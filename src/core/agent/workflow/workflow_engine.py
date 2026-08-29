from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from enum import Enum
import threading
import time
from typing import Optional

from common.logger import get_logger


class NodeStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class WorkflowNode:
    id: str
    name: str
    description: str = ""
    tool: str = ""
    params: dict = field(default_factory=dict)
    depends_on: list[str] = field(default_factory=list)
    condition: Optional[str] = None
    max_retries: int = 1
    timeout: float = 60.0
    status: NodeStatus = NodeStatus.PENDING
    result: Optional[dict] = None
    retry_count: int = 0
    started_at: Optional[str] = None
    finished_at: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "description": self.description,
            "tool": self.tool, "depends_on": self.depends_on,
            "condition": self.condition, "max_retries": self.max_retries,
            "status": self.status.value, "result": self.result,
        }


@dataclass
class Workflow:
    id: str
    name: str
    goal: str = ""
    nodes: dict[str, WorkflowNode] = field(default_factory=dict)
    status: NodeStatus = NodeStatus.PENDING
    started_at: Optional[str] = None
    finished_at: Optional[str] = None

    def add_node(self, node: WorkflowNode):
        self.nodes[node.id] = node

    def get_ready_nodes(self) -> list[WorkflowNode]:
        ready = []
        for node in self.nodes.values():
            if node.status != NodeStatus.PENDING:
                continue
            if self._dependencies_satisfied(node):
                ready.append(node)
        return ready

    def _dependencies_satisfied(self, node: WorkflowNode) -> bool:
        if not node.depends_on:
            return True
        for dep_id in node.depends_on:
            dep = self.nodes.get(dep_id)
            if dep is None:
                continue
            if dep.status == NodeStatus.FAILED:
                return False
            if node.condition and dep.status == NodeStatus.SUCCESS:
                if not self._evaluate_condition(node.condition, dep):
                    node.status = NodeStatus.SKIPPED
                    return False
            if dep.status != NodeStatus.SUCCESS and dep.status != NodeStatus.SKIPPED:
                return False
        return True

    @staticmethod
    def _evaluate_condition(condition: str, dep: WorkflowNode) -> bool:
        try:
            if not dep.result:
                return True
            if condition.startswith("data."):
                key = condition[5:]
                val = dep.result.get("data", {}).get(key)
                return val is not None and bool(val)
            if condition == "success":
                return dep.result.get("success", False)
            if condition == "has_data":
                data = dep.result.get("data", {})
                return bool(data)
            return True
        except Exception:
            return True


class WorkflowEngine:
    def __init__(self, executor: Callable[[str, dict, dict], dict]):
        self._logger = get_logger()
        self._executor = executor
        self._context: dict = {}
        self._lock = threading.Lock()
        self._on_progress: Optional[Callable] = None
        self._on_error: Optional[Callable] = None

    def set_progress_callback(self, cb: Callable):
        self._on_progress = cb

    def set_error_callback(self, cb: Callable):
        self._on_error = cb

    def run(self, workflow: Workflow, context: dict = None) -> dict:
        self._context = context or {}
        workflow.started_at = time.strftime("%Y-%m-%d %H:%M:%S")

        if not workflow.nodes:
            return {"success": False, "error": "工作流为空", "workflow": workflow}

        total = len(workflow.nodes)
        completed = 0
        failed_nodes: list[str] = []

        while completed + len(failed_nodes) < total:
            ready = workflow.get_ready_nodes()
            if not ready:
                pending = [n for n in workflow.nodes.values() if n.status == NodeStatus.PENDING]
                if pending:
                    unresolved = [n.id for n in pending
                                  if any(workflow.nodes.get(d, WorkflowNode(id=d, name=d)).status == NodeStatus.FAILED
                                         for d in n.depends_on)]
                    if unresolved:
                        for nid in unresolved:
                            node = workflow.nodes[nid]
                            node.status = NodeStatus.SKIPPED
                            failed_nodes.append(nid)
                        continue
                break

            parallel_nodes = [n for n in ready if len(ready) > 1]
            if parallel_nodes:
                results = self._execute_parallel(parallel_nodes, workflow)
            else:
                results = {ready[0].id: self._execute_node(ready[0], workflow)}

            for nid, r in results.items():
                node = workflow.nodes[nid]
                node.result = r
                node.finished_at = time.strftime("%H:%M:%S")
                if r.get("success"):
                    node.status = NodeStatus.SUCCESS
                    completed += 1
                else:
                    if node.retry_count < node.max_retries:
                        node.retry_count += 1
                        node.status = NodeStatus.PENDING
                        self._logger.info(f"节点 {node.id} 重试 ({node.retry_count}/{node.max_retries})")
                    else:
                        node.status = NodeStatus.FAILED
                        failed_nodes.append(nid)

            if self._on_progress:
                self._on_progress(workflow)

        workflow.finished_at = time.strftime("%Y-%m-%d %H:%M:%S")
        workflow.status = NodeStatus.SUCCESS if not failed_nodes else NodeStatus.FAILED

        return {
            "success": workflow.status == NodeStatus.SUCCESS,
            "workflow": workflow,
            "completed": completed,
            "failed": len(failed_nodes),
            "failed_nodes": failed_nodes,
        }

    def _execute_node(self, node: WorkflowNode, workflow: Workflow) -> dict:
        node.status = NodeStatus.RUNNING
        node.started_at = time.strftime("%H:%M:%S")
        self._logger.info(f"[Workflow] 执行节点: {node.id} → {node.tool}")

        ctx = dict(self._context)
        for dep_id in node.depends_on:
            dep = workflow.nodes.get(dep_id)
            if dep and dep.result:
                ctx[f"_dep_{dep_id}"] = dep.result

        try:
            result = self._executor(node.tool, node.params, ctx)
            return result
        except Exception as e:
            self._logger.error(f"节点 {node.id} 异常: {e}")
            if self._on_error:
                self._on_error(node.id, str(e))
            return {"success": False, "error": str(e)}

    def _execute_parallel(self, nodes: list[WorkflowNode], workflow: Workflow) -> dict[str, dict]:
        results: dict[str, dict] = {}
        threads = []

        def runner(node):
            r = self._execute_node(node, workflow)
            with self._lock:
                results[node.id] = r

        for node in nodes:
            t = threading.Thread(target=runner, args=(node,), daemon=True)
            threads.append(t)
            t.start()

        for t in threads:
            t.join(timeout=node.timeout + 5)

        return results

    @staticmethod
    def from_decomposed_plan(plan: dict) -> Workflow:
        """从 CeshuSkill.decompose 的输出构建 Workflow"""
        wf = Workflow(
            id=plan.get("id", f"wf_{int(time.time())}"),
            name=plan.get("name", "自动工作流"),
            goal=plan.get("goal", ""),
        )
        steps = plan.get("steps", [])
        for i, step in enumerate(steps):
            node_id = f"step_{i+1}"
            depends = [f"step_{i}"] if i > 0 else []
            wf.add_node(WorkflowNode(
                id=node_id,
                name=step.get("desc", f"步骤{i+1}"),
                description=step.get("desc", ""),
                tool=step.get("tool_hint", ""),
                params=step.get("params", {}),
                depends_on=depends,
            ))
        return wf

    @staticmethod
    def from_json_file(filepath: str) -> Workflow:
        with open(filepath, encoding="utf-8") as f:
            import json as _json
            data = _json.load(f)
        return WorkflowEngine.from_json(data)

    @staticmethod
    def from_json(data: dict) -> Workflow:
        wf = Workflow(
            id=data.get("id", f"wf_{int(time.time())}"),
            name=data.get("name", "JSON工作流"),
            goal=data.get("goal", data.get("description", "")),
        )
        steps = data.get("steps", [])
        for step in steps:
            node_id = step.get("id", f"step_{step.get('index', len(wf.nodes) + 1)}")
            depends = step.get("depends_on", [])
            wf.add_node(WorkflowNode(
                id=node_id,
                name=step.get("name", node_id),
                description=step.get("description", step.get("desc", "")),
                tool=step.get("tool", step.get("tool_name", step.get("tool_hint", ""))),
                params=step.get("params", step.get("args", {})),
                depends_on=depends,
                condition=step.get("condition"),
                max_retries=step.get("max_retries", 1),
                timeout=step.get("timeout", 60.0),
            ))
        return wf

    @staticmethod
    def workflow_template_example() -> str:
        return '''{
  "id": "my_workflow_001",
  "name": "一键生成游戏策划",
  "description": "自动生成完整的游戏策划文档",
  "steps": [
    {
      "id": "step_1",
      "name": "搜索市场数据",
      "tool": "system.web_search",
      "params": {"query": "2024 手游市场趋势 射击游戏"},
      "depends_on": []
    },
    {
      "id": "step_2",
      "name": "生成策划方案",
      "tool": "system.ceshu",
      "params": {"action": "run", "requirement": "射击手游策划"},
      "depends_on": ["step_1"]
    },
    {
      "id": "step_3",
      "name": "生成封面图",
      "tool": "tool.image",
      "params": {"prompt": "赛博朋克风格射击游戏海报"},
      "depends_on": ["step_2"],
      "condition": "success"
    },
    {
      "id": "step_4",
      "name": "保存文件",
      "tool": "system.file_ops",
      "params": {"action": "write", "path": "exports/plan.md"},
      "depends_on": ["step_2", "step_3"]
    }
  ]
}'''
