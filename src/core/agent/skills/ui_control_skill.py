from __future__ import annotations

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill

logger = get_logger()
from core.agent.skills.common import _resolve_plural, normalize_params


class UiControlSkill(BaseSkill):
    name = "system.ui_control"
    NAME = "system.ui_control"
    DESCRIPTION = "操控游戏编辑器的前端界面，包括切换标签页、切换数据库、调整布局、开关面板等。"
    version = "1.0.0"
    tags = ["system", "ui", "界面", "前端"]
    depends_on = []
    parameters = []
    REQUIRES_MAIN_THREAD = True  # 修复 P2-29: 直接操控 QWidget，必须在主线程执行

    PARAMS_SCHEMA = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["switch_tab", "switch_library", "set_layout", "toggle_panel", "get_state"],
                "description": "操作类型。switch_tab=切换标签页, switch_library=切换数据库, set_layout=调整布局, toggle_panel=开关面板, get_state=获取当前界面状态",
            },
            "target": {
                "type": "string",
                "description": "【switch_tab/switch_library/set_layout/toggle_panel时必填】操作目标。switch_tab: 数据类型(roles/monsters/skills/items/equips/talents/buffs/tasks/planning，支持中文角色/怪物/技能/道具/装备/天赋/效果/任务/策划); switch_library: 库名; set_layout: 布局(三栏界面); toggle_panel: 面板(digital_panel/ai_popup/智能体/AI助手)",
            },
            "data_type": {
                "type": "string",
                "description": "【switch_tab时可用】target的别名，二选一即可。值同target的switch_tab说明",
            },
        },
        "required": ["action"],
    }

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        action = params.get("action", "")
        target = params.get("target", "") or params.get("data_type", "") or params.get("type", "")
        logger = get_logger()
        mw = context.get("main_window")

        if not mw:
            return {"success": False, "error": "无法访问主窗口，请先打开项目", "message": ""}

        if action == "switch_tab":
            return self._switch_tab(mw, target, params, logger, context)
        elif action == "switch_library":
            return self._switch_library(mw, target, params, logger)
        elif action == "set_layout":
            return self._set_layout(mw, target, params, logger)
        elif action == "toggle_panel":
            return self._toggle_panel(mw, target, params, logger)
        elif action == "get_state":
            return self._get_state(mw, logger)
        else:
            return {"success": False, "error": f"未知操作: {action}，支持: switch_tab/switch_library/set_layout/toggle_panel/get_state", "message": ""}

    def _switch_tab(self, mw, target: str, params: dict, logger, context: dict = None) -> dict:
        from PyQt6.QtCore import Q_ARG, QMetaObject, Qt
        if not target:
            available_tabs = self._get_available_tabs(mw)
            user_input = str(context.get("_raw_input", "")) if context else ""
            guessed = self._guess_tab_from_input(user_input, mw)
            if guessed:
                logger.info(f"[UI] 从用户输入推断目标标签页: {guessed}")
                target = guessed
            if not target:
                return {
                    "success": False,
                    "error": f"请指定要切换的数据类型(target)。当前可用的标签页: {', '.join(available_tabs)}。例如: {{\"action\":\"switch_tab\", \"target\":\"roles\"}} 切换到角色标签页",
                    "message": "",
                }

        target = target.lower().strip()
        data_type = _resolve_plural(target)
        # 尝试中文→复数键映射
        from config.constants import _type_registry
        for singular, cn_name in _type_registry.names.items():
            if target == cn_name.lower().strip():
                data_type = _type_registry.get_plural(singular)
                break
        # 额外别名映射
        extra_map = {
            "效果": "buffs", "策划": "planning",
            "计划": "planning", "文档": "planning", "策划方案": "planning",
        }
        if target in extra_map:
            data_type = extra_map[target]

        available_tabs = self._get_available_tabs(mw)

        if data_type not in available_tabs and mw:
            type_names = self._build_type_name_map(mw)
            for plural_key, ch_name in type_names.items():
                if target == ch_name.lower().strip():
                    data_type = plural_key
                    break

        if data_type not in available_tabs:
            logger.warning(f"[UI] 目标标签页不存在: {data_type}，可用: {available_tabs}")
            return {
                "success": False,
                "error": f"标签页 '{data_type}' 不存在。当前可用的标签页: {', '.join(available_tabs)}",
                "message": "",
            }

        if hasattr(mw, '_deferred_switch_tab'):
            try:
                QMetaObject.invokeMethod(
                    mw, "_deferred_switch_tab",
                    Qt.ConnectionType.QueuedConnection,
                    Q_ARG(str, data_type),
                )
            except Exception as e:
                logger.error(f"[UI] 切换标签页失败: {e}")
                return {"success": False, "error": f"切换标签页失败: {e}", "message": ""}
            return {"success": True, "message": f"[OK] 已切换到 {target} 标签页", "data": None}
        return {"success": False, "error": "主窗口不支持切换标签页", "message": ""}

    def _switch_library(self, mw, target: str, params: dict, logger) -> dict:
        from PyQt6.QtCore import Q_ARG, QMetaObject, Qt
        if not target:
            return {"success": False, "error": "请指定要切换的库名称(target)", "message": ""}

        if hasattr(mw, '_deferred_switch_library'):
            try:
                QMetaObject.invokeMethod(
                    mw, "_deferred_switch_library",
                    Qt.ConnectionType.QueuedConnection,
                    Q_ARG(str, target),
                )
            except Exception as e:
                logger.error(f"[UI] 切换库失败: {e}")
                return {"success": False, "error": f"切换库失败: {e}", "message": ""}
            return {"success": True, "message": f"已切换到库「{target}」", "data": None}
        return {"success": False, "error": "主窗口不支持切换数据库", "message": ""}

    def _set_layout(self, mw, target: str, params: dict, logger) -> dict:
        from PyQt6.QtCore import Q_ARG, QMetaObject, Qt
        layout_modes = self._build_layout_modes(mw)
        all_aliases = set()
        for info in layout_modes.values():
            all_aliases.update(info["aliases"])
            all_aliases.add(info["key"])

        if not target or target not in all_aliases:
            valid_names = [info["label"] for info in layout_modes.values()]
            return {
                "success": False,
                "error": f"无效的布局模式: {target}，可选: {'/'.join(valid_names)}",
                "message": "",
            }

        layout_key = target
        for _key, info in layout_modes.items():
            if target in info["aliases"] or target == info["key"]:
                layout_key = info["key"]
                break

        if hasattr(mw, '_deferred_set_layout'):
            try:
                QMetaObject.invokeMethod(
                    mw, "_deferred_set_layout",
                    Qt.ConnectionType.QueuedConnection,
                    Q_ARG(str, layout_key),
                )
            except Exception as e:
                logger.error(f"[UI] 切换布局失败: {e}")
                return {"success": False, "error": f"切换布局失败: {e}", "message": ""}
            mode_labels = {info["key"]: info["label"] for info in layout_modes.values()}
            return {"success": True, "message": f"布局已切换为「{mode_labels.get(target, mode_labels.get(layout_key, target))}」", "data": None}
        return {"success": False, "error": "主窗口不支持切换布局", "message": ""}

    def _toggle_panel(self, mw, target: str, params: dict, logger) -> dict:
        from PyQt6.QtCore import QMetaObject, Qt
        panel_map = self._build_panel_map(mw)
        slot_name = panel_map.get(target)
        if not slot_name:
            set(v for k, v in panel_map.items() if k != v.replace("_deferred_toggle_", ""))
            panel_names = sorted(set(v.replace("_deferred_toggle_", "") for v in panel_map.values()))
            return {
                "success": False,
                "error": f"无效的面板: {target}，可选: {'/'.join(panel_names)}",
                "message": "",
            }

        if hasattr(mw, slot_name):
            try:
                QMetaObject.invokeMethod(
                    mw, slot_name,
                    Qt.ConnectionType.QueuedConnection,
                )
            except Exception as e:
                logger.error(f"[UI] 切换面板失败: {e}")
                return {"success": False, "error": f"切换面板失败: {e}", "message": ""}
            return {"success": True, "message": "已切换面板显示状态", "data": None}
        return {"success": False, "error": f"主窗口不支持{target}面板操作", "message": ""}

    def _get_state(self, mw, logger) -> dict:
        try:
            layout, layout_label = self._detect_layout(mw)

            active_lib = ""
            if hasattr(mw, 'config') and mw.config and hasattr(mw.config, 'library_manager'):
                lm = mw.config.library_manager
                if lm and lm.active_library:
                    active_lib = getattr(lm.active_library, 'name', '')

            current_tab = ""
            if hasattr(mw, 'tab_widget') and mw.tab_widget:
                idx = mw.tab_widget.currentIndex()
                if idx >= 0:
                    w = mw.tab_widget.widget(idx)
                    current_tab = getattr(w, '_data_type', '') or mw.tab_widget.tabText(idx)

            all_tabs = self._get_available_tabs(mw)

            type_names = self._build_type_name_map(mw)

            tab_details = []
            dm = getattr(mw, 'data_manager', None)
            for dt in all_tabs:
                count = 0
                if dm:
                    count = len(dm.data.get(dt, []))
                label = self._tab_label(dt, type_names, current_tab == dt)
                tab_details.append(f"{label}({count}条)")

            panel_visible = False
            agent_popup_visible = False
            if hasattr(mw, 'digital_panel') and mw.digital_panel:
                panel_visible = mw.digital_panel.isVisible()
            if hasattr(mw, '_ai_popup') and mw._ai_popup:
                agent_popup_visible = mw._ai_popup.isVisible()

            selection = None
            if current_tab and hasattr(mw, 'tab_widget') and mw.tab_widget:
                idx = mw.tab_widget.currentIndex()
                if idx >= 0:
                    w = mw.tab_widget.widget(idx)
                    current_item = getattr(w, 'current_item', None)
                    if current_item and isinstance(current_item, dict):
                        name = current_item.get('name', current_item.get('id', '?'))
                        key_info = {}
                        for k in ('id', 'name', 'type', 'level', 'hp', 'mp', 'class',
                                  'race', 'rarity', 'category', 'status', 'grade'):
                            v = current_item.get(k)
                            if v is not None:
                                key_info[k] = v
                        selection = {"name": name, "key_fields": key_info}

            state = {
                "layout": layout,
                "layout_label": layout_label,
                "active_library": active_lib,
                "current_tab": current_tab,
                "available_tabs": all_tabs,
                "tab_details": tab_details,
                "digital_panel_visible": panel_visible,
                "agent_popup_visible": agent_popup_visible,
            }
            if selection:
                state["selection"] = selection
            return {"success": True, "message": "当前界面状态", "data": state}
        except Exception as e:
            logger.error(f"[UI] 获取界面状态失败: {e}")
            return {"success": False, "error": f"获取界面状态失败: {e}", "data": {"layout": "three_column", "layout_label": "三栏界面", "available_tabs": [], "tab_details": []}}

    @staticmethod
    def _build_type_name_map(mw) -> dict:
        result = {}
        try:
            if hasattr(mw, 'config') and mw.config:
                lm = getattr(mw.config, 'library_manager', None)
                if lm:
                    schema = lm.get_active_type_schema()
                    if schema:
                        for t in schema.types:
                            result[t.plural_key] = t.name
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        return result

    @staticmethod
    def _tab_label(data_type: str, type_names: dict, is_current: bool) -> str:
        label = type_names.get(data_type, data_type)
        if is_current:
            return f"{label}"
        return label

    @staticmethod
    def _get_available_tabs(mw) -> list:
        tabs = []
        if hasattr(mw, 'tab_widget') and mw.tab_widget:
            for i in range(mw.tab_widget.count()):
                w = mw.tab_widget.widget(i)
                dt = getattr(w, '_data_type', None) or getattr(w, 'data_type', None)
                if dt:
                    tabs.append(dt)
                else:
                    tabs.append(mw.tab_widget.tabText(i))
        return tabs

    @staticmethod
    def _build_panel_map(mw) -> dict:
        panel_map = {}
        if not mw:
            return panel_map
        for attr in dir(mw):
            if attr.startswith("_deferred_toggle_"):
                panel_name = attr.replace("_deferred_toggle_", "")
                panel_map[panel_name] = attr
                panel_map[panel_name.replace("_", "")] = attr
                labels = {"digital_panel": "智能体", "ai_popup": "AI助手"}
                if panel_name in labels:
                    panel_map[labels[panel_name]] = attr
        return panel_map

    @staticmethod
    def _build_layout_modes(mw) -> dict:
        """从 MainWindow 的 is_*_layout 属性动态构建布局模式字典"""
        modes = {}
        # 布局 key → 中文标签 映射
        label_map = {
            "three_column": "三栏界面",
            "two_column": "两栏界面",
            "single_column": "单栏界面",
            "compact": "紧凑布局",
            "wide": "宽屏布局",
        }
        if not mw:
            # 无 mw 时退化为默认三栏
            modes["three_column"] = {"key": "three_column", "label": "三栏界面",
                                     "aliases": ["three_column", "三栏界面", "三栏"]}
            return modes
        # 修复: 之前 layout_key 计算后被忽略，硬编码为 three_column
        for attr in dir(mw):
            if attr.startswith("is_") and attr.endswith("_layout"):
                layout_key = attr.replace("is_", "").replace("_layout", "")
                label = label_map.get(layout_key, layout_key.replace("_", " ").title())
                modes[layout_key] = {
                    "key": layout_key,
                    "label": label,
                    "aliases": [layout_key, label, layout_key.replace("_", "")],
                }
        # 兜底：未发现任何 is_*_layout 时退化为三栏
        if not modes:
            modes["three_column"] = {"key": "three_column", "label": "三栏界面",
                                     "aliases": ["three_column", "三栏界面", "三栏"]}
        return modes

    @staticmethod
    def _detect_layout(mw) -> tuple:
        if not mw:
            return ("three_column", "三栏界面")
        labels = {"three_column": "三栏界面"}
        for attr in dir(mw):
            if attr.startswith("is_") and attr.endswith("_layout"):
                try:
                    if getattr(mw, attr, False):
                        key = attr.replace("is_", "").replace("_layout", "")
                        return (key, labels.get(key, key))
                except Exception:
                    continue
        return ("three_column", "三栏界面")

    @staticmethod
    def _guess_tab_from_input(user_input: str, mw=None) -> str:
        if not user_input:
            return ""
        keyword_map = {}
        if mw:
            try:
                if hasattr(mw, 'config') and mw.config:
                    lm = getattr(mw.config, 'library_manager', None)
                    if lm:
                        schema = lm.get_active_type_schema()
                        if schema:
                            for t in schema.types:
                                keyword_map[t.name] = t.plural_key
                                keyword_map[t.id] = t.plural_key
            except Exception as e:
                logger.warning(f"操作失败: {e}")
        if not keyword_map:
            from config.constants import _type_registry
            keyword_map = {}
            for singular, plur in _type_registry.plurals.items():
                cn_name = _type_registry.get_name(singular)
                keyword_map[cn_name] = plur
                keyword_map[singular] = plur
            # 补充额外别名
            keyword_map.update({
                "效果": "buffs", "舞台": "stories", "章节": "stories",
                "策划": "planning", "计划": "planning", "文档": "planning", "策划方案": "planning",
            })
        for kw, dt in keyword_map.items():
            if kw in user_input:
                return dt
        return ""
