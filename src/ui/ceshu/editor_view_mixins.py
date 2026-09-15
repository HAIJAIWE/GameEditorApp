"""editor_view 拆分出的功能 mixin。"""
from __future__ import annotations

from typing import Any, cast

from PyQt6.QtWidgets import QInputDialog, QMessageBox, QWidget

from .editor_view_workers import _AIFillChapterWorker, _AIFillFieldWorker
from .preset_market_dialog import PresetMarketDialog
from .validation_dialog import ValidationReportDialog


def _self_qwidget(self: Any) -> QWidget:
    """mixin 未继承 QWidget，运行时与实际宿主（QWidget 子类）组合，这里做类型收窄转换。"""
    return cast(QWidget, self)


class _CeshuMixinBase:
    """mixin 公共宿主声明：以下属性/方法由宿主 CeshuEditorView 组合注入。"""

    _model: Any
    _manager: Any
    _ceshu_id: str
    _library: str
    _dirty: bool
    _chapter_panel: Any
    _preview_panel: Any
    _library_root: Any
    _data_manager: Any
    _btn_ai_empty: Any

    def _refresh_chapter_forms(self) -> None:
        """由宿主实现：刷新各章节表单 UI。"""
        ...

    def _build_enabled_editors(self, enabled_keys: list) -> Any:
        """由宿主实现：根据启用状态构建编辑器映射，供预览面板刷新。"""
        ...

    def save_ceshu(self) -> None:
        """由宿主实现：保存当前策划书。"""
        ...

    def load_ceshu(self, ceshu_id: str, library: str) -> None:
        """由宿主实现：按 id 加载策划书版本。"""
        ...


class AIMixin(_CeshuMixinBase):

    _ai_field_worker: _AIFillFieldWorker | None
    _ai_chapter_worker: _AIFillChapterWorker | None
    _pending_ai_buttons: dict[str, object]
    _btn_ai_chapter: Any

    def _on_ai_fill_field(self, chapter_key: str, field_path: str) -> None:
        """F1: 收到字段级 AI 填充请求，启动后台 worker 调用 AI

        流程：
        1. 从 model 读取当前字段内容（作为 AI 上下文）
        2. 启动 _AIFillFieldWorker 后台线程
        3. 完成后通过 _on_ai_field_done 回填到表单 + 恢复按钮状态
        """
        if not self._model or not self._ceshu_id:
            QMessageBox.warning(_self_qwidget(self), "AI 填充", "请先加载策划书")
            return
        # 防重入：若已有 worker 在跑，提示
        if self._ai_field_worker and self._ai_field_worker.isRunning():
            QMessageBox.information(_self_qwidget(self), "AI 填充", "已有 AI 任务进行中，请稍候")
            return

        # 读取当前字段内容
        current = ""
        try:
            ch_data = self._model.get_chapter(chapter_key) or {}
            field_name = field_path.split(".", 1)[-1] if "." in field_path else field_path
            v = ch_data.get(field_name, "")
            if isinstance(v, (str, int, float)):
                current = str(v)
        except Exception:
            pass

        # 提取字段显示名（label）
        field_label = field_path

        # 启动 worker
        self._ai_field_worker = _AIFillFieldWorker(
            chapter_key=chapter_key,
            field_path=field_path,
            field_label=field_label,
            current_content=current,
            ceshu_id=self._ceshu_id,
            library=self._library,
            parent=self,
        )
        self._ai_field_worker.succeeded.connect(
            lambda content, ck=chapter_key, fp=field_path: self._on_ai_field_done(ck, fp, content))
        self._ai_field_worker.failed.connect(self._on_ai_field_failed)
        self._ai_field_worker.start()


    def _on_ai_field_done(self, chapter_key: str, field_path: str, content: str) -> None:
        """F1: AI 字段填充成功，回填到表单"""
        ok = self._chapter_panel.apply_ai_content(chapter_key, field_path, content)
        if ok:
            # 回填成功后表单已自动 emit data_changed，model 已同步
            self._dirty = True
            # 恢复所有 AI 按钮状态（防止按钮卡在 busy）
            self._reset_ai_buttons(chapter_key, field_path)
        else:
            QMessageBox.warning(
                _self_qwidget(self), "AI 回填失败",
                f"AI 已生成内容但无法回填到字段「{field_path}」。\n"
                f"可能原因：字段类型不匹配或字段不存在。\n\n"
                f"生成内容预览：\n{content[:200]}")
            self._reset_ai_buttons(chapter_key, field_path)


    def _on_ai_field_failed(self, error_msg: str) -> None:
        """F1: AI 字段填充失败"""
        QMessageBox.warning(_self_qwidget(self), "AI 填充失败", error_msg)
        # 恢复所有 AI 按钮
        for fp in list(self._pending_ai_buttons.keys()):
            self._reset_ai_buttons("", fp)


    def _reset_ai_buttons(self, chapter_key: str, field_path: str) -> None:
        """F1: 恢复指定字段路径对应的 AI 按钮状态"""
        from .ai_field_button import AIFieldButton
        # 在整个 chapter_panel 中查找匹配的按钮
        buttons = self._chapter_panel.findChildren(AIFieldButton)
        for btn in buttons:
            if btn.is_busy() and (not field_path or btn._field_path == field_path):
                btn.set_busy(False)


    def _on_ai_fill_chapter(self) -> None:
        """F7: AI 一键生成整章内容

        1. 让用户选择要生成的章节
        2. 启动后台 worker 调用 AI
        3. 完成后解析 JSON 并回填到对应字段
        """
        if not self._model or not self._ceshu_id:
            QMessageBox.information(_self_qwidget(self), "AI 整章", "请先加载策划书")
            return
        if self._ai_chapter_worker and self._ai_chapter_worker.isRunning():
            QMessageBox.information(_self_qwidget(self), "AI 整章", "已有 AI 任务进行中，请稍候")
            return

        # 让用户选择章节
        from core.ceshu.ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS
        items = [CHAPTER_LABELS.get(k, k) for k in CHAPTER_KEYS]
        cur_chapter = self._chapter_panel.get_current_chapter()
        cur_idx = CHAPTER_KEYS.index(cur_chapter) if cur_chapter in CHAPTER_KEYS else 0
        label, ok = QInputDialog.getItem(
            _self_qwidget(self), "AI 整章生成",
            "选择要生成的章节（AI 将覆盖现有内容）：",
            items, cur_idx, False
        )
        if not ok:
            return
        idx = items.index(label)
        chapter_key = CHAPTER_KEYS[idx]

        # 二次确认（防止误覆盖）
        reply = QMessageBox.question(
            _self_qwidget(self), "确认 AI 整章生成",
            f"将使用 AI 生成「{label}」整章内容，可能覆盖现有字段。\n"
            f"建议先生成新内容到剪贴板再手动粘贴，或确认覆盖。\n\n"
            f"是否继续？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if reply != QMessageBox.StandardButton.Yes:
            return

        # 启动 worker
        self._btn_ai_chapter.setEnabled(False)
        self._btn_ai_chapter.setText("AI 整章生成中...")
        self._ai_chapter_worker = _AIFillChapterWorker(
            chapter_key=chapter_key,
            ceshu_id=self._ceshu_id,
            library=self._library,
            parent=self,
        )
        self._ai_chapter_worker.succeeded.connect(
            lambda content, ck=chapter_key: self._on_ai_chapter_done(ck, content))
        self._ai_chapter_worker.failed.connect(self._on_ai_chapter_failed)
        self._ai_chapter_worker.start()


    def _on_ai_chapter_done(self, chapter_key: str, content: str) -> None:
        """F7: AI 整章生成成功，解析 JSON 并回填"""
        self._btn_ai_chapter.setEnabled(True)
        self._btn_ai_chapter.setText("AI 整章")

        # 解析 LLM 返回的 JSON
        from common.logger import get_logger
        from core.agent.skills.ceshu_skill import CeshuSkill
        parsed = CeshuSkill._parse_llm_json(content, get_logger())
        if not parsed or not isinstance(parsed, dict):
            QMessageBox.warning(
                _self_qwidget(self), "AI 整章生成",
                f"AI 返回内容无法解析为 JSON，请重试。\n\n内容预览：\n{content[:300]}")
            return

        # 兼容两种格式：1) 直接是字段字典 2) 嵌套在 chapter_key 下
        chapter_data = parsed.get(chapter_key, parsed)
        if not isinstance(chapter_data, dict):
            QMessageBox.warning(_self_qwidget(self), "AI 整章生成", "AI 返回的章节内容格式异常")
            return

        # 更新 model
        try:
            existing = self._model.get_chapter(chapter_key) or {}
            if isinstance(existing, dict):
                existing.update(chapter_data)
                self._model.set_chapter(chapter_key, existing)
            else:
                self._model.set_chapter(chapter_key, chapter_data)
        except Exception as e:
            QMessageBox.warning(_self_qwidget(self), "AI 整章生成", f"更新 model 失败: {e}")
            return

        # 刷新表单 UI
        self._refresh_chapter_forms()
        self._dirty = True
        self._chapter_panel.refresh_progress()
        filled_count = sum(1 for v in chapter_data.values() if v)
        QMessageBox.information(
            _self_qwidget(self), "AI 整章生成完成",
            f"已生成「{chapter_key}」章节内容，共填充 {filled_count} 个字段。\n"
            f"建议检查内容并按需调整。")


    def _on_ai_chapter_failed(self, error_msg: str) -> None:
        """F7: AI 整章生成失败"""
        self._btn_ai_chapter.setEnabled(True)
        self._btn_ai_chapter.setText("AI 整章")
        QMessageBox.warning(_self_qwidget(self), "AI 整章生成失败", error_msg)


    def _on_ai_fill_empty_fields(self) -> None:
        """d3: AI 补全本章空字段 — 保留已有内容，只生成空字段。"""
        if not self._model or not self._ceshu_id:
            QMessageBox.information(_self_qwidget(self), "AI 补空", "请先加载策划书")
            return
        if self._ai_chapter_worker and self._ai_chapter_worker.isRunning():
            QMessageBox.information(_self_qwidget(self), "AI 补空", "已有 AI 任务进行中，请稍候")
            return
        cur = self._chapter_panel.get_current_chapter()
        if not cur:
            return
        self._set_ai_empty_button_busy(True)
        self._ai_chapter_worker = _AIFillChapterWorker(
            chapter_key=cur,
            ceshu_id=self._ceshu_id,
            library=self._library,
            only_empty=True,
            parent=self,
        )
        self._ai_chapter_worker.succeeded.connect(
            lambda content, ck=cur: self._on_ai_empty_done(ck, content))
        self._ai_chapter_worker.failed.connect(self._on_ai_empty_failed)
        self._ai_chapter_worker.nothing_to_fill.connect(self._on_ai_empty_nothing)
        self._ai_chapter_worker.start()


    def _on_ai_empty_done(self, chapter_key: str, content: str) -> None:
        """d3: 补空成功 — 复用整章生成的回填与刷新逻辑。"""
        self._reset_ai_empty_button()
        self._on_ai_chapter_done(chapter_key, content)


    def _on_ai_empty_failed(self, error_msg: str) -> None:
        self._reset_ai_empty_button()
        QMessageBox.warning(_self_qwidget(self), "AI 补空失败", error_msg)


    def _on_ai_empty_nothing(self) -> None:
        self._reset_ai_empty_button()
        QMessageBox.information(_self_qwidget(self), "AI 补空", "本章没有空字段，无需补全。")


    def _set_ai_empty_button_busy(self, busy: bool) -> None:
        """d3: 更新「AI 补空」按钮状态（按钮已收进「更多」菜单，从菜单触发时可能不存在）。"""
        btn = getattr(self, "_btn_ai_empty", None)
        if btn is not None:
            btn.setEnabled(not busy)
            btn.setText("补空生成中..." if busy else "AI 补空")

    def _reset_ai_empty_button(self) -> None:
        self._set_ai_empty_button_busy(False)


    def _on_ai_full_generate(self) -> None:
        """N10: 打开 AI 一键生成对话框，从简要描述生成完整 18 章 GDD。

        生成完成后通过 ``_on_ai_full_generated`` 应用到 model 并刷新 UI。
        """
        from .ai_full_generate_dialog import AIFullGenerateDialog
        dlg = AIFullGenerateDialog(parent=_self_qwidget(self), model=self._model)
        dlg.generation_completed.connect(self._on_ai_full_generated)
        dlg.generation_failed.connect(
            lambda msg: QMessageBox.warning(_self_qwidget(self), "AI 生成失败", msg))
        dlg.exec()


    def _on_ai_full_generated(self, chapters_data: dict) -> None:
        """N10: AI 生成完成回调 — 应用到 model 并刷新 UI。

        Args:
            chapters_data: 章节键到生成内容的字典，例如
                {"meta": {...}, "vision": {...}, ...}
        """
        if not self._model or not chapters_data:
            return

        from core.ceshu.ceshu_model import CHAPTER_KEYS
        applied = 0
        for chapter_key in CHAPTER_KEYS:
            chapter_data = chapters_data.get(chapter_key)
            if not chapter_data or not isinstance(chapter_data, dict):
                continue
            try:
                if chapter_key == "meta":
                    self._model.meta.update(chapter_data)
                elif chapter_key == "systems":
                    for sys_key, sys_val in chapter_data.items():
                        if not isinstance(sys_val, dict):
                            continue
                        if sys_key in self._model.systems:
                            self._model.systems[sys_key].update(sys_val)
                        else:
                            self._model.systems[sys_key] = sys_val
                else:
                    existing = getattr(self._model, chapter_key, {})
                    if isinstance(existing, dict):
                        existing.update(chapter_data)
                        setattr(self._model, chapter_key, existing)
                    else:
                        setattr(self._model, chapter_key, chapter_data)
                applied += 1
            except Exception:
                continue

        # 刷新 UI
        self._refresh_chapter_forms()
        enabled = self._model.compute_enabled_editors()
        self._preview_panel.refresh(self._build_enabled_editors(enabled))
        self._chapter_panel.refresh_progress()
        self._dirty = True
        # 自动保存
        self.save_ceshu()
        if applied:
            QMessageBox.information(
                _self_qwidget(self), "已应用生成结果",
                f"已将 AI 生成的 {applied} 章内容应用到当前策划书。")


    def _on_ai_data_generate(self) -> None:
        """N20: 打开 AI 数据生成对话框 — 从策划书设定生成候选游戏数据，人工勾选后导入。"""
        if not self._model or not self._ceshu_id:
            QMessageBox.information(_self_qwidget(self), "AI 数据生成", "请先加载策划书")
            return
        from .ai_data_generate_dialog import AIDataGenerateDialog
        dm = getattr(self, "_data_manager", None)
        dlg = AIDataGenerateDialog(parent=_self_qwidget(self), model=self._model, data_manager=dm)
        dlg.data_imported.connect(self._on_ai_data_imported)
        dlg.exec()


    def _on_ai_data_imported(self, count: int) -> None:
        """候选数据导入完成 — 通知数据表刷新并标记数据变更。"""
        if count <= 0:
            return
        host = _self_qwidget(self)
        mw = host.window()
        refresh = getattr(mw, "_refresh_all_tabs", None)
        if callable(refresh):
            refresh()
        mark = getattr(mw, "mark_data_changed", None)
        if callable(mark):
            mark()


    def _on_ai_review(self) -> None:
        """N6: 弹出 AI 智能审阅对话框（5 维度评分 + Top 3 改进建议）。"""
        if not self._model or not self._ceshu_id:
            QMessageBox.information(_self_qwidget(self), "AI 审阅", "请先加载策划书")
            return
        from .ai_review_dialog import AIReviewDialog
        dlg = AIReviewDialog(
            self._model, self._ceshu_id, self._library, parent=_self_qwidget(self))
        dlg.exec()


class VersionMixin(_CeshuMixinBase):

    _version_label: Any
    _btn_activate: Any
    _btn_derive: Any
    systems_changed: Any

    def _on_version_diff(self) -> None:
        """N1: 弹出版本对比工具对话框

        对比同版本链下两个版本的策划书，高亮变更字段。
        """
        if not self._manager or not self._ceshu_id:
            QMessageBox.information(_self_qwidget(self), "版本对比", "请先加载策划书")
            return
        from .version_diff_dialog import VersionDiffDialog
        dlg = VersionDiffDialog(
            self._manager, self._library, self._ceshu_id, parent=self)
        dlg.exec()


    def _on_derive_clicked(self) -> None:
        """P8: 派生新版本（编辑器内入口）"""
        if not self._model or not self._manager:
            return
        from PyQt6.QtWidgets import QInputDialog
        note, ok = QInputDialog.getText(
            _self_qwidget(self), "派生新版本",
            f"基于当前版本 {self._model.version_label} 派生子版本\n"
            f"请输入本次迭代说明：",
            text="",
        )
        if not ok:
            return
        new_model = self._manager.derive_version(
            self._library, self._ceshu_id,
            version_label="",
            version_note=note.strip(),
        )
        if new_model:
            QMessageBox.information(
                _self_qwidget(self), "派生成功",
                f"已派生子版本 {new_model.version_label}\n"
                f"新版本默认非激活。"
            )
            # 切换到新版本
            self.load_ceshu(new_model.ceshu_id, self._library)
            self.systems_changed.emit()  # 触发 Tab 过滤刷新


    def _on_activate_clicked(self) -> None:
        """P8: 设为激活版本"""
        if not self._model or not self._manager:
            return
        reply = QMessageBox.question(
            _self_qwidget(self), "设为激活版本",
            f"确定将版本 {self._model.version_label} 设为激活版本吗？\n"
            f"同版本链下其他版本将取消激活。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if reply != QMessageBox.StandardButton.Yes:
            return
        ok = self._manager.set_active_version(self._library, self._ceshu_id)
        if ok:
            # 重新加载
            self.load_ceshu(self._ceshu_id, self._library)
            QMessageBox.information(_self_qwidget(self), "已激活", f"版本 {self._model.version_label} 已设为激活")
        else:
            QMessageBox.warning(_self_qwidget(self), "失败", "激活失败，请查看日志")


    def _refresh_version_display(self) -> None:
        """P8: 刷新版本信息标签和按钮可见性"""
        # 「派生新版本」按钮已收进「更多」菜单（d2 收敛），引用需防御式访问
        derive_btn = getattr(self, "_btn_derive", None)
        if not self._model:
            self._version_label.setText("")
            self._btn_activate.setVisible(False)
            if derive_btn is not None:
                derive_btn.setVisible(False)
            return
        self._version_label.setText(self._model.version_display)
        # 非激活版本显示"设为激活"按钮
        self._btn_activate.setVisible(not self._model.is_active)
        # 主策划和子策划都可以派生新版本
        if derive_btn is not None:
            derive_btn.setVisible(True)


    def _on_version_timeline(self) -> None:
        """N7: 弹出版本时间线对话框，支持切换版本。"""
        if not self._manager or not self._ceshu_id:
            QMessageBox.information(_self_qwidget(self), "版本时间线", "请先加载策划书")
            return
        from .version_timeline_dialog import VersionTimelineDialog
        dlg = VersionTimelineDialog(
            self._manager, self._library, self._ceshu_id, parent=_self_qwidget(self))
        dlg.version_selected.connect(self._on_timeline_version_selected)
        dlg.exec()


    def _on_timeline_version_selected(self, ceshu_id: str) -> None:
        """N7: 时间线中选择切换版本后重新加载。"""
        if not ceshu_id or not self._library:
            return
        self.load_ceshu(ceshu_id, self._library)
        self.systems_changed.emit()


    def _on_changelog(self) -> None:
        """N15: 弹出变更日志对话框。

        从同版本链下的版本对比自动生成 changelog，
        支持导出 Markdown / HTML / 纯文本。
        """
        if not self._manager or not self._ceshu_id:
            QMessageBox.information(_self_qwidget(self), "变更日志", "请先加载策划书")
            return
        from .changelog_dialog import ChangelogDialog
        dlg = ChangelogDialog(
            self._manager, self._library, self._ceshu_id, parent=_self_qwidget(self))
        dlg.exec()


class ExportMixin(_CeshuMixinBase):

    _btn_export: Any

    def _on_export(self) -> None:
        """P10: 导出策划书 — 弹出菜单选择导出格式"""
        if not self._model or not self._manager:
            return
        from PyQt6.QtWidgets import QFileDialog, QMenu, QMessageBox
        menu = QMenu(_self_qwidget(self))
        act_json = menu.addAction("导出为 .ceshu（JSON，单版本）")
        act_chain = menu.addAction("导出为 .ceshu（JSON，含完整版本链）")
        act_md = menu.addAction("导出为 .md（Markdown 文档，适合 Git 版本控制）")
        act_html = menu.addAction("导出为 .html（交互式网页，带目录导航）")
        act_docx = menu.addAction("导出为 .docx（Word 工业级 GDD，18 章完整结构）")
        act_pdf = menu.addAction("导出为 .pdf（PDF 带书签大纲，18 章完整结构）")
        act_pptx = menu.addAction("导出为 .pptx（PowerPoint 演示文稿，16:9 宽屏）")
        act_xlsx = menu.addAction("导出为 .xlsx（Excel 工作簿，多 Sheet 数据分析）")
        action = menu.exec(self._btn_export.mapToGlobal(self._btn_export.rect().bottomLeft()))
        if action is None:
            return

        # 默认文件名带版本号
        game_name = self._model.meta.get("game_name", "未命名")
        vlabel = self._model.version_label or "v1.0"
        safe_name = "".join(c for c in game_name if c.isalnum() or c in "._-") or "ceshu"
        default_name = f"{safe_name}_{vlabel}"

        try:
            if action == act_json:
                path, _ = QFileDialog.getSaveFileName(
                    _self_qwidget(self), "导出策划书", default_name + ".ceshu", "Ceshu 文件 (*.ceshu)")
                if not path:
                    return
                out = self._manager.export_ceshu(
                    self._ceshu_id, self._library, path, include_version_chain=False)
                QMessageBox.information(_self_qwidget(self), "导出成功", f"策划书已导出到:\n{out}")
            elif action == act_chain:
                path, _ = QFileDialog.getSaveFileName(
                    _self_qwidget(self), "导出版本链", default_name + "_chain.ceshu", "Ceshu 文件 (*.ceshu)")
                if not path:
                    return
                out = self._manager.export_ceshu(
                    self._ceshu_id, self._library, path, include_version_chain=True)
                QMessageBox.information(
                    _self_qwidget(self), "导出成功",
                    f"完整版本链已导出到:\n{out}\n\n"
                    f"包含同版本链下的所有策划书版本。")
            elif action == act_md:
                path, _ = QFileDialog.getSaveFileName(
                    _self_qwidget(self), "导出 Markdown", default_name + ".md", "Markdown 文件 (*.md)")
                if not path:
                    return
                out = self._manager.export_ceshu_markdown(
                    self._ceshu_id, self._library, path, include_validation_report=True)
                QMessageBox.information(
                    _self_qwidget(self), "导出成功",
                    f"Markdown 文档已导出到:\n{out}\n\n"
                    f"包含 18 章完整结构 + 目录锚点 + 校验报告附录。\n"
                    f"适合 Git 版本控制与团队协作。")
            elif action == act_html:
                path, _ = QFileDialog.getSaveFileName(
                    _self_qwidget(self), "导出 HTML", default_name + ".html", "HTML 文件 (*.html)")
                if not path:
                    return
                out = self._manager.export_ceshu_html(
                    self._ceshu_id, self._library, path, include_validation_report=True)
                QMessageBox.information(
                    _self_qwidget(self), "导出成功",
                    f"交互式 HTML 文档已导出到:\n{out}\n\n"
                    f"包含左侧目录导航 + 深色/浅色主题切换 + 响应式布局 + 校验报告。\n"
                    f"双击即可在浏览器中打开。")
            elif action == act_docx:
                path, _ = QFileDialog.getSaveFileName(
                    _self_qwidget(self), "导出 Word 文档", default_name + ".docx", "Word 文档 (*.docx)")
                if not path:
                    return
                out = self._manager.export_ceshu_docx(
                    self._ceshu_id, self._library, path, include_validation_report=True)
                QMessageBox.information(
                    _self_qwidget(self), "导出成功",
                    f"工业级 GDD Word 文档已导出到:\n{out}\n\n"
                    f"包含 18 章完整结构 + 章节进度统计 + 校验报告附录。")
            elif action == act_pdf:
                path, _ = QFileDialog.getSaveFileName(
                    _self_qwidget(self), "导出 PDF 文档", default_name + ".pdf", "PDF 文档 (*.pdf)")
                if not path:
                    return
                out = self._manager.export_ceshu_pdf(
                    self._ceshu_id, self._library, path, include_validation_report=True)
                QMessageBox.information(
                    _self_qwidget(self), "导出成功",
                    f"PDF 文档已导出到:\n{out}\n\n"
                    f"包含 18 章完整结构 + 书签大纲 + 章节进度统计 + 校验报告附录。")
            elif action == act_pptx:
                path, _ = QFileDialog.getSaveFileName(
                    _self_qwidget(self), "导出 PowerPoint", default_name + ".pptx",
                    "PowerPoint 文档 (*.pptx)")
                if not path:
                    return
                out = self._manager.export_ceshu_pptx(
                    self._ceshu_id, self._library, path, include_validation_report=True)
                QMessageBox.information(
                    _self_qwidget(self), "导出成功",
                    f"PowerPoint 演示文稿已导出到:\n{out}\n\n"
                    f"包含 18 章完整结构 + 封面 + 目录 + 章节完成度 + 校验报告附录。\n"
                    f"16:9 宽屏布局，深色主题。")
            elif action == act_xlsx:
                path, _ = QFileDialog.getSaveFileName(
                    _self_qwidget(self), "导出 Excel", default_name + ".xlsx",
                    "Excel 工作簿 (*.xlsx)")
                if not path:
                    return
                out = self._manager.export_ceshu_excel(
                    self._ceshu_id, self._library, path)
                QMessageBox.information(
                    _self_qwidget(self), "导出成功",
                    f"Excel 工作簿已导出到:\n{out}\n\n"
                    f"包含 8 个 Sheet：概览 / 系统配置 / 数值表 / 角色 / "
                    f"里程碑 / 风险 / 竞品 / 校验报告。\n"
                    f"标题行加粗 + 冻结首行 + 列宽自适应。")
        except Exception as e:
            QMessageBox.critical(_self_qwidget(self), "导出失败", str(e))


class TemplateMixin(_CeshuMixinBase):

    def _on_template_picker(self) -> None:
        """N5: 弹出章节模板库对话框

        展示 18 章预置模板，支持搜索 + 预览 + 一键应用。
        应用后通过 chapter_panel.apply_template 回填到表单。
        """
        if not self._model:
            QMessageBox.information(_self_qwidget(self), "模板库", "请先加载策划书")
            return
        from .template_picker_dialog import TemplatePickerDialog
        cur_chapter = self._chapter_panel.get_current_chapter()
        dlg = TemplatePickerDialog(self._model, cur_chapter, parent=_self_qwidget(self))
        dlg.template_applied.connect(self._on_template_applied)
        dlg.exec()


    def _on_template_applied(self, chapter_key: str, merged_data: dict) -> None:
        """N5: 模板应用回调 — 回填到表单 + 同步 model + 刷新预览"""
        if not self._model:
            return
        # 更新 model
        try:
            self._model.set_chapter(chapter_key, merged_data)
        except Exception as e:
            QMessageBox.warning(_self_qwidget(self), "模板应用", f"更新 model 失败: {e}")
            return
        # 回填到表单（会触发 data_changed）
        self._chapter_panel.apply_template(chapter_key, merged_data)
        # 刷新预览面板
        if chapter_key == "systems":
            enabled = self._model.compute_enabled_editors()
            self._preview_panel.refresh(self._build_enabled_editors(enabled))
        # 标记脏数据
        self._dirty = True
        # 刷新章节进度
        self._chapter_panel.refresh_progress()


    def _on_template_editor(self) -> None:
        """N13: 弹出 GDD 模板编辑器对话框。

        让用户把当前章节保存为可复用的自定义模板，或管理已有自定义模板。
        自定义模板独立存储于 data/custom_templates/，不与内置 CHAPTER_TEMPLATES 混淆。
        """
        import os

        from core.ceshu.custom_template_manager import CustomTemplateManager

        from .template_editor_dialog import TemplateEditorDialog
        data_root = self._library_root or os.path.join(
            os.path.dirname(__file__), "..", "..", "..", "data")
        # 若 library_root 已包含到 libraries/，则取上一级
        if os.path.basename(data_root) == "libraries":
            data_root = os.path.dirname(data_root)
        manager = CustomTemplateManager(data_root)
        cur_chapter = self._chapter_panel.get_current_chapter()
        dlg = TemplateEditorDialog(
            model=self._model, manager=manager,
            current_chapter=cur_chapter,
            data_root=data_root, parent=_self_qwidget(self),
        )
        dlg.template_saved.connect(self._on_template_editor_saved)
        dlg.exec()


    def _on_template_editor_saved(self, chapter_key: str, data: dict) -> None:
        """N13: 模板编辑器中"应用到当前章节"或"保存"后回填到 model。"""
        if not self._model or not chapter_key or not data:
            return
        try:
            existing = self._model.get_chapter(chapter_key) or {}
            if isinstance(existing, dict):
                merged = dict(existing)
                merged.update(data)
                self._model.set_chapter(chapter_key, merged)
            else:
                self._model.set_chapter(chapter_key, data)
        except Exception as e:
            QMessageBox.warning(_self_qwidget(self), "模板编辑", f"应用数据失败: {e}")
            return
        # 回填到表单
        self._chapter_panel.apply_template(chapter_key, data)
        # 刷新预览面板
        if chapter_key == "systems":
            enabled = self._model.compute_enabled_editors()
            self._preview_panel.refresh(self._build_enabled_editors(enabled))
        self._dirty = True
        self._chapter_panel.refresh_progress()


class ReviewMixin(_CeshuMixinBase):

    def _on_validate(self) -> None:
        """v5.0: 弹出工业级校验报告对话框

        展示 CeshuModel.validate() 返回的全部错误（按分类）+ 章节完成度进度条。
        数据已通过 data_changed 信号实时同步到 model，无需额外 flush。
        """
        if not self._model:
            QMessageBox.information(_self_qwidget(self), "校验", "请先加载策划书")
            return
        dlg = ValidationReportDialog(self._model, parent=self)
        dlg.exec()


    def _on_score_report(self) -> None:
        """N4: 弹出工业级 GDD 评分报告对话框

        对当前策划书进行三维度评分：结构完整度 + 内容质量 + 市场潜力。
        """
        if not self._model:
            QMessageBox.information(_self_qwidget(self), "评分", "请先加载策划书")
            return
        from .score_report_dialog import ScoreReportDialog
        dlg = ScoreReportDialog(self._model, parent=_self_qwidget(self))
        dlg.exec()


    def _on_checklist(self) -> None:
        """N11: 弹出 GDD 完备性检查清单对话框。

        预制作就绪检查：50 项检查清单覆盖 6 大类，
        含自动检查与人工核查，输出就绪度评分与制作就绪判定。
        """
        if not self._model:
            QMessageBox.information(_self_qwidget(self), "检查清单", "请先加载策划书")
            return
        from .checklist_dialog import ChecklistDialog
        dlg = ChecklistDialog(self._model, parent=_self_qwidget(self))
        dlg.exec()


    def _on_field_dependency_graph(self) -> None:
        """N14: 弹出字段依赖关系图对话框。

        可视化展示 18 章节之间的字段级依赖关系：
        - 节点颜色按违规状态着色（绿/黄/红）
        - 边线型按依赖类型区分（实线/虚线/点线）
        - 支持检查依赖、导出图片
        """
        if not self._model:
            QMessageBox.information(_self_qwidget(self), "字段依赖图", "请先加载策划书")
            return
        from .field_dependency_graph import FieldDependencyGraphDialog
        dlg = FieldDependencyGraphDialog(self._model, parent=self)
        dlg.exec()


    def _on_word_stats(self) -> None:
        """F6: 弹出字数统计与写作建议对话框

        统计每章字数，对照工业级 GDD 标准给出改进建议。
        """
        if not self._model:
            QMessageBox.information(_self_qwidget(self), "字数统计", "请先加载策划书")
            return
        from .word_stats_dialog import WordStatsDialog
        dlg = WordStatsDialog(self._model, parent=self)
        dlg.exec()


class SystemMixin(_CeshuMixinBase):

    systems_changed: Any

    def show_system_confirm(self) -> None:
        """P3: 弹出系统确认对话框（AI 生成后调用）

        让用户确认/调整 AI 推荐的游戏系统 + 字段架构预览
        """
        if not self._model:
            return

        from .system_confirm_dialog import SystemConfirmDialog
        dlg = SystemConfirmDialog(self._model, parent=self)
        dlg.confirmed.connect(self._on_system_confirmed)
        dlg.exec()


    def _on_system_confirmed(self, enabled_keys: list) -> None:
        """P3: 系统确认完成 → 保存 + 刷新预览"""
        if not self._model:
            return
        # 标记为已确认，下次打开不再弹窗
        self._model.meta["system_confirmed"] = True
        # 保存策划书
        if self._manager:
            self._manager.save_ceshu(self._model, self._library)
        # 刷新预览面板
        enabled = self._model.compute_enabled_editors()
        self._preview_panel.refresh(self._build_enabled_editors(enabled))
        # 通知父级（CeshuController）更新数据 Tab 过滤
        self.systems_changed.emit()


    def _on_preset_market(self) -> None:
        """v5.0 优化D: 弹出混合玩法预设市场对话框

        展示 18 个工业级预设，支持搜索 + 一键应用。
        """
        if not self._model:
            QMessageBox.information(_self_qwidget(self), "预设市场", "请先加载策划书")
            return
        dlg = PresetMarketDialog(self._model, parent=self)
        dlg.preset_applied.connect(self._on_preset_applied)
        dlg.exec()


    def _on_preset_applied(self, preset_key: str) -> None:
        """v5.0 优化D: 预设应用后刷新 UI"""
        # 刷新游戏系统编辑器
        if self._chapter_panel and hasattr(self._chapter_panel, '_systems_editor'):
            self._chapter_panel._systems_editor.set_data(self._model.systems)
        # 刷新预览面板
        enabled = self._model.compute_enabled_editors()
        self._preview_panel.refresh(self._build_enabled_editors(enabled))
        # v5.0 优化C: 同时刷新各章节表单（让 auto_fill_required 的结果在 UI 显示）
        self._refresh_chapter_forms()
        # 标记脏数据
        self._dirty = True
        # 刷新章节进度
        self._chapter_panel.refresh_progress()

