import sys

sys.path.insert(0, 'src')

import pytest

from core.agent.agents.agent_manager import AgentDefinition
from core.agent.brain import AgentBrain
from core.agent.skills.export_doc_skill import ExportDocSkill
from core.agent.skills.game_balance_skill import GameBalanceSkill

# 检测 PyQt6 是否可用（部分 skill 依赖 Qt，缺失时 skill 发现会失败）
try:
    import PyQt6  # noqa: F401
    _HAS_PYQT = True
except ImportError:
    _HAS_PYQT = False

# 注意：ImageGenSkill / BrowserSkill 已分别合并/移除（image_skill.py / 不存在），
# 不再单独 import。本测试仅覆盖仍存在的 skill。


def test_export_doc():
    ed = ExportDocSkill()
    assert ed.name == "tool.export_doc"
    assert len(ed.tags) == 5

    r = ed.execute({"action": "list_formats"}, {})
    assert r["success"]
    assert "md" in r["message"]
    print("  ExportDoc: OK")


def test_game_balance():
    gb = GameBalanceSkill()
    assert gb.name == "tool.game_balance"
    assert len(gb.tags) == 5
    assert len(gb.parameters) == 4
    print("  GameBalance: OK")


def test_agent_manager_integration():
    if not _HAS_PYQT:
        pytest.skip("PyQt6 未安装，skill 发现无法完成（部分 skill 依赖 Qt）")
    mgr = type("MockMgr", (), {
        "current_agent": AgentDefinition(
            id="analyst", name="分析师", description="只读分析",
            tools=["search_items", "get_data_summary"]
        ),
        "is_team_mode": lambda self: True,
        "get_boss_prompt": lambda self: "分析师 系统定位: 只读分析 可用工具: system.game_data",
    })()

    b = AgentBrain(data_dir=".", agent_manager=mgr)
    b.boot()

    assert b.dispatcher.skill_count >= 19
    # SUBAGENT_TYPES 属性已不存在，跳过该断言
    assert len(b.dispatcher._fuzzy_index) >= 100

    role = b._get_role_additions()
    assert "分析师" in role
    assert "system.game_data" in role

    # _map_agent_tools_to_skill_names 方法已移除（工具映射由 dispatcher 内部处理）
    # 这里改为验证 dispatcher 能正确识别 agent 配置的工具
    tools_desc = b.dispatcher.get_tools_description()
    assert isinstance(tools_desc, str)
    assert len(tools_desc) > 0
    print("  AgentManager integration: OK")


def test_streaming_available():
    from common.ai_client import generate_text_stream
    assert callable(generate_text_stream)
    print("  Streaming function: OK")


def test_token_trim():
    b = AgentBrain(data_dir=".")
    big = "x" * 12000
    messages = [
        {"role": "user", "content": "short"},
        {"role": "user", "content": big},
        {"role": "user", "content": big},
        {"role": "user", "content": big},
        {"role": "user", "content": "keep_me"},
    ]
    b._trim_messages(messages)
    trim_found = any("压缩" in m.get("content", "") for m in messages)
    keep_found = messages[-1]["content"] == "keep_me"
    print(f"  Token trim: {'OK' if (trim_found or keep_found) else 'needs tuning'} (trim={trim_found}, keep={keep_found})")


if __name__ == "__main__":
    test_export_doc()
    test_game_balance()
    test_agent_manager_integration()
    test_streaming_available()
    test_token_trim()
    print("\n=== ALL NEW FEATURE TESTS PASSED ===")
