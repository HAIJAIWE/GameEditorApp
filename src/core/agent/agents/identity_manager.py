"""Agent OS §3 — IdentityManager: SOUL.md 加载器"""
from pathlib import Path
from typing import Any


def load_soul(agent_id: str, workspace_root: Path = None) -> dict:
    """从工作区加载 SOUL.md，返回结构化身份信息

    Returns: {identity, duties, boundaries, style, format}
    """
    if workspace_root is None:
        from core.agent.workspace import get_workspace
        workspace_root = get_workspace().root

    soul_file = workspace_root / "identity.md"
    if not soul_file.exists():
        return _default_soul(agent_id)

    content = soul_file.read_text(encoding="utf-8")
    return _parse_soul_md(content, agent_id)


def _parse_soul_md(content: str, agent_id: str) -> dict:
    """解析 SOUL.md 格式"""
    result: dict[str, Any] = {
        "identity": agent_id,
        "duties": "根据用户需求完成任务",
        "boundaries": [],
        "style": "直接高效",
        "output_format": "文本",
    }

    current_section = None
    for line in content.split("\n"):
        line = line.strip()
        if line.startswith("# 核心身份") or line.startswith("## 核心身份"):
            current_section = "identity"
        elif line.startswith("# 核心职责") or line.startswith("## 核心职责"):
            current_section = "duties"
        elif line.startswith("# 绝对边界") or line.startswith("## 绝对边界"):
            current_section = "boundaries"
        elif line.startswith("# 工作风格") or line.startswith("## 工作风格"):
            current_section = "style"
        elif line.startswith("# 输出格式") or line.startswith("## 输出格式"):
            current_section = "output_format"
        elif line.startswith("#"):
            current_section = None
        elif line and current_section:
            if current_section == "boundaries":
                result["boundaries"].append(line.lstrip("- "))
            elif current_section == "duties":
                result["duties"] = line
            elif current_section == "identity":
                result["identity"] = line
            elif current_section == "style":
                result["style"] = line
            elif current_section == "output_format":
                result["output_format"] = line

    return result


def _default_soul(agent_id: str) -> dict:
    """默认 SOUL"""
    defaults = {
        "data_operator": {
            "identity": "数据操作员",
            "duties": "游戏数据增删改查",
            "boundaries": ["只操作数据，不改结构"],
            "style": "调用工具直接返回结果",
            "output_format": "工具结果",
        },
        "schema_manager": {
            "identity": "结构管理员",
            "duties": "字段结构、批量操作、策划案建字段",
            "boundaries": ["不直接修改数据条目"],
            "style": "结构驱动",
            "output_format": "字段定义",
        },
        "planner": {
            "identity": "策划助手",
            "duties": "策划案撰写、文档导出、数值平衡",
            "boundaries": ["不直接修改数据", "不确定时先询问"],
            "style": "方案驱动",
            "output_format": "Markdown 方案",
        },
        "analyst": {
            "identity": "数值分析师",
            "duties": "数据审查、规则验证、关系分析",
            "boundaries": ["只分析不修改", "不操作编辑器"],
            "style": "数据驱动",
            "output_format": "结构化分析报告",
        },
        "web_surfer": {
            "identity": "联网搜索员",
            "duties": "浏览器、网页抓取、搜索、PDF",
            "boundaries": ["只搜不看不安全网站"],
            "style": "快搜快回",
            "output_format": "链接 + 摘要",
        },
        "media_creator": {
            "identity": "媒体生成师",
            "duties": "AI生图、图片分析、语音、截图",
            "boundaries": ["不生成不当内容"],
            "style": "创意驱动",
            "output_format": "媒体文件",
        },
        "dev_coder": {
            "identity": "开发助手",
            "duties": "写代码、Git、联网查方案",
            "boundaries": ["不操作命令行和文件"],
            "style": "代码优先",
            "output_format": "代码块",
        },
        "ops_coder": {
            "identity": "运维助手",
            "duties": "命令行、文件操作、定时任务、UI预览",
            "boundaries": ["不写代码逻辑"],
            "style": "运维导向",
            "output_format": "命令输出",
        },
        "fixer": {
            "identity": "修复专家",
            "duties": "系统诊断、数据修复、代码修复、健康检查",
            "boundaries": ["不修改业务逻辑"],
            "style": "诊断→修复→验证",
            "output_format": "修复报告",
        },
        "steward": {
            "identity": "管家",
            "duties": "对话理解、任务分派、结果汇总",
            "boundaries": ["不删除用户文件", "不执行业务操作", "不问不调工具"],
            "style": "先听懂再委派",
            "output_format": "对话",
        },
    }
    return defaults.get(agent_id, {
        "identity": agent_id,
        "duties": "根据用户需求完成任务",
        "boundaries": ["不执行危险操作"],
        "style": "直接高效",
        "output_format": "文本",
    })
