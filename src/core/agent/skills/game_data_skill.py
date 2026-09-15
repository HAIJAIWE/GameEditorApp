from __future__ import annotations

from typing import Any

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import _resolve_plural, _resolve_singular, normalize_params

logger = get_logger()


def _build_type_labels() -> dict:
    """从中央类型注册表构建复数键→中文标签的映射"""
    from config.constants import _type_registry
    plurals = _type_registry.plurals
    names = _type_registry.names
    return {plurals[k]: names[k] for k in plurals if k in names}


_TYPE_LABELS = _build_type_labels()


class GameDataSkill(BaseSkill):
    name = "system.game_data"
    NAME = "system.game_data"
    DESCRIPTION = "游戏数据增删改查操作（创建/修改/删除游戏条目）。支持 switch_tab 切换到对应数据类型的标签页查看效果。"
    version = "1.0.0"
    VERSION = "1.0.0"

    PARAMS_SCHEMA = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["create", "update", "delete", "batch_create", "batch_update", "query", "list", "switch_tab", "switch_library", "load_library", "list_types"],
                "description": "操作类型: create=创建, update=修改, delete=删除, batch_create=批量创建, batch_update=批量修改, query=查询, list=列表, switch_tab=切换到对应界面标签页, switch_library=切换到指定数据库/库, load_library=查询库数据, list_types=列出所有数据类型"
            },
            "data_type": {
                "type": "string",
                "description": "数据类型英文复数键: roles/monsters/skills/equips/items/talents/buffs/tasks/achievements/jobs/titles/stories/dialogs"
            },
            "name": {
                "type": "string",
                "description": "条目名称"
            },
            "keyword": {
                "type": "string",
                "description": "查询关键词"
            },
            "data": {
                "type": "object",
                "description": "数据属性JSON对象，如 {\"attack\":100,\"defense\":50}"
            },
            "limit": {
                "type": "integer",
                "description": "查询返回条数上限，默认20",
                "default": 20
            },
        },
        "required": ["action"],
        "allOf": [
            {
                "if": {"properties": {"action": {"enum": ["create", "batch_create", "batch_update", "list", "list_types"]}}},
                "then": {"required": ["data_type"]}
            },
            {
                "if": {"properties": {"action": {"enum": ["update", "delete"]}}},
                "then": {"required": ["name"]}
            }
        ]
    }

    @staticmethod
    def _build_cn_type_map() -> dict:
        """从中央类型注册表构建中文→复数键的映射"""
        from config.constants import _type_registry
        names = _type_registry.names
        plurals = _type_registry.plurals
        mapping = {}
        for singular, cn_name in names.items():
            mapping[cn_name] = plurals.get(singular, singular + "s")
        return mapping

    def _resolve_type(self, raw: str) -> str:
        raw = raw.strip()
        cn_map = self._build_cn_type_map()
        if raw in cn_map:
            return cn_map[raw]

        raw_lower = raw.lower().strip()
        # 用类型注册表验证已知复数键
        from config.constants import _type_registry
        known_plurals = set(_type_registry.plurals.values())
        # 修复 rstrip("s") bug: "boss" → "bos"+"s"="boss" OK 但 "address"→"addres"+"s" 错误
        # 先尝试原样匹配（用户可能已传复数如 "roles"）
        if raw_lower in known_plurals:
            return raw_lower
        # 再尝试加 s（如 "role" → "roles"）
        candidate = raw_lower + ("s" if not raw_lower.endswith("s") else "")
        if candidate in known_plurals:
            return candidate
        # 最后退化为原样返回
        return raw

    def _find_item_by_name(self, dm, name: str, data_type: str = "") -> dict | None:
        if not name or not dm:
            return None

        target_name = name.strip()
        if data_type:
            resolved = self._resolve_type(data_type)
            search_types = [resolved] if resolved else list(dm.data.keys())
        else:
            search_types = list(dm.data.keys())

        exact_matches = []
        partial_matches = []

        for plural in search_types:
            if plural not in dm.data:
                continue
            items = dm.data.get(plural, [])
            for it in items:
                item_name = str(it.get("name", "")).strip()
                if not item_name:
                    continue
                if item_name == target_name:
                    exact_matches.append((plural, it, _resolve_singular(plural)))
                elif target_name in item_name or item_name in target_name:
                    partial_matches.append((plural, it, _resolve_singular(plural)))

        if exact_matches:
            if len(exact_matches) == 1:
                return {"plural": exact_matches[0][0], "item": exact_matches[0][1],
                        "data_type": exact_matches[0][2]}
            return {"plural": exact_matches[0][0], "item": exact_matches[0][1],
                    "data_type": exact_matches[0][2], "ambiguous": len(exact_matches)}

        if partial_matches:
            if len(partial_matches) == 1:
                return {"plural": partial_matches[0][0], "item": partial_matches[0][1],
                        "data_type": partial_matches[0][2]}

        return None

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        logger = get_logger()
        action = params.get("action", "")

        try:
            mw = context.get("main_window")
            dm = context.get("data_manager")

            if not dm and mw:
                dm = getattr(mw, 'data_manager', None)

            if not dm:
                from core.data_manager import OptimizedDataManager
                dm = OptimizedDataManager()
                logger.warning("GameDataSkill: 未从 context 获取到 data_manager，创建了独立实例（数据变更不会刷新 UI）")

            if action == "create":
                return self._create_item(dm, mw, params, logger)
            elif action == "update":
                return self._update_item(dm, mw, params, logger)
            elif action == "delete":
                return self._delete_item(dm, mw, params, logger)
            elif action == "batch_update":
                return self._batch_update(dm, mw, params, logger)
            elif action == "batch_create":
                return self._batch_create(dm, mw, params, logger)
            elif action == "query":
                return self._query_items(dm, mw, params, logger)
            elif action == "list":
                return self._list_items(dm, params, logger)
            elif action == "switch_tab":
                return self._switch_tab(mw, params, logger)
            elif action == "switch_library":
                return self._switch_library(mw, params, logger)
            elif action == "load_library":
                return self._load_library(params, logger)
            elif action == "list_types":
                return self._list_data_types(dm, logger)
            else:
                return {"success": False, "error": f"未知动作: {action}", "message": ""}
        except Exception as e:
            logger.error(f"GameDataSkill execute failed: {e}")
            return {"success": False, "error": str(e), "message": ""}

    def _create_item(self, dm, mw, params, logger) -> dict:
        data_type = params.get("data_type", "")
        name = params.get("name", "")
        if not name or name.startswith("$") or name == "未命名":
            name = (data_type or "条目").title()
        data = params.get("data", {})
        known_params = {"action", "data_type", "name", "data", "_raw_input", "matched_text"}
        for k, v in params.items():
            if k not in known_params and not k.startswith("_") and k not in data:
                if isinstance(v, (str, int, float, bool, list)):
                    data[k] = v
        user_input = params.get("_raw_input", params.get("data", params.get("matched_text", "")))

        if not data_type:
            available = ", ".join(_resolve_singular(p) for p in dm.data.keys())
            return {"success": False, "error": f"缺少 data_type 参数。可用类型: {available}", "message": ""}

        plural = _resolve_plural(data_type)

        existing = dm.data.get(plural, [])
        duplicate = [it for it in existing if it.get("name") == name]
        if duplicate and name:
            return {"success": False, "error": (
                f"已存在名为【{name}】的{_TYPE_LABELS.get(plural, data_type)}条目（id={duplicate[0].get('id','?')}），"
                f"请用 action=update 而不是 create。"
            ), "message": ""}

        ai_data = None
        try:
            from features.ai import ai_generate_game_data
            existing = dm.data.get(plural, [])
            existing_names = [it.get("name", "") for it in existing if it.get("name")]
            desc = user_input or name
            ai_data = ai_generate_game_data(data_type, desc,
                                            existing_context={"names": existing_names[:20]})
        except Exception as e:
            logger.debug(f"AI生成跳过: {e}")

        if not isinstance(data, dict):
            if isinstance(data, str):
                try:
                    import json
                    data = json.loads(data)
                except Exception:
                    data = {}
            else:
                data = {}

        if ai_data and isinstance(ai_data, dict):
            merged = dict(ai_data)
            if name:
                merged["name"] = name
            merged.update(data)
            data = merged
            logger.info(f"AI生成数据: {list(merged.keys())[:8]}")
        else:
            data["name"] = name
            smart_defaults = self._smart_defaults(data_type)
            for k, v in smart_defaults.items():
                if k not in data:
                    data[k] = v

        item = {"id": dm.generate_id(plural), **data}
        dm.add_item(plural, item)

        label = _TYPE_LABELS.get(plural, data_type)
        attr_count = len(data) - 1
        if mw:
            mw.mark_data_changed()
            try:
                tab = getattr(mw, '_ensure_tab_loaded', None)
                if tab:
                    t = tab(data_type)
                    if hasattr(t, 'refresh_list'):
                        t.refresh_list()
                if hasattr(mw, '_update_project_list'):
                    mw._update_project_list(data_type)
                self._auto_select_item(mw, data_type, data.get('name', name))
            except Exception as e:
                logger.warning(f"UI刷新失败（数据已保存）: {e}")

        return {"success": True, "message": f"[OK] 已创建【{data.get('name', name)}】({label}) → {attr_count}个属性（已完成，无需继续）", "data": {
            "id": item["id"],
            "ai_generated": ai_data is not None,
        }}

    def _update_item(self, dm, mw, params, logger) -> dict:
        field = params.get("field", "")
        value = params.get("value", "")
        update_data = params.get("data", {})
        # LLM 可能传 data={...} 而非 field+value，兼容一下
        if isinstance(update_data, dict) and update_data:
            if not field:
                field = "batch"  # 有 data 就不用 field
        else:
            update_data = {}
        item_id = params.get("item_id", "")
        data_type = params.get("data_type", "")
        name_filter = params.get("name", "")
        new_name = params.get("new_name", "")
        plural = ""

        if name_filter and not item_id:
            result = self._find_item_by_name(dm, name_filter, data_type)
            if result:
                item_id = result["item"].get("id", "")
                plural = result["plural"]
                data_type = result["data_type"] or data_type
                if result.get("ambiguous"):
                    logger.info(f"名称'{name_filter}'匹配到多个条目(共{result['ambiguous']}个)，只修改了第一个匹配的")
                    return {"success": True, "message": f"名称「{name_filter}」匹配到{result['ambiguous']}个条目，只修改了第一个匹配的", "data": {
                        "hint": "请提供 data_type 参数指定具体类型" if result['ambiguous'] > 1 else "",
                    }}
            elif data_type:
                plural = self._resolve_type(data_type)
                item_id = None

        if item_id and not plural:
            if data_type:
                plural = self._resolve_type(data_type)
            else:
                for p, items in dm.data.items():
                    if any(it.get("id") == item_id for it in items):
                        plural = p
                        data_type = _resolve_singular(p)
                        break

        if (not plural or not item_id) and mw:
            editor = getattr(mw, 'current_editor', None)
            if editor and hasattr(editor, 'current_item') and editor.current_item:
                item_id = item_id or editor.current_item.get("id", "")
                data_type = getattr(editor, 'data_type', None) or data_type
                if data_type:
                    plural = self._resolve_type(data_type)

        if not data_type and not plural:
            return {"success": False, "error": "无法确定要修改的数据类型。请提供 data_type 参数（如 role/skill/item 等）", "message": ""}
        if not item_id:
            return {"success": False, "error": f"找不到名称「{name_filter}」对应的条目。请检查名称是否正确，或提供 data_type 缩小范围。", "message": ""}
        if not field:
            return {"success": False, "error": "缺少要修改的字段名 (field 参数) 或 data 对象", "message": ""}

        if update_data:
            merged = dict(update_data)
            if field != "batch":
                merged[field] = value
            if new_name:
                merged["name"] = new_name
            if not dm.update_item(plural, item_id, merged):
                return {"success": False, "error": f"条目 {item_id} 不存在", "message": ""}
            applied = merged
        else:
            upd = {field: value}
            if new_name:
                upd["name"] = new_name
            if not dm.update_item(plural, item_id, upd):
                return {"success": False, "error": f"条目 {item_id} 不存在", "message": ""}
            applied = upd
        if mw:
            mw.mark_data_changed()
            if hasattr(mw, 'current_editor') and mw.current_editor:
                editor = mw.current_editor
                if hasattr(editor, 'current_item') and editor.current_item:
                    if editor.current_item.get("id") == item_id:
                        for k, v in applied.items():
                            editor.current_item[k] = v
                        if hasattr(editor, 'form_widget') and hasattr(editor.form_widget, 'load_data'):
                            editor.form_widget.load_data(editor.current_item)
            if data_type and hasattr(mw, '_update_project_list'):
                mw._update_project_list(data_type)
            try:
                tab = getattr(mw, '_ensure_tab_loaded', None)
                if tab:
                    t = tab(_resolve_singular(plural))
                    if hasattr(t, 'refresh_list'):
                        t.refresh_list()
            except Exception as e:
                logger.debug(f"刷新tab列表跳过: {e}")

        changed = f"{field}={value}"
        if new_name:
            changed += f", name={new_name}"
        return {"success": True, "message": f"已更新「{name_filter or item_id}」→ {changed}", "data": None}

    def _delete_item(self, dm, mw, params, logger) -> dict:
        item_id = params.get("item_id", "")
        data_type = params.get("data_type", "")
        name_filter = params.get("name", "")
        plural = ""

        if name_filter and not item_id:
            result = self._find_item_by_name(dm, name_filter, data_type)
            if result:
                item_id = result["item"].get("id", "")
                plural = result["plural"]
                data_type = result["data_type"] or data_type
                item_name = result["item"].get("name", "?")

        if item_id and not plural:
            if data_type:
                plural = self._resolve_type(data_type)

        if (not plural or not item_id) and mw:
            editor = getattr(mw, 'current_editor', None)
            if editor and hasattr(editor, 'current_item') and editor.current_item:
                item_id = item_id or editor.current_item.get("id", "")
                item_name = editor.current_item.get("name", "?")
                data_type = getattr(editor, 'data_type', None) or data_type
                if data_type:
                    plural = self._resolve_type(data_type)

        if not plural or not item_id:
            return {"success": False, "error": "找不到要删除的条目。请提供 name 参数（如 'name':'火系法师'）或先在编辑器中选中。", "message": ""}

        item_name = item_name or None
        if item_name is None:
            all_items = dm.data.get(plural, [])
            item_name = next((it.get("name", "?") for it in all_items if it.get("id") == item_id), "?")

        confirm = params.get("confirm", False)
        if isinstance(confirm, str):
            confirm = confirm.lower() in ("true", "yes", "1", "确认", "是")
        if not confirm:
            return {"success": False, "needs_confirm": True, "error": f"[WARN] 确认删除【{item_name}】？", "message": ""}

        if not dm.delete_item(plural, item_id):
            return {"success": False, "error": f"条目 {item_id} 不存在", "message": ""}
        if mw:
            mw.mark_data_changed()
            if data_type and hasattr(mw, '_update_project_list'):
                mw._update_project_list(data_type)
            try:
                tab = getattr(mw, '_ensure_tab_loaded', None)
                if tab:
                    t = tab(data_type)
                    if hasattr(t, 'refresh_list'):
                        t.refresh_list()
            except Exception as e:
                logger.debug(f"刷新tab列表跳过: {e}")
        return {"success": True, "message": f"已删除【{item_name}】", "data": None}

    def _batch_create(self, dm, mw, params, logger) -> dict:
        data_type = params.get("data_type", "")
        count_str = params.get("count", "1")
        name = params.get("name", "")
        try:
            count = int(count_str)
            count = max(1, count)
        except (ValueError, TypeError):
            count = 1

        if not data_type:
            return {"success": False, "error": "缺少 data_type 参数", "message": ""}
        if not name:
            name = data_type

        plural = _resolve_plural(data_type)
        created = []
        name_suffixes = ["·烈风", "·雷霆", "·冰霜", "·暗影", "·圣光",
                         "·火焰", "·风暴", "·深渊", "·星辰", "·极光"]

        for i in range(count):
            item_name = f"{name}{name_suffixes[i] if i < len(name_suffixes) else f' #{i+1}'}"
            existing = dm.data.get(plural, [])
            if any(it.get("name") == item_name for it in existing):
                continue
            data = {"name": item_name}
            smart = self._smart_defaults(data_type)
            for k, v in smart.items():
                data[k] = v
            item = {"id": dm.generate_id(plural), **data}
            dm.add_item(plural, item)
            created.append(item_name)

        if mw:
            mw.mark_data_changed()
            if data_type and hasattr(mw, '_update_project_list'):
                mw._update_project_list(data_type)
            try:
                tab = getattr(mw, '_ensure_tab_loaded', None)
                if tab:
                    t = tab(data_type)
                    if hasattr(t, 'refresh_list'):
                        t.refresh_list()
            except Exception as e:
                get_logger().warning(f"批量创建后刷新列表失败: {e}")

        label = _TYPE_LABELS.get(plural, data_type)
        names_str = "、".join(created[:5])
        more = f"...等共{len(created)}个" if len(created) > 5 else ""
        return {"success": True, "message": f"[OK] 已批量创建 {len(created)} 个{label}：{names_str}{more}（已完成）", "data": {
            "count": len(created),
        }}

    def _batch_update(self, dm, mw, params, logger) -> dict:
        data_type = params.get("data_type", "")
        filter_expr = params.get("filter", "")
        op = params.get("op", "set")
        field = params.get("field", "")
        value_str = params.get("value", "0")
        keyword = params.get("keyword", "")
        valid_ops = {"set", "add", "multiply"}
        if op not in valid_ops:
            return {"success": False, "error": f"不支持的批量操作: {op}，仅支持: {'/'.join(sorted(valid_ops))}", "message": ""}

        if not field:
            return {"success": False, "error": "缺少 field 参数", "message": ""}

        try:
            value = float(value_str)
        except (ValueError, TypeError):
            return {"success": False, "error": f"value 必须是数字: {value_str}", "message": ""}

        if data_type:
            plural = self._resolve_type(data_type)
            items = dm.data.get(plural, [])
        else:
            return {"success": False, "error": "缺少 data_type 参数", "message": ""}

        if not items:
            return {"success": True, "message": f"「{data_type}」类型暂无数据", "data": None}

        targets = list(items)
        if filter_expr:
            conditions = self._parse_filter(filter_expr)
            if conditions:
                targets = self._apply_filters(targets, conditions)
        elif keyword:
            kw = keyword.lower()
            targets = [it for it in targets if any(kw in str(v).lower() for v in it.values())]

        if not targets:
            return {"success": True, "message": f"没有匹配的条目（filter={filter_expr or keyword}）", "data": None}

        modified = []
        skipped = 0
        for it in targets:
            try:
                item_id = it.get("id", "")
                current = float(it.get(field, 0) or 0)
                if op == "multiply":
                    new_val = current * value
                elif op == "add":
                    new_val = current + value
                else:
                    new_val = value

                if isinstance(it.get(field), int) and op != "multiply":
                    new_val = int(new_val)
                else:
                    new_val = round(new_val, 1)

                dm.update_item(plural, item_id, {field: new_val})
                modified.append(f"{it.get('name','?')}: {current}→{new_val}")
            except (ValueError, TypeError) as e:
                logger.warning(f"跳过条目 {it.get('name','?')}: 字段 {field} 值无法转换: {e}")
                skipped += 1
                continue

        if mw:
            mw.mark_data_changed()
            if data_type and hasattr(mw, '_update_project_list'):
                mw._update_project_list(data_type)
            try:
                tab = getattr(mw, '_ensure_tab_loaded', None)
                if tab:
                    t = tab(data_type)
                    if hasattr(t, 'refresh_list'):
                        t.refresh_list()
            except Exception as e:
                logger.debug(f"刷新跳过: {e}")

        op_names = {"set": "设置为", "multiply": "乘以", "add": "增加"}
        op_name = op_names.get(op, op)
        sample = modified[:3]
        sample_str = "; ".join(sample)
        more = f"...等共{len(modified)}条" if len(modified) > 3 else ""

        return {"success": True, "message": f"批量修改完成：{field} {op_name} {value}\n{sample_str}{more}", "data": {
            "count": len(modified),
        }}

    def _switch_tab(self, mw, params, logger) -> dict:
        if not mw:
            return {"success": False, "error": "无法访问主窗口", "message": ""}
        from PyQt6.QtCore import Q_ARG, QMetaObject, Qt
        data_type = params.get("data_type", "")
        if not data_type:
            return {"success": False, "error": "缺少参数: data_type", "message": ""}
        logger.info(f"[Skill] switch_tab 请求 -> data_type={data_type}")
        if hasattr(mw, 'tab_widget') and mw.tab_widget:
            for i in range(mw.tab_widget.count()):
                w = mw.tab_widget.widget(i)
                dt = getattr(w, '_data_type', None) or getattr(w, 'data_type', None)
                if dt == data_type:
                    if hasattr(mw, '_deferred_switch_tab'):
                        QMetaObject.invokeMethod(
                            mw, "_deferred_switch_tab",
                            Qt.ConnectionType.QueuedConnection,
                            Q_ARG(str, data_type),
                        )
                        logger.info(f"[Skill] switch_tab 已投递到主线程 -> {data_type}")
                        return {"success": True, "message": f"已切换到 {data_type} 标签页", "data": None}
                    mw.tab_widget.setCurrentIndex(i)
                    return {"success": True, "message": f"已切换到 {data_type} 标签页", "data": None}
        logger.warning(f"[Skill] switch_tab 失败：未找到 {data_type}")
        return {"success": False, "error": f"未找到 {data_type} 标签页", "message": ""}

    def _switch_library(self, mw, params, logger) -> dict:
        if not mw:
            return {"success": False, "error": "无法访问主窗口", "message": ""}
        lib_name = params.get("library", params.get("name", ""))
        if not lib_name:
            return {"success": False, "error": "缺少参数: library（库名称）", "message": ""}
        lm = getattr(mw.config, 'library_manager', None)
        if not lm:
            return {"success": False, "error": "无法访问库管理器", "message": ""}
        libraries = lm.get_all_libraries()
        lib_names = [lib.name for lib in libraries]
        if lib_name not in lib_names:
            return {
                "success": False,
                "error": f"库不存在: {lib_name}。可用库: {', '.join(lib_names)}",
                "message": ""
            }
        if hasattr(mw, 'library_bar_widget') and mw.library_bar_widget:
            bar = mw.library_bar_widget
            if hasattr(bar, '_menu_select_library'):
                bar._menu_select_library(lib_name)
            else:
                lm.switch_library(lib_name)
            bar.refresh_library_list()
            return {
                "success": True,
                "message": f"已切换到库「{lib_name}」",
                "data": {"library": lib_name}
            }
        if hasattr(mw, '_on_library_switched'):
            try:
                lm.switch_library(lib_name)
                mw._on_library_switched(lib_name)
                return {
                    "success": True,
                    "message": f"已切换到库「{lib_name}」",
                    "data": {"library": lib_name}
                }
            except Exception as e:
                return {"success": False, "error": f"切换库失败: {e}", "message": ""}
        return {"success": False, "error": f"无法切换库「{lib_name}」", "message": ""}

    def _query_items(self, dm, mw, params, logger) -> dict:
        data_type = params.get("data_type", "")
        keyword = params.get("keyword", "") or params.get("name", "") or params.get("query", "")
        sort_by = params.get("sort_by", "")
        sort_order = params.get("sort_order", "desc")
        limit_str = params.get("limit", "20")
        filter_expr = params.get("filter", "")
        filter_field = params.get("filter_field", "")
        filter_value = params.get("filter_value", "")
        try:
            limit = int(limit_str)
        except (ValueError, TypeError):
            limit = 20

        if not data_type and keyword:
            type_hints = {
                "角色": "role", "怪物": "monster", "技能": "skill",
                "装备": "equip", "道具": "item", "天赋": "talent",
                "法师": "role", "战士": "role", "武器": "equip",
                "防具": "equip", "药水": "item", "任务": "task",
                "职业": "job", "成就": "achievement", "称号": "title",
                "对话": "dialog", "剧情": "story",
            }
            for hint, type_id in type_hints.items():
                if hint in keyword:
                    data_type = type_id
                    break

        all_items = []
        def _is_placeholder(name: str) -> bool:
            if not name or not name.strip():
                return True
            if name.startswith("$"):
                return True
            if name.strip().lower() in ("role", "item", "skill", "monster", "equip", "talent"):
                return True
            return False
        if data_type:
            plural = self._resolve_type(data_type)
            for it in dm.data.get(plural, []):
                if _is_placeholder(it.get("name", "")):
                    continue
                it_copy = dict(it)
                it_copy["__type"] = plural
                all_items.append(it_copy)
        else:
            for key, items in dm.data.items():
                if isinstance(items, list) and key.startswith("_"):
                    continue
                if isinstance(items, list):
                    for it in items:
                        if _is_placeholder(it.get("name", "")):
                            continue
                        it_copy = dict(it)
                        it_copy["__type"] = key
                        all_items.append(it_copy)

        if not all_items:
            return {"success": True, "message": "暂无数据", "data": None}

        if keyword:
            kw = keyword.lower()
            all_items = [it for it in all_items
                         if any(kw in str(v).lower() for v in it.values())]

        if filter_expr:
            conditions = self._parse_filter(filter_expr)
            if conditions:
                all_items = self._apply_filters(all_items, conditions)

        elif filter_field:
            fv = filter_value
            all_items = [it for it in all_items
                         if str(it.get(filter_field, "")).lower() == str(fv).lower()]

        total = len(all_items)

        if sort_by:
            try:
                reverse = sort_order != "asc"
                all_items.sort(
                    key=lambda it: float(it.get(sort_by, 0))
                        if isinstance(it.get(sort_by), (int, float))
                        else 0,
                    reverse=reverse
                )
            except (ValueError, TypeError) as e:
                logger.debug(f"操作失败: {e}")

        if limit > 0:
            all_items = all_items[:limit]

        if not all_items:
            return {"success": True, "message": f"查询结果为空（共 {total} 条匹配）", "data": {
                "total": total,
            }}

        lines = [f"查询结果（共 {total} 条，显示前 {len(all_items)} 条）：\n"]
        for it in all_items:
            name = it.get("name", "?")
            type_key = it.get("__type", "")
            type_label = _TYPE_LABELS.get(type_key, "")
            prefix = f"  [{type_label}] " if type_label else "  "
            line = f"{prefix}【{name}】"
            extras = []
            for key in ("level", "atk", "hp", "type", "category", "rare", "job", "difficulty", "value"):
                v = it.get(key)
                if v is not None and v != "":
                    extras.append(f"{key}={v}")
            if extras:
                line += f"  ({', '.join(extras[:4])})"
            lines.append(line)

        return {"success": True, "message": "\n".join(lines), "data": {
            "total": total,
            "shown": len(all_items),
            "items": [{"name": it.get("name"), "id": it.get("id")} for it in all_items[:20]],
        }}

    @staticmethod
    def _parse_filter(expr) -> list:
        import re
        # LLM 可能传 JSON 对象而非字符串，自动转换
        if isinstance(expr, dict):
            expr = ", ".join(f"{k} = {v}" for k, v in expr.items())
        if not isinstance(expr, str):
            return []
        conditions = []
        for part in expr.split(","):
            part = part.strip()
            if not part:
                continue
            m = re.match(r'^([\w_]+)\s*(>=|<=|!=|=|>|<)\s*(.+)$', part)
            if m:
                field, op, val_raw = m.group(1), m.group(2), m.group(3).strip()
                val_raw = val_raw.strip("\"'")
                try:
                    value: Any = int(val_raw)
                except ValueError:
                    try:
                        value = float(val_raw)
                    except ValueError:
                        value = val_raw
                conditions.append({"field": field, "op": op, "value": value})
        return conditions

    @staticmethod
    def _apply_filters(items: list, conditions: list) -> list:
        result = []
        for item in items:
            match = True
            for cond in conditions:
                field = cond["field"]
                op = cond["op"]
                target = cond["value"]
                actual = item.get(field)

                try:
                    if isinstance(target, (int, float)):
                        actual = float(actual) if actual is not None else 0
                        target = float(target)
                except (ValueError, TypeError):
                    actual = str(actual) if actual is not None else ""
                    target = str(target)

                if op == ">" and not (actual > target):
                    match = False
                elif op == "<" and not (actual < target):
                    match = False
                elif op == ">=" and not (actual >= target):
                    match = False
                elif op == "<=" and not (actual <= target):
                    match = False
                elif op == "!=" and not (str(actual) != str(target)):
                    match = False
                elif op == "=" and not (str(actual) == str(target)):
                    match = False

                if not match:
                    break
            if match:
                result.append(item)
        return result

    def _list_items(self, dm, params, logger) -> dict:
        data_type = params.get("data_type", "")
        if not data_type:
            return {"success": False, "error": "缺少 data_type 参数", "message": ""}

        plural = self._resolve_type(data_type)
        items = dm.data.get(plural, [])
        if not items:
            return {"success": True, "message": f"「{data_type}」类型暂无数据", "data": None}

        lines = [f"=== {_TYPE_LABELS.get(plural, data_type)}（共 {len(items)} 条）===\n"]
        for i, it in enumerate(items):
            name = it.get("name", "?")
            extras = []
            for key in ("level", "atk", "hp", "type", "category", "rare", "job"):
                v = it.get(key)
                if v is not None and v != "":
                    extras.append(f"{key}={v}")
            extra_str = f" ({', '.join(extras[:3])})" if extras else ""
            lines.append(f"  {i+1}. {name}{extra_str}")

        return {"success": True, "message": "\n".join(lines), "data": None}

    @staticmethod
    def _list_data_types(dm, logger) -> dict:
        """列出所有可用数据类型及其字段概要"""
        from config.constants import _type_registry
        # 构建复数→单数反向映射（安全处理不规则复数如 stories→story）
        plural_to_singular = {}
        for sing, plur in _type_registry.plurals.items():
            plural_to_singular[plur] = sing
        lines = ["=== 可用数据类型 ===\n"]
        for plural, items in dm.data.items():
            singular = plural_to_singular.get(plural, _resolve_singular(plural))
            label = _type_registry.get_name(singular)
            count = len(items)
            sample_fields = []
            if items:
                sample = items[0]
                sample_fields = [k for k in sample.keys() if k not in ("id", "__type")][:6]
            lines.append(f"  {label} (type={singular}, {count}条)")
            if sample_fields:
                lines.append(f"    字段: {', '.join(sample_fields)}")
        return {"success": True, "message": "\n".join(lines), "data": None}

    def _auto_select_item(self, mw, data_type: str, item_name: str):
        if not mw or not data_type:
            return
        try:
            if hasattr(mw, 'tab_widget') and mw.tab_widget:
                for i in range(mw.tab_widget.count()):
                    w = mw.tab_widget.widget(i)
                    if getattr(w, '_data_type', None) == data_type:
                        mw.tab_widget.setCurrentIndex(i)
                        break
            tab = getattr(mw, '_ensure_tab_loaded', None)
            if tab:
                tab(data_type)
            if hasattr(mw, '_update_project_list'):
                mw._update_project_list(data_type)
            editor = mw.tabs.get(data_type) if hasattr(mw, 'tabs') else None
            if editor and hasattr(editor, 'get_item_names'):
                names = editor.get_item_names()
                for idx, n in enumerate(names):
                    if n == item_name:
                        if hasattr(editor, 'external_select_item'):
                            editor.external_select_item(idx)
                        break
        except Exception as e:
            get_logger().warning(f"_auto_select_item 跳过: {e}")

    @staticmethod
    def _smart_defaults(data_type: str) -> dict:
        import random
        def r(lo, hi):
            return random.randint(lo, hi)
        defaults_map = {
            "role": {"hp": r(300, 800), "mp": r(100, 400), "atk": r(40, 120),
                     "def": r(20, 60), "level": r(1, 10), "category": "近战输出"},
            "monster": {"hp": r(100, 500), "atk": r(20, 80), "def": r(10, 40),
                        "level": r(1, 15), "type": "普通", "difficulty": "简单"},
            "skill": {"type": "主动", "damage_type": "物理", "multiplier": round(random.uniform(1.0, 3.0), 1),
                       "cd": r(1, 5), "consume": r(10, 50)},
            "equip": {"rare": random.choice(["普通", "优秀", "稀有", "史诗"]),
                      "part": random.choice(["武器", "防具", "饰品"])},
            "item": {"type": "消耗品", "value": r(5, 100),
                     "rare": random.choice(["普通", "优秀", "稀有"])},
            "talent": {"type": "被动", "level": 1,
                       "rarity": random.choice(["普通", "优秀", "稀有"])},
            "task": {"type": "主线", "difficulty": "普通", "reward": r(50, 200)},
            "buff": {"type": "增益", "duration": r(1, 10), "max_stacks": r(1, 3)},
            "job": {"difficulty": random.choice(["简单", "中等", "困难"]), "growth_type": "均衡"},
            "achievement": {"reward": r(10, 100)},
            "dialog": {"speaker": "NPC", "condition": "默认"},
            "story": {"type": "主线剧情"},
            "design_doc": {"status": "草稿", "author": "策划"},
            "gameplay_design": {"game_genre": "RPG", "platform": "PC"},
            "numerical_design": {"balance_principle": "线性成长"},
            "system_plan": {"priority": "中", "module_name": "新系统"},
            "sound_design": {"mood": "史诗", "tempo": "中速"},
            "art_style": {"art_style": "写实", "camera_view": "第三人称"},
        }
        return defaults_map.get(data_type, {})

    @staticmethod
    def _schema_defaults(data_type: str) -> dict:
        import json
        try:
            from pathlib import Path
            project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
            for lib_dir in (project_root / "data" / "libraries").iterdir():
                sf = lib_dir / "type_schema.json"
                if sf.exists():
                    schema = json.loads(sf.read_text(encoding='utf-8'))
                    for t in schema.get("data_types", []):
                        if t.get("id") == data_type:
                            defaults = {}
                            for f in t.get("form_fields", []):
                                fn = f["name"]
                                if fn in ("id", "name"):
                                    continue
                                ft = f.get("type", "entry")
                                vals = f.get("values", [])
                                if vals:
                                    defaults[fn] = vals[0]
                                elif ft == "spinbox":
                                    defaults[fn] = 1
                                elif ft == "text":
                                    defaults[fn] = ""
                                elif ft == "checkbox":
                                    defaults[fn] = False
                                else:
                                    defaults[fn] = ""
                            return defaults
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        return {}
    @staticmethod
    def _load_library(params: dict, logger) -> dict:
        """加载库数据：查询库里的角色/怪物/技能等"""
        import json
        from pathlib import Path
        lib_name = params.get("library", params.get("name", ""))
        data_type = params.get("data_type", "")
        keyword = params.get("keyword", "")
        limit = int(params.get("limit", 20))

        lib_root = Path(__file__).resolve().parent.parent.parent.parent.parent / "data" / "libraries"
        lib_dir = lib_root / lib_name
        if not lib_dir.is_dir():
            return {"success": False, "error": f"库不存在: {lib_name}。可用: {', '.join(sorted(d.name for d in lib_root.iterdir() if d.is_dir()))}", "message": ""}

        data_file = lib_dir / "default.json"
        if not data_file.exists():
            return {"success": False, "error": f"库 {lib_name} 无数据文件", "message": ""}

        with open(data_file, encoding="utf-8") as f:
            lib_data = json.load(f)

        if data_type:
            plural = _resolve_plural(data_type)
            items = lib_data.get(plural, [])
        else:
            items = []
            for k, v in lib_data.items():
                if isinstance(v, list) and not k.startswith("_") and k != "metadata":
                    items.extend(v)

        if keyword:
            kw = keyword.lower()
            items = [it for it in items if any(kw in str(v).lower() for v in it.values())]

        items = items[:limit]
        if not items:
            return {"success": True, "message": f"库 {lib_name} 中未找到匹配数据", "data": None}

        summary = []
        for it in items:
            name = it.get("name", "?")
            extras = ", ".join(f"{k}={v}" for k, v in it.items() if k not in ("id", "name", "__type") and not isinstance(v, (list, dict)))[:60]
            summary.append(f"  [{it.get('__type', '?')}] {name} ({extras})")

        msg = f"库 {lib_name} ({len(summary)}条):\n" + "\n".join(summary)
        return {"success": True, "message": msg, "data": {"count": len(summary), "items": items[:5]}}
