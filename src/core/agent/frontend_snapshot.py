"""前端快照 — 解耦 AgentBrain 与 MainWindow 的桥梁

目的：
    AgentBrain 不再直接持有 main_window 引用，也不再直接访问 PyQt 或 MainWindow 内部属性。
    所有前端访问（数据引用、库信息、UI 状态扫描、危险操作确认）集中到 FrontendSnapshot。
    测试时可 mock 本类，无需构造完整 MainWindow。

设计：
    - brain 只依赖 FrontendSnapshot 接口（鸭子类型）
    - FrontendSnapshot 内部可访问 main_window，但对外只暴露明确的方法
    - 危险操作确认可通过 confirm_dangerous_callback 注入，避免 PyQt 依赖
"""
from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
import time
from typing import Optional

from common.logger import get_logger

logger = get_logger()


class FrontendSnapshot:
    """封装 AgentBrain 对前端的访问。

    通过此类将 brain 与 MainWindow / PyQt 解耦：
        - data_manager / config：显式注入或懒加载自 main_window
        - confirm_dangerous：通过回调或 main_window + QMessageBox
        - generate_frontend_map_text / generate_maps_text：内省 main_window 状态
        - get_library_context / build_library_summary：库信息摘要
    """

    # 文件地图缓存（类级共享，因为与 main_window 无关，仅扫描项目结构）
    _file_map_cache: Optional[list] = None
    _file_map_cache_time: float = 0.0

    def __init__(
        self,
        main_window=None,
        data_manager=None,
        config=None,
        confirm_dangerous_callback: Optional[Callable[[str, str], bool]] = None,
    ):
        self._main_window = main_window
        self._data_manager = data_manager
        self._config = config
        self._confirm_dangerous_callback = confirm_dangerous_callback
        self._logger = get_logger()

    # ------------------------------------------------------------------
    #  数据引用 / 配置
    # ------------------------------------------------------------------

    @property
    def data_manager(self):
        """优先使用注入的 data_manager，否则从 main_window 懒加载"""
        if self._data_manager is not None:
            return self._data_manager
        if self._main_window is not None:
            return getattr(self._main_window, 'data_manager', None)
        return None

    @property
    def config(self):
        """优先使用注入的 config，否则从 main_window 懒加载"""
        if self._config is not None:
            return self._config
        if self._main_window is not None:
            return getattr(self._main_window, 'config', None)
        return None

    @property
    def main_window(self):
        """对外暴露 main_window（仅供仍需深度访问的旧代码使用，新代码应避免）"""
        return self._main_window

    # ------------------------------------------------------------------
    #  危险操作确认
    # ------------------------------------------------------------------

    def confirm_dangerous(self, title: str, text: str) -> Optional[bool]:
        """请求用户确认危险操作。

        Returns:
            True  = 用户确认
            False = 用户取消
            None  = 无法弹出对话框（调用方应回落文本确认）
        """
        if self._confirm_dangerous_callback is not None:
            try:
                return bool(self._confirm_dangerous_callback(title, text))
            except Exception as e:
                self._logger.debug(f"confirm_dangerous 回调失败: {e}")
                return None

        if self._main_window is not None:
            try:
                from PyQt6.QtWidgets import QMessageBox
                reply = QMessageBox.question(
                    self._main_window, title, text,
                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                    QMessageBox.StandardButton.No
                )
                return reply == QMessageBox.StandardButton.Yes
            except Exception as e:
                self._logger.debug(f"QMessageBox 弹出失败，回落文本确认: {e}")
                return None
        return None

    # ------------------------------------------------------------------
    #  库信息
    # ------------------------------------------------------------------

    def get_library_context(self) -> dict:
        """返回库上下文：active_library / library_path / all_libraries / data_types"""
        config = self.config
        if not config or not hasattr(config, 'library_manager'):
            return {}
        lm = config.library_manager
        active = getattr(lm, 'active_library_name', None)
        if not active:
            return {}
        active_lib = getattr(lm, '_active_library', None)
        ctx = {
            "active_library": active,
            "library_path": str(active_lib.path) if active_lib else "",
            "all_libraries": [lib.name for lib in lm.get_all_libraries()],
        }
        schema = config.get_type_schema()
        if schema:
            ctx["data_types"] = [(t.id, t.name) for t in schema.types]
        return ctx

    def build_library_summary(self) -> str:
        """构建库信息摘要文本（注入到 AI 上下文中）"""
        config = self.config
        if not config or not hasattr(config, 'library_manager'):
            return ""
        lm = config.library_manager
        active = getattr(lm, 'active_library_name', None)
        if not active:
            return ""
        all_libs = [lib.name for lib in lm.get_all_libraries()]
        schema = config.get_type_schema()
        data_types = [(t.id, t.name) for t in schema.types] if schema else []
        all_items = self._count_library_items(self.data_manager)
        return (
            f"当前库: {active}\n"
            f"可用库: {', '.join(all_libs)}\n"
            f"数据类型: {', '.join(f'{n}({i})' for i, n in data_types)}\n"
            f"数据总量: {all_items}条"
        )

    @staticmethod
    def _count_library_items(dm) -> int:
        if not dm or not hasattr(dm, 'data'):
            return 0
        return sum(len(v) for v in dm.data.values() if isinstance(v, list))

    # ------------------------------------------------------------------
    #  前端地图
    # ------------------------------------------------------------------

    def generate_maps_text(self) -> str:
        """生成完整地图文本（前端地图 + 文件地图）"""
        parts = []
        fm = self.generate_frontend_map_text()
        if fm:
            parts.append(fm)
        fl_lines = self.generate_file_map()
        if fl_lines:
            parts.append("\n".join(fl_lines))
        return "\n\n".join(parts)

    def generate_frontend_map_text(self) -> str:
        """生成前端地图文本 — 内省 main_window 的当前状态"""
        mw = self._main_window
        if not mw:
            return ""

        type_names = self._build_type_name_map()
        dm = self.data_manager

        # ── 布局模式检测 ──
        layout = "策划案编辑器模式" if getattr(mw, 'startup_mode', None) == 2 else "数据编辑器模式"
        is_ceshu_mode = hasattr(mw, '_center_stack') and mw._center_stack is not None

        # ── 当前位置检测 ──
        # 修复 P2-25: 私有 widget 访问包裹 try/except 防止 widget 销毁时崩溃
        current_tab = ""
        current_label = ""
        if is_ceshu_mode and hasattr(mw, '_center_stack'):
            try:
                w = mw._center_stack.currentWidget()
                if w:
                    current_tab = getattr(w, '_data_type', '') or ''
                    cls_name = type(w).__name__
                    if 'CeshuHomeView' in cls_name:
                        current_label = "策划书首页"
                        current_tab = "ceshu_home"
                    elif 'CeshuEditorView' in cls_name:
                        current_label = "策划书编辑器"
                        current_tab = "ceshu_editor"
            except RuntimeError as e:
                # QWidget 在 C++ 端被销毁时抛 RuntimeError
                logger.debug(f"[FrontendSnapshot] _center_stack.currentWidget() 失败: {e}")
        if not current_tab and hasattr(mw, 'tab_widget') and mw.tab_widget:
            try:
                idx = mw.tab_widget.currentIndex()
                if idx >= 0:
                    w = mw.tab_widget.widget(idx)
                    current_tab = getattr(w, '_data_type', '') or mw.tab_widget.tabText(idx)
                    current_label = type_names.get(current_tab, current_tab)
            except RuntimeError as e:
                logger.debug(f"[FrontendSnapshot] tab_widget 访问失败: {e}")

        # ── 标签页列表 ──
        tab_lines = []
        seen_types = set()
        if hasattr(mw, 'tab_widget') and mw.tab_widget:
            tab_count = mw.tab_widget.count()
            for i in range(min(tab_count, 20)):
                w = mw.tab_widget.widget(i)
                dt = getattr(w, '_data_type', '') or getattr(w, 'data_type', '') or mw.tab_widget.tabText(i)
                if dt in seen_types:
                    continue
                seen_types.add(dt)
                count = len(dm.data.get(dt, [])) if dm else 0
                marker = "← 当前" if dt == current_tab else ""
                label = type_names.get(dt, dt)
                tab_lines.append(f"  {label}({dt})\t{count}条  {marker}")
            if tab_count > 20:
                tab_lines.append(f"  ... 还有 {tab_count - 20} 个标签页（未显示）")
        if is_ceshu_mode and 'ceshu_home' not in seen_types:
            seen_types.add('ceshu_home')
            marker = "← 当前" if current_tab == 'ceshu_home' else ""
            tab_lines.append(f"  策划书首页(ceshu_home)  {marker}")
            marker2 = "← 当前" if current_tab == 'ceshu_editor' else ""
            tab_lines.append(f"  策划书编辑器(ceshu_editor)  {marker2}")

        # ── AI 面板检测 ──
        panel_visible = bool(hasattr(mw, 'digital_panel') and mw.digital_panel
                             and mw.digital_panel.isVisible())
        agent_popup_visible = bool(hasattr(mw, '_ai_popup') and mw._ai_popup
                                   and mw._ai_popup.isVisible())

        # ── 检测可折叠任务面板 ──
        # 修复 P2-25: 整段私有属性访问包裹在 try/except 中，避免 MainWindow 结构变化时崩
        task_panel = (hasattr(mw, 'digital_panel') and mw.digital_panel
                      and hasattr(mw.digital_panel, '_task_panel'))
        task_panel_status = ""
        if task_panel:
            try:
                tp = mw.digital_panel._task_panel
                # 用 getattr 防御 is_expanded / _summary 缺失
                is_expanded = bool(getattr(tp, 'is_expanded', False))
                summary_text = getattr(tp, '_summary', "") or ""
                if is_expanded:
                    task_panel_status = "展开"
                    if summary_text:
                        task_panel_status += f" [{summary_text}]"
                else:
                    task_panel_status = f"折叠 ({summary_text})" if summary_text else "折叠"
            except Exception as e:
                logger.debug(f"[FrontendSnapshot] 任务面板状态访问失败: {e}")
                task_panel_status = "未知"
        else:
            task_panel_status = "不可用"

        # ── 弹窗检测 ──
        dialog_info = ""
        try:
            from PyQt6.QtWidgets import QApplication
            active_modal = QApplication.activeModalWidget()
            if active_modal and active_modal.isVisible():
                title = active_modal.windowTitle() or type(active_modal).__name__
                dialog_info = f"[WARN] 当前有弹窗: 【{title}】— 需先处理弹窗才能操作界面"
        except Exception as e:
            logger.warning(f"操作失败: {e}")

        # ── 当前选中项 ──
        selection_text = ""
        key_fields_text = ""
        if current_tab and current_tab not in ('ceshu_home', 'ceshu_editor') and hasattr(mw, 'tab_widget') and mw.tab_widget:
            idx = mw.tab_widget.currentIndex()
            if idx >= 0:
                w = mw.tab_widget.widget(idx)
                map_attrs = getattr(w, '_map_attrs', None)
                if map_attrs and isinstance(map_attrs, dict):
                    sel_attr = map_attrs.get("selection", "current_item")
                    current_item = getattr(w, sel_attr, None)
                    name_key = map_attrs.get("name_key", "name")
                    fields_attr = map_attrs.get("fields_config", "")
                    fields_key = map_attrs.get("fields_key", "name")
                else:
                    current_item = getattr(w, 'current_item', None)
                    name_key = "name"
                    fields_attr = None
                if current_item and isinstance(current_item, dict):
                    name = current_item.get(name_key, current_item.get('id', '?'))
                    key_items = []
                    for k, v in current_item.items():
                        if k in ('id', 'name', 'type', 'level', 'hp', 'mp', 'class',
                                 'race', 'rarity', 'category', 'status', 'grade'):
                            if v is not None:
                                key_items.append(f"{k}={v}")
                    if key_items:
                        selection_text = f" 当前选中: 【{name}】 {' | '.join(key_items[:6])}"
                if dm:
                    visible_fields = []
                    if map_attrs and isinstance(map_attrs, dict) and fields_attr:
                        fc = getattr(w, fields_attr, None)
                        if fc and isinstance(fc, (list, tuple)):
                            visible_fields = [f.get(fields_key, '') for f in fc if f.get(fields_key, '') not in ('id',)]
                    if not visible_fields:
                        df = getattr(w, 'form_widget', None)
                        if df and hasattr(df, 'fields_config'):
                            visible_fields = [f.get('name', '') for f in df.fields_config if f.get('name', '') not in ('id',)]
                    if visible_fields:
                        key_fields_text = f" 字段: {', '.join(visible_fields[:10])}" if visible_fields else ""

        # ── 构建输出 ──
        lines = [
            "【前端地图】你当前的前端界面状态（实时）:",
        ]
        if dialog_info:
            lines.append(f"  {dialog_info}")
        lines.append(f"  📌 当前位置: {current_label or current_tab or '未知'}")
        lines.append(f"  🏗️ 布局模式: {layout}")
        lines.append("  📂 数据标签页:")
        lines.extend(tab_lines)
        lines.append(f"  🤖 右侧 AI 面板: {'✓ 可见' if panel_visible else '✗ 隐藏'}")
        lines.append(f"  📋 任务面板: {task_panel_status}")
        if agent_popup_visible:
            lines.append("  🪟 AI弹窗: ✓ 打开")
        if selection_text:
            lines.append(f"  {selection_text}")
        if key_fields_text:
            lines.append(f"  {key_fields_text}")
        lines.append("")
        lines.append("【可用操作】")
        lines.append("  • 切换数据标签页: system.ui_control action=switch_tab target=<类型>")
        lines.append("  • 切换策划书页面: system.ui_control action=switch_tab target=ceshu_home")
        lines.append("  • 展开/折叠任务面板: 点击右侧AI面板中的任务面板标题栏")
        lines.append("  • 查看任务详情: 展开任务面板后点击任务行")

        file_map = self.generate_file_map()
        if file_map:
            lines.append("")
            lines.extend(file_map)

        return "\n".join(lines)

    def _build_type_name_map(self) -> dict:
        """构建类型 plural_key → name 映射"""
        result = {}
        try:
            config = self.config
            if config:
                lm = getattr(config, 'library_manager', None)
                if lm:
                    schema = lm.get_active_type_schema()
                    if schema:
                        for t in schema.types:
                            result[t.plural_key] = t.name
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        return result

    # ------------------------------------------------------------------
    #  文件地图（与 main_window 无关，扫描项目结构）
    # ------------------------------------------------------------------

    def generate_file_map(self) -> list:
        """生成项目文件地图（带 30 秒缓存）"""
        now = time.time()
        if FrontendSnapshot._file_map_cache and (now - FrontendSnapshot._file_map_cache_time) < 30:
            return FrontendSnapshot._file_map_cache

        project_root = None
        for candidate in [Path.cwd(), Path(__file__).resolve().parent.parent.parent.parent]:
            if (candidate / "src").exists() and (candidate / "src" / "app.py").exists():
                project_root = candidate
                break
        if not project_root:
            return []

        skip_dirs = {'.git', '.venv', 'venv', 'node_modules', '__pycache__', '.idea',
                     '.vscode', '.trae', 'build', 'dist', '.pytest_cache', '.mypy_cache'}

        # 修复 P3-34: rglob 递归会进入 .venv/__pycache__ 等，导致文件计数和最近修改列表混入依赖/缓存
        def _is_skipped(p: Path) -> bool:
            for part in p.parts:
                if part in skip_dirs:
                    return True
            return False

        dir_entries = []
        try:
            for entry in sorted(project_root.iterdir()):
                if entry.name.startswith('.') or entry.name in skip_dirs:
                    continue
                if entry.is_dir():
                    try:
                        file_count = sum(
                            1 for _ in entry.rglob('*')
                            if _.is_file() and not _is_skipped(_)
                        )
                    except Exception:
                        file_count = 0
                    dir_entries.append(f"{entry.name}/ ({file_count}文件)")

            recent_files = []
            now = time.time()
            # 修复 P3-34: 过滤 .venv/__pycache__ 等，再按 mtime 排序取 Top 8
            py_files = [
                p for p in project_root.rglob('*.py')
                if not _is_skipped(p)
            ]
            py_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            for entry in py_files[:8]:
                rel = entry.relative_to(project_root)
                age_min = int((now - entry.stat().st_mtime) / 60)
                age_str = "刚刚" if age_min < 1 else f"{age_min}分钟前" if age_min < 60 else f"{age_min//60}小时前"
                recent_files.append(f"{rel} [{age_str}]")
        except Exception:
            return []

        lines = [
            " 【项目文件地图】你的项目文件环境:",
        ]

        try:
            from common.logger import AppLogger
            recent = AppLogger.get_recent_logs(5)
            if recent:
                has_error = any("ERROR" in line or "CRITICAL" in line for line in recent)
                marker = "[ERR]" if has_error else ""
                log_lines = [f"    {line}" for line in recent[-5:]]
                lines.append(f"  {marker} 终端最近日志:")
                lines.extend(log_lines)
        except Exception as e:
            logger.warning(f"操作失败: {e}")

        lines.append(f"   根目录: {project_root}")
        lines.append(f"   项目结构: {'  '.join(dir_entries[:8])}")
        if recent_files:
            lines.append(f"   最近修改: {', '.join(recent_files[:5])}")

        try:
            import subprocess
            git_root = project_root
            result = subprocess.run(
                ["git", "-C", str(git_root), "status", "--porcelain"],
                capture_output=True, text=True, timeout=3
            )
            if result.returncode == 0 and result.stdout.strip():
                changed_lines = [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]
                modified = [line[3:] for line in changed_lines if line.startswith(" M") or line.startswith("M ")]
                added = [line[3:] for line in changed_lines if line.startswith("??")]
                deleted = [line[3:] for line in changed_lines if line.startswith(" D") or line.startswith("D ")]
                parts = []
                if modified:
                    parts.append(f"修改{len(modified)}")
                if added:
                    parts.append(f"新增{len(added)}")
                if deleted:
                    parts.append(f"删除{len(deleted)}")
                sample = [f"{f}" for f in modified[:3]] + [f"+{a}" for a in added[:2]]
                sample = sample[:5]
                lines.append(f"   未提交变更: {' | '.join(parts)} ({', '.join(sample)})")
        except Exception as e:
            logger.warning(f"操作失败: {e}")

        lines.append("   读写文件: system.file_ops action=read/write/list/grep | 执行命令: system.shell")
        FrontendSnapshot._file_map_cache = lines
        FrontendSnapshot._file_map_cache_time = now
        return lines
