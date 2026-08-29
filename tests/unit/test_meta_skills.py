import sys
sys.path.insert(0, 'src')

import pytest

# skills 包会链式加载 PyQt6 相关技能，缺失时跳过（与套件其它用例约定一致）
pytest.importorskip("PyQt6", reason="PyQt6 未安装")

from core.agent.skills.ask_user_skill import AskUserSkill
from core.agent.skills.todo_skill import TodoWriteSkill

ask = AskUserSkill()
assert ask.name == "tool.ask_user"
assert len(ask.tags) == 6
print(f"AskUser: {ask.name}, tags={ask.tags}")

todo = TodoWriteSkill()
assert todo.name == "tool.todo_write"
assert len(todo.tags) == 6

r = todo.execute({"action": "list"}, {})
assert r["success"]
assert r["message"] == "当前无任务"
print(f"TodoWrite list: {r['message']}")

r2 = todo.execute({
    "action": "create_replaces",
    "todos": [
        {"id": "t1", "content": "test_task_1", "status": "pending", "priority": "high"},
        {"id": "t2", "content": "test_task_2", "status": "in_progress", "priority": "medium"},
    ]
}, {})
assert r2["success"]
assert "test_task_1" in r2["message"]
print(f"TodoWrite create: {len(r2['message'])} chars, count={r2['data']['count']}")

r3 = todo.execute({"action": "mark_done", "item_id": "t1"}, {})
assert r3["success"]
assert "test_task_1" in r3["message"]
assert "completed" in r3["message"]
print(f"TodoWrite mark_done: {r3['data']['status']}")

r4 = todo.execute({"action": "list"}, {})
tasks = r4["data"]["todos"]
assert r4["data"]["completed"] == 1
assert r4["data"]["in_progress"] == 1
assert r4["data"]["count"] == 2
print(f"TodoWrite final: {r4['data']['completed']}/{r4['data']['count']} done")

print("\n=== BOTH SKILLS OK ===")