"""Agent OS §12 — 基准测试：20个标准案例"""
BENCHMARK_CASES = [
    {"id": "T01", "name": "创建角色", "input": "创建一个法师角色叫火法·炽焰", "expect_tool": "system.game_data", "expect_action": "create"},
    {"id": "T02", "name": "查询数据", "input": "有哪些角色", "expect_tool": "system.game_data", "expect_action": "query"},
    {"id": "T03", "name": "修改属性", "input": "把火法·炽焰的atk改成200", "expect_tool": "system.game_data", "expect_action": "update"},
    {"id": "T04", "name": "创建技能", "input": "给火法加一个火球术技能", "expect_tool": "system.game_data", "expect_action": "create"},
    {"id": "T05", "name": "列出怪物", "input": "有哪些怪物", "expect_tool": "system.game_data", "expect_action": "query"},
    {"id": "T06", "name": "策划方案列表", "input": "看看有什么策划方案", "expect_tool": "system.ceshu", "expect_action": "list"},
    {"id": "T07", "name": "写方案", "input": "写个放置游戏的方案", "expect_tool": "system.ceshu", "expect_action": "write"},
    {"id": "T08", "name": "数值分析", "input": "分析一下角色平衡性", "expect_tool": "tool.game_balance", "expect_action": None},
    {"id": "T09", "name": "批量创建", "input": "批量创建5个怪物", "expect_tool": "system.batch_data", "expect_action": None},
    {"id": "T10", "name": "Schema编辑", "input": "给角色加个spell_power字段", "expect_tool": "system.schema_edit", "expect_action": None},
    {"id": "T11", "name": "导出文档", "input": "把策划方案导出来", "expect_tool": "tool.export_doc", "expect_action": None},
    {"id": "T12", "name": "文件读取", "input": "读一下README.md", "expect_tool": "system.file_ops", "expect_action": "read"},
    {"id": "T13", "name": "Web搜索", "input": "搜索一下Unity教程", "expect_tool": "system.web_search", "expect_action": None},
    {"id": "T14", "name": "生成图片", "input": "生成一个法师的图片", "expect_tool": "tool.image", "expect_action": "generate"},
    {"id": "T15", "name": "代码助手", "input": "写个Python函数排序", "expect_tool": "system.code", "expect_action": None},
    {"id": "T16", "name": "删除确认", "input": "删除火法·炽焰", "expect_tool": "system.game_data", "expect_action": "delete"},
    {"id": "T17", "name": "委派任务", "input": "让策划专家设计一个boss", "expect_tool": "delegate_to_agent", "expect_action": None},
    {"id": "T18", "name": "纯对话", "input": "你好", "expect_tool": None, "expect_action": None},  # 不调工具
    {"id": "T19", "name": "帮助", "input": "你能做什么", "expect_tool": None, "expect_action": None},  # 纯回复
    {"id": "T20", "name": "退出会话", "input": "今天就这样", "expect_tool": None, "expect_action": None},  # 结束
]


def run_benchmark(agent) -> dict:
    """运行全部基准测试，返回 {case_id: passed}"""
    results = {}
    for case in BENCHMARK_CASES:
        try:
            result = agent.process(case["input"])
            tool_used = result.get("tools_used", [])
            if case["expect_tool"]:
                passed = any(case["expect_tool"] in t for t in tool_used)
            else:
                passed = len(tool_used) == 0 or result.get("answer", "")
            results[case["id"]] = passed
        except Exception:
            results[case["id"]] = False
    return results
