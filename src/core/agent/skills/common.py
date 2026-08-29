def _resolve_plural(data_type: str) -> str:
    """将单数类型名解析为复数键，委托中央类型注册表"""
    from config.constants import _type_registry
    data_type = data_type.lower().strip()
    # 先从注册表获取（安全处理不规则复数如 story→stories）
    plural = _type_registry.get_plural(data_type)
    if plural != data_type + "s":
        return plural
    # 如果注册表没有精确匹配，再查反向映射（兼容传入已是复数的情况）
    for _sing, plur in _type_registry.plurals.items():
        if plur == data_type:
            return plur
    # 修复: 之前 rstrip("s") 会把 "boss"→"bos"+"s"="boss" 看似 OK 但 "class"→"clas"+"s"="class" OK
    # 但 "address"→"addres"+"s" 错误！应判断末尾是否已是 's' 复数
    if data_type.endswith("s"):
        # 可能已经是复数（如 roles/skills），直接返回
        return data_type
    return data_type + "s"


def _resolve_singular(plural_key: str) -> str:
    """将复数键还原为单数类型名 — 反向查询 _type_registry.plurals，避免 rstrip("s") bug

    之前: plural_key.rstrip("s")  → "boss" → "bos" 错误
    """
    if not plural_key:
        return ""
    try:
        from config.constants import _type_registry
        for sing, plur in _type_registry.plurals.items():
            if plur == plural_key:
                return sing
    except Exception:
        pass
    # 兜底: 仅当以 "s" 结尾且不以 "ss" 结尾时才去掉 s
    if plural_key.endswith("s") and not plural_key.endswith("ss"):
        return plural_key[:-1]
    return plural_key


def normalize_params(params: dict) -> dict:
    """统一规范化 LLM 传来的参数——接受多种等价写法。
    在每个技能的 execute() 入口调用 params = normalize_params(params) 即可。"""
    p = dict(params)

    if "action" in p:
        act = str(p["action"]).lower()
        ALIASES = {
            "add": "create", "add_item": "create", "create_item": "create",
            "new": "create", "\u65b0\u589e": "create", "\u521b\u5efa": "create", "\u6dfb\u52a0": "create",
            "edit": "update", "modify": "update", "change": "update",
            "update_item": "update", "\u4fee\u6539": "update", "\u66f4\u65b0": "update", "\u7f16\u8f91": "update",
            "remove": "delete", "delete_item": "delete", "del": "delete",
            "\u5220\u9664": "delete", "\u79fb\u9664": "delete",
            "search": "query", "find": "query", "query_items": "query",
            "\u67e5\u8be2": "query", "\u641c\u7d22": "query", "\u67e5\u627e": "query",
            "list_all": "list", "list_items": "list", "list_dir": "list", "ls": "list", "dir": "list",
            "query_files": "query", "search_files": "query", "find_files": "query",
            "\u5217\u8868": "list", "\u5168\u90e8": "list",
            "info": "get", "show": "get", "get_info": "get",
            "view": "get", "\u8be6\u60c5": "get", "\u67e5\u770b": "get",
            "run": "execute", "exec": "execute", "\u6267\u884c": "execute",
            "go": "navigate", "open": "navigate", "visit": "navigate",
            "export": "export", "save": "export", "\u5bfc\u51fa": "export",
            "import": "import", "load": "import", "\u5bfc\u5165": "import",
            # ui_control action aliases
            "switch_tab": "switch_tab", "switch": "switch_tab",
            "\u5207\u6362": "switch_tab", "\u5207\u6362\u6807\u7b7e": "switch_tab",
            "\u5207\u6362\u9875\u9762": "switch_tab", "\u6253\u5f00\u9875\u9762": "switch_tab",
            "\u8f6c\u5230": "switch_tab", "goto": "switch_tab", "navigate": "switch_tab",
            "switch_library": "switch_library", "\u5207\u6362\u5e93": "switch_library",
            "\u5e93\u5207\u6362": "switch_library", "use_library": "switch_library",
            "set_layout": "set_layout", "layout": "set_layout",
            "\u5e03\u5c40": "set_layout", "\u5207\u6362\u5e03\u5c40": "set_layout",
            "change_layout": "set_layout", "set_layout_mode": "set_layout",
            "toggle_panel": "toggle_panel", "panel": "toggle_panel",
            "\u9762\u677f": "toggle_panel", "\u5207\u6362\u9762\u677f": "toggle_panel",
            "show_panel": "toggle_panel", "hide_panel": "toggle_panel",
            "get_state": "get_state", "state": "get_state",
            "\u72b6\u6001": "get_state", "status": "get_state",
            "\u5f53\u524d\u72b6\u6001": "get_state", "get_status": "get_state",
        }
        p["action"] = ALIASES.get(act, act)

    for field in ("keyword", "name", "query", "search", "text", "term", "filter_text"):
        if field in p and "keyword" not in p:
            p["keyword"] = str(p.pop(field))
            if field == "name":
                p["name"] = p["keyword"]

    for field in ("file", "file_path", "source", "target_path", "target_file"):
        if field in p and "path" not in p:
            p["path"] = str(p.pop(field))

    for field in ("link", "address"):
        if field in p and "url" not in p:
            p["url"] = str(p.pop(field))

    for field in ("body", "text", "data_str", "value", "message"):
        if field in p and "content" not in p:
            p["content"] = str(p.pop(field))

    if "filter" in p and isinstance(p["filter"], dict):
        p["filter"] = ", ".join(f"{k} = {v}" for k, v in p["filter"].items())

    return p
