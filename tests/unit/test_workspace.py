import sys
sys.path.insert(0, 'src')

from core.agent.workspace import WorkspaceManager, get_workspace

print("=== WorkspaceManager 测试 ===")

w = get_workspace()
print(f"当前工作区: {w.current}")
print(f"工作区路径: {w.workspace_dir}")
print(f"记忆路径: {w.memory_dir}")
print(f"身份: {w.read_persona()[:60]}...")

print("\n创建新工作区...")
w.create_workspace("test_project", "# 测试项目", "测试身份")
w.switch_workspace("test_project")
assert w.current == "test_project", f"切换失败: {w.current}"
print(f"切换后: {w.current}, 路径: {w.workspace_dir}")

w.switch_workspace("default")
assert w.current == "default", f"切回失败: {w.current}"
print(f"切回: {w.current}")

ws_list = w.list_workspaces()
print(f"工作区列表: {[x['id'] for x in ws_list]}")
assert len(ws_list) >= 2, f"工作区数量不足: {len(ws_list)}"

stats = w.get_stats()
print(f"Stats: {stats}")
assert stats["workspace"] == "default"

w.delete_workspace("test_project")
ws_list2 = w.list_workspaces()
print(f"删除后列表: {[x['id'] for x in ws_list2]}")
assert "test_project" not in [x["id"] for x in ws_list2]

print("\n=== Memory 升级测试 ===")
from core.agent.memory import Memory
import tempfile, os

tmp = tempfile.mkdtemp()
m = Memory(data_dir=tmp)

m.save_short_term("project_name", "2D冒险岛", confidence=0.9)
m.save_short_term("user_style", "detailed", confidence=0.8)
m.save_short_term("favorite_tool", "code_skill", confidence=0.7)
m.save_short_term("last_action", "create_item", confidence=0.5)

for entry in m._short_term.values():
    if hasattr(entry, 'access_count'):
        entry.access_count = 3

m.save_conversation("查询火属性", "火属性角色共3个：火神、炎魔、赤焰")
m.save_conversation("详细说说", "火神：攻击力850，防御力600，技能包括烈焰风暴、火球术、焚烧")
m.save_conversation("帮我优化这段代码", "好的，我来分析你提供的代码并给出优化建议...")

m.consolidate()
print(f"提炼后长期记忆条目: {len(m._long_term)}")
assert len(m._long_term) > 0, "consolidate 应该写入长期记忆"

m.learn_preferences()
prefs = m.get_preference("style")
print(f"偏好 style: {prefs}")

m.clear_session()
print("clear_session 完成")

import shutil
shutil.rmtree(tmp, ignore_errors=True)

print("\n=== 全部通过 ===")