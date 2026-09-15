"""策划书 CRUD 与导入导出 —— CeshuSkill 的 CeshuSkillDataMixin 部分

自 ceshu_skill.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from core.agent.skills.ceshu_skill_state import CeshuSkillState


class CeshuSkillDataMixin(CeshuSkillState):
    """策划书 CRUD 与导入导出"""

    @staticmethod
    def _resolve_library(context: dict, params: dict) -> str:
        """从上下文或参数中解析当前库名"""
        lib = params.get("library", "")
        if not lib:
            mw = context.get("main_window")
            if mw and hasattr(mw, "active_library_name"):
                lib = mw.active_library_name
        if not lib:
            ws = context.get("workspace_root", "")
            if ws:
                lib = Path(ws).name
        return lib or "默认库"
    def _get_manager(self, context: dict) -> Any:
        """获取 CeshuManager 实例"""
        from core.ceshu import CeshuManager
        mw = context.get("main_window")
        lib_root: Any = ""
        if mw and hasattr(mw, "data_manager"):
            dm = mw.data_manager
            if dm and hasattr(dm, "_root"):
                lib_root = dm._root
        if not lib_root:
            lib_root = Path(__file__).resolve().parent.parent.parent.parent.parent / "data" / "libraries"
        return CeshuManager(lib_root)
    def _list(self, params: dict, context: dict, logger) -> dict:
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        keyword = params.get("keyword", "")
        ceshus = mgr.list_ceshu(library, keyword)
        lines = [f"策划书列表（{len(ceshus)} 本）:"]
        for c in ceshus:
            lines.append(f"- [{c['game_type']}] {c['name']} (id={c['ceshu_id']}) {c['status']}")
        return {"success": True, "message": "\n".join(lines), "data": {"ceshus": ceshus}}
    def _get(self, params: dict, context: dict, logger) -> dict:
        ceshu_id = params.get("ceshu_id", "")
        if not ceshu_id:
            return {"success": False, "error": "缺少 ceshu_id", "message": ""}
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        try:
            model = mgr.get_ceshu(ceshu_id, library)
            return {"success": True, "message": f"策划书: {model.meta.get('game_name', '未命名')}", "data": model.to_dict()}
        except FileNotFoundError:
            return {"success": False, "error": f"策划书 {ceshu_id} 不存在", "message": ""}
    def _create(self, params: dict, context: dict, logger) -> dict:
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        template = params.get("template", "")
        meta = params.get("meta")
        model = mgr.create_ceshu(library, template, meta)
        return {"success": True, "message": f"策划书已创建: {model.meta.get('game_name', '未命名')}", "data": model.to_dict()}
    def _update(self, params: dict, context: dict, logger) -> dict:
        ceshu_id = params.get("ceshu_id", "")
        if not ceshu_id:
            return {"success": False, "error": "缺少 ceshu_id", "message": ""}
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        try:
            model = mgr.get_ceshu(ceshu_id, library)
            if "meta" in params:
                model.meta.update(params["meta"])
            if "chapter" in params and "chapter_data" in params:
                model.set_chapter(params["chapter"], params["chapter_data"])
            mgr.save_ceshu(model, library)
            return {"success": True, "message": "策划书已更新", "data": model.to_dict()}
        except FileNotFoundError:
            return {"success": False, "error": f"策划书 {ceshu_id} 不存在", "message": ""}
    def _delete(self, params: dict, context: dict, logger) -> dict:
        ceshu_id = params.get("ceshu_id", "")
        if not ceshu_id:
            return {"success": False, "error": "缺少 ceshu_id", "message": ""}
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        ok = mgr.delete_ceshu(ceshu_id, library)
        if ok:
            return {"success": True, "message": f"策划书 {ceshu_id} 已删除"}
        return {"success": False, "error": f"策划书 {ceshu_id} 不存在", "message": ""}
    def _export(self, params: dict, context: dict, logger) -> dict:
        ceshu_id = params.get("ceshu_id", "")
        output = params.get("output", "")
        fmt = params.get("format", "ceshu")
        if not ceshu_id:
            return {"success": False, "error": "缺少 ceshu_id", "message": ""}
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        if fmt == "docx":
            path = mgr.export_ceshu_docx(ceshu_id, library, output, include_validation_report=True)
        elif fmt == "pdf":
            path = mgr.export_ceshu_pdf(ceshu_id, library, output, include_validation_report=True)
        elif fmt == "md":
            path = mgr.export_ceshu_markdown(ceshu_id, library, output)
        elif fmt == "ceshu_chain":
            path = mgr.export_ceshu(ceshu_id, library, output, include_version_chain=True)
        else:  # "ceshu" 默认
            path = mgr.export_ceshu(ceshu_id, library, output, include_version_chain=False)
        return {"success": True, "message": f"已导出到 {path}"}
    def _import(self, params: dict, context: dict, logger) -> dict:
        filepath = params.get("filepath", "")
        if not filepath:
            return {"success": False, "error": "缺少 filepath", "message": ""}
        mgr = self._get_manager(context)
        library = self._resolve_library(context, params)
        model = mgr.import_ceshu(filepath, library)
        return {"success": True, "message": f"策划书已导入: {model.meta.get('game_name', '未命名')}", "data": model.to_dict()}
