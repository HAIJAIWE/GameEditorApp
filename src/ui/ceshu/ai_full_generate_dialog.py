"""N10: AI 一键生成完整策划书对话框

特性:
- 用户输入简要描述（游戏名/类型/风格/描述/参考游戏/平台/商业模式）
- 后台 QThread 逐章调用 CeshuSkill.ai_fill_chapter 生成 18 章内容
- 实时展示每章生成状态（待生成 / 生成中 / 已完成 / 失败）
- 全部完成后通过 generation_completed 信号携带完整章节数据
- 失败时通过 generation_failed 信号传递错误信息
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import QThread, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QRadioButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from .ceshu_theme import theme_color

if TYPE_CHECKING:
    from core.ceshu.ceshu_model import CeshuModel


# === UI 常量 ===

GAME_TYPES: list[str] = [
    "RPG", "MMORPG", "ARPG", "MOBA", "FPS", "SLG",
    "休闲", "放置", "卡牌", "塔防", "Roguelike", "策略",
]

GAME_STYLES: list[str] = [
    "仙侠", "武侠", "科幻", "现代", "奇幻", "末日",
    "历史", "二次元", "暗黑", "赛博朋克", "蒸汽朋克",
]

BUSINESS_MODELS: list[str] = ["F2P", "P2P", "Buyonce", "混合"]

PLATFORMS: list[str] = ["PC", "移动端", "主机", "Web"]

# 章节状态显示文案
STATUS_PENDING = "待生成"
STATUS_RUNNING = "生成中"
STATUS_DONE = "已完成"
STATUS_FAILED = "失败"


# === AI Worker（后台线程） ===

class _AIFullGenerateWorker(QThread):
    """N10: AI 一键生成完整策划书 worker。

    流程：
      1. 调用 CeshuSkill.ai_generate_full 获取生成计划（章节顺序 + 提示词）
      2. 按章节顺序逐章调用 ai_fill_chapter（在内存 CeshuModel 上）
      3. 已生成章节作为上下文传给下一章
      4. 收集所有章节内容到 dict，发射 all_completed

    信号:
        chapter_started(str): 开始生成某章
        chapter_succeeded(str, dict): 某章生成成功（chapter_key, data）
        chapter_failed(str, str): 某章生成失败（chapter_key, error）
        all_completed(dict): 全部完成，携带所有章节数据
        failed(str): 整体失败（如生成计划获取失败）
    """

    chapter_started = pyqtSignal(str)
    chapter_succeeded = pyqtSignal(str, dict)
    chapter_failed = pyqtSignal(str, str)
    all_completed = pyqtSignal(dict)
    failed = pyqtSignal(str)

    def __init__(self, user_input: dict, parent: QWidget | None = None,
                 scope: str = "full", retry_chapters: list[str] | None = None) -> None:
        """初始化 worker。

        Args:
            user_input: 用户输入字典，包含 game_name/game_type/style/
                description/references/platforms/business_model/scope。
            parent: 父 QObject。
            scope: 生成范围 (lite=基础9章 / full=全部18章)。
            retry_chapters: 仅重试这些章节（失败重试用）。
        """
        super().__init__(parent)
        self._user_input = dict(user_input)
        self._scope = scope
        self._retry_chapters = list(retry_chapters) if retry_chapters else None
        self._cancelled = False

    def cancel(self) -> None:
        """请求取消生成（在线程下一次循环检查时生效）。"""
        self._cancelled = True

    def run(self) -> None:
        """线程入口：执行生成计划 + 逐章生成。"""
        try:
            from common.logger import get_logger
            from core.agent.skills.ceshu_skill import CeshuSkill
            logger = get_logger()

            skill = CeshuSkill()

            # 1. 获取生成计划
            plan_params = {
                "action": "ai_generate_full",
                **self._user_input,
            }
            plan_result = skill.execute(plan_params, context={})
            if not plan_result.get("success"):
                self.failed.emit(plan_result.get("message")
                                 or plan_result.get("error")
                                 or "生成计划获取失败")
                return

            plan_data = plan_result.get("data") or {}
            chapter_order = list(plan_data.get("chapter_order", []))
            chapter_prompts = dict(plan_data.get("chapter_prompts", {}))
            meta_seed = dict(plan_data.get("meta_seed", {}))

            # d3: 按档位过滤章节（lite 只生成基础 9 章）
            if self._scope == "lite":
                from core.ceshu.ceshu_model import BASE_CHAPTER_KEYS
                chapter_order = [c for c in chapter_order if c in BASE_CHAPTER_KEYS]
            # d3: 失败重试 — 仅生成指定章节
            if self._retry_chapters:
                retry_set = set(self._retry_chapters)
                chapter_order = [c for c in chapter_order if c in retry_set]

            if not chapter_order:
                self.failed.emit("生成计划中没有章节")
                return

            # 2. 构造内存 CeshuModel 并预填 meta 种子
            from core.ceshu.ceshu_model import CeshuModel
            model = CeshuModel()
            if meta_seed:
                model.meta.update(meta_seed)
            user_input = dict(plan_data.get("user_input", {}))
            if user_input.get("style"):
                model.style = _map_style_to_key(user_input["style"])
            if user_input.get("game_type"):
                model.module_type = _map_type_to_key(user_input["game_type"])

            # 3. 逐章生成
            chapters_data: dict[str, dict] = {}
            for chapter_key in chapter_order:
                if self._cancelled:
                    break

                self.chapter_started.emit(chapter_key)
                try:
                    chapter_data = self._generate_chapter(
                        skill, model, chapter_key,
                        chapter_prompts.get(chapter_key, ""),
                        logger,
                    )
                    if chapter_data:
                        chapters_data[chapter_key] = chapter_data
                        # 应用到 model，作为下一章上下文
                        _apply_chapter_to_model(model, chapter_key, chapter_data)
                        self.chapter_succeeded.emit(chapter_key, chapter_data)
                    else:
                        self.chapter_failed.emit(chapter_key, "AI 未返回有效内容")
                except Exception as e:
                    logger.warning(f"[AIFullGen] 章节 {chapter_key} 生成失败: {e}")
                    self.chapter_failed.emit(chapter_key, str(e))

            if self._cancelled:
                self.failed.emit("用户已取消生成")
                return

            # 4. 全部完成
            self.all_completed.emit(chapters_data)
        except Exception as e:
            self.failed.emit(f"AI 生成异常: {e}")

    def _generate_chapter(self, skill, model, chapter_key: str,
                          extra_prompt: str, logger) -> dict:
        """调用 ai_fill_chapter 生成单章并解析 JSON。

        Args:
            skill: CeshuSkill 实例。
            model: 内存 CeshuModel（用于上下文）。
            chapter_key: 章节键名。
            extra_prompt: 来自生成计划的额外提示词。
            logger: 日志器。

        Returns:
            解析后的章节字典；解析失败返回空 dict。
        """
        params = {
            "action": "ai_fill_chapter",
            "chapter": chapter_key,
        }
        # 把额外提示词放进 description（让 _ai_fill_chapter 拿到）
        if extra_prompt:
            params["description"] = extra_prompt

        result = skill.execute(params, context={"_inline_model": model})
        if not result.get("success"):
            msg = result.get("message") or result.get("error") or "AI 调用失败"
            logger.warning(f"[AIFullGen] 章节 {chapter_key} 调用失败: {msg}")
            return {}

        content = (result.get("data") or {}).get("generated_content", "")
        if not content:
            return {}

        # 解析 JSON
        from core.agent.skills.ceshu_skill import CeshuSkill
        parsed = CeshuSkill._parse_llm_json(content, logger)
        if not isinstance(parsed, dict):
            return {}

        # 兼容两种格式：1) 直接字段字典 2) 嵌套在 chapter_key 下
        if chapter_key in parsed and isinstance(parsed[chapter_key], dict):
            return parsed[chapter_key]
        return parsed


# === 辅助函数（不依赖 PyQt6） ===

_STYLE_LABEL_TO_KEY: dict[str, str] = {
    "仙侠": "xianxia", "武侠": "wuxia", "科幻": "sci-fi",
    "现代": "realistic", "奇幻": "fantasy", "末日": "post_apoc",
    "历史": "realistic", "二次元": "anime", "暗黑": "dark",
    "赛博朋克": "cyberpunk", "蒸汽朋克": "steampunk",
}

_TYPE_LABEL_TO_KEY: dict[str, str] = {
    "RPG": "rpg", "MMORPG": "mmorpg", "ARPG": "arpg",
    "MOBA": "moba", "FPS": "fps", "SLG": "slg",
    "休闲": "casual", "放置": "casual", "卡牌": "card",
    "塔防": "tower_defense", "Roguelike": "roguelike", "策略": "strategy",
}


def _map_style_to_key(label: str) -> str:
    """风格中文标签 → style 标识符（用于 model.style）。"""
    return _STYLE_LABEL_TO_KEY.get(label, "")


def _map_type_to_key(label: str) -> str:
    """游戏类型中文标签 → module_type 标识符（用于 model.module_type）。"""
    return _TYPE_LABEL_TO_KEY.get(label, "")


def _apply_chapter_to_model(model, chapter_key: str, chapter_data: dict) -> None:
    """把生成结果应用到 model（作为下一章生成的上下文）。

    Args:
        model: CeshuModel 实例。
        chapter_key: 章节键名。
        chapter_data: 生成的章节字典。
    """
    if not chapter_data or not isinstance(chapter_data, dict):
        return
    try:
        if chapter_key == "meta":
            # meta 是 model.meta
            model.meta.update(chapter_data)
        elif chapter_key == "systems":
            # systems 是 dict[sys_key, {enabled, config}]
            for sys_key, sys_val in chapter_data.items():
                if not isinstance(sys_val, dict):
                    continue
                if sys_key in model.systems:
                    model.systems[sys_key].update(sys_val)
                else:
                    model.systems[sys_key] = sys_val
        else:
            existing = getattr(model, chapter_key, {})
            if isinstance(existing, dict):
                existing.update(chapter_data)
                setattr(model, chapter_key, existing)
            else:
                setattr(model, chapter_key, chapter_data)
    except Exception:
        pass


# === 对话框 ===

class AIFullGenerateDialog(QDialog):
    """N10: AI 一键生成完整策划书对话框。

    从简要描述生成完整 18 章 GDD。生成完成后通过
    ``generation_completed`` 信号携带完整章节数据，调用方可选择应用到
    model 并刷新 UI。

    信号:
        generation_completed(dict): 生成完成，携带完整章节数据
        generation_failed(str): 生成失败
        chapter_progress(str, str): 章节进度更新（chapter_key, status）
    """

    generation_completed = pyqtSignal(dict)
    generation_failed = pyqtSignal(str)
    chapter_progress = pyqtSignal(str, str)

    def __init__(self, parent: QWidget | None = None,
                 model: CeshuModel | None = None) -> None:
        """初始化对话框。

        Args:
            parent: 父控件。
            model: 可选的 CeshuModel 实例，用于预填游戏名等字段。
        """
        super().__init__(parent)
        self._model = model
        self._worker: _AIFullGenerateWorker | None = None
        self._chapter_items: dict[str, QListWidgetItem] = {}
        # d3: 累积生成结果 + 失败重试状态
        self._accumulated: dict[str, dict] = {}
        self._expected_keys: list[str] = []
        self._failed_keys: list[str] = []
        self._last_input: dict = {}
        self._last_scope = "full"
        self._setup_ui()
        self._apply_theme()
        self._prefill_from_model()

    # ── UI 搭建 ──

    def _setup_ui(self) -> None:
        """搭建对话框界面。"""
        self.setWindowTitle("🤖 AI 一键生成完整策划书")
        self.resize(720, 760)
        self.setMinimumSize(640, 640)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        layout.addWidget(self._build_title())
        layout.addWidget(self._build_input_group())
        layout.addWidget(self._build_options_group())
        layout.addWidget(self._build_progress_group(), 1)
        layout.addLayout(self._build_bottom_buttons())

    def _build_title(self) -> QWidget:
        """构建标题。"""
        container = QWidget()
        v = QVBoxLayout(container)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(4)

        title = QLabel("🤖 AI 一键生成完整策划书")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        title.setStyleSheet(f"color: {theme_color('fg')}; background: transparent;")
        v.addWidget(title)

        hint = QLabel("填写简要描述，AI 将按依赖顺序逐章生成完整 18 章 GDD。")
        hint.setStyleSheet(
            f"color: {theme_color('hint')}; background: transparent; font-size: 12px;")
        v.addWidget(hint)
        return container

    def _build_input_group(self) -> QGroupBox:
        """构建输入区。"""
        group = QGroupBox("项目信息")
        layout = QVBoxLayout(group)
        layout.setSpacing(8)

        # 第一行：游戏名称 + 游戏类型
        row1 = QHBoxLayout()
        row1.addWidget(self._make_label("游戏名称:"))
        self._edit_name = QLineEdit()
        self._edit_name.setPlaceholderText("如：星河战记")
        row1.addWidget(self._edit_name, 2)
        row1.addWidget(self._make_label("游戏类型:"))
        self._combo_type = QComboBox()
        self._combo_type.addItems(GAME_TYPES)
        self._combo_type.setCurrentText("RPG")
        row1.addWidget(self._combo_type, 1)
        layout.addLayout(row1)

        # 第二行：风格 + 商业模式
        row2 = QHBoxLayout()
        row2.addWidget(self._make_label("风格:"))
        self._combo_style = QComboBox()
        self._combo_style.addItems(GAME_STYLES)
        self._combo_style.setCurrentText("仙侠")
        row2.addWidget(self._combo_style, 1)
        row2.addWidget(self._make_label("商业模式:"))
        self._combo_biz = QComboBox()
        self._combo_biz.addItems(BUSINESS_MODELS)
        self._combo_biz.setCurrentText("F2P")
        row2.addWidget(self._combo_biz, 1)
        layout.addLayout(row2)

        # 第三行：参考游戏
        row3 = QHBoxLayout()
        row3.addWidget(self._make_label("参考游戏:"))
        self._edit_refs = QLineEdit()
        self._edit_refs.setPlaceholderText("可选，逗号分隔，如：原神, 艾尔登法环")
        row3.addWidget(self._edit_refs, 1)
        layout.addLayout(row3)

        # 第四行：目标平台
        row4 = QHBoxLayout()
        row4.addWidget(self._make_label("目标平台:"))
        self._platform_checks: dict[str, QCheckBox] = {}
        for plat in PLATFORMS:
            cb = QCheckBox(plat)
            if plat == "PC":
                cb.setChecked(True)
            self._platform_checks[plat] = cb
            row4.addWidget(cb)
        row4.addStretch()
        layout.addLayout(row4)

        # 第五行：简要描述
        row5 = QVBoxLayout()
        row5.setSpacing(2)
        row5.addWidget(self._make_label("简要描述（3-5 句话描述游戏概念）:"))
        self._edit_desc = QTextEdit()
        self._edit_desc.setPlaceholderText(
            "例：一款仙侠题材的开放世界 RPG，玩家扮演修真者探索三界，"
            "通过修炼境界、收集法宝、结交道友对抗魔族入侵。"
        )
        self._edit_desc.setMinimumHeight(80)
        self._edit_desc.setMaximumHeight(120)
        row5.addWidget(self._edit_desc)
        layout.addLayout(row5)

        return group

    def _build_options_group(self) -> QGroupBox:
        """构建选项区。"""
        group = QGroupBox("生成范围")
        layout = QHBoxLayout(group)
        layout.setSpacing(16)

        self._chk_apply = QCheckBox("生成后自动应用")
        self._chk_apply.setChecked(True)
        layout.addWidget(self._chk_apply)

        self._radio_lite = QRadioButton("轻量（基础 9 章，推荐）")
        self._radio_full = QRadioButton("工业级（全部 18 章）")
        self._radio_lite.setChecked(True)
        layout.addWidget(self._radio_lite)
        layout.addWidget(self._radio_full)

        layout.addStretch()
        return group

    def _build_progress_group(self) -> QGroupBox:
        """构建进度区。"""
        group = QGroupBox("生成进度")
        layout = QVBoxLayout(group)
        layout.setSpacing(8)

        # 总进度条
        bar_row = QHBoxLayout()
        bar_row.addWidget(self._make_label("总进度:"))
        self._progress_bar = QProgressBar()
        self._progress_bar.setRange(0, 100)
        self._progress_bar.setValue(0)
        self._progress_bar.setTextVisible(True)
        self._progress_bar.setFormat("%v / %m 章 (%p%)")
        bar_row.addWidget(self._progress_bar, 1)
        layout.addLayout(bar_row)

        # 章节列表
        self._chapter_list = QListWidget()
        self._chapter_list.setMinimumHeight(220)
        self._init_chapter_list()
        layout.addWidget(self._chapter_list, 1)

        return group

    def _init_chapter_list(self) -> None:
        """初始化章节列表，所有章节状态为「待生成」。"""
        from core.ceshu.ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS
        self._chapter_items.clear()
        self._chapter_list.clear()
        for ch in CHAPTER_KEYS:
            label = CHAPTER_LABELS.get(ch, ch)
            text = f"{label}  —  [{STATUS_PENDING}]"
            item = QListWidgetItem(text)
            self._chapter_list.addItem(item)
            self._chapter_items[ch] = item

    def _build_bottom_buttons(self) -> QHBoxLayout:
        """构建底部按钮行。"""
        row = QHBoxLayout()

        self._btn_start = QPushButton("开始生成")
        self._btn_start.clicked.connect(self._on_start)
        row.addWidget(self._btn_start)

        self._btn_cancel = QPushButton("取消")
        self._btn_cancel.setEnabled(False)
        self._btn_cancel.clicked.connect(self._on_cancel)
        row.addWidget(self._btn_cancel)

        # d3: 失败章节重试按钮
        self._btn_retry = QPushButton("重试失败章节")
        self._btn_retry.setEnabled(False)
        self._btn_retry.clicked.connect(self._on_retry_failed)
        row.addWidget(self._btn_retry)

        row.addStretch()

        self._btn_close = QPushButton("关闭")
        self._btn_close.clicked.connect(self._on_close)
        row.addWidget(self._btn_close)
        return row

    def _make_label(self, text: str) -> QLabel:
        """创建辅助标签。"""
        lbl = QLabel(text)
        lbl.setStyleSheet(
            f"color: {theme_color('secondary_fg', theme_color('fg'))};"
            " background: transparent; font-size: 12px;")
        return lbl

    def _apply_theme(self) -> None:
        """应用对话框整体主题样式。"""
        bg = theme_color('input_bg') or '#1e1e1e'
        fg = theme_color('fg') or '#e0e0e0'
        border = theme_color('border') or '#3a3a3a'
        accent = theme_color('accent', '#4f8cf7')
        self.setStyleSheet(f"""
            QDialog {{ background: {bg}; color: {fg}; }}
            QLabel {{ background: transparent; color: {fg}; }}
            QGroupBox {{
                border: 1px solid {border};
                border-radius: 6px;
                margin-top: 10px;
                padding-top: 8px;
                color: {fg};
            }}
            QGroupBox::title {{
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 4px;
                color: {accent};
            }}
            QLineEdit, QTextEdit, QComboBox {{
                background: {bg}; color: {fg};
                border: 1px solid {border};
                border-radius: 4px;
                padding: 4px 8px;
            }}
            QLineEdit:focus, QTextEdit:focus, QComboBox:focus {{
                border-color: {accent};
            }}
            QListWidget {{
                background: {bg}; color: {fg};
                border: 1px solid {border};
                border-radius: 4px;
            }}
            QPushButton {{
                background: {bg}; color: {fg};
                border: 1px solid {border};
                padding: 6px 14px;
                border-radius: 4px;
            }}
            QPushButton:hover {{
                border-color: {accent};
            }}
            QPushButton:disabled {{
                color: {theme_color('hint')};
            }}
            QProgressBar {{
                background: {border};
                border: 1px solid {border};
                border-radius: 4px;
                text-align: center;
            }}
            QProgressBar::chunk {{
                background: {accent};
                border-radius: 3px;
            }}
        """)

    # ── 数据收集 / 预填 ──

    def _collect_user_input(self) -> dict:
        """从 UI 控件收集用户输入。"""
        platforms = [p for p, cb in self._platform_checks.items() if cb.isChecked()]
        scope = "lite" if self._radio_lite.isChecked() else "full"
        return {
            "game_name": self._edit_name.text().strip(),
            "game_type": self._combo_type.currentText().strip(),
            "style": self._combo_style.currentText().strip(),
            "description": self._edit_desc.toPlainText().strip(),
            "references": self._edit_refs.text().strip(),
            "platforms": ",".join(platforms),
            "business_model": self._combo_biz.currentText().strip(),
            "scope": scope,
            # 兼容旧计划参数：lite 关闭市场/风险章
            "include_market_analysis": scope == "full",
            "include_risk_assessment": scope == "full",
        }

    def _prefill_from_model(self) -> None:
        """从已加载的 model 预填字段（方便用户在已有基础上调整）。"""
        if not self._model:
            return
        try:
            name = self._model.meta.get("game_name", "")
            if name:
                self._edit_name.setText(name)
            game_type = self._model.meta.get("game_type", "")
            if game_type and self._combo_type.findText(game_type) >= 0:
                self._combo_type.setCurrentText(game_type)
        except Exception:
            pass

    # ── 事件回调 ──

    def _on_start(self) -> None:
        """点击「开始生成」按钮：校验输入 → 启动 worker。"""
        if self._worker and self._worker.isRunning():
            QMessageBox.information(self, "AI 生成", "已有生成任务进行中，请稍候")
            return

        user_input = self._collect_user_input()
        if not user_input["description"]:
            QMessageBox.warning(
                self, "请填写描述",
                "请填写简要描述，便于 AI 生成有针对性的内容。")
            return

        # 重置 UI
        self._init_chapter_list()
        self._progress_bar.setValue(0)
        from core.ceshu.ceshu_model import CHAPTER_KEYS
        self._progress_bar.setMaximum(len(CHAPTER_KEYS))

        # 切换按钮状态
        self._btn_start.setEnabled(False)
        self._btn_cancel.setEnabled(True)
        self._btn_close.setEnabled(False)

        # 启动 worker
        self._worker = _AIFullGenerateWorker(user_input, parent=self)
        self._worker.chapter_started.connect(self._on_chapter_started)
        self._worker.chapter_succeeded.connect(self._on_chapter_succeeded)
        self._worker.chapter_failed.connect(self._on_chapter_failed)
        self._worker.all_completed.connect(self._on_all_completed)
        self._worker.failed.connect(self._on_failed)
        self._worker.start()

    def _on_cancel(self) -> None:
        """点击「取消」按钮：请求 worker 取消。"""
        if self._worker and self._worker.isRunning():
            self._worker.cancel()
            self._btn_cancel.setEnabled(False)

    def _on_close(self) -> None:
        """点击「关闭」按钮：若有任务运行则提示。"""
        if self._worker and self._worker.isRunning():
            reply = QMessageBox.question(
                self, "关闭对话框",
                "生成任务仍在进行中，关闭对话框将取消生成。\n是否继续？",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            )
            if reply != QMessageBox.StandardButton.Yes:
                return
            self._worker.cancel()
            self._worker.wait(2000)
        self.reject()

    def _on_chapter_started(self, chapter_key: str) -> None:
        """章节开始生成：更新列表状态 + 进度信号。"""
        self._update_chapter_status(chapter_key, STATUS_RUNNING)
        self.chapter_progress.emit(chapter_key, STATUS_RUNNING)

    def _on_chapter_succeeded(self, chapter_key: str, data: dict) -> None:
        """章节生成成功。"""
        self._update_chapter_status(chapter_key, STATUS_DONE)
        self._bump_progress()
        self.chapter_progress.emit(chapter_key, STATUS_DONE)

    def _on_chapter_failed(self, chapter_key: str, error: str) -> None:
        """章节生成失败。"""
        self._update_chapter_status(chapter_key, STATUS_FAILED, error)
        self._bump_progress()
        self.chapter_progress.emit(chapter_key, STATUS_FAILED)

    def _on_all_completed(self, chapters_data: dict) -> None:
        """全部章节生成结束（含重试）→ 合并结果并收尾。"""
        if chapters_data:
            self._accumulated.update(chapters_data)
        self._finalize_generation()

    def _finalize_generation(self) -> None:
        """生成收尾：结算失败章节、提示并发射最终结果。"""
        self._reset_buttons_after_done()
        done = len(self._accumulated)
        total = len(self._expected_keys) or done
        self._failed_keys = [k for k in self._expected_keys if k not in self._accumulated]
        self._progress_bar.setValue(min(done, self._progress_bar.maximum()))
        apply_note = "✅ 将自动应用到当前策划书。" if self._chk_apply.isChecked() else "请点击「应用」查看生成结果。"
        if self._failed_keys:
            msg = (f"AI 已完成 {done} / {total} 章，{len(self._failed_keys)} 章失败。\n"
                   f"可点击「重试失败章节」补齐，或直接应用已生成内容。\n{apply_note}")
        else:
            msg = f"AI 已完成全部 {total} 章内容生成。\n{apply_note}"
        QMessageBox.information(self, "生成完成", msg)
        self._btn_retry.setEnabled(bool(self._failed_keys))
        self.generation_completed.emit(dict(self._accumulated))

    def _on_retry_failed(self) -> None:
        """d3: 仅重新生成失败章节。"""
        if self._worker and self._worker.isRunning():
            QMessageBox.information(self, "重试", "生成任务仍在进行中，请稍候")
            return
        failed = list(self._failed_keys)
        if not failed:
            return
        for k in failed:
            self._update_chapter_status(k, STATUS_PENDING)
        self._btn_retry.setEnabled(False)
        self._btn_start.setEnabled(False)
        self._btn_cancel.setEnabled(True)
        self._btn_close.setEnabled(False)
        self._worker = _AIFullGenerateWorker(
            self._last_input, parent=self, scope=self._last_scope,
            retry_chapters=failed,
        )
        self._worker.chapter_started.connect(self._on_chapter_started)
        self._worker.chapter_succeeded.connect(self._on_chapter_succeeded)
        self._worker.chapter_failed.connect(self._on_chapter_failed)
        self._worker.all_completed.connect(self._on_all_completed)
        self._worker.failed.connect(self._on_failed)
        self._worker.start()

    def _on_failed(self, error_msg: str) -> None:
        """整体失败。"""
        self._reset_buttons_after_done()
        QMessageBox.warning(self, "AI 生成失败", error_msg)
        self.generation_failed.emit(error_msg)

    # ── 辅助方法 ──

    def _update_chapter_status(self, chapter_key: str, status: str,
                               error: str = "") -> None:
        """更新章节列表中某章的状态显示。"""
        from core.ceshu.ceshu_model import CHAPTER_LABELS
        item = self._chapter_items.get(chapter_key)
        if item is None:
            return
        label = CHAPTER_LABELS.get(chapter_key, chapter_key)
        suffix = f"  —  {error[:60]}" if error else ""
        item.setText(f"{label}  —  [{status}]{suffix}")

        # 状态颜色
        color_map = {
            STATUS_PENDING: theme_color('hint'),
            STATUS_RUNNING: theme_color('accent', '#4f8cf7'),
            STATUS_DONE: "#22C55E",
            STATUS_FAILED: "#EF4444",
        }
        color = color_map.get(status, theme_color('fg'))
        try:
            from PyQt6.QtGui import QColor
            item.setForeground(QColor(color))
        except Exception:
            pass

    def _bump_progress(self) -> None:
        """进度条 +1。"""
        v = self._progress_bar.value() + 1
        self._progress_bar.setValue(min(v, self._progress_bar.maximum()))

    def _reset_buttons_after_done(self) -> None:
        """生成结束（成功/失败/取消）后恢复按钮状态。"""
        self._btn_start.setEnabled(True)
        self._btn_cancel.setEnabled(False)
        self._btn_close.setEnabled(True)

    # ── 公共接口 ──

    def should_auto_apply(self) -> bool:
        """是否在生成完成后自动应用到 model。"""
        return self._chk_apply.isChecked()

    def get_chapters_data(self) -> dict:
        """获取已生成的章节数据（仅在生成完成后调用）。"""
        return dict(self._accumulated)
