"""Agent OS §11 — 安全护栏：危险操作检测 + 上下文裁剪 + 重规划

SafetyGuard 负责在 Agent 执行循环中拦截危险工具调用，避免误操作。
危险等级:
  - Skill-level: 工具本身可修改系统/文件/网络（system.shell 等）
  - Data-level:  工具可删除/回滚游戏数据（delete_current_item 等）
  - Param-level: 工具 + 特定 action 组合危险（tool.file + delete）
"""
from __future__ import annotations

from common.logger import get_logger

logger = get_logger()


class SafetyGuard:
    # Skill-level 危险工具: 可修改系统/文件/网络
    SKILL_DANGEROUS_TOOLS = {
        "system.shell", "system.code", "system.browser", "system.scheduler",
    }
    SKILL_DANGEROUS_PARAM_ACTIONS = {
        "system.file_ops": ["delete", "rmtree", "rmdir", "remove"],
        "tool.file": ["delete", "rmtree", "rmdir", "remove"],
        "system.shell": ["exec", "eval", "os.system"],
        "system.git": ["push", "force_push", "reset_hard"],
    }
    # Data-level 危险工具: 可删除/回滚游戏数据
    DATA_DANGEROUS_TOOLS = {
        "delete_current_item", "rollback_data", "undo", "sync_schema_from_plan",
    }
    DATA_DANGEROUS_PARAM_ACTIONS = {
        "batch": ("delete", "clear", "remove", "overwrite"),
        "planning": ("delete",),
        "maintain": ("delete", "clear", "reset"),
        "template": ("delete", "overwrite"),
    }

    def __init__(self, max_tokens: int = 12000, keep_system_first: int = 2):
        self._logger = get_logger()
        self._MAX_TOKENS = max_tokens
        self._KEEP_SYSTEM_FIRST = keep_system_first

    def check_dangerous(self, tn: str, tp: dict, context: dict, messages: list,
                        all_results: dict, iteration: int) -> bool:
        """检测工具调用是否危险

        Args:
            tn: 工具名称
            tp: 工具参数
            context: 会话上下文（含 _danger_confirmed 确认状态）
            messages: 消息列表（危险时追加确认提示）
            all_results: 各轮次结果字典
            iteration: 当前迭代轮次

        Returns:
            True 表示需要用户确认（已拦截），False 表示放行
        """
        is_dangerous = (
            tn in self.SKILL_DANGEROUS_TOOLS or
            tn in self.DATA_DANGEROUS_TOOLS
        )
        if not is_dangerous:
            if tn in self.SKILL_DANGEROUS_PARAM_ACTIONS:
                action = tp.get("action", "")
                is_dangerous = any(d in action for d in self.SKILL_DANGEROUS_PARAM_ACTIONS[tn])
            if not is_dangerous and tn in self.DATA_DANGEROUS_PARAM_ACTIONS:
                action = tp.get("action", "")
                is_dangerous = any(d in action for d in self.DATA_DANGEROUS_PARAM_ACTIONS[tn])

        if not is_dangerous:
            return False

        # 已确认同一工具 → 放行并清除确认状态
        confirmed = context.get("_danger_confirmed")
        if confirmed and confirmed[0] == tn:
            context["_danger_confirmed"] = None
            return False

        danger_desc = f"{tn}" + (f"({tp.get('action','?')})" if tp.get("action") else "")
        msg = (
            f"\u26a0\ufe0f 确认操作: 即将执行危险操作[{danger_desc}]\n"
            f"下一个回复中请明确说 确认执行 来继续，或 取消 来放弃。\n"
            f"请回复确认或取消。"
        )
        context["_danger_confirmed"] = (tn, tp)
        all_results[iteration] = msg
        messages.append({"role": "user", "content": msg})
        return True

    def replan_step(self, tool_name: str, tool_params: dict, error: str,
                    messages: list, context: dict) -> str:
        """工具失败后生成重规划提示

        Returns:
            包含失败信息、替代方案和原始目标的字符串
        """
        alternatives = self._get_tool_alternatives(tool_name)
        current_messages = context.get("messages", [])
        goal_hint = ""
        for msg in reversed(current_messages):
            if msg.get("role") == "user":
                goal_hint = msg.get("content", "")[:200]
                break

        lines = ["## 自动重规划", f"- 失败工具: {tool_name}", f"- 错误: {error[:100]}"]
        if alternatives:
            lines.append(f"- 替代方案: {' / '.join(alternatives[:3])}")
        if goal_hint:
            lines.append(f"- 原始目标: {goal_hint[:80]}...")
        lines.append("- 建议: 先 query 验证数据是否存在，再尝试操作")
        return "\n".join(lines)

    def trim_messages(self, messages: list):
        """裁剪消息列表以控制 token 总量

        策略: 先压缩非 system 消息长内容 → 再压缩 system 消息 → 最后丢弃旧 user 消息
        """
        total = sum(self._estimate_tokens(m.get("content", "")) for m in messages)
        if total <= self._MAX_TOKENS:
            return

        system_msgs = messages[:self._KEEP_SYSTEM_FIRST]
        extra_system = messages[self._KEEP_SYSTEM_FIRST:]
        non_system = [m for m in extra_system if m["role"] != "system"]

        def _trim_non_system():
            for m in non_system:
                content = m.get("content", "")
                if len(content) > 500:
                    m["content"] = content[:200] + "...[已压缩]"

        def _trim_system():
            for m in extra_system:
                content = m.get("content", "")
                if len(content) > 200:
                    m["content"] = content[:100] + "...[已压缩]"

        def _drop_old_user():
            keep_last = [non_system[-1]] if non_system else []
            drop_count = 0
            for i in range(len(messages) - 1, 0, -1):
                msg = messages[i]
                if msg.get("role") == "user" and msg not in keep_last:
                    messages.pop(i)
                    drop_count += 1
                    if drop_count >= 3:
                        break

        _trim_non_system()

        need_more = sum(self._estimate_tokens(m.get("content", "")) for m in messages)
        if need_more > self._MAX_TOKENS:
            _trim_system()

        final_tokens = sum(self._estimate_tokens(m.get("content", "")) for m in messages)
        if final_tokens > self._MAX_TOKENS * 1.2:
            _drop_old_user()

        self._logger.info(
            f"[SafetyGuard] Token 裁剪: {total} → ~{sum(self._estimate_tokens(m.get('content', '')) for m in messages)}"
        )

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        """估算文本 token 数（优先用 tiktoken，回退到字符数启发式）"""
        try:
            import tiktoken
            enc = tiktoken.get_encoding("cl100k_base")
            return len(enc.encode(text))
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        cn = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
        en = len(text) - cn
        return cn // 2 + en // 4 + 1

    @staticmethod
    def _get_tool_alternatives(tool_name: str) -> list:
        """获取工具的替代方案列表"""
        alt_map = {
            "system.game_data": ["system.file_ops (手动编辑)", "system.code (脚本创建)"],
            "system.ceshu": ["system.file_ops (手动写文档)", "tool.export_doc (导出为文档)"],
            "system.web_fetch": ["system.web_search (搜索替代信息)", "system.browser (浏览器查看)"],
            "tool.image": ["system.web_search (搜索参考图)"],
            "system.file_ops": ["system.shell (命令行操作)", "system.code (程序化处理)"],
            "system.shell": ["system.code (Python脚本)", "system.file_ops (文件操作替代)"],
            "system.schema_edit": ["system.file_ops (手动编辑Schema)", "system.code (生成Schema)"],
        }
        return alt_map.get(tool_name, ["system.file_ops (查看数据)", "system.web_fetch (搜索相关文档)"])
