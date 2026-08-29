from __future__ import annotations

import json
import re

from common.event_bus import EventBus
from common.logger import get_logger

logger = get_logger()
from core.agent.diagnostics.error_handler import _snapshot_mgr
from core.agent.tools.tool_shared import DATA_TYPE_PLURALS, _mark_changed

_logger = get_logger()


def _get_lm(config):
    try:
        return config.library_manager
    except Exception:
        return None


def _library(config, mw, dm, params):
    action = params.get("action", "list")
    lm = _get_lm(config)
    if not lm:
        return "库管理器不可用"

    if action == "list":
        libs = lm.get_all_libraries()
        an = lm.active_library_name if hasattr(lm, 'active_library_name') else ""
        lines = [f"  {l.name}{' ' if l.name == an else ''} — {l.description or ''} ({l.data_count}条)" for l in libs]
        return f"共 {len(libs)} 个库:\n" + "\n".join(lines) if lines else "暂无库"

    elif action == "current":
        return f"当前活跃库: {lm.active_library_name}"

    elif action == "create":
        name = params.get("name", "")
        desc = params.get("description", "")
        if not name:
            return "缺少 name 参数"
        result = lm.create_library(name, desc)
        return f"已创建库「{name}」" if result else f"库「{name}」创建失败（可能已存在）"

    elif action == "delete":
        name = params.get("name", "")
        if not name:
            return "缺少 name 参数"
        if lm.delete_library(name):
            return f"已删除库「{name}」"
        return f"删除失败: 库「{name}」不存在或无法删除"

    elif action == "rename":
        name = params.get("name", "")
        new_name = params.get("new_name", "")
        if not name or not new_name:
            return "缺少 name 或 new_name 参数"
        if lm.rename_library(name, new_name):
            return f"已将库「{name}」重命名为「{new_name}」"
        return "重命名失败"

    elif action == "switch":
        name = params.get("name", "")
        if not name:
            return "缺少 name 参数"
        old = lm.active_library_name
        if old == name:
            return f"已经是当前库「{name}」"
        if lm.switch_library(name):
            dm.reload_from_library()
            _mark_changed(mw, "ai")
            EventBus().emit("library_switched", name=name)
            EventBus().emit("rebuild_needed")
            return f"已从「{old}」切换到「{name}」"
        return f"切换失败: 库「{name}」不存在"

    return f"未知操作: {action}，支持: list/current/create/delete/rename/switch"


# ═══════════════════════════════════════════════════════════════════
# 合并：批量操作 4→1  (action: update/delete/export/import)
# ═══════════════════════════════════════════════════════════════════

def _batch_operate(dm, mw, params):
    action = params.get("action", "update")
    data_type = params.get("data_type")
    if not data_type:
        return "缺少 data_type 参数"

    if action == "update":
        updates = params.get("updates", {})
        match_field = params.get("match_field")
        match_value = params.get("match_value")
        if not updates:
            return "缺少 updates 参数"
        plural = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
        items = dm.data.get(plural, [])
        count = 0
        for item in items:
            if match_field and match_value:
                if str(item.get(match_field, "")) != str(match_value):
                    continue
            for k, v in updates.items():
                item[k] = v
            count += 1
        return f"批量更新: 修改了 {count} 条 {data_type} 数据"

    elif action == "delete":
        _snapshot_mgr.snapshot(dm.data, f"batch_delete_{data_type}")
        match_field = params.get("match_field")
        match_value = params.get("match_value")
        if not match_field or not match_value:
            return "批量删除需要 match_field 和 match_value"
        plural = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
        items = dm.data.get(plural, [])
        keep = [i for i in items if str(i.get(match_field, "")) != str(match_value)]
        removed = len(items) - len(keep)
        dm.data[plural] = keep
        return f"批量删除: 删除了 {removed} 条 {data_type} 数据"

    elif action == "export":
        plural = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
        items = dm.data.get(plural, [])
        return f"[{data_type} — {len(items)}条]\n" + json.dumps(items, ensure_ascii=False, indent=2)[:4000]

    elif action == "import":
        _snapshot_mgr.snapshot(dm.data, f"batch_import_{data_type}")
        items_json = params.get("items", "[]")
        try:
            items = json.loads(items_json) if isinstance(items_json, str) else items_json
        except Exception:
            return "items 参数格式错误，需要 JSON 数组"
        plural = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
        count = 0
        for item in items:
            item["id"] = dm.generate_id(plural)
            dm.add_item(plural, item)
            count += 1
        _mark_changed(mw, "ai")
        return f"批量导入: 导入了 {count} 条 {data_type} 数据"

    return f"未知操作: {action}，支持: update/delete/export/import"


# ═══════════════════════════════════════════════════════════════════
# 合并：数据导出 3→1  (format: json/csv/engine)
# ═══════════════════════════════════════════════════════════════════

def _data_export(dm, params):
    fmt = params.get("format", "json")
    data_type = params.get("data_type")

    if fmt == "json":
        if data_type:
            plural = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
            items = dm.data.get(plural, [])
            return f"[{data_type} {len(items)}条]\n" + json.dumps(items, ensure_ascii=False, indent=2)[:6000]
        return "[全部数据]\n" + json.dumps(dm.data, ensure_ascii=False, indent=2)[:8000]

    elif fmt == "csv":
        if not data_type:
            return "CSV 导出需要指定 data_type"
        plural = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
        items = dm.data.get(plural, [])
        if not items:
            return f"暂无 {data_type} 数据"
        keys = sorted(set().union(*(it.keys() for it in items)))
        lines = [",".join(keys)]
        for item in items:
            lines.append(",".join(str(item.get(k, "")) for k in keys))
        return f"[{data_type} CSV — {len(items)}条]\n" + "\n".join(lines[:100])

    elif fmt == "engine":
        engine = params.get("engine", "unity")
        if not data_type:
            return "引擎导出需要指定 data_type"
        engines = {"unity": "Unity", "unreal": "Unreal", "godot": "Godot", "cocos2d": "Cocos2d"}
        if engine not in engines:
            return f"不支持的引擎: {engine}"
        plural = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
        items = dm.data.get(plural, [])
        preview = json.dumps(items[:3], ensure_ascii=False, indent=2)
        return f"导出到 {engines[engine]} ({data_type} {len(items)}条):\n{preview}"

    return f"未知格式: {fmt}，支持: json/csv/engine"


# ═══════════════════════════════════════════════════════════════════
# 合并：数据导入 2→1  (format: json/csv)
# ═══════════════════════════════════════════════════════════════════

def _data_import(dm, mw, params):
    fmt = params.get("format", "json")
    data_type = params.get("data_type")
    if not data_type:
        return "缺少 data_type 参数"

    if fmt == "json":
        data = params.get("data", "[]")
        try:
            items = json.loads(data) if isinstance(data, str) else data
        except Exception:
            return "data 参数格式错误"
    elif fmt == "csv":
        csv_text = params.get("data", "")
        if not csv_text:
            return "缺少 data 参数（CSV文本）"
        lines = csv_text.strip().split("\n")
        if len(lines) < 2:
            return "CSV 格式错误（至少需要表头 + 一行数据）"
        keys = [k.strip() for k in lines[0].split(",")]
        items = []
        for line in lines[1:]:
            values = [v.strip() for v in line.split(",")]
            if len(values) < len(keys):
                values.extend([""] * (len(keys) - len(values)))
            items.append(dict(zip(keys, values)))
    else:
        return f"未知格式: {fmt}，支持: json/csv"

    plural = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
    count = 0
    for item in items:
        item["id"] = dm.generate_id(plural)
        dm.add_item(plural, item)
        count += 1
    _mark_changed(mw, "ai")
    tab = mw._ensure_tab_loaded(data_type) if hasattr(mw, '_ensure_tab_loaded') else None
    if tab:
        tab.refresh_list()
    return f"导入完成: {count} 条 {data_type} ({fmt})"


# ═══════════════════════════════════════════════════════════════════
# 合并：备份 4→1  (action: list/create/restore/delete)
# ═══════════════════════════════════════════════════════════════════

def _backup(mw, dm, params):
    action = params.get("action", "list")

    try:
        lm = dm.config.library_manager
        backup_dir = lm.libraries_dir.parent / "backups" if hasattr(lm, 'libraries_dir') else dm.config.data_dir / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        return f"无法访问备份目录: {e}"

    if action == "list":
        files = sorted(backup_dir.glob("*.json"), reverse=True)
        lines = [f"  {f.stem} — {f.stat().st_size:,}B" for f in files[:20]]
        return f"共 {len(files)} 个备份:\n" + "\n".join(lines) if lines else "暂无备份"

    elif action == "create":
        label = params.get("label", "ai")
        from datetime import datetime
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        lib_name = getattr(lm, 'active_library_name', 'default') if 'lm' in dir() else 'default'
        filename = f"{lib_name}_{ts}_{label}.json"
        filepath = backup_dir / filename
        data = {"metadata": {"library": lib_name, "created_at": datetime.now().isoformat(), "label": label}}
        for k in dm.data:
            data[k] = dm.data[k]
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return f"备份完成: {filename} ({filepath.stat().st_size:,}B)"

    elif action == "restore":
        _snapshot_mgr.snapshot(dm.data, "before_restore")
        filename = params.get("filename", "")
        if not filename:
            return "缺少 filename 参数"
        filepath = backup_dir / (filename if filename.endswith(".json") else filename + ".json")
        if not filepath.exists():
            return f"备份文件不存在: {filename}"
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)
        for key, items in data.items():
            if key.startswith("metadata"):
                continue
            dm.data[key] = items
        _mark_changed(mw, "ai")
        EventBus().emit("data_changed", source="ai")
        EventBus().emit("rebuild_needed")
        return f"备份恢复完成: {filename}"

    elif action == "delete":
        filename = params.get("filename", "")
        if not filename:
            return "缺少 filename 参数"
        filepath = backup_dir / (filename if filename.endswith(".json") else filename + ".json")
        if filepath.exists():
            filepath.unlink()
            return f"已删除备份: {filename}"
        return f"备份文件不存在: {filename}"

    return f"未知操作: {action}，支持: list/create/restore/delete"


# ═══════════════════════════════════════════════════════════════════
# 合并：模板 2→1  (action: list/apply)
# ═══════════════════════════════════════════════════════════════════

def _template(config, mw, dm, params):
    action = params.get("action", "list")

    if action == "list":
        try:
            from features.advanced import AdvancedFeatures
            templates = getattr(AdvancedFeatures, 'get_templates', lambda: {})()
            if not templates:
                return "暂无模板"
            lines = [f"  {k}: {v.get('description','')}" for k, v in templates.items()]
            return f"共 {len(templates)} 个模板:\n" + "\n".join(lines)
        except Exception:
            template_dir = config.data_dir / "templates"
            if not template_dir.exists():
                return "暂无模板"
            files = list(template_dir.glob("*.json"))
            return f"共 {len(files)} 个模板:\n" + "\n".join(f"  {f.stem}" for f in files)

    elif action == "apply":
        template_name = params.get("template_name")
        data_type = params.get("data_type")
        if not template_name or not data_type:
            return "缺少 template_name 或 data_type 参数"
        try:
            template_dir = config.data_dir / "templates"
            template_file = template_dir / f"{template_name}.json"
            if not template_file.exists():
                return f"模板「{template_name}」不存在"
            with open(template_file, encoding="utf-8") as f:
                template_data = json.load(f)
            plural = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
            items = template_data if isinstance(template_data, list) else template_data.get("items", template_data.get(data_type, template_data.get(plural, [])))
            count = 0
            for item in items:
                item["id"] = dm.generate_id(plural)
                dm.add_item(plural, item)
                count += 1
            _mark_changed(mw, "ai")
            return f"模板「{template_name}」应用: 创建 {count} 条 {data_type}"
        except Exception as e:
            return f"应用模板失败: {e}"

    return f"未知操作: {action}，支持: list/apply"


# ═══════════════════════════════════════════════════════════════════
# 合并：策划案 3→1  (action: list/create/delete)
# ═══════════════════════════════════════════════════════════════════

def _planning(dm, mw, params):
    action = params.get("action", "list")

    if action == "list":
        items = dm.data.get("planning", [])
        if items:
            lines = [f"  {it.get('name','?')} — {it.get('description','')[:40]}" for it in items[:20]]
            return f"共 {len(items)} 份:\n" + "\n".join(lines)
        return "暂无策划案"

    elif action == "create":
        name = params.get("name", "新策划案")
        desc = params.get("description", "")
        content = params.get("content", "")
        tags = params.get("tags", [])
        item = {"id": dm.generate_id("planning"), "name": name, "description": desc, "content": content, "tags": tags}
        dm.add_item("planning", item)
        _mark_changed(mw, "ai")
        EventBus().emit("data_changed", source="ai")
        return f"策划案「{name}」已创建"

    elif action == "delete":
        name = params.get("name")
        item_id = params.get("item_id")
        items = dm.data.get("planning", [])
        target = None
        for it in items:
            if item_id and str(it.get("id", "")) == str(item_id):
                target = it
                break
            if name and it.get("name") == name:
                target = it
                break
        if not target:
            return "未找到指定策划案"
        dm.delete_item("planning", target["id"])
        _mark_changed(mw, "ai")
        return f"策划案「{target.get('name','?')}」已删除"

    return f"未知操作: {action}，支持: list/create/delete"


# ═══════════════════════════════════════════════════════════════════
# 合并：维护 2→1  (action: clear_all/cleanup_images)
# ═══════════════════════════════════════════════════════════════════

def _maintain(mw, dm, params):
    action = params.get("action", "cleanup_images")

    if action == "clear_all":
        if not params.get("confirm"):
            return "[WARN] 清空所有数据是危险操作！请设置 confirm=true"
        _snapshot_mgr.snapshot(dm.data, "before_clear_all")
        dm.clear_all()
        _mark_changed(mw, "ai")
        EventBus().emit("data_changed", source="ai")
        EventBus().emit("rebuild_needed")
        return "[WARN] 所有数据已清空"

    elif action == "cleanup_images":
        try:
            count = 0
            data_text = json.dumps(dm.data)
            img_dir = dm.config.data_dir / "assets"
            if img_dir.exists():
                for img in img_dir.glob("*"):
                    if img.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
                        if img.name not in data_text:
                            img.unlink()
                            count += 1
            return f"已清理 {count} 张未使用的图片"
        except Exception as e:
            return f"清理失败: {e}"

    return f"未知操作: {action}，支持: clear_all/cleanup_images"


# ═══════════════════════════════════════════════════════════════════
# 独立操作
# ═══════════════════════════════════════════════════════════════════

def _get_item_references(dm, params):
    data_type = params.get("data_type")
    item_id = params.get("item_id")
    if not data_type or not item_id:
        return "缺少 data_type 或 item_id 参数"
    plural = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
    items = dm.data.get(plural, [])
    target = next((it for it in items if str(it.get("id", "")) == str(item_id)), None)
    if not target:
        return f"未找到 {data_type}/{item_id}"

    refs = []
    for pk in dm.data:
        dt_items = dm.data.get(pk, [])
        if not isinstance(dt_items, list):
            continue
        for dt_item in dt_items:
            for key, val in dt_item.items():
                if isinstance(val, str) and str(item_id) in val:
                    refs.append(f"  [{pk}] {dt_item.get('name','?')}.{key} 引用")
                elif isinstance(val, list) and str(item_id) in [str(v) for v in val]:
                    refs.append(f"  [{pk}] {dt_item.get('name','?')}.{key} 列表引用")
    if refs:
        return f"【{target.get('name','?')}】被 {len(refs)} 处引用:\n" + "\n".join(refs[:20])
    return f"【{target.get('name','?')}】暂未发现引用"


def _show_relation_graph(mw, params):
    if hasattr(mw, '_show_relation_graph'):
        mw._show_relation_graph(params.get("data_type"), params.get("item_id"))
        return "已打开关联关系图"
    return "关系图功能不可用"


def _toggle_auto_save(mw):
    if hasattr(mw, '_auto_save_enabled'):
        mw._auto_save_enabled = not mw._auto_save_enabled
        return f"自动保存: {'已开启' if mw._auto_save_enabled else '已关闭'}"
    return "自动保存切换不可用"


def _advanced_search(dm, params):
    keyword = params.get("keyword", "")
    data_type = params.get("data_type")
    match_all = params.get("match_all", False)
    if not keyword:
        return "缺少 keyword 参数"
    all_results = []
    keywords = [kw.strip().lower() for kw in keyword.split(",")]
    for plural_key in dm.data:
        items = dm.data.get(plural_key, [])
        if not isinstance(items, list):
            continue
        if data_type and plural_key != DATA_TYPE_PLURALS.get(data_type, data_type + "s"):
            continue
        for item in items:
            item_text = json.dumps(item, ensure_ascii=False).lower()
            matches = [kw in item_text for kw in keywords]
            ok = all(matches) if match_all else any(matches)
            if ok:
                all_results.append(f"[{plural_key}] {item.get('name','?')} (id:{item.get('id','')})")
    if all_results:
        return f"高级搜索「{keyword}」: {len(all_results)} 条\n" + "\n".join(all_results[:30])
    return "未找到匹配"


def _rule_validate(dm, params):
    data_type = params.get("data_type")
    results = []
    if data_type:
        plural = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
        for it in dm.data.get(plural, [])[:10]:
            issues = [f for f in ["name"] if f not in it]
            if issues:
                results.append(f"  [{it.get('name','?')}]: 缺少 {', '.join(issues)}")
    else:
        for pk, items in dm.data.items():
            if not isinstance(items, list) or not items:
                continue
            empty = sum(1 for i in items if not i.get("name"))
            if empty:
                results.append(f"  {pk}: {empty}/{len(items)} 条缺名称")
    if results:
        return "规则验证:\n" + "\n".join(results[:20])
    return "验证通过，未发现明显问题"


def _layout_switch(params):
    layout = params.get("layout", "three_column")
    valid = {"three_column": "三栏布局"}
    if layout not in valid:
        return f"不支持的布局: {layout}"
    return f"布局切换请在菜单「设置→选择界面」中手动操作。可用: {', '.join(f'{k}({v})' for k,v in valid.items())}"


# ═══════════════════════════════════════════════════════════════════
# 方案 → Schema 自动生成
# ═══════════════════════════════════════════════════════════════════

def _sync_schema_from_plan(dm, config, params, mw=None):
    _snapshot_mgr.snapshot(dm.data, "before_schema_sync")
    plan_name = params.get("plan_name")
    item_id = params.get("plan_id") or params.get("item_id")
    save = params.get("save", True)

    plan = None
    plans = dm.data.get("planning", [])
    for p in plans:
        if item_id and str(p.get("id", "")) == str(item_id):
            plan = p
            break
        if plan_name and p.get("name") == plan_name:
            plan = p
            break

    if not plan:
        if plans:
            plan = plans[-1]
        else:
            return "没有可用的策划方案"

    plan_content = plan.get("content", "") or plan.get("description", "") or json.dumps(plan, ensure_ascii=False)
    extracted = _extract_fields_from_text(plan_content)

    new_types = extracted.get("new_types", [])
    fields_to_create = extracted.get("fields", [])

    if not new_types and not fields_to_create:
        return f"方案「{plan.get('name','?')}」中未找到可提取的字段定义。\n提示：请在方案中用【需要字段】或「字段:类型」格式描述数据结构。如果要新建数据类型，用【新增类型】格式。"

    schema_path = None
    lib_dir = None
    try:
        lib_dir = config.library_manager.libraries_dir / config.library_manager.active_library_name
        sf = lib_dir / "type_schema.json"
        schema_path = sf
    except Exception as e:
        logger.warning(f"操作失败: {e}")

    results = []

    if schema_path and schema_path.exists():
        schema = json.loads(schema_path.read_text(encoding='utf-8'))
    else:
        schema = {"data_types": []}

    types = schema.get("data_types", [])
    type_names = {t.get("id"): t.get("name", t.get("id")) for t in types}

    # ── 先处理新类型 ──
    for nt in new_types:
        tid = nt["id"]
        tname = nt.get("name", tid)
        tcolor = nt.get("color", "#a855f7")
        if tid in type_names:
            results.append(f"   类型 {tname}({tid}) 已存在")
            continue

        default_fields = [
            {"name": "name", "label": "名称", "type": "entry", "editable": True},
            {"name": "description", "label": "描述", "type": "text", "editable": True},
            {"name": "type", "label": "分类", "type": "combobox", "editable": True, "values": [tname, "普通", "稀有", "史诗"]},
            {"name": "level", "label": "等级", "type": "spinbox", "editable": True},
        ]
        all_fields = list(default_fields)
        for f in nt.get("fields", []):
            if not any(ef.get("name") == f.get("name") for ef in all_fields):
                all_fields.append(f)

        types.append({
            "id": tid,
            "name": tname,
            "plural_key": nt.get("plural", tid + "s"),
            "color": tcolor,
            "icon": nt.get("icon", ""),
            "form_fields": all_fields,
        })

        _init_empty_data_file(lib_dir / "default.json", tid + "s")

        type_code, _ = _reload_types_from_schema(schema, config)

        results.append(f"  🆕 新建数据类型「{tname}」({tid})，包含 {len(all_fields)} 个字段")

    # ── 再处理字段 ──
    for fdef in fields_to_create:
        data_type = fdef.get("data_type", "skill")
        field_name = fdef.get("name", "")
        field_label = fdef.get("label", field_name)
        field_type = fdef.get("type", "string")

        if not field_name:
            continue

        if save and schema_path:
            try:
                target_type = next((t for t in types if t.get("id") == data_type), None)
                if not target_type:
                    target_type = {
                        "id": data_type,
                        "name": data_type,
                        "form_fields": [],
                    }
                    types.append(target_type)

                existing = [f.get("name") for f in target_type.get("form_fields", [])]
                if field_name in existing:
                    results.append(f"   {data_type}.{field_name} 已存在，跳过")
                    continue

                target_type.setdefault("form_fields", []).append({
                    "name": field_name,
                    "label": field_label,
                    "type": field_type,
                    "editable": True,
                })

                schema_path.write_text(json.dumps(schema, ensure_ascii=False, indent=2), encoding='utf-8')
                results.append(f"  [OK] 创建 {data_type}.{field_name} ({field_type})")
            except Exception as e:
                results.append(f"  [FAIL] {data_type}.{field_name} 失败: {e}")
        else:
            results.append(f"   {data_type}.{field_name} ({field_type}) — 未保存")

    if save and schema_path:
        schema_path.write_text(json.dumps(schema, ensure_ascii=False, indent=2), encoding='utf-8')
        _reload_types_from_schema(schema, config)
        try:
            lm = config.library_manager
            lm.reload_type_schema(lm.active_library_name)
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        EventBus().emit("rebuild_needed")

    return f"从方案「{plan.get('name','?')}」提取 {len(new_types)} 个新类型 + {len(fields_to_create)} 个字段:\n" + "\n".join(results)


def _init_empty_data_file(data_path, plural_key):
    if data_path.exists():
        try:
            data = json.loads(data_path.read_text(encoding='utf-8'))
            if plural_key not in data:
                data[plural_key] = []
                data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        except Exception as e:
            logger.warning(f"操作失败: {e}")


def _reload_types_from_schema(schema, config):
    type_ids = []
    type_names = {}
    type_plurals = {}
    type_colors = {}
    for t in schema.get("data_types", []):
        tid = t.get("id", "")
        if not tid:
            continue
        type_ids.append(tid)
        type_names[tid] = t.get("name", tid)
        type_plurals[tid] = t.get("plural_key", tid + "s")
        type_colors[tid] = t.get("color", "#a855f7")
    try:
        from config.constants import reload_from_type_schema
        reload_from_type_schema(type_ids, type_names, type_plurals, type_colors)
    except Exception as e:
        logger.warning(f"操作失败: {e}")
    return type_ids, type_names


def _extract_fields_from_text(text: str) -> dict:
    result = {"new_types": [], "fields": []}
    new_types = result["new_types"]
    fields = result["fields"]

    # ── 检测游戏类型/风格（用于智能推断 data_type） ──
    type_hints = {}
    genre_map = {
        "卡牌": "card", "卡组": "deck", "卡片": "card",
        "塔防": "tower", "塔": "tower",
        "枪械": "weapon", "武器": "weapon", "FPS": "weapon",
        "赛车": "car", "车辆": "car",
        "宠物": "pet", "坐骑": "mount",
        "建筑": "building", "城池": "building",
        "种植": "crop", "农作物": "crop",
        "关卡": "level", "地图": "map",
        "技能": "skill", "角色": "role", "怪物": "monster",
        "装备": "equip", "道具": "item", "任务": "task",
    }
    for cn, en in genre_map.items():
        if cn in text:
            type_hints[en] = cn

    # ── 检测新类型定义 ──
    # 格式: 【新增类型】card 卡牌
    # 格式: 数据类型：卡片(card)
    new_type_patterns = [
        r'【新增类型】\s*(\w+)\s*[：:]*\s*(.*?)(?:\n|$)',
        r'数据类型[：:]\s*(.+?)\s*\((\w+)\)',
        r'新建类型[：:]\s*(\w+)\s*[：:]*\s*(.*?)(?:\n|$)',
        r'需要创建\s*(.+?)\s*类型\s*（?(\w+)）?',
    ]
    for ptn in new_type_patterns:
        for m in re.finditer(ptn, text):
            if ptn == new_type_patterns[2]:
                tid = m.group(1)
                tname = m.group(2) or tid
            elif ptn == new_type_patterns[3]:
                tid = m.group(2) or m.group(1)
                tname = m.group(1)
            else:
                tid = m.group(1) if '\\w+' in ptn.split('(')[1] else m.group(2)
                tname = m.group(2) if '\\w+' in ptn.split('(')[1] else m.group(1)
                if not tid or tid.startswith(("是", "的", "和")):
                    continue
                if len(tid) > 30:
                    tid, tname = tname, tid
            tname = tname.strip()
            if tname and tid:
                new_types.append({"id": tid, "name": tname})

    # Deduplicate new types
    seen = set()
    new_types[:] = [nt for nt in new_types if not (nt["id"] in seen or seen.add(nt["id"]))]

    # ── 检测各类型下的字段定义 ──
    # 格式: ## 卡牌(card) 或 ### card
    section_pattern = re.compile(r'^#{2,4}\s*(.+?)\s*(?:\((\w+)\))?\s*$', re.MULTILINE)
    sections = list(section_pattern.finditer(text))

    if sections:
        for i, sec in enumerate(sections):
            sec_name = sec.group(1).strip()
            sec_id = sec.group(2) or genre_map.get(sec_name, None)
            if not sec_id:
                continue

            start = sec.end()
            end = sections[i+1].start() if i + 1 < len(sections) else len(text)
            section_text = text[start:end]

            for fdef in _parse_field_lines(section_text):
                fdef["data_type"] = sec_id
                fields.append(fdef)

    # ── 全局字段提取 ──
    # 先定位【需要字段】区块，跳过已由分节处理的字段
    captured_by_section = {f["name"] for f in fields}
    block_pattern = re.compile(r'【需要字段】\s*\n((?:[-*•].*\n?)*)', re.MULTILINE)
    for m in block_pattern.finditer(text):
        for fdef in _parse_field_lines(m.group(1)):
            if fdef["name"] not in captured_by_section:
                fields.append(fdef)

    captured = {f["name"] for f in fields}

    patterns = [
        (r'[「【]([\w\u4e00-\u9fff]+)\s*[:：]\s*(\w+)[】」]', False),
        (r'字段[:：]\s*([\w\u4e00-\u9fff]+)\s*[:：]\s*(\w+)', False),
        (r'新增字段[:：]\s*([\w\u4e00-\u9fff]+)\s*[-:：]\s*(\w+)', False),
        (r'([\w\u4e00-\u9fff]+)\s*[-:：]\s*类型[:：]\s*(\w+)', False),
    ]

    for ptn, _ in patterns:
        for m in re.finditer(ptn, text):
            name = m.group(1)
            if name in captured:
                continue
            captured.add(name)
            fields.append({
                "data_type": "skill", "name": name,
                "type": m.group(2), "label": name,
            })

    # ── 命名格式字段检测 ──
    kw_fields = re.findall(r'\b(\w+)\s*字段\b', text)
    skip_words = {"的","和","或","以及","这些","以下","以上","所有","新","一个","这个","该","可","用","每","只","之","需要","是"}
    for kw in kw_fields:
        if kw not in captured and kw not in skip_words:
            captured.add(kw)
            fields.append({"data_type": "skill", "name": kw, "type": "string", "label": kw})

    # ── 智能推断 data_type ──
    # 如果新类型只有一个，把默认 skill 的字段转到该类型
    if len(new_types) == 1 and not sections:
        primary_type = new_types[0]["id"]
        for f in fields:
            if f["data_type"] == "skill":
                f["data_type"] = primary_type
    elif type_hints and not new_types and not sections:
        primary_hint = next(iter(type_hints))
        for f in fields:
            if f["data_type"] == "skill":
                f["data_type"] = primary_hint

    return result


def _parse_field_lines(text_block: str) -> list:
    """从文本块中解析「field_name : type」格式的行"""
    items = []
    for line in text_block.strip().split("\n"):
        line = line.strip()
        # - name: type 或 * name: type 或 name=type
        fm = re.match(r'[-*•]*\s*([\w\u4e00-\u9fff]+)\s*[-:：=]\s*(.*)', line)
        if fm:
            fname = fm.group(1)
            ftype = fm.group(2).strip()
            if fname and fname not in ("id", "name", "description", "type", "level"):
                items.append({"data_type": "skill", "name": fname, "type": ftype, "label": fname})
    return items

