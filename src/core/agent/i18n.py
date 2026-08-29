from __future__ import annotations

from common.logger import get_logger

logger = get_logger()



class AgentI18n:
    _instance = None
    _lang: str = "zh"
    _strings: dict[str, dict[str, str]] = {}
    _loaded = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @classmethod
    def set_language(cls, lang: str):
        cls._lang = lang
        cls._loaded = False

    @classmethod
    def get_language(cls) -> str:
        return cls._lang

    @classmethod
    def load_builtin(cls):
        cls._strings["zh"] = {
            "agent.identity": "你是游戏数据设计与开发助手。",
            "agent.identity.plan": "你是游戏策划分析助手。主要职责是分析和规划。",
            "agent.rule.parallel": "优先并行调用独立工具",
            "agent.rule.reflect": "工具失败后反思参数，不要重复相同错误",
            "agent.rule.query_first": "不确定数据时先查询再操作",
            "agent.rule.verify": "结果太短时主动补充查询验证",
            "agent.rule.workflow": "复杂多步骤任务可使用 system.workflow 创建工作流自动化执行",
            "agent.plan.hint": "使用 system.ceshu action=run 来生成完整的策划方案",
            "agent.plan.readonly": "只查不改，3轮内出方案",
            "agent.create.hint": "直接用 system.game_data action=create，不要先查询再创建",
            "agent.create.params": "一次性给全所有参数：data_type、name、以及需要的属性值",
            "agent.create.ref": "属性参考当前项目已有的字段结构",
            "agent.create.efficiency": "创建完直接展示结果，效率第一",
            "agent.fallback": "抱歉，暂时无法处理这个请求。",
            "agent.debate.planner": "你是方案规划师。你的职责是提出清晰、可执行的方案，考虑可行性、资源约束和风险。给出结构化建议，包含目标、步骤、预期结果。",
            "agent.debate.critic": "你是方案审核师。你的职责是发现方案中的问题和潜在风险。从不同视角审视方案的完整性和可行性。是否遗漏了重要细节？",
            "agent.debate.synthesizer": "你是方案整合师。你的职责是综合前面的讨论，整合不同观点，给出最终可落地的方案。明确执行步骤和验收标准。",
            "agent.subagent.prefix": "你是{role}。只输出JSON。",
            "agent.subagent.allowed_actions": "允许 action: {actions}。",
            "agent.subagent.max_rounds": "最多{rounds}轮。",
            "agent.subagent.tools": "=== 工具 ===\n{tools}",
            "agent.subagent.format": '输出: {"think":"...","tool":"...","params":{...}}\n完成: {"done":true,"answer":"汇总..."}',
            "agent.managed.subagent": "你是 {icon} {name}。\n{system_prompt}\n\n当前任务: {task}\n最多{rounds}轮工具调用。完成后直接给出最终答案。",
            "agent.project.context": "## 当前项目\n{ctx}\n- data_type 取值用上面的英文 type\n",
            "agent.manager.list": "## 可委派的专业智能体\n{agents}\n使用 subagent 工具委派，agent_id 用上面的 id。",
            "agent.manager.agent_line": "  - {id}: {icon} {name} — {desc}（{tools}个工具）",
            "agent.learning.prefix": "[系统] 根据学习到的数据:\n{data}",
            "agent.session.restored": "[系统] 以下为上次会话的历史记录，供你参考上下文：",
            "agent.images.hint": "[系统] 用户上传了 {count} 张图片，请根据图片内容进行分析处理。",
        }

        cls._strings["en"] = {
            "agent.identity": "You are a game data design and development assistant.",
            "agent.identity.plan": "You are a game planning analysis assistant. Your main role is analysis and planning.",
            "agent.rule.parallel": "Prioritize parallel independent tool calls",
            "agent.rule.reflect": "After tool failure, reflect on parameters, don't repeat same errors",
            "agent.rule.query_first": "Query before operating when uncertain",
            "agent.rule.verify": "Actively verify with additional queries when results are too short",
            "agent.rule.workflow": "For complex multi-step tasks, use system.workflow to create automated workflows",
            "agent.plan.hint": "Use system.ceshu action=run to generate complete planning documents",
            "agent.plan.readonly": "Read-only, produce plan within 3 rounds",
            "agent.create.hint": "Use system.game_data action=create directly, don't query first",
            "agent.create.params": "Provide all parameters at once: data_type, name, and required attributes",
            "agent.create.ref": "Refer to existing field structure in current project",
            "agent.create.efficiency": "Show results immediately after creation for maximum efficiency",
            "agent.fallback": "Sorry, unable to process this request at the moment.",
            "agent.debate.planner": "You are a solution planner. Propose clear, executable solutions considering feasibility, resource constraints and risks. Provide structured suggestions with goals, steps, and expected outcomes.",
            "agent.debate.critic": "You are a solution reviewer. Your role is to identify issues and potential risks in solutions. Examine completeness and feasibility from different perspectives. Are important details missing?",
            "agent.debate.synthesizer": "You are a solution integrator. Synthesize previous discussions, integrate different viewpoints, and provide a final actionable plan. Define execution steps and acceptance criteria.",
            "agent.subagent.prefix": 'You are {role}. Output JSON only.',
            "agent.subagent.allowed_actions": "Allowed actions: {actions}.",
            "agent.subagent.max_rounds": "Max {rounds} rounds.",
            "agent.subagent.tools": "=== Tools ===\n{tools}",
            "agent.subagent.format": 'Output: {"think":"...","tool":"...","params":{...}}\nDone: {"done":true,"answer":"Summary..."}',
            "agent.managed.subagent": "You are {icon} {name}.\n{system_prompt}\n\nCurrent task: {task}\nMax {rounds} tool call rounds. Provide final answer when complete.",
            "agent.project.context": "## Current Project\n{ctx}\n- Use the English type values above for data_type\n",
            "agent.manager.list": "## Delegateable Agents\n{agents}\nUse subagent tool to delegate, use the id above for agent_id.",
            "agent.manager.agent_line": "  - {id}: {icon} {name} — {desc} ({tools} tools)",
            "agent.learning.prefix": "[System] Based on learned data:\n{data}",
            "agent.session.restored": "[System] The following is history from the previous session for context reference:",
            "agent.images.hint": "[System] User uploaded {count} image(s). Please analyze the image content.",
        }

        cls._loaded = True

    @classmethod
    def get(cls, key: str, **kwargs) -> str:
        if not cls._loaded:
            cls.load_builtin()
        text = cls._strings.get(cls._lang, cls._strings.get("zh", {})).get(key, key)
        if kwargs:
            try:
                text = text.format(**kwargs)
            except (KeyError, ValueError) as e:
                logger.debug(f"操作失败: {e}")
        return text
