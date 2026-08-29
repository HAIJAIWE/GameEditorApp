from __future__ import annotations

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill

logger = get_logger()
from core.agent.skills.common import normalize_params


class CodeSkill(BaseSkill):
    name = "system.code"
    description = "代码生成、调试、解释与修复"
    version = "1.0.0"
    parameters = []

    PARAMS_SCHEMA = {
        "type": "object",
        "properties": {
            "mode": {
                "type": "string",
                "enum": ["generate", "debug", "explain", "fix", "run"],
                "description": "模式: generate(生成代码)/debug(调试错误)/explain(解释代码)/fix(修复代码)/run(运行代码)"
            },
            "language": {
                "type": "string",
                "description": "编程语言: python/javascript/typescript/java/go/rust/cpp/c/lua/bash/html/css/sql/等"
            },
            "framework": {
                "type": "string",
                "description": "框架: react/vue/flask/django/fastapi/express/unity/等"
            },
            "code": {
                "type": "string",
                "description": "代码内容(generate模式为需求描述，debug/explain/fix模式为待处理代码)"
            },
            "description": {
                "type": "string",
                "description": "需求描述(generate模式，简明描述要生成的功能)"
            },
            "error": {
                "type": "string",
                "description": "错误信息(debug/fix模式)"
            }
        },
        "required": ["mode"]
    }

    _KNOWN_LANGUAGES = [
        "python", "javascript", "typescript", "java", "c", "cpp", "c++", "csharp", "c#",
        "go", "golang", "rust", "ruby", "php", "swift", "kotlin", "lua", "bash", "shell",
        "sql", "html", "css", "yaml", "json", "xml", "markdown",
    ]

    _KNOWN_FRAMEWORKS = [
        "react", "vue", "angular", "svelte", "next.js", "nuxt",
        "django", "flask", "fastapi", "express", "spring", "gin",
        "unity", "unreal", "pygame", "godot",
    ]

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        self._logger = get_logger()

        mode = params.get("mode", "generate")
        try:
            if mode == "generate":
                return self._generate_code(params, context)
            elif mode == "debug":
                return self._debug_code(params, context)
            elif mode == "explain":
                return self._explain_code(params, context)
            elif mode == "fix":
                return self._fix_code(params, context)
            elif mode == "run":
                return self._run_code(params)
            else:
                return self._generate_code(params, context)
        except Exception as e:
            self._logger.error(f"CodeSkill execute failed: {e}")
            return {"success": False, "error": str(e), "message": ""}

    def _run_code(self, params: dict) -> dict:
        """执行 Python 代码 — 委托给安全沙箱（不再裸 subprocess）"""
        code = params.get("code", "")
        if not code:
            return {"success": False, "error": "缺少要执行的代码", "message": ""}
        try:
            from security.sandbox import get_sandbox
            sandbox = get_sandbox()
            timeout = int(params.get("timeout", 15))
            result = sandbox.execute(code, language="python", timeout=timeout)
            return {
                "success": result.get("success", False),
                "message": result.get("stdout", "")[:4000] or result.get("stderr", "")[:2000] or "(无输出)",
                "data": {
                    "stdout": result.get("stdout", "")[:4000],
                    "stderr": result.get("stderr", "")[:2000],
                    "returncode": result.get("returncode", 0),
                    "sandbox": True,
                }
            }
        except ImportError:
            return {"success": False,
                    "error": "安全沙箱不可用，已拒绝执行（避免 RCE）",
                    "message": ""}
        except Exception as e:
            return {"success": False, "error": str(e), "message": ""}

    def _generate_code(self, params: dict, context: dict) -> dict:
        prompt_text = params.get("prompt", params.get("keyword", params.get("raw_query", "")))
        if not prompt_text:
            prompt_text = context.get("raw_input", "")

        language = params.get("language", self._detect_language(prompt_text))
        framework = params.get("framework", "")
        constraints = params.get("constraints", [])

        system_prompt = self._build_generate_system_prompt(language, framework, constraints)

        success, result = self._call_ai(prompt_text, system_prompt)
        if not success:
            return {"success": False, "error": result, "message": ""}

        code = self._strip_code_fences(result)

        output_path = params.get("output", params.get("path", ""))
        file_saved = False
        if output_path:
            try:
                import os
                os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
                with open(output_path, "w", encoding="utf-8") as f:
                    f.write(code)
                file_saved = True
            except Exception as e:
                self._logger.warning(f"保存代码失败: {e}")

        return {
            "success": True,
            "message": "",
            "data": {
                "code": code,
                "language": language,
                "framework": framework,
                "prompt": prompt_text,
                "output": output_path if output_path else None,
                "file_saved": file_saved,
            },
        }

    def _debug_code(self, params: dict, context: dict) -> dict:
        source_code = params.get("code", params.get("source", ""))
        error_info = params.get("error", params.get("error_info", ""))
        language = params.get("language", "")

        if not source_code:
            return {"success": False, "error": "调试模式需要提供源代码 (code 字段)", "message": ""}

        system_prompt = (
            "你是一位资深调试专家。分析以下代码中的问题，给出诊断报告。\n"
            "输出格式（严格 JSON）：\n"
            "{\n"
            '  "issues": [{"line": 行号或范围, "severity": "error|warning|info", "description": "问题描述"}],\n'
            '  "root_cause": "根因分析",\n'
            '  "suggestions": ["修复建议1", "修复建议2"]\n'
            "}\n"
            "只输出 JSON。"
        )

        user_prompt = f"调试以下代码：\n```{language or ''}\n{source_code}\n```"
        if error_info:
            user_prompt += f"\n\n报错信息：\n{error_info}"

        success, result = self._call_ai(user_prompt, system_prompt)
        if not success:
            return {"success": False, "error": result, "message": ""}

        try:
            import json
            parsed = json.loads(self._extract_json(result))
            return {
                "success": True,
                "message": "",
                "data": {
                    "analysis": parsed,
                    "source_code": source_code,
                    "language": language,
                },
            }
        except Exception:
            return {
                "success": True,
                "message": "",
                "data": {"analysis_raw": result, "source_code": source_code, "language": language},
            }

    def _explain_code(self, params: dict, context: dict) -> dict:
        source_code = params.get("code", params.get("source", params.get("prompt", "")))
        language = params.get("language", "")

        if not source_code:
            return {"success": False, "error": "解释模式需要提供源代码 (code 字段)", "message": ""}

        system_prompt = (
            "你是一位编程导师。请对以下代码进行通俗易懂的解释。\n"
            "输出包含：\n"
            "1. 代码整体功能概述（一句话）\n"
            "2. 逐段/逐函数解释逻辑\n"
            "3. 关键技术和模式说明\n"
            "4. 时间复杂度分析（如适用）\n"
            "5. 潜在改进建议\n"
            "使用中文回答，表达清晰。"
        )

        user_prompt = f"请解释以下代码：\n```{language or ''}\n{source_code}\n```"

        success, result = self._call_ai(user_prompt, system_prompt)
        if not success:
            return {"success": False, "error": result, "message": ""}

        return {
            "success": True,
            "message": "",
            "data": {
                "explanation": result,
                "source_code": source_code,
                "language": language,
            },
        }

    def _fix_code(self, params: dict, context: dict) -> dict:
        source_code = params.get("code", params.get("source", ""))
        error_info = params.get("error", params.get("error_info", ""))
        language = params.get("language", "")

        if not source_code:
            return {"success": False, "error": "修复模式需要提供源代码 (code 字段)", "message": ""}

        system_prompt = (
            "你是一位代码修复专家。根据错误信息修复代码中的问题。\n"
            "只输出修复后的完整代码，不要解释，不要 markdown 代码块标记。"
        )

        user_prompt = f"修复以下{language + ' ' if language else ''}代码：\n```\n{source_code}\n```"
        if error_info:
            user_prompt += f"\n\n错误信息：\n{error_info}"

        success, fixed_code = self._call_ai(user_prompt, system_prompt)
        if not success:
            return {"success": False, "error": fixed_code, "message": ""}

        fixed_code = self._strip_code_fences(fixed_code)

        return {
            "success": True,
            "message": "",
            "data": {
                "fixed_code": fixed_code,
                "original_code": source_code,
                "language": language,
            },
        }

    def _call_ai(self, user_prompt: str, system_prompt: str, retries: int = 1):
        for attempt in range(retries + 1):
            try:
                from common.ai_client import generate_text
                from config.settings import get_config

                config = get_config()

                if not config.enabled or not config.api_key:
                    return False, "AI 服务未启用或未配置 API Key"

                return generate_text(config, user_prompt, system_prompt)
            except Exception as e:
                self._logger.error(f"CodeSkill AI call failed (attempt {attempt + 1}/{retries + 1}): {e}")
                if attempt < retries:
                    continue
                return False, str(e)
        return False, "AI 调用失败"

    def _detect_language(self, text: str) -> str:
        text_lower = text.lower()
        for lang in self._KNOWN_LANGUAGES:
            if lang in text_lower:
                if lang == "c++":
                    return "cpp"
                if lang == "c#":
                    return "csharp"
                if lang == "golang":
                    return "go"
                return lang
        return ""

    def _build_generate_system_prompt(self, language: str, framework: str, constraints: list) -> str:
        parts = ["你是一位资深软件工程师。根据需求生成高质量代码。"]
        parts.append("要求：")
        parts.append("- 代码完整可运行，包含必要的导入语句")
        parts.append("- 添加关键注释说明核心逻辑")
        parts.append("- 遵循最佳实践和设计模式")

        if language:
            parts.append(f"- 使用 {language} 语言编写")
        if framework:
            parts.append(f"- 使用 {framework} 框架")
        if constraints:
            parts.append("- 额外约束：")
            for c in constraints:
                parts.append(f"  * {c}")

        parts.append("\n只输出代码，不要解释，不要 markdown 代码块标记。")
        return "\n".join(parts)

    @staticmethod
    def _strip_code_fences(text: str) -> str:
        import re
        text = text.strip()
        text = re.sub(r'^```[\w]*\s*\n', '', text)
        text = re.sub(r'\n```\s*$', '', text)
        return text.strip()

    @staticmethod
    def _extract_json(text: str) -> str:
        try:
            import json
            import re
            text = re.sub(r'```(?:json)?\s*', '', text).strip()
            if text.startswith("{") and text.endswith("}"):
                try:
                    json.loads(text)
                    return text
                except json.JSONDecodeError as e:
                    logger.debug(f"操作失败: {e}")
            start = text.find("{")
            if start == -1:
                return text
            depth = 0
            for i, ch in enumerate(text[start:], start=start):
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        return text[start:i + 1]
            m = re.search(r'\{[^{}]*\}', text)
            return m.group() if m else text
        except Exception:
            return text
