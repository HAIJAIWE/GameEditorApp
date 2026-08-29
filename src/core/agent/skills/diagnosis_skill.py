from __future__ import annotations

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import normalize_params


class DiagnosisSkill(BaseSkill):
    name = "system.diagnosis"
    description = "系统诊断与修复: 检查数据健康/修复数据/回滚快照/翻译报错/检查引用/备份管理/代码自愈"
    version = "1.0.0"
    parameters = [
        {"name": "action", "required": True, "type": "string",
         "enum": ["diagnose", "health", "fix_data", "rollback",
                  "translate", "references", "backup", "fix_code", "fix_config"],
         "description": "diagnose=数据诊断(缺id/重复/孤立引用), health=系统健康报告, "
                        "fix_data=修复数据问题, rollback=回滚快照, "
                        "translate=翻译技术报错, references=检查数据引用关系, "
                        "backup=备份管理(list/create/restore), "
                        "fix_code=代码自愈, fix_config=配置修复"},
        {"name": "data_type", "required": False, "type": "string",
         "description": "数据类型(diagnose/references/fix_data)"},
        {"name": "item_id", "required": False, "type": "string",
         "description": "数据ID(references)"},
        {"name": "error_message", "required": False, "type": "string",
         "description": "错误消息(translate)"},
        {"name": "error_type", "required": False, "type": "string",
         "description": "错误类型如 NameError(translate)"},
        {"name": "traceback", "required": False, "type": "string",
         "description": "完整 traceback(fix_code)"},
        {"name": "language", "required": False, "type": "string",
         "description": "代码语言(fix_code): python/typescript/javascript/css"},
        {"name": "file_path", "required": False, "type": "string",
         "description": "文件路径(fix_code/fix_config)"},
        {"name": "backup_action", "required": False, "type": "string",
         "enum": ["list", "create", "restore", "delete"],
         "description": "备份操作(backup)"},
        {"name": "backup_label", "required": False, "type": "string",
         "description": "备份标签(backup action=create)"},
        {"name": "backup_filename", "required": False, "type": "string",
         "description": "备份文件名(backup action=restore/delete)"},
        {"name": "fix_action", "required": False, "type": "string",
         "enum": ["repair_missing_ids", "repair_duplicate_ids", "repair_empty_names",
                  "clean_orphan_refs", "all"],
         "description": "修复动作(fix_data)"},
    ]
    tags = ["diagnosis", "repair", "health", "rollback", "backup", "code_fix"]

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        logger = get_logger()
        action = params.get("action", "health")

        mw = context.get("main_window")
        dm = context.get("data_manager") or (mw and getattr(mw, "data_manager", None))

        try:
            if action == "diagnose":
                return self._diagnose(dm, mw, params, logger)
            elif action == "health":
                return self._health_report(logger)
            elif action == "fix_data":
                return self._fix_data(dm, mw, params, logger)
            elif action == "rollback":
                return self._rollback(dm, mw, logger)
            elif action == "translate":
                return self._translate(params, logger)
            elif action == "references":
                return self._references(dm, params, logger)
            elif action == "backup":
                return self._backup(mw, dm, params, logger)
            elif action == "fix_code":
                return self._fix_code(params, logger)
            elif action == "fix_config":
                return self._fix_config(params, logger)
            else:
                return {"success": False, "error": f"未知 action: {action}", "message": ""}
        except Exception as e:
            logger.error(f"DiagnosisSkill {action} 异常: {e}", exc_info=True)
            return {"success": False, "error": str(e), "message": ""}

    # ──────────── 诊断 ────────────

    def _diagnose(self, dm, mw, params, logger) -> dict:
        from core.agent.tools.tool_repair import _diagnose_problem
        if not dm or not mw:
            return {"success": False, "error": "编辑器未就绪", "message": ""}
        result = _diagnose_problem(dm, mw, params)
        return {"success": True, "message": result, "data": {"report": result}}

    def _health_report(self, logger) -> dict:
        from core.agent.tools.tool_repair import _show_health_report
        result = _show_health_report()
        return {"success": True, "message": result, "data": {"report": result}}

    def _fix_data(self, dm, mw, params, logger) -> dict:
        from core.agent.tools.tool_repair import _fix_data
        if not dm or not mw:
            return {"success": False, "error": "编辑器未就绪", "message": ""}
        result = _fix_data(dm, mw, params)
        return {"success": True, "message": result, "data": {"report": result}}

    def _rollback(self, dm, mw, logger) -> dict:
        from core.agent.tools.tool_repair import _rollback_data
        if not dm or not mw:
            return {"success": False, "error": "编辑器未就绪", "message": ""}
        result = _rollback_data(dm, mw)
        return {"success": True, "message": result, "data": {"report": result}}

    # ──────────── 翻译 ────────────

    def _translate(self, params, logger) -> dict:
        from core.agent.tools.tool_repair import _translate_error
        result = _translate_error(params)
        return {"success": True, "message": result, "data": {"report": result}}

    # ──────────── 引用检查 ────────────

    def _references(self, dm, params, logger) -> dict:
        from core.agent.tools.tool_advanced import _get_item_references
        if not dm:
            return {"success": False, "error": "数据管理器未就绪", "message": ""}
        result = _get_item_references(dm, params)
        return {"success": True, "message": result, "data": {"report": result}}

    # ──────────── 备份管理 ────────────

    def _backup(self, mw, dm, params, logger) -> dict:
        from core.agent.tools.tool_advanced import _backup
        if not dm or not mw:
            return {"success": False, "error": "编辑器未就绪", "message": ""}
        backup_params = {
            "action": params.get("backup_action", "list"),
            "label": params.get("backup_label", "ai"),
            "filename": params.get("backup_filename", ""),
        }
        result = _backup(mw, dm, backup_params)
        return {"success": True, "message": result, "data": {"report": result}}

    # ──────────── 代码/配置自愈 ────────────

    def _fix_code(self, params, logger) -> dict:
        from core.agent.tools.tool_repair import _fix_code
        result = _fix_code(params)
        return {"success": True, "message": result, "data": {"report": result}}

    def _fix_config(self, params, logger) -> dict:
        from core.agent.tools.tool_repair import _fix_config
        result = _fix_config(params)
        return {"success": True, "message": result, "data": {"report": result}}
