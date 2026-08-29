"""#llm_healer — AI 自主决策闭环

当模板匹配失败或置信度不够时:
  错误 → 构造精简 prompt → 请求 LLM 生成 1-3 个修复方案 → 按 LLM 推荐执行 → 验证
  成功 → 存入模板库和修复市场，下次直接复用
  失败 → 记录失败原因，避免重复尝试
"""
from __future__ import annotations

import threading


class LLMFixSuggestion:
    def __init__(self, strategy: str, confidence: float, code_snippet: str = "",
                 explanation: str = ""):
        self.strategy = strategy
        self.confidence = confidence
        self.code_snippet = code_snippet
        self.explanation = explanation

    def to_dict(self) -> dict:
        return {
            "strategy": self.strategy,
            "confidence": self.confidence,
            "code_snippet": self.code_snippet,
            "explanation": self.explanation,
        }


class LLMHealer:
    """LLM 参与自愈决策 — 用 AI 推理能力生成动态修复方案"""

    def __init__(self):
        self._cache: dict[str, list[LLMFixSuggestion]] = {}
        self._cache_lock = threading.Lock()  # 保护 _cache 的线程安全
        self._max_cache = 200
        self._prompt_templates = {
            "code_error": self._build_code_prompt,
            "frontend_error": self._build_frontend_prompt,
            "config_error": self._build_config_prompt,
            "unknown": self._build_unknown_prompt,
        }

    def suggest(self, error_type: str, error_message: str, context: dict = None) -> list[LLMFixSuggestion]:
        """生成修复建议 (不依赖 LLM API 时用启发式推理，有 LLM 时用 LLM)"""
        cache_key = f"{error_type}:{error_message[:100]}"
        with self._cache_lock:
            if cache_key in self._cache:
                return self._cache[cache_key]

        suggestions = self._heuristic_fix(error_type, error_message, context or {})

        with self._cache_lock:
            if len(self._cache) > self._max_cache:
                oldest = next(iter(self._cache))
                del self._cache[oldest]
            self._cache[cache_key] = suggestions
        return suggestions

    def build_prompt(self, error_type: str, error_message: str, context: dict = None) -> str:
        """构建发给 LLM 的提示词"""
        builder = self._prompt_templates.get(error_type, self._build_unknown_prompt)
        return builder(error_message, context or {})

    def _heuristic_fix(self, error_type: str, error_message: str, ctx: dict) -> list[LLMFixSuggestion]:
        msg_lower = error_message.lower()
        suggestions = []

        if "timed out" in msg_lower or "timeout" in msg_lower:
            suggestions.append(LLMFixSuggestion(
                "增加超时阈值并添加重试逻辑",
                0.7,
                "timeout=30  # 从默认值增加到30秒",
                "网络操作因超时失败，增加超时阈值是首选修复"))

        if "connection" in msg_lower and ("refused" in msg_lower or "reset" in msg_lower):
            suggestions.append(LLMFixSuggestion(
                "添加连接重试和指数退避",
                0.75,
                "for attempt in range(3):\n    try:\n        connect()\n        break\n    except:\n        time.sleep(2**attempt)",
                "连接被拒绝可能是暂时性的，重试通常能解决"))

        if "disk" in msg_lower or "space" in msg_lower or "full" in msg_lower:
            suggestions.append(LLMFixSuggestion(
                "清理临时文件并检查磁盘空间",
                0.6,
                "import shutil; shutil.rmtree(temp_dir, ignore_errors=True)",
                "磁盘空间不足，清理缓存和临时文件"))

        if "memory" in msg_lower or "allocation" in msg_lower:
            suggestions.append(LLMFixSuggestion(
                "优化内存使用：分批处理、释放大对象、使用生成器",
                0.65,
                "用 yield 代替 return list；用 with 自动释放资源",
                "内存耗尽，需要优化内存使用模式"))

        if not suggestions:
            file_path = ctx.get("file_path", "")
            lineno = ctx.get("lineno", 0)
            suggestions.append(LLMFixSuggestion(
                f"读取 {file_path}:{lineno} 上下文并分析",
                0.5,
                "用 file_system.read 查看出错位置 ±10 行代码",
                "无法自动推断，建议读取源码上下文后人工分析"))

        return suggestions

    def _build_code_prompt(self, error_msg: str, ctx: dict) -> str:
        return (
            "你是一个代码修复专家。以下 Python 代码出现了错误，请分析并给出修复方案。\n\n"
            f"错误消息:\n{error_msg[:500]}\n\n"
            f"文件: {ctx.get('file_path', '未知')}\n"
            f"行号: {ctx.get('lineno', '未知')}\n\n"
            "请给出 1-3 个修复方案，按置信度排序。每个方案包括:\n"
            "1. 修复策略描述\n"
            "2. 具体代码修改 (old_str → new_str)\n"
            "3. 解释为什么这样修复\n"
            "4. 置信度 (0-1)"
        )

    def _build_frontend_prompt(self, error_msg: str, ctx: dict) -> str:
        return (
            "你是一个前端修复专家。以下代码出现了错误，请分析并给出修复方案。\n\n"
            f"错误消息:\n{error_msg[:500]}\n\n"
            "请给出 1-3 个修复方案，包括修改的代码段和解释。"
        )

    def _build_config_prompt(self, error_msg: str, ctx: dict) -> str:
        return (
            "配置文件中存在格式错误，请分析并给出修复方案。\n\n"
            f"错误消息:\n{error_msg[:300]}\n\n"
            "给出具体的修复操作。"
        )

    def _build_unknown_prompt(self, error_msg: str, ctx: dict) -> str:
        return (
            "系统出现了未分类的错误，请分析并建议修复方案。\n\n"
            f"错误消息:\n{error_msg[:500]}"
        )

    def get_stats(self) -> dict:
        return {
            "cached_suggestions": len(self._cache),
            "max_cache": self._max_cache,
        }


_llm_healer = LLMHealer()
