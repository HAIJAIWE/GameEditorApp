"""WorkspaceManager / Memory 单元测试

覆盖工作区的创建、切换、列表、统计、删除，以及记忆提炼与偏好学习。

所有操作通过 monkeypatch 把 WorkspaceManager 单例的根目录重定向到 tmp_path，
因此不会在真实的 data/libraries/ 下留下 test_project 之类的残留目录。
"""

import pytest

from core.agent.memory import Memory
from core.agent.workspace import get_workspace


@pytest.fixture
def workspace(monkeypatch, tmp_path):
    """提供与真实数据目录隔离的 WorkspaceManager 实例"""
    ws = get_workspace()
    monkeypatch.setattr(ws, "_root", tmp_path / "libraries")
    monkeypatch.setattr(ws, "_current", "default")
    ws._ensure_default_workspace()
    yield ws


# ── WorkspaceManager ──

def test_default_workspace_ready(workspace):
    assert workspace.current == "default"
    assert workspace.workspace_dir.is_dir()
    assert workspace.memory_dir.is_dir()
    assert workspace.persona_path.exists()
    assert "小墨" in workspace.read_persona()


def test_create_and_switch_workspace(workspace):
    assert workspace.create_workspace("test_project", "# 测试项目", "测试身份") is True
    # 同名工作区已存在，重复创建应失败
    assert workspace.create_workspace("test_project") is False

    assert workspace.switch_workspace("test_project") is True
    assert workspace.current == "test_project"
    assert workspace.workspace_dir.name == ".workspace"
    assert workspace.workspace_dir.parent.name == "test_project"

    assert workspace.switch_workspace("default") is True
    assert workspace.current == "default"


@pytest.mark.parametrize("name", ["", "   ", "\t"])
def test_create_workspace_rejects_blank_name(workspace, name):
    assert workspace.create_workspace(name) is False


def test_create_workspace_writes_persona(workspace):
    workspace.create_workspace("alpha", "# 阿尔法", "# 阿尔法身份")
    workspace.switch_workspace("alpha")
    assert workspace.read_persona().startswith("# 阿尔法")


def test_list_workspaces(workspace):
    workspace.create_workspace("alpha")
    entries = workspace.list_workspaces()
    ids = [x["id"] for x in entries]
    assert "default" in ids
    assert "alpha" in ids

    active = [x for x in entries if x["active"]]
    assert len(active) == 1
    assert active[0]["id"] == workspace.current


def test_get_stats(workspace):
    stats = workspace.get_stats()
    assert stats["workspace"] == workspace.current
    assert stats["path"] == str(workspace.workspace_dir)
    assert stats["conversations"] == 0
    assert stats["plans"] == 0
    assert stats["persona_size"] > 0


def test_cannot_delete_default_or_active_workspace(workspace):
    # 默认工作区禁止删除
    assert workspace.delete_workspace("default") is False

    # 当前活跃的工作区禁止删除
    workspace.create_workspace("beta")
    workspace.switch_workspace("beta")
    assert workspace.delete_workspace("beta") is False

    # 不存在的工作区返回 False 而非抛异常
    assert workspace.delete_workspace("nonexistent") is False


def test_delete_workspace_removes_empty_library_shell(workspace):
    """回归：删除工作区后不应留下空的库目录壳

    历史上 delete_workspace 只删 .workspace，导致 data/libraries/ 下
    反复残留 test_project 等空目录。
    """
    workspace.create_workspace("gamma")
    lib_dir = workspace._root / "gamma"
    assert lib_dir.is_dir()

    workspace.switch_workspace("default")
    assert workspace.delete_workspace("gamma") is True
    assert not lib_dir.exists(), "库目录为空时应一并清理"
    assert "gamma" not in [x["id"] for x in workspace.list_workspaces()]


def test_delete_workspace_keeps_library_with_other_data(workspace):
    """库目录内仍有业务数据时，删除工作区不能连库一起删掉"""
    workspace.create_workspace("delta")
    lib_dir = workspace._root / "delta"
    (lib_dir / "ceshu").mkdir()
    (lib_dir / "ceshu" / "data.json").write_text("{}", encoding="utf-8")

    workspace.switch_workspace("default")
    assert workspace.delete_workspace("delta") is True
    assert lib_dir.exists(), "含业务数据的库目录必须保留"
    assert (lib_dir / "ceshu" / "data.json").exists()


# ── Memory ──

def test_memory_consolidate_writes_long_term(tmp_path):
    m = Memory(data_dir=str(tmp_path / "mem"))
    m.save_short_term("project_name", "2D冒险岛", confidence=0.9)
    m.save_short_term("user_style", "detailed", confidence=0.8)
    m.save_short_term("favorite_tool", "code_skill", confidence=0.7)
    m.save_short_term("last_action", "create_item", confidence=0.5)

    for entry in m._short_term.values():
        if hasattr(entry, "access_count"):
            entry.access_count = 3

    m.save_conversation("查询火属性", "火属性角色共3个：火神、炎魔、赤焰")
    m.save_conversation("详细说说", "火神：攻击力850，防御力600，技能包括烈焰风暴、火球术、焚烧")

    m.consolidate()
    assert len(m._long_term) > 0, "consolidate 应该写入长期记忆"


def test_memory_learn_preferences(tmp_path):
    """learn_preferences 依据对话内容推断偏好（简洁）

    注意两点：
    1. 该方法以 load_recent_conversations 为输入，没有任何对话时会直接返回，偏好保持为空；
    2. 回复长度 <80 会被判为 brief、>400 判为 detail，两者都会覆盖关键词结果。
       因此这里把回复控制在 80~400 字符之间，使断言只由用户关键词决定。
    """
    m = Memory(data_dir=str(tmp_path / "mem"))
    m.save_conversation(
        "请简洁一点",
        "关于火属性角色的整体设计思路，我会从数值定位、技能机制和克制关系三个层面来逐条展开说明，"
        "同时结合当前的版本环境给出平衡性的调整建议，并补充几个可选的优化方向供你在后续迭代时参考使用。",
    )
    m.learn_preferences()
    assert m.get_preference("style") == "brief"


def test_memory_learn_preferences_detailed(tmp_path):
    """同上，用户使用「详细/展开/完整」时推断为 detailed"""
    m = Memory(data_dir=str(tmp_path / "mem"))
    m.save_conversation(
        "能详细展开说明吗",
        "关于火属性角色的整体设计思路，我会从数值定位、技能机制和克制关系三个层面来逐条展开说明，"
        "同时结合当前的版本环境给出平衡性的调整建议，并补充几个可选的优化方向供你在后续迭代时参考使用。",
    )
    m.learn_preferences()
    assert m.get_preference("style") == "detailed"


def test_memory_learn_preferences_noop_without_conversations(tmp_path):
    """没有对话时 learn_preferences 应静默返回，不产生偏好"""
    m = Memory(data_dir=str(tmp_path / "mem"))
    m.learn_preferences()
    assert m.get_preference("style") is None


def test_memory_clear_session(tmp_path):
    m = Memory(data_dir=str(tmp_path / "mem"))
    m.save_short_term("tmp_key", "tmp_value", confidence=0.5)
    assert len(m._short_term) > 0
    m.clear_session()
    assert len(m._short_term) == 0
