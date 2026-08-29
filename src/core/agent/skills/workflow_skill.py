from __future__ import annotations

import threading
import time

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.workflow.workflow_engine import NodeStatus, Workflow, WorkflowEngine

logger = get_logger()


class WorkflowSkill(BaseSkill):
    name = "system.workflow"
    NAME = "system.workflow"
    DESCRIPTION = "工作流引擎：创建、执行、管理自动化工作流。可并行执行多个步骤。"
    PARAMS_SCHEMA = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["run", "create", "status", "list", "cancel"],
                "description": "动作：run=执行工作流, create=创建新工作流, status=查看状态, list=列出所有工作流, cancel=取消"
            },
            "workflow_json": {
                "type": "object",
                "description": "工作流定义 JSON（action=run/create 时使用）"
            },
            "workflow_id": {
                "type": "string",
                "description": "工作流 ID（action=status/cancel 时使用）"
            },
            "workflow_file": {
                "type": "string",
                "description": "工作流 JSON 文件路径（action=run 时使用）"
            },
            "plan": {
                "type": "object",
                "description": "CeshuSkill.decompose 输出的计划（action=run 时自动转换为工作流）"
            },
        },
        "required": ["action"]
    }

    _workflows: dict[str, Workflow] = {}
    _lock = threading.Lock()
    # 修复 P3-35: 共享 dispatcher 单例 — 避免每个节点都 new ToolDispatcher + discover_skills
    # discover_skills 涉及 importlib 模块扫描，对多节点工作流是 O(N×scan) 浪费
    _shared_dispatcher = None
    _shared_dispatcher_lock = threading.Lock()

    @classmethod
    def _get_shared_dispatcher(cls):
        """懒加载共享 ToolDispatcher（线程安全）。如果 brain 已注入 dispatcher，可优先用之。"""
        if cls._shared_dispatcher is not None:
            return cls._shared_dispatcher
        with cls._shared_dispatcher_lock:
            if cls._shared_dispatcher is None:
                from core.agent.dispatcher import ToolDispatcher
                d = ToolDispatcher()
                d.discover_skills("core.agent.skills")
                try:
                    d.register_mcp_tools()
                except Exception as e:
                    logger.warning(f"[Workflow] MCP 工具注册失败: {e}")
                cls._shared_dispatcher = d
                logger.info(f"[Workflow] 共享 dispatcher 初始化完成 ({len(d._skills)} skills)")
        return cls._shared_dispatcher

    @classmethod
    def inject_dispatcher(cls, dispatcher) -> None:
        """供 brain 在 boot 时注入已配置好的 dispatcher，跳过重复 discover。"""
        with cls._shared_dispatcher_lock:
            cls._shared_dispatcher = dispatcher

    def execute(self, params: dict, context: dict = None) -> dict:
        action = params.get("action", "run")
        # logger 已在模块顶部定义

        if action == "run":
            return self._run(params, context, logger)
        elif action == "create":
            return self._create(params, logger)
        elif action == "status":
            return self._status(params)
        elif action == "list":
            return self._list_workflows()
        elif action == "cancel":
            return self._cancel(params)
        else:
            return {"success": False, "error": f"未知 action: {action}"}

    def _run(self, params: dict, context: dict, logger) -> dict:
        wf = None

        if params.get("workflow_file"):
            try:
                wf = WorkflowEngine.from_json_file(params["workflow_file"])
            except Exception as e:
                return {"success": False, "error": f"加载工作流文件失败: {e}"}

        if not wf and params.get("plan"):
            wf = WorkflowEngine.from_decomposed_plan(params["plan"])

        if not wf and params.get("workflow_json"):
            wf = WorkflowEngine.from_json(params["workflow_json"])

        if not wf:
            return {"success": False, "error": "缺少工作流定义 (workflow_json/plan/workflow_file)"}

        def executor(tool_name, tool_params, ctx):
            # 修复 P3-35: 复用共享 dispatcher，避免每个节点重新 discover_skills
            # 同时支持 brain 在 context 中注入已配置的 dispatcher（优先用之）
            dispatcher = (ctx or {}).get("_dispatcher") or self._get_shared_dispatcher()
            r = dispatcher.execute(tool_name, tool_params, ctx)
            if isinstance(r, dict) and not r.get("success", True):
                logger.warning(f"[Workflow] 节点工具 {tool_name} 返回失败: {r.get('error','')}")
            return r

        engine = WorkflowEngine(executor)
        engine.set_progress_callback(
            lambda w: logger.info(
                f"[Workflow] {w.id} 进度: "
                f"{sum(1 for n in w.nodes.values() if n.status.value in ('success','failed','skipped'))}/{len(w.nodes)}"
            )
        )
        engine.set_error_callback(lambda nid, err: logger.error(f"[Workflow] 节点 {nid} 失败: {err}"))

        logger.info(f"[Workflow] 开始执行: {wf.id} ({wf.name}), {len(wf.nodes)} 个节点")
        result = engine.run(wf, context or {})

        with self._lock:
            self._workflows[wf.id] = result["workflow"]

        status_lines = [f"工作流: {wf.id} ({wf.name})", f"状态: {result['workflow'].status.value}"]
        for _nid, node in result["workflow"].nodes.items():
            status_lines.append(f"  [{node.status.value}] {node.id}: {node.name}")

        return {
            "success": result["success"],
            "workflow_id": wf.id,
            "status": result["workflow"].status.value,
            "completed": result["completed"],
            "failed": result["failed"],
            "failed_nodes": result["failed_nodes"],
            "details": "\n".join(status_lines),
            "message": f"工作流 {wf.name} 完成: {result['completed']}/{len(result['workflow'].nodes)} 成功, {result['failed']} 失败",
        }

    def _create(self, params: dict, logger) -> dict:
        wf = None
        if params.get("workflow_json"):
            wf = WorkflowEngine.from_json(params["workflow_json"])
        if not wf:
            return {"success": False, "error": "需要 workflow_json 参数"}
        with self._lock:
            self._workflows[wf.id] = wf
        logger.info(f"[Workflow] 创建工作流: {wf.id} ({wf.name}), {len(wf.nodes)} 个节点")
        return {
            "success": True,
            "workflow_id": wf.id,
            "node_count": len(wf.nodes),
            "nodes": [{"id": n.id, "name": n.name, "tool": n.tool} for n in wf.nodes.values()],
            "message": f"工作流 {wf.id} 已创建（{len(wf.nodes)} 个节点），使用 action=run 执行",
        }

    def _status(self, params: dict) -> dict:
        wf_id = params.get("workflow_id", "")
        if not wf_id:
            return {"success": False, "error": "需要 workflow_id"}
        wf = self._workflows.get(wf_id)
        if not wf:
            return {"success": False, "error": f"工作流不存在: {wf_id}"}
        return {
            "success": True,
            "workflow_id": wf.id,
            "name": wf.name,
            "status": wf.status.value,
            "started_at": wf.started_at,
            "finished_at": wf.finished_at,
            "nodes": {
                nid: {"name": n.name, "status": n.status.value, "result": n.result}
                for nid, n in wf.nodes.items()
            },
        }

    def _list_workflows(self) -> dict:
        workflows = [
            {
                "id": wf.id, "name": wf.name, "status": wf.status.value,
                "nodes": len(wf.nodes), "started_at": wf.started_at,
            }
            for wf in self._workflows.values()
        ]
        return {
            "success": True,
            "count": len(workflows),
            "workflows": workflows,
            "message": f"共 {len(workflows)} 个工作流" if workflows else "暂无工作流",
        }

    def _cancel(self, params: dict) -> dict:
        wf_id = params.get("workflow_id", "")
        if wf_id in self._workflows:
            wf = self._workflows[wf_id]
            if wf.status in (NodeStatus.PENDING, NodeStatus.RUNNING):
                for node in wf.nodes.values():
                    if node.status in (NodeStatus.PENDING, NodeStatus.RUNNING):
                        node.status = NodeStatus.SKIPPED
                wf.status = NodeStatus.FAILED
                wf.finished_at = time.strftime("%Y-%m-%d %H:%M:%S")
            return {"success": True, "message": f"工作流 {wf_id} 已取消"}
        return {"success": False, "error": f"工作流不存在: {wf_id}"}
