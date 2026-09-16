"""会话生命周期、配置重载与统计 —— AgentBrain 的 BrainSessionMixin 部分

自 brain.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

import json
from pathlib import Path
import time
from typing import Any, Optional, cast

from common.logger import get_logger
from core.agent.brain_state import BrainState
from core.agent.learner import Learner
from core.agent.memory import Memory

logger = get_logger()


class BrainSessionMixin(BrainState):
    """会话生命周期、配置重载与统计"""

    def reload_workspace(self):
        """切换工作区后完整重载 Memory / Session / Perf"""
        memory_dir = str(self._workspace.memory_dir)
        self.memory = Memory(data_dir=memory_dir)
        self.learner = Learner(self.memory)
        self._session_conv_count = 0
        self._session_tool_calls = 0
        self._failure_count = 0

        self._session_dir = Path(memory_dir)
        self._session_dir.mkdir(parents=True, exist_ok=True)
        self._session_file = self._session_dir / "active_session.json"
        self._restored_context = None
        self._session_meta = {}
        self._try_restore_session()

        from core.agent.perf_dashboard import PerfDashboard
        self._perf = PerfDashboard(data_dir=str(self._session_dir / "perf"))

        self._logger.info(f"AgentBrain workspace reloaded [workspace={self._workspace.current}]")
    def configure(self, max_tokens: int = None, max_iterations: int = None,
                  temperature: float = None, model: str = None):
        if max_tokens is not None and max_tokens > 0:
            self._max_tokens = max_tokens
            self._logger.info(f"[Config] max_tokens={self._max_tokens}")
        if max_iterations is not None and max_iterations > 0:
            self._max_iterations = max_iterations
            self._logger.info(f"[Config] max_iterations={self._max_iterations}")
        if temperature is not None and self._config:
            self._config.temperature = temperature
            self._logger.info(f"[Config] temperature={temperature}")
        if model is not None and self._config:
            self._config.model = model
            self._logger.info(f"[Config] model={model}")
    def reload_config(self):
        """Agent OS §12: 配置热更新 — 不重启即生效 identity / tools / agents"""
        self._logger.info("[HotReload] 开始配置热更新...")

        # 1. 重载 AI 配置
        try:
            from core.agent.workspace import get_workspace
            ws = cast(Any, get_workspace())
            api_cfg = ws.load_settings("api_config")
            if api_cfg and self._config:
                if api_cfg.get("model"):
                    self._config.model = api_cfg["model"]
                if api_cfg.get("temperature"):
                    self._config.temperature = float(api_cfg["temperature"])
                if api_cfg.get("max_tokens"):
                    self._max_tokens = int(api_cfg["max_tokens"])
                self._logger.info("[HotReload] AI配置已更新")
        except Exception as e:
            self._logger.warning(f"[HotReload] AI配置重载失败: {e}")

        # 2. 重载 Agent 定义
        if self._agent_manager:
            try:
                ws = get_workspace() if 'ws' not in dir() else ws
                ws_reload = cast(Any, get_workspace())
                agents_cfg = ws_reload.load_settings("agents")
                if agents_cfg:
                    self._logger.info("[HotReload] Agent定义从配置加载（暂简化）")
            except Exception as e:
                self._logger.warning(f"[HotReload] Agent重载失败: {e}")

        # 3. 重载身份/人格
        try:
            ws2 = cast(Any, get_workspace())
            identity = ws2.load_identity()
            ws2.load_persona()
            self._logger.info(f"[HotReload] 身份/人格已更新 ({identity.get('name','?')})")
        except Exception as e:
            self._logger.warning(f"[HotReload] 身份重载失败: {e}")

        # 4. 刷新技能注册
        try:
            count = self.dispatcher.discover_skills("core.agent.skills")
            self._logger.info(f"[HotReload] 技能已刷新 ({count}个)")
        except Exception as e:
            self._logger.warning(f"[HotReload] 技能重载失败: {e}")

        self._logger.info("[HotReload] 配置热更新完成")
    def health_check(self) -> dict:
        """Agent OS §12: 健康检查 — 返回系统运行时状态"""
        mem_stats = self.memory.get_memory_stats()
        return {
            "status": "running",
            "session_conv_count": self._session_conv_count,
            "failure_count": self._failure_count,
            "ai_available": self._ai_available(),
            "tools_count": len(self.dispatcher._skills) if hasattr(self.dispatcher, '_skills') else 0,
            "agents_loaded": bool(self._agent_manager),
            "memory": mem_stats,
            "config": {
                "model": self._config.model if self._config else "N/A",
                "max_tokens": self._max_tokens,
                "max_iterations": self._max_iterations,
            },
        }
    def _call_ai(self, config, prompt="", system_prompt=None, messages_list=None):
        from common.rate_limiter import RateLimiter
        if not RateLimiter().acquire("llm", timeout=15.0):
            self._logger.warning("[Agent] LLM 调用被限流，降级到关键词引擎")
            return False, "限流: 请求过于频繁，请稍后再试"
        from common.ai_client import generate_text
        return generate_text(config, prompt, system_prompt, messages_list)
    def boot(self):
        count = self.dispatcher.discover_skills("core.agent.skills")
        self.dispatcher.register_mcp_tools()
        self.dispatcher.set_subagent_handler(self._spawn_subagent)
        self._logger.info(f"AgentBrain booted with {count} skills")
    def set_agent_manager(self, agent_manager):
        self._agent_manager = agent_manager
    def end_session(self):
        """结束当前会话，提炼记忆并学习偏好"""
        self.memory.capture_context()
        self.memory.consolidate()
        self.memory.learn_preferences()
        self.memory.auto_archive()
        # Agent OS: 反思循环 — 分析失败并写经验
        if self._failure_count > 0:
            self._reflect_on_failures()
        # Agent OS: 持久化长期记忆到 MEMORY.md
        try:
            project_ctx = self._extract_project_context()
            self.memory.save_project_memory(project_ctx)
        except Exception as e:
            self._logger.warning(f"保存项目记忆失败: {e}")
        self.memory.clear_session()
        self._session_conv_count = 0
        self._session_tool_calls = 0
        self._logger.info("Session 结束，记忆已提炼")
    def _try_restore_session(self):
        if not self._session_file.exists():
            return
        try:
            data = json.loads(self._session_file.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                return
            self._restored_context = data.get("messages", [])
            self._session_meta = data.get("meta", {})
            if self._restored_context:
                self._logger.info(
                    f"[Session] 恢复会话: {len(self._restored_context)}条消息, "
                    f"时间={self._session_meta.get('saved_at', '未知')}"
                )
            else:
                self._restored_context = None
        except Exception as e:
            self._logger.warning(f"[Session] 会话恢复失败: {e}")
            self._restored_context = None
    def _save_session(self, messages: list):
        try:
            # 修复 P3-32: 超长 content 截断而非丢弃，避免会话恢复时丢失上下文角色
            def _truncate(m: dict) -> dict:
                out = {}
                for k, v in m.items():
                    if k == "content" and isinstance(v, str) and len(v) > 2000:
                        out[k] = v[:2000] + f"\n[...截断 {len(v) - 2000} 字符...]"
                    else:
                        out[k] = v
                return out

            data = {
                "meta": {
                    "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "timestamp": time.time(),
                    "message_count": len(messages),
                },
                "messages": [_truncate(m) for m in messages[-50:]],
            }
            self._session_file.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except Exception as e:
            self._logger.warning(f"[Session] 会话保存失败: {e}")
    def has_pending_session(self) -> bool:
        return bool(self._restored_context)
    def get_pending_session_info(self) -> dict:
        return {
            "has_session": self.has_pending_session(),
            "message_count": len(self._restored_context) if self._restored_context else 0,
            "saved_at": self._session_meta.get("saved_at", ""),
        }
    def load_pending_session(self) -> Optional[list]:
        context = self._restored_context
        self._restored_context = None
        self._session_meta = {}
        return context
    def clear_session(self):
        self._restored_context = None
        self._session_meta = {}
        try:
            if self._session_file.exists():
                self._session_file.unlink()
        except OSError as e:
            self._logger.warning(f"[Session] 会话文件清理失败: {e}")
    def _record_deploy_metric(self, metric_type: str, data: dict):
        """Agent OS §12: 部署监控 — 写入 metrics.jsonl"""
        try:
            mp = self._session_dir / "metrics.jsonl"
            entry = {"type": metric_type, "timestamp": time.time(), **data}
            with open(mp, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except OSError as e:
            self._logger.debug(f"[Metrics] 写入失败: {e}")
    def get_uptime(self) -> float:
        """Agent OS §12: 返回会话运行秒数"""
        return time.time() - self._session_start
    def get_session_stats(self) -> dict:
        """Agent OS §12: 会话统计 — 返回当前会话指标"""
        uptime = self.get_uptime()
        self._session_conv_count + self._failure_count
        return {
            "conversations": self._session_conv_count,
            "failures": self._failure_count,
            "successes": self._success_count,
            "success_rate": (
                f"{max(0, self._session_conv_count - self._failure_count)}/{self._session_conv_count}"
                if self._session_conv_count > 0 else "N/A"
            ),
            "has_restored_session": bool(self._restored_context),
            "uptime_seconds": int(uptime),
            "uptime": f"{int(uptime // 60)}m{int(uptime % 60)}s",
            "undo_stack_size": len(self._undo_stack),
        }
