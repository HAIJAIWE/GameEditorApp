"""策划书首页 — 卡片列表 + 搜索 + 最近打开 + 新建入口，接入8主题"""
from __future__ import annotations

from PyQt6.QtCore import QSize, Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QLineEdit,
    QMenu,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from common.event_bus import EventBus
from common.i18n import get_i18n
from common.lucide_icon import get_icon
from core.ceshu import CeshuManager, CeshuTemplate

from .ceshu_theme import (
    ceshu_home_ai_card_qss,
    ceshu_home_btn_new_qss,
    ceshu_home_empty_qss,
    ceshu_home_recent_btn_qss,
    ceshu_home_search_qss,
    ceshu_home_section_label_qss,
    ceshu_home_sep_qss,
    ceshu_home_title_qss,
)
from .home_card import CeshuCard


class CeshuHomeView(QWidget):
    """策划书首页"""

    ceshu_opened = pyqtSignal(str, str)  # ceshu_id, library
    ceshu_created = pyqtSignal(str, str)  # ceshu_id, library

    def __init__(self, library_root: str = "", parent=None):
        super().__init__(parent)
        self._library_root = library_root
        self._library = "默认库"
        self._manager: CeshuManager | None = None
        self._template = CeshuTemplate()
        self._cards: list[CeshuCard] = []
        self._setup_ui()
        # 监听主题切换
        EventBus().on("theme_changed", self._on_theme_changed)

    def set_left_panel_visible(self, visible: bool) -> None:
        """兼容三栏布局接口（无操作）"""
        pass

    def set_manager(self, manager: CeshuManager) -> None:
        self._manager = manager

    def _get_manager(self) -> CeshuManager:
        if self._manager is None:
            from pathlib import Path
            root = self._library_root or str(Path(__file__).resolve().parent.parent.parent.parent / "data" / "libraries")
            self._manager = CeshuManager(root)
        return self._manager

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 16, 24, 16)
        layout.setSpacing(12)

        # 标题行
        title_layout = QHBoxLayout()
        self._title = QLabel(get_i18n().t("ceshu.title"))
        self._title.setFont(QFont("Microsoft YaHei", 18, QFont.Weight.Bold))
        title_layout.addWidget(self._title)

        # 搜索
        self._search = QLineEdit()
        self._search.setPlaceholderText("搜索策划书...")
        self._search.setMaximumWidth(300)
        self._search.textChanged.connect(self._on_search_changed)
        self._search.setAccessibleName("策划书搜索框")
        self._search.setAccessibleDescription("输入关键词按名称过滤策划书列表")
        # P4-15: 统一搜索防抖（150ms，与 data_tab.py 一致）
        self._search_timer = QTimer(self)
        self._search_timer.setSingleShot(True)
        self._search_timer.timeout.connect(self._do_search)
        title_layout.addWidget(self._search)
        title_layout.addStretch()

        # 新建按钮
        self._btn_new = QPushButton("  " + get_i18n().t("ceshu.new"))
        self._btn_new.setMinimumHeight(36)
        self._btn_new.setIcon(get_icon("plus", "white", 18))
        self._btn_new.setIconSize(QSize(18, 18))
        self._btn_new.clicked.connect(self._on_new_clicked)
        self._btn_new.setAccessibleName("新建策划书按钮")
        self._btn_new.setAccessibleDescription("点击弹出菜单，可选择从模板或空白创建新的游戏策划书")
        title_layout.addWidget(self._btn_new)
        layout.addLayout(title_layout)

        # ── AI 入口卡片（主推）──
        self._ai_card = QFrame()
        self._ai_card.setObjectName("AiEntryCard")
        ai_layout = QVBoxLayout(self._ai_card)
        ai_layout.setContentsMargins(20, 16, 20, 16)
        ai_layout.setSpacing(8)

        ai_title = QLabel("✨ 和 AI 聊想法，自动生成策划书")
        ai_title.setObjectName("AiTitle")
        ai_title.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
        ai_layout.addWidget(ai_title)

        ai_hint = QLabel("描述你想做的游戏（如「做个仙侠 RPG，3 种族 5 阵营，回合制战斗」），AI 会引导你完成策划书")
        ai_hint.setObjectName("AiHint")
        ai_hint.setWordWrap(True)
        ai_layout.addWidget(ai_hint)

        ai_input_row = QHBoxLayout()
        self._ai_input = QLineEdit()
        self._ai_input.setObjectName("AiInput")
        self._ai_input.setPlaceholderText("输入你的游戏想法，回车发送给 AI...")
        self._ai_input.returnPressed.connect(self._on_ai_send)
        ai_input_row.addWidget(self._ai_input)

        self._ai_btn = QPushButton("和 AI 对话")
        self._ai_btn.setObjectName("AiBtn")
        self._ai_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._ai_btn.clicked.connect(self._on_ai_send)
        ai_input_row.addWidget(self._ai_btn)
        ai_layout.addLayout(ai_input_row)

        layout.addWidget(self._ai_card)

        # 最近打开
        recent_layout = QHBoxLayout()
        self._recent_label = QLabel(get_i18n().t("ceshu.recent"))
        recent_layout.addWidget(self._recent_label)
        recent_layout.addStretch()
        layout.addLayout(recent_layout)

        self._recent_widget = QWidget()
        self._recent_layout = QHBoxLayout(self._recent_widget)
        self._recent_layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self._recent_widget)

        # 分隔线
        self._sep = QLabel("")
        self._sep.setFixedHeight(1)
        layout.addWidget(self._sep)

        # 全部策划书
        self._all_label = QLabel(get_i18n().t("ceshu.all"))
        layout.addWidget(self._all_label)

        # 卡片网格
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setAccessibleName("策划书列表")
        scroll.setAccessibleDescription("以卡片形式展示当前库下的全部策划书，点击卡片可打开编辑")
        self._card_container = QWidget()
        self._card_grid = QGridLayout(self._card_container)
        self._card_grid.setContentsMargins(0, 0, 0, 0)
        self._card_grid.setSpacing(16)
        scroll.setWidget(self._card_container)
        layout.addWidget(scroll)

        self._apply_theme()

    def _apply_theme(self) -> None:
        """应用当前主题色"""
        self._title.setStyleSheet(ceshu_home_title_qss())
        self._search.setStyleSheet(ceshu_home_search_qss())
        self._btn_new.setStyleSheet(ceshu_home_btn_new_qss())
        self._sep.setStyleSheet(ceshu_home_sep_qss())
        self._recent_label.setStyleSheet(ceshu_home_section_label_qss())
        self._all_label.setStyleSheet(ceshu_home_section_label_qss())
        self._ai_card.setStyleSheet(ceshu_home_ai_card_qss())
        # 刷新已有卡片
        for card in self._cards:
            card._apply_theme()
        # 刷新最近打开按钮
        for i in range(self._recent_layout.count()):
            item = self._recent_layout.itemAt(i)
            if item:
                w = item.widget()
                if w is not None and isinstance(w, QPushButton):
                    w.setStyleSheet(ceshu_home_recent_btn_qss())

    def _on_theme_changed(self, **_) -> None:
        """主题切换回调"""
        self._apply_theme()

    def load_ceshu_list(self, library: str = "") -> None:
        """加载策划书列表"""
        if library:
            self._library = library
        mgr = self._get_manager()
        try:
            ceshus = mgr.list_ceshu(self._library)
        except Exception:
            import traceback
            traceback.print_exc()
            return
        recents = mgr.get_recent_ceshus(self._library, 6)

        self._render_recent(recents)
        self._render_cards(ceshus)

    def _render_cards(self, ceshus: list) -> None:
        """渲染卡片网格"""
        for c in self._cards:
            c.setParent(None)
        self._cards.clear()

        # 清空网格
        while self._card_grid.count():
            item = self._card_grid.takeAt(0)
            if item:
                w = item.widget()
                if w is not None:
                    w.setParent(None)

        cols = 4
        for i, info in enumerate(ceshus):
            card = CeshuCard(info)
            ceshu_id = info.get("ceshu_id", "")
            card.clicked.connect(lambda checked=False, cid=ceshu_id: self._on_card_clicked(cid))
            # 右键菜单信号
            card.rename_requested.connect(self._on_rename_ceshu)
            card.delete_requested.connect(self._on_delete_ceshu)
            card.duplicate_requested.connect(self._on_duplicate_ceshu)
            card.derive_requested.connect(self._on_derive_version)  # P8
            row, col = divmod(i, cols)
            self._card_grid.addWidget(card, row, col)
            self._cards.append(card)

        if not ceshus:
            empty = QLabel("暂无策划书，点击右上角「+ 新建策划书」开始吧")
            empty.setStyleSheet(ceshu_home_empty_qss())
            empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self._card_grid.addWidget(empty, 0, 0)

    def _render_recent(self, recents: list) -> None:
        """渲染最近打开列表"""
        while self._recent_layout.count():
            item = self._recent_layout.takeAt(0)
            if item:
                w = item.widget()
                if w is not None:
                    w.setParent(None)

        for info in recents[:5]:
            btn = QPushButton(f"{info.get('name', '?')[:12]}")
            ceshu_id = info.get("ceshu_id", "")
            btn.setStyleSheet(ceshu_home_recent_btn_qss())
            btn.clicked.connect(lambda checked, cid=ceshu_id: self._on_card_clicked(cid))
            self._recent_layout.addWidget(btn)

        if not recents:
            self._recent_widget.setVisible(False)
        else:
            self._recent_widget.setVisible(True)

    def _on_search_changed(self, text: str) -> None:
        """P4-15: 搜索框文本变化时启动防抖定时器"""
        self._search_timer.start(150)

    def _do_search(self) -> None:
        """P4-15: 执行搜索过滤（防抖后触发）"""
        text = self._search.text()
        mgr = self._get_manager()
        ceshus = mgr.list_ceshu(self._library, text)
        self._render_cards(ceshus)

    def _on_new_clicked(self) -> None:
        """新建策划书弹出菜单"""
        menu = QMenu(self)
        from_template = menu.addAction(get_i18n().t("ceshu.template"))
        from_existing = menu.addAction("从已有策划书复制（独立副本）")  # P9
        blank = menu.addAction(get_i18n().t("ceshu.blank"))

        action = menu.exec(self._btn_new.mapToGlobal(self._btn_new.rect().bottomLeft()))
        if action == from_template:
            self._show_template_dialog()
        elif action == from_existing:
            self._show_existing_picker_dialog()
        elif action == blank:
            self._create_blank()

    def _show_existing_picker_dialog(self) -> None:
        """P9: 弹出已有策划书列表，让用户选一个作为基础复制为独立副本"""
        mgr = self._get_manager()
        ceshus = mgr.list_ceshu(self._library)
        if not ceshus:
            QMessageBox.information(self, "提示", "当前库还没有任何策划书，无法复制。")
            return
        # 构造显示项
        items_text = []
        for c in ceshus:
            name = c.get("name", "未命名")
            vlabel = c.get("version_label", "")
            suffix = "主" if c.get("is_main", True) else "子"
            star = " ★" if c.get("is_active", True) else ""
            items_text.append(f"{name} [{vlabel} ({suffix}){star}]")
        from PyQt6.QtWidgets import QInputDialog
        selected, ok = QInputDialog.getItem(
            self, "从已有策划书复制",
            "选择基础策划书（将创建为独立副本，不建立版本关系）：",
            items_text, 0, False,
        )
        if not ok or not selected:
            return
        idx = items_text.index(selected)
        source_id = ceshus[idx].get("ceshu_id", "")
        model = mgr.duplicate_ceshu(self._library, source_id)
        if model:
            self.load_ceshu_list()
            self.ceshu_opened.emit(model.ceshu_id, self._library)

    def _show_template_dialog(self, scope: str = "full") -> None:
        """显示模板选择对话框"""
        names = self._template.list_template_names()
        if not names:
            QMessageBox.information(self, get_i18n().t("common.info"), "暂无可用模板。请先创建模板文件。")
            self._create_blank(scope)
            return
        selected, ok = QInputDialog.getItem(
            self, get_i18n().t("ceshu.select_template"), "请选择游戏类型模板：", names, 0, False)
        if ok and selected:
            self._create_from_template(selected, scope)

    def _create_blank(self, scope: str = "full") -> None:
        from core.ceshu.ceshu_model import GDD_SCOPE_FULL, GDD_SCOPE_LITE

        mgr = self._get_manager()
        model = mgr.create_ceshu(self._library)
        model.gdd_scope = scope if scope in (GDD_SCOPE_LITE, GDD_SCOPE_FULL) else GDD_SCOPE_FULL
        mgr.save_ceshu(model, self._library)
        self.load_ceshu_list()
        self.ceshu_opened.emit(model.ceshu_id, self._library)

    def _create_from_template(self, template_name: str, scope: str = "full") -> None:
        from core.ceshu.ceshu_model import GDD_SCOPE_FULL, GDD_SCOPE_LITE

        mgr = self._get_manager()
        model = mgr.create_ceshu(self._library, template_name)
        model.gdd_scope = scope if scope in (GDD_SCOPE_LITE, GDD_SCOPE_FULL) else GDD_SCOPE_FULL
        mgr.save_ceshu(model, self._library)
        self.load_ceshu_list()
        self.ceshu_opened.emit(model.ceshu_id, self._library)

    # ── d2: AI 生成新建入口 ──

    def _start_ai_full_generate(self, scope: str = "full") -> None:
        """打开 AI 一键生成对话框：生成完成后按所选档位创建新策划书。"""
        from .ai_full_generate_dialog import AIFullGenerateDialog

        self._pending_ai_scope = scope
        dlg = AIFullGenerateDialog(parent=self)
        dlg.generation_completed.connect(self._apply_ai_generated_new)
        dlg.exec()

    def _apply_ai_generated_new(self, chapters_data: dict) -> None:
        """AI 生成完成 → 创建新策划书并应用生成内容。"""
        from core.ceshu.ceshu_model import BASE_CHAPTER_KEYS, CHAPTER_KEYS, GDD_SCOPE_LITE

        from .ai_full_generate_dialog import _apply_chapter_to_model

        scope = getattr(self, "_pending_ai_scope", "full")
        keys = BASE_CHAPTER_KEYS if scope == GDD_SCOPE_LITE else CHAPTER_KEYS
        mgr = self._get_manager()
        model = mgr.create_ceshu(self._library)
        model.gdd_scope = scope
        applied = 0
        for ch in keys:
            data = chapters_data.get(ch)
            if isinstance(data, dict):
                _apply_chapter_to_model(model, ch, data)
                applied += 1
        mgr.save_ceshu(model, self._library)
        self.load_ceshu_list()
        self.ceshu_opened.emit(model.ceshu_id, self._library)
        QMessageBox.information(
            self, "已创建策划书",
            f"已根据 AI 生成内容创建策划书（应用了 {applied} 章内容，档位："
            f"{'轻量 9 章' if scope == GDD_SCOPE_LITE else '工业级 18 章'}）。")

    def _on_card_clicked(self, ceshu_id: str) -> None:
        """卡片点击 → 高亮选中 + 发射打开信号"""
        for card in self._cards:
            card.set_selected(card.ceshu_id == ceshu_id)
        self.ceshu_opened.emit(ceshu_id, self._library)

    def _on_ai_send(self) -> None:
        """AI 入口：把输入的文字发送到右侧 DigitalPanel

        加 [策划书生成] 前缀引导 AI 进入多轮对话模式：
        - AI 应先问关键问题（玩法/世界观/系统/规模/付费等）
        - 收集足够信息后再调用 system.ceshu ai_generate
        - 不要一句话直接生成

        防重入：发送期间禁用按钮+输入框，避免重复点击触发多个 AI 请求。
        """
        # 防重入：busy 状态下忽略
        if getattr(self, '_ai_sending', False):
            return
        text = self._ai_input.text().strip()
        if not text:
            return
        # 向上找到 MainWindow，再找它的 digital_panel
        parent = self.parentWidget()
        while parent and not hasattr(parent, 'digital_panel'):
            parent = parent.parentWidget()
        if not parent or not parent.digital_panel:  # type: ignore[attr-defined]  # digital_panel 由 MainWindow 在运行时注入
            QMessageBox.warning(self, "提示", "AI 面板未就绪，请稍后再试。")
            return
        dp = parent.digital_panel  # type: ignore[attr-defined]  # digital_panel 由 MainWindow 在运行时注入
        # 加引导前缀，让 AI 进入多轮提问模式
        guided_text = (
            f"[策划书生成] {text}\n\n"
            f"（请以资深游戏主策划身份和我多轮对话：先问 3-5 个关键问题，"
            f"包括核心玩法、世界观、主要游戏系统、规模、付费模式等，"
            f"等我回答充分后再调用 system.ceshu 的 ai_generate 生成完整策划书。"
            f"不要一句话就直接生成。）"
        )
        # 防重入：禁用 UI
        self._ai_sending = True
        self._ai_btn.setEnabled(False)
        self._ai_btn.setText("发送中...")
        self._ai_input.setEnabled(False)
        try:
            dp._input_edit.setText(guided_text)
            self._ai_input.clear()
            dp._send_message()
            dp._input_edit.setFocus()
        finally:
            # 恢复 UI（dp._send_message 内部已异步化或快速返回）
            self._ai_sending = False
            self._ai_btn.setEnabled(True)
            self._ai_btn.setText("和 AI 对话")
            self._ai_input.setEnabled(True)

    def _on_rename_ceshu(self, ceshu_id: str) -> None:
        """右键菜单：重命名策划书"""
        mgr = self._get_manager()
        ceshus = mgr.list_ceshu(self._library)
        target = next((c for c in ceshus if c.get("ceshu_id") == ceshu_id), None)
        if not target:
            return
        old_name = target.get("name", "未命名")
        new_name, ok = QInputDialog.getText(
            self, get_i18n().t("ceshu.rename"), "新名称：", text=old_name)
        if ok and new_name.strip():
            mgr.rename_ceshu(self._library, ceshu_id, new_name.strip())
            self.load_ceshu_list()

    def _on_delete_ceshu(self, ceshu_id: str) -> None:
        """右键菜单：删除策划书"""
        reply = QMessageBox.question(
            self, get_i18n().t("ceshu.confirm_delete"),
            "确定要删除这个策划书吗？此操作不可撤销。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if reply == QMessageBox.StandardButton.Yes:
            mgr = self._get_manager()
            mgr.delete_ceshu(self._library, ceshu_id)
            self.load_ceshu_list()

    def _on_duplicate_ceshu(self, ceshu_id: str) -> None:
        """右键菜单：复制策划书"""
        mgr = self._get_manager()
        model = mgr.duplicate_ceshu(self._library, ceshu_id)
        if model:
            self.load_ceshu_list()
            self.ceshu_opened.emit(model.ceshu_id, self._library)

    def _on_derive_version(self, ceshu_id: str) -> None:
        """P8: 派生新版本 — 基于现有策划书创建子版本"""
        mgr = self._get_manager()
        # 先获取父策划书信息，便于显示提示
        try:
            parent = mgr.get_ceshu(ceshu_id, self._library)
        except Exception as e:
            QMessageBox.warning(self, "错误", f"读取策划书失败: {e}")
            return
        # 让用户输入版本说明
        note, ok = QInputDialog.getText(
            self, "派生新版本",
            f"基于「{parent.meta.get('game_name', '?')}」({parent.version_label}) 派生子版本\n"
            f"新版本号将自动递增。请输入本次迭代说明：",
            text="",
        )
        if not ok:
            return
        model = mgr.derive_version(
            self._library, ceshu_id,
            version_label="",  # 自动递增
            version_note=note.strip(),
        )
        if model:
            QMessageBox.information(
                self, "派生成功",
                f"已派生子版本 {model.version_label}\n"
                f"新版本默认非激活，如需切换为激活版本，请在编辑器中点击「设为激活」。"
            )
            self.load_ceshu_list()
            self.ceshu_opened.emit(model.ceshu_id, self._library)
