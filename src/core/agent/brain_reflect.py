"""失败反思与轮次评估 —— AgentBrain 的 BrainReflectionMixin 部分

自 brain.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

import time
from typing import Any

from common.logger import get_logger
from core.agent.brain_state import BrainState

logger = get_logger()


class BrainReflectionMixin(BrainState):
    """失败反思与轮次评估"""

    def _reflect_on_failures(self):
        """Agent OS §8 反思循环：失败模式归类 + 经验自动匹配 + 固化"""
        recent = self.learner.get_recent_failures(10)
        if not recent:
            return

        # Agent OS: 失败模式归类
        patterns = self._categorize_failure_patterns(recent)
        for pattern, failures in patterns.items():
            if len(failures) >= 2:
                self._logger.info(f"[Reflect] 发现失败模式 [{pattern}]: {len(failures)}次")
                suggestion = self._get_pattern_suggestion(pattern, failures)
                self.memory.save_learning("failure_pattern",
                    f"[{pattern}] {len(failures)}次: {suggestion}")
        summary = "\n".join(f"- {r['tool']}: {r['error'][:80]}" for r in recent)
        note = f"Session 反思 ({time.strftime('%Y-%m-%d %H:%M')}):\n{self._failure_count}次工具调用失败\n{summary}"
        self.memory.save_learning("reflect", note)
        self._logger.info(f"[Reflection] 已记录 {len(recent)} 条失败经验, {len(patterns)} 个模式")

        # Agent OS 评估层：LLM-Judge 自动评分
        self._evaluate_last_turn(self._last_user_input, self._last_response)
    @staticmethod
    def _categorize_failure_patterns(failures: list) -> dict:
        """Agent OS §8: 失败模式归类"""
        patterns: dict[str, Any] = {}
        for f in failures:
            err = str(f.get("error", "")).lower()
            tool = f.get("tool", "unknown")
            if "not found" in err or "不存在" in err or "找不到" in err:
                key = "数据不存在"
            elif "permission" in err or "权限" in err or "denied" in err:
                key = "权限不足"
            elif "timeout" in err or "超时" in err:
                key = "超时"
            elif "json" in err or "parse" in err or "格式" in err or "schema" in err:
                key = "格式/解析错误"
            elif "param" in err or "参数" in err or "invalid" in err:
                key = "参数错误"
            elif "connection" in err or "连接" in err or "network" in err:
                key = "网络/连接"
            else:
                key = f"其他.{tool}"
            if key not in patterns:
                patterns[key] = []
            patterns[key].append(f)
        return dict(sorted(patterns.items(), key=lambda x: -len(x[1])))
    @staticmethod
    def _get_pattern_suggestion(pattern: str, failures: list) -> str:
        """Agent OS §8: 根据失败模式给出经验建议"""
        suggestions = {
            "数据不存在": "先 query 确认数据存在再操作，检查名称拼写",
            "权限不足": "检查工具白名单和 ACL 配置",
            "超时": "减少批量操作规模，或增加超时时间",
            "格式/解析错误": "检查参数 JSON 格式，确保符合工具 schema",
            "参数错误": "参考工具 input_schema 检查参数类型和必填项",
            "网络/连接": "检查网络状态和 API 端点可用性",
        }
        tools = list(set(f.get("tool", "") for f in failures))
        base = suggestions.get(pattern, f"检查工具 {', '.join(tools[:3])} 的参数配置")
        return f"{base} (涉及: {', '.join(tools[:3])})"
    def _evaluate_last_turn(self, last_user_input: str = "", last_response: str = ""):
        """Agent OS 评估层：LLM-Judge 自动评分"""
        if not last_user_input and not last_response:
            return
        try:
            from testing.auto_evaluator import auto_reflect_if_low
        except ImportError:
            try:
                from pathlib import Path
                import sys
                src = Path(__file__).resolve().parent.parent.parent
                if str(src) not in sys.path:
                    sys.path.insert(0, str(src))
                from testing.auto_evaluator import auto_reflect_if_low
            except ImportError:
                self._logger.debug("评估模块不可用，跳过")
                return
        try:
            auto_reflect_if_low(
                last_user_input[:200],
                last_response[:500],
                self._config,
                self.memory
            )
            self._logger.debug("[Evaluate] LLM-Judge 评分完成")
        except Exception as e:
            self._logger.debug(f"评估跳过: {e}")
    def _ai_available(self) -> bool:
        return bool(self._config and getattr(self._config, 'enabled', False)
                    and getattr(self._config, 'api_key', ''))
