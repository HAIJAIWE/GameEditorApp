"""对话消息渲染、流式进度与回滚 —— DigitalPanel 的 DigitalPanelChatMixin 部分

自 digital_employee.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""

from __future__ import annotations

from datetime import datetime
import html as html_mod
from typing import Optional

from PyQt6.QtCore import (
    QEvent,
    Qt,
    QTimer,
)

from common.logger import get_logger
from ui.digital_panel_state import DigitalPanelState

try:
    from config.settings import AppConfig, get_config
    _APP_CONFIG: Optional[AppConfig] = get_config()
except (ImportError, RuntimeError):
    _APP_CONFIG = None

logger = get_logger()



class DigitalPanelChatMixin(DigitalPanelState):
    """对话消息渲染、流式进度与回滚"""

    def _record_bubble(self, entry: dict):
        """记录气泡（格式化状态，非 HTML）"""
        if self._current_task_id is None:
            self._general_history.append(entry)
        else:
            hist = self._task_histories.setdefault(self._current_task_id, [])
            hist.append(entry)
    def _on_progress(self, event_type: str, data: dict):
        try:
            if event_type == "plan_ready":
                intent = data.get("intent", "")
                confidence = data.get("confidence", 0)
                steps = data.get("steps", 0)
                text = f"解析意图：「{intent}」（置信度 {confidence:.0%}，共 {steps} 步）"
                self._add_system_message(text)
                self._set_status("分析中...", f"共 {steps} 步", busy=True)

            elif event_type == "step_start":
                # 上一步若还有缓冲，先出面板
                if self._stream_buffer and len(self._stream_buffer) > 1:
                    self._flush_stream_step()
                tool = data.get("tool", "工具")
                order = data.get("order", 0)
                reason = data.get("reason", "")
                self._stream_buffer = [f"[{tool}]\n"]
                self._step_id_counter += 1
                step_info = f"步骤 {order}: {tool}"
                if reason:
                    step_info += f" — {reason[:40]}"
                self._set_status(step_info, busy=True)

            elif event_type == "stream_chunk":
                text = data.get("text", "")
                self._stream_buffer.append(text)
                self._set_status("LLM 生成中...", busy=True)

            elif event_type == "stream_done":
                if self._stream_buffer:
                    detail = "".join(self._stream_buffer)
                    self._add_collapsible_step("思考", detail, self._step_id_counter)
                    self._stream_buffer = []

            elif event_type == "step_done":
                tool = data.get("tool", "工具")
                result = data.get("result", "")
                detail = "".join(self._stream_buffer) if self._stream_buffer else ""
                if detail:
                    detail += f"\n\n→ {result}"
                else:
                    detail = f"→ {result}"
                self._add_collapsible_step(f"{tool}", detail, self._step_id_counter)
                self._stream_buffer = []
                self._set_status(f"✓ {tool} 完成", busy=False)

            elif event_type == "step_error":
                error = data.get("error", "未知错误")
                detail = "".join(self._stream_buffer) if self._stream_buffer else error
                self._add_collapsible_step("失败", detail, self._step_id_counter, error=True)
                self._stream_buffer = []
                self._set_status(f"✗ 出错: {error[:30]}", busy=False)
        except Exception as e:
            import traceback
            print(f"[_on_progress ERROR] {e}")
            traceback.print_exc()
    def _on_finished(self, result: dict):
        self._restore_send_button()
        self._remove_thinking_indicator()
        self._input_edit.setEnabled(True)
        self._input_edit.setFocus()
        self._set_status("就绪", busy=False)
        if result.get("success"):
            msg = self._format_results(result.get("results", {}))
            if msg:
                if result.get("has_plan"):
                    self._add_plan_bubble(msg)
                else:
                    self._add_assistant_bubble(msg)
        else:
            error = result.get("error", "未知错误")
            self._add_error_message(f"任务失败：{error}")
        # P2: AI 回复完成后自动保存草稿
        self._autosave_draft()
    def _add_plan_bubble(self, plan_text: str):
        """显示方案气泡，带执行按钮提示"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        import markdown
        md_html = markdown.markdown(plan_text, extensions=['fenced_code', 'nl2br', 'sane_lists'])
        try:
            from ui.themes import get_theme_colors, is_dark_theme
            c = get_theme_colors()
            dark = is_dark_theme()
            plan_accent = '#f59e0b' if dark else '#d97706'
            plan_bg = c['input_bg']
            plan_hint = c['hint']
        except Exception:
            dark = True
            plan_accent = '#f59e0b'
            plan_bg = '#292524'
            plan_hint = '#888'
        full_html = f'''
        <div style="margin:8px 0;display:flex;justify-content:flex-start;">
            <div style="max-width:85%;">
                <div style="color:{plan_accent};font-weight:bold;font-size: 14px;">分析方案 ({timestamp})</div>
                <div style="background:{plan_bg};color:inherit;padding:12px 16px;border-radius:12px 12px 12px 4px;
                            border:2px solid {plan_accent};margin-top:4px;font-size: 14px;line-height:1.5;">
                    {md_html}
                </div>
                <div style="margin-top:8px;font-size: 14px;color:{plan_hint};">
                    回复「<b style="color:{plan_accent};">执行</b>」开始实施 | 回复「<b>修改xxx</b>」调整方案
                </div>
            </div>
        </div>'''
        self._chat_display.append(full_html)
        self._record_bubble({"type": "plan", "text": plan_text, "timestamp": timestamp})
        self._scroll_to_bottom()
    def _format_results(self, results: dict) -> str:
        """提取技能返回的可读消息，跳过空结果"""
        if not results:
            return ""
        for step_order in sorted(results.keys()):
            data = results[step_order]
            # 优先取 message 字段（技能返回的格式化文本）
            if isinstance(data, dict) and data.get("message"):
                msg = data["message"]
                # 去掉消息中的 "暂无数据" 之类空结果
                if msg == "暂无数据":
                    return "暂无匹配数据"
                return msg
            if isinstance(data, str):
                return data[:2000]
        return ""
    def _is_dark_mode(self) -> bool:
        """从聊天框背景判断当前是否为深色模式"""
        bg = self._chat_display.palette().window().color()
        return (bg.red() + bg.green() + bg.blue()) / 3 < 128
    def _add_user_bubble(self, text: str):
        ts = datetime.now().strftime("%H:%M:%S")
        html = self._renderer.render_user_bubble(text, ts)
        self._chat_display.append(html)
        self._record_bubble({"type": "user", "text": text, "timestamp": ts})
        self._scroll_to_bottom()
    def _add_assistant_bubble(self, text: str):
        ts = datetime.now().strftime("%H:%M:%S")
        html = self._renderer.render_assistant_bubble(text, ts, self._current_conv_id)
        self._chat_display.append(html)
        self._record_bubble({"type": "assistant", "text": text, "timestamp": ts,
                             "conv_id": self._current_conv_id})
        self._scroll_to_bottom()
    def _add_system_message(self, text: str):
        html = self._renderer.render_system_message(text)
        self._chat_display.append(html)
        self._record_bubble({"type": "system", "text": text})
        self._scroll_to_bottom()
    def _add_error_message(self, text: str):
        html = self._renderer.render_error_message(text)
        self._chat_display.append(html)
        self._record_bubble({"type": "error", "text": text})
        self._scroll_to_bottom()
    def _scroll_to_bottom(self):
        sb = self._chat_display.verticalScrollBar()
        if sb:
            try:
                QTimer.singleShot(60, lambda: sb.setValue(sb.maximum()))
            except RuntimeError as e:
                logger.debug(f"滚动条设置失败: {e}")
    def _add_collapsible_step(self, title: str, detail: str, step_id: int, error: bool = False):
        """添加可折叠步骤 — 用 <a> 锚点实现可靠点击展开/收起"""
        self._step_data[step_id] = {"title": title, "detail": detail, "error": error}
        is_expanded = self._step_states.get(step_id, False)
        html = self._renderer.render_collapsible_step(
            title, detail, step_id, is_expanded, error
        )
        self._chat_display.append(html)
        self._scroll_to_bottom()
    def _rebuild_chat(self):
        """重建聊天显示 — 用渲染器重新渲染所有气泡和步骤块"""
        if self._current_task_id:
            history = list(self._task_histories.get(self._current_task_id, []))
        else:
            history = list(self._general_history)

        self._chat_display.clear()

        for entry in history:
            html = self._renderer.render_entry(entry)
            self._chat_display.append(html)

        for step_id in sorted(self._step_data.keys()):
            data = self._step_data[step_id]
            is_expanded = self._step_states.get(step_id, False)
            html = self._renderer.render_collapsible_step(
                data["title"], data["detail"], step_id,
                is_expanded, error=data.get("error", False)
            )
            self._chat_display.append(html)

        self._scroll_to_bottom()
    def _flush_stream_step(self):
        """强制输出当前缓冲的步骤为折叠面板"""
        if not self._stream_buffer:
            return
        detail = "".join(self._stream_buffer)
        self._add_collapsible_step("执行", detail, self._step_id_counter)
        self._stream_buffer = []
    def _rollback_conversation(self, conv_id: str):
        """回滚指定会话的所有数据操作"""
        dm = self._extra.get("data_manager") if self._extra else None
        if not dm:
            self._add_system_message("回滚失败：无法获取数据管理器")
            return
        try:
            from core.operation_log import OperationLog
            count, errors = OperationLog.rollback_conversation(conv_id, dm)
            if count > 0:
                self._add_system_message(f"↩ 已回退 {count} 项操作（此对话的所有修改已撤销）")
                if errors:
                    self._add_error_message("部分回滚失败:\n" + "\n".join(errors))
                # 刷新编辑器
                mw = self._extra.get("main_window") if self._extra else None
                if mw and hasattr(mw, 'on_data_changed'):
                    mw.on_data_changed()
            else:
                self._add_system_message("此对话没有可回退的数据操作")
        except Exception as e:
            self._add_error_message(f"回滚失败: {e}")
            self._logger.error("回滚异常", exc_info=True)
    def _event_filter_chat_and_workspace(self, obj, event):
        # 聊天区视图点击：检测锚点（可折叠步骤 + 回滚链接）
        if hasattr(self, '_chat_display') and obj == self._chat_display.viewport():
            if event.type() == QEvent.Type.MouseButtonPress and event.button() == Qt.MouseButton.LeftButton:
                cursor = self._chat_display.cursorForPosition(event.pos())
                fmt = cursor.charFormat()
                if fmt.isAnchor():
                    href = fmt.anchorHref()
                    # 可折叠步骤
                    if href.startswith("step://toggle/"):
                        try:
                            step_id = int(href.split("/")[-1])
                        except ValueError:
                            return False
                        current = self._step_states.get(step_id, False)
                        self._step_states[step_id] = not current
                        self._rebuild_chat()
                        return True
                    # 对话回滚
                    if href.startswith("conv://rollback/"):
                        conv_id = href.split("/")[-1]
                        self._rollback_conversation(conv_id)
                        return True
        # 工作区下拉列表右键
        if hasattr(self, '_workspace_combo') and obj == self._workspace_combo.view().viewport():
            if event.type() == QEvent.Type.MouseButtonPress and event.button() == Qt.MouseButton.RightButton:
                self._on_workspace_menu(event.pos())
                return True
        return False
    def _cancel_worker(self):
        if self._worker and self._worker.isRunning():
            self._worker.terminate()
            self._worker.wait(2000)
        self._restore_send_button()
        self._remove_thinking_indicator()
        self._input_edit.setEnabled(True)
        self._input_edit.setFocus()
        self._add_system_message("已取消")
    def _restore_send_button(self):
        self._send_btn.setText("↑")
        try:
            from ui.themes import get_theme_colors
            c = get_theme_colors()
            btn_bg = c['input_bg']
            hint = c['hint']
            border = c['border']
        except Exception:
            btn_bg, hint, border = '#21262d', '#484f58', '#30363d'
        self._send_btn.setStyleSheet(f"""
            QPushButton {{
                background: {btn_bg};
                color: {hint};
                border: none;
                border-radius: 16px;
                font-size: 16px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background: {border};
            }}
        """)
    def _add_thinking_indicator(self):
        self._thinking_id = f"thinking_{datetime.now().timestamp()}"
        try:
            from ui.themes import get_theme_colors, is_dark_theme
            c = get_theme_colors()
            is_dark_theme()
            skel_bg = c['input_bg']
            skel_fg = c['border']
            skel_mid = c['bg']
            think_color = c.get('accent', '#7ee787')
        except Exception:
            skel_bg, skel_fg, skel_mid, think_color = '#161b22', '#30363d', '#21262d', '#7ee787'
        html = f'''
        <div id="{self._thinking_id}" style="margin:8px 0;display:flex;justify-content:flex-start;">
            <div style="max-width:82%;">
                <div style="color:{think_color};font-size: 14px;margin-bottom:4px;">思考中...</div>
                <div class="skeleton-block" style="background:{skel_bg};border:1px solid {skel_fg};
                    border-radius:16px 16px 16px 4px;padding:12px 16px;min-height:36px;">
                    <div class="skeleton-line" style="height:12px;margin:4px 0;
                        background:linear-gradient(90deg,{skel_mid} 25%,{skel_fg} 50%,{skel_mid} 75%);
                        border-radius:8px;background-size:200% 100%;
                        animation:skeleton-shimmer 1.5s ease-in-out infinite;"></div>
                    <div class="skeleton-line" style="height:12px;margin:4px 0;width:75%;
                        background:linear-gradient(90deg,{skel_mid} 25%,{skel_fg} 50%,{skel_mid} 75%);
                        border-radius:8px;background-size:200% 100%;
                        animation:skeleton-shimmer 1.5s ease-in-out 0.2s infinite;"></div>
                    <div class="skeleton-line" style="height:12px;margin:4px 0;width:50%;
                        background:linear-gradient(90deg,{skel_mid} 25%,{skel_fg} 50%,{skel_mid} 75%);
                        border-radius:8px;background-size:200% 100%;
                        animation:skeleton-shimmer 1.5s ease-in-out 0.4s infinite;"></div>
                </div>
            </div>
        </div>
        <style>
            @keyframes skeleton-shimmer {{
                0% {{ background-position: 200% 0; }}
                100% {{ background-position: -200% 0; }}
            }}
        </style>
        '''
        self._chat_display.append(html)
        self._scroll_to_bottom()
    def _remove_thinking_indicator(self):
        try:
            cursor = self._chat_display.textCursor()
            cursor.movePosition(cursor.MoveOperation.End)
            doc = self._chat_display.document()
            if doc:
                last_block = doc.findBlockByLineNumber(doc.blockCount() - 1)
                if last_block.isValid():
                    block_text = last_block.text()
                    if "思考中" in block_text or "skeleton" in block_text or "shimmer" in block_text:
                        cursor.movePosition(cursor.MoveOperation.StartOfBlock, cursor.MoveMode.KeepAnchor)
                        cursor.removeSelectedText()
                        cursor.deletePreviousChar()
        except Exception as e:
            logger.warning(f"操作失败: {e}")
    def show_memory_context(self):
        """在对话区顶部显示个性化记忆提示"""
        try:
            brain = self._brain
            memory = brain.memory
            learner = brain.learner
            hints = []

            try:
                from ui.themes import get_theme_colors
                c = get_theme_colors()
                _accent = c['accent']
                _hint = c['hint']
                _fg = c['fg']
                _success = c.get('success_color', '#a5d6a7')
                _info = c.get('info_color', _accent)
            except Exception:
                _accent = '#58a6ff'
                _hint = '#8b949e'
                _fg = '#c9d1d9'
                _success = '#a5d6a7'
                _info = '#a0b0f0'

            editor = memory.get_preference("code_editor")
            if editor:
                hints.append(
                    f'<span style="color:{_info};">我注意到你习惯用 </span>'
                    f'<b style="color:{_accent};">{html_mod.escape(editor)}</b>'
                    f'<span style="color:{_info};">，需要我帮你适配编辑器设置吗？</span>'
                )
            lang = memory.get_preference("language")
            if lang:
                hints.append(
                    f'<span style="color:{_info};">偏好语言：</span>'
                    f'<b style="color:{_accent};">{html_mod.escape(lang)}</b>'
                )
            archive = memory.get_preference("archive_dir")
            if archive:
                hints.append(
                    f'<span style="color:{_info};">常用目录：</span>'
                    f'<b style="color:{_success};">{html_mod.escape(archive)}</b>'
                )
            personalized = learner.get_personalized_prompt()
            if personalized:
                for line in personalized.split("\n"):
                    if line.strip():
                        hints.append(
                            f'<span style="color:{_hint};">{html_mod.escape(line.strip())}</span>'
                        )
            habits = learner.get_habits()
            if habits.get("frequent_actions"):
                actions = ", ".join(a["action"] for a in habits["frequent_actions"][:3])
                hints.append(
                    f'<span style="color:{_info};">常用操作：</span>'
                    f'<b style="color:{_accent};">{html_mod.escape(actions)}</b>'
                )
            last_result = memory.get_short_term("last_result")
            if last_result and isinstance(last_result, dict):
                intent_name = last_result.get("intent", "")
                if last_result.get("success"):
                    hints.append(
                        f'<span style="color:{_success};">上次任务「{html_mod.escape(str(intent_name))}」已成功完成。</span>'
                    )
            if hints:
                # 容器背景色跟随主题
                _container_bg = _accent + '14'   # accent @ 8% opacity
                _container_border = _accent + '33'  # accent @ 20% opacity
                html = (
                    f'<div style="margin:8px;padding:12px;'
                    f'background:{_container_bg};'
                    f'border:1px solid {_container_border};'
                    f'border-radius:8px;font-size: 14px;line-height:1.7;">'
                    + "<br>".join(hints)
                    + "</div>"
                )
                self._chat_display.append(html)
        except Exception as e:
            self._logger.warning(f"Failed to show memory context: {e}")
    def send_welcome(self):
        """显示欢迎消息 — 动态读取已注册技能"""
        self._add_system_message(f"对话框已启动 — {datetime.now().strftime('%Y-%m-%d %H:%M')}")

        # 从 AgentBrain 读取已注册的技能列表
        skill_descriptions = {
            "game_data": "🆕 创建/修改/删除游戏数据条目",
            "planning": "创建/编辑策划方案文档",
            "code": "生成/调试/解释代码",
            "shell": "执行命令行/终端操作",
            "file_ops": "读写文件、目录操作",
            "web_search": "联网搜索信息",
            "search": "搜索文件/查找内容",
            "clipboard": "剪贴板操作",
            "schedule": "定时任务/提醒",
            "data_analyze": "数据分析/统计",
        }

        try:
            brain = self._brain
            registry = getattr(brain, 'registry', None)
            if registry and hasattr(registry, 'list_skills'):
                skills = registry.list_skills
                if skills:
                    tips_lines = []
                    for s in skills:
                        name = s.get("name", "")
                        # 映射技能名到友好的描述
                        for key, desc in skill_descriptions.items():
                            if key in name:
                                tips_lines.append(f"{desc}")
                                break
                    tips = "\n".join(tips_lines[:8])
                    self._add_system_message(tips)
                    return
        except Exception as e:
            logger.warning(f"操作失败: {e}")

        # 兜底：静态欢迎
        tips = (
            "🆕 创建数据：帮我创建一个火系法师\n"
            "修改数据：把攻击力改成200\n"
            "删除数据：删除这个条目\n"
            "写代码：帮我写个导出脚本\n"
            "执行命令：执行 python app.py\n"
            "读写文件：帮我看看 data 目录\n"
            "策划方案：创建一个仙侠策划案"
        )
        self._add_system_message(tips)
