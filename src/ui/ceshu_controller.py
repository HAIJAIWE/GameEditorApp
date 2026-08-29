"""策划书控制器 — 从 MainWindow 中提取的策划书编辑逻辑

处理:
  - 策划书打开/关闭/上下文注入
  - @data[...] 引用点击 → 跳转到数据表
  - 数据变更 → 实时更新预览中的引用值
"""
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QAction
from PyQt6.QtWidgets import QListWidgetItem, QMenu

from common.logger import get_logger

logger = get_logger()


class CeshuController:
    """管理策划书的打开、关闭、上下文注入等逻辑"""

    def __init__(self, main_window):
        self._mw = main_window
        self.logger = get_logger()

    def on_ceshu_opened(self, ceshu_id: str, library: str):
        """策划书卡片点击 → 切换到编辑器页面"""
        try:
            from ui.ceshu import CeshuEditorView

            if self._mw.ceshu_editor is not None:
                try:
                    self._mw.ceshu_editor.parent()
                except RuntimeError:
                    self._mw.ceshu_editor = None
            if self._mw.ceshu_editor is None:
                self._mw.ceshu_editor = CeshuEditorView(parent=self._mw)
                self._mw.ceshu_editor.hide()
                self._mw.ceshu_editor.back_requested.connect(self._mw._on_ceshu_back)
                self._mw.ceshu_editor.chapter_changed.connect(self._mw._on_ceshu_ai_context)
                self._mw.ceshu_editor.ref_clicked.connect(self._on_ceshu_ref_clicked)
                self._mw.ceshu_editor.type_editor_requested.connect(self._mw._tab_dropdown_open_type_editor)
                # P3: 系统确认弹窗后，刷新数据 Tab 过滤
                self._mw.ceshu_editor.systems_changed.connect(self._on_systems_changed)
                self._mw.ceshu_editor.preview_panel.set_data_manager(self._mw.data_manager)
                self._mw._center_stack.addWidget(self._mw.ceshu_editor)
            schema = self._mw.config.get_type_schema()
            self._mw.ceshu_editor.load_ceshu(ceshu_id, library, schema=schema)
            # P6: 注入 DataManager 给 ChapterPanel/SystemsEditor，启用进度回填
            self._mw.ceshu_editor.set_data_manager(self._mw.data_manager)
            # v5.0: 设置当前策划书给同步器（用于事件驱动自动同步）
            self._set_sync_current(ceshu_id, library)
            if self._mw.ceshu_editor.model:
                self._apply_ceshu_tab_filter(self._mw.ceshu_editor.model)
                from core.style_manager import get_style_manager
                sm = get_style_manager()
                meta = self._mw.ceshu_editor.model.meta or {}
                game_type = meta.get("game_type", "")
                tags = " ".join(meta.get("tags", []))
                inferred = sm.infer_style_from_text(game_type + " " + tags)
                if not inferred:
                    inferred = sm.infer_style_from_text(meta.get("positioning", ""))
                sm.set_active_style(inferred)
            self._mw._center_stack.setCurrentWidget(self._mw.ceshu_editor)
            # P3: 如果策划书未确认系统，自动弹出确认对话框
            if self._mw.ceshu_editor.model:
                meta = self._mw.ceshu_editor.model.meta or {}
                if not meta.get("system_confirmed", False):
                    # 启用系统数 > 0 时才弹
                    enabled = self._mw.ceshu_editor.model.compute_enabled_editors()
                    if enabled:
                        from PyQt6.QtCore import QTimer
                        QTimer.singleShot(300, lambda: self._mw.ceshu_editor.show_system_confirm())
        except Exception as e:
            self.logger.error(f"打开策划书失败: {e}", exc_info=True)

    def _get_data_sync(self):
        """v5.0: 获取或懒创建 CeshuDataSync 实例"""
        if not hasattr(self._mw, '_ceshu_data_sync') or self._mw._ceshu_data_sync is None:
            try:
                from core.ceshu import CeshuDataSync
                ceshu_mgr = getattr(self._mw, 'ceshu_manager', None)
                if ceshu_mgr is None:
                    # 退化：用 CeshuManager(lib_root) 构造
                    from pathlib import Path

                    from core.ceshu import CeshuManager
                    lib_root = Path(self._mw.data_manager._root).parent if hasattr(self._mw.data_manager, '_root') else Path(__file__).resolve().parent.parent.parent / "data" / "libraries"
                    ceshu_mgr = CeshuManager(lib_root)
                self._mw._ceshu_data_sync = CeshuDataSync(
                    ceshu_manager=ceshu_mgr,
                    data_manager=self._mw.data_manager,
                    library_manager=getattr(self._mw.config, 'library_manager', None),
                    config=self._mw.config,
                )
            except Exception as e:
                self.logger.debug(f"创建 CeshuDataSync 失败: {e}")
                return None
        return self._mw._ceshu_data_sync

    def _set_sync_current(self, ceshu_id: str, library: str) -> None:
        """设置当前活跃策划书给同步器"""
        sync = self._get_data_sync()
        if sync:
            try:
                sync.set_current_ceshu(ceshu_id, library)
            except Exception as e:
                self.logger.debug(f"设置同步器当前策划书失败: {e}")

    def _apply_ceshu_tab_filter(self, model) -> None:
        """根据策划书的游戏系统配置，过滤中间编辑器的标签页"""
        enabled = model.compute_enabled_editors()
        # 把游戏系统键转换为实际数据类型 ID
        type_set: set[str] = set()
        for key in enabled:
            actual_key = key if isinstance(key, str) else key.get("key", "")
            if not actual_key:
                continue
            sys_cfg = model.systems.get(actual_key, {})
            if isinstance(sys_cfg, dict):
                dt = sys_cfg.get("data_type", actual_key)
                type_set.add(dt)
        if hasattr(self._mw, 'tab_mgr'):
            self._mw.tab_mgr.set_ceshu_context(type_set)

    def _on_systems_changed(self) -> None:
        """P3+P4+v5.0: 系统确认弹窗后刷新 Tab 过滤 + 双向同步"""
        if not (self._mw.ceshu_editor and self._mw.ceshu_editor.model):
            return
        model = self._mw.ceshu_editor.model
        # v5.0: 通过 CeshuDataSync 双向同步（包含 P4 的类型注册逻辑）
        sync = self._get_data_sync()
        if sync:
            try:
                library = self._mw.ceshu_editor.current_library or ""
                sync.sync_systems_to_data(model, library)
            except Exception as e:
                self.logger.debug(f"通过同步器同步失败，回退到 _ensure_types_for_systems: {e}")
                # 退化：调用原有的 _ensure_types_for_systems
                self._ensure_types_for_systems(model)
        else:
            # 同步器创建失败时退化
            self._ensure_types_for_systems(model)
        # 刷新 Tab 过滤
        self._apply_ceshu_tab_filter(model)

    def _ensure_types_for_systems(self, model) -> None:
        """P4: 根据启用的游戏系统，动态注册缺失的数据类型到 type_schema

        - 遍历 model.systems 中启用的系统
        - 对每个系统的 data_type，检查 type_schema 是否包含
        - 如果不包含，添加默认 TypeDef（id/name/plural_key + 基础字段）
        - 保存 type_schema 并刷新 tab_mgr 缓存
        """
        from core.ceshu.ceshu_model import SYSTEM_LABELS
        from core.type_schema import TypeDef, TypeField

        # 收集启用的 data_type
        enabled_types: list[tuple[str, str]] = []  # (data_type, display_name)
        for sys_key, sys_cfg in model.systems.items():
            if not (isinstance(sys_cfg, dict) and sys_cfg.get("enabled")):
                continue
            data_type = sys_cfg.get("data_type", sys_key)
            display_name = sys_cfg.get("name", SYSTEM_LABELS.get(sys_key, sys_key))
            enabled_types.append((data_type, display_name))

        if not enabled_types:
            return

        # 获取当前 schema
        schema = self._mw.config.get_type_schema()
        if schema is None:
            self.logger.warning("[P4] 无活跃库的 type_schema，跳过动态注册")
            return

        existing_ids = set(schema.type_ids)
        added: list[str] = []
        for data_type, display_name in enabled_types:
            if data_type in existing_ids:
                continue
            # 创建默认 TypeDef
            # 字段架构：id + name + desc（最小可用结构）
            default_fields = [
                TypeField(name="id", label="ID:", type="entry", editable=False),
                TypeField(name="name", label=f"{display_name}名称:", type="entry", editable=True),
                TypeField(name="desc", label="描述:", type="textarea", editable=True),
            ]
            new_type = TypeDef(
                id=data_type,
                name=display_name,
                plural_key=data_type + "s",  # 复数键默认加 s
                color="#4CAF50",
                form_fields=default_fields,
                ai_context={},
            )
            schema.types.append(new_type)
            existing_ids.add(data_type)
            added.append(data_type)

        if not added:
            return  # 没有新增，无需保存

        # 保存 type_schema
        try:
            lm = self._mw.config.library_manager
            if lm.active_library:
                schema_path = lm.get_schema_path()
                if schema_path:
                    schema.save(schema_path)
                    # 更新内存缓存（使用公开 API 而非私有属性）
                    lm.set_type_schema(schema, lm.active_library.name)
                    self.logger.info(f"[P4] 已动态注册数据类型: {added}")
        except Exception as e:
            self.logger.error(f"[P4] 保存 type_schema 失败: {e}", exc_info=True)
            return

        # 刷新 tab_mgr 缓存，让新 Tab 出现
        if hasattr(self._mw, 'tab_mgr') and self._mw.tab_mgr:
            self._mw.tab_mgr.invalidate_tab_configs()
            # 注意：不调用 rebuild_all_tabs，因为那会销毁所有 Tab
            # invalidate_tab_configs 已让 get_tab_configs 返回新列表
            # 用户切换 Tab 时会自动创建

    def _on_ceshu_ref_clicked(self, full_path: str):
        """@data[...] 引用点击 → 切换到对应数据类型标签页

        支持格式:
          role.atk        → 切换到 role 标签页
          role.hero_01.*  → 切换到 role 标签页
        """
        parts = full_path.split(".")
        if not parts:
            return
        type_key = parts[0]
        # 通过 TabManager 切换标签
        if hasattr(self._mw, 'tab_mgr') and self._mw.tab_mgr:
            # 查找 type_key 对应的标签页索引
            configs = self._mw.tab_mgr.get_tab_configs()
            for idx, cfg in enumerate(configs):
                if cfg.get("key") == type_key or cfg.get("data_type") == type_key:
                    self._mw.tab_mgr.deferred_switch_tab(idx)
                    return
            # 未找到对应标签 → 尝试默认切到首页
            self.logger.info("未找到数据类型 '%s' 的标签页", type_key)

    def on_ceshu_back(self):
        """编辑器返回 → 切回策划书首页，清除上下文过滤"""
        if self._mw.ceshu_home is not None:
            self._mw.ceshu_home.load_ceshu_list()
            self._mw._center_stack.setCurrentWidget(self._mw.ceshu_home)
        if hasattr(self._mw, 'tab_mgr'):
            self._mw.tab_mgr.clear_ceshu_context()
        if self._mw.digital_panel:
            self._mw.digital_panel._extra.pop("ceshu_model", None)
            self._mw.digital_panel._extra.pop("current_chapter", None)

    def on_ceshu_ai_context(self, chapter: str):
        """章节切换 → 注入策划书上下文到 AI 面板"""
        if self._mw.ceshu_editor and self._mw.ceshu_editor.model:
            self.send_ceshu_ai_context(self._mw.ceshu_editor.model, chapter)

    def send_ceshu_ai_context(self, model, chapter: str):
        """注入策划书上下文到 DigitalPanel（静默更新，不污染聊天记录）"""
        if not self._mw.digital_panel:
            return
        self._mw.digital_panel._extra["ceshu_model"] = model
        self._mw.digital_panel._extra["current_chapter"] = chapter

    def update_ceshu_project_list(self):
        """三栏布局下：从 CeshuHomeView 获取策划书名填充左栏列表"""
        if not hasattr(self._mw, 'project_list') or self._mw.ceshu_home is None:
            return
        self._mw.project_list.clear()

        try:
            self._mw.ceshu_home.objectName()
        except RuntimeError:
            return

        library = self._mw.data_manager.get_active_library_name()
        from core.ceshu.ceshu_manager import CeshuManager
        lib_root = str(self._mw.config.library_manager.libraries_dir)
        mgr = CeshuManager(lib_root)
        ceshus = mgr.list_ceshu(library)

        for idx, info in enumerate(ceshus):
            name = info.get("game_name", "未命名")
            list_item = QListWidgetItem(f"{idx + 1}. {name}")
            list_item.setData(Qt.ItemDataRole.UserRole, info.get("ceshu_id"))
            self._mw.project_list.addItem(list_item)

        if self._mw.project_list.count() > 0:
            self._mw.project_list.setCurrentRow(0)

    def on_project_list_context_menu(self, pos):
        """策划书右键菜单"""
        item = self._mw.project_list.itemAt(pos)
        if not item:
            return
        data_type = self._mw.data_type_combo.currentData()
        if data_type != "ceshu":
            return
        if self._mw.ceshu_home is None:
            return
        try:
            self._mw.ceshu_home.objectName()
        except RuntimeError:
            return
        idx = item.data(Qt.ItemDataRole.UserRole)
        if idx is None or idx < 0:
            return
        doc_name = item.text()

        menu = QMenu(self._mw)
        rename_action = QAction("重命名", self._mw)
        rename_action.triggered.connect(
            lambda checked, row=idx: self._ceshu_context_rename(row))
        menu.addAction(rename_action)

        delete_action = QAction("删除", self._mw)
        delete_action.triggered.connect(
            lambda checked, row=idx, name=doc_name: self._ceshu_context_delete(row, name))
        menu.addAction(delete_action)

        menu.exec(self._mw.project_list.mapToGlobal(pos))

    def _ceshu_context_rename(self, row: int):
        if self._mw.ceshu_home is None:
            return
        try:
            self.update_ceshu_project_list()
        except RuntimeError as e:
            logger.debug(f"操作失败: {e}")

    def _ceshu_context_delete(self, row: int, name: str):
        if self._mw.ceshu_home is None:
            return
        try:
            self.update_ceshu_project_list()
        except RuntimeError as e:
            logger.debug(f"操作失败: {e}")

    def on_project_list_new_ceshu(self):
        """左栏按钮：新建策划书"""
        if self._mw.ceshu_home is not None:
            try:
                self._mw.ceshu_home._on_new_clicked()
                self.update_ceshu_project_list()
            except RuntimeError as e:
                logger.debug(f"操作失败: {e}")

    def on_project_list_ai_ceshu(self):
        """左栏按钮：AI生成策划书"""
        if self._mw.ceshu_home is not None:
            try:
                self.update_ceshu_project_list()
            except RuntimeError as e:
                logger.debug(f"操作失败: {e}")

    def on_project_list_export_ceshu(self):
        """左栏按钮：导出当前策划书

        优先复用编辑器内置 _on_export（弹文件对话框 + 调用 CeshuManager.export_ceshu）；
        若未打开任何策划书则提示用户先打开。
        """
        editor = getattr(self._mw, 'ceshu_editor', None)
        if editor is None:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.information(self._mw, "导出策划书", "请先打开一本策划书后再点击导出按钮。")
            return
        try:
            editor.objectName()
        except RuntimeError:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.information(self._mw, "导出策划书", "请先打开一本策划书后再点击导出按钮。")
            return
        editor._on_export()
        try:
            self.update_ceshu_project_list()
        except RuntimeError as e:
            logger.debug(f"操作失败: {e}")
