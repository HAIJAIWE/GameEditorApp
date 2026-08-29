"""图算法工具模块"""
from collections import deque


class CircularDependencyError(Exception):
    pass


def topological_sort(graph: dict[str, list[str]]) -> list[str]:
    """
    拓扑排序（Kahn算法）

    Args:
        graph: 依赖图，{节点: [依赖列表]}，值列表为当前节点依赖的其他节点

    Returns:
        拓扑排序后的节点列表

    Raises:
        CircularDependencyError: 检测到循环依赖
    """
    in_degree: dict[str, int] = {name: 0 for name in graph}
    reverse_adj: dict[str, list[str]] = {name: [] for name in graph}

    for name, deps in graph.items():
        for dep in deps:
            if dep in in_degree:
                in_degree[name] += 1
                reverse_adj[dep].append(name)

    queue = deque(name for name, degree in in_degree.items() if degree == 0)
    result = []

    while queue:
        node = queue.popleft()
        result.append(node)
        for dependent in reverse_adj.get(node, []):
            in_degree[dependent] -= 1
            if in_degree[dependent] == 0:
                queue.append(dependent)

    if len(result) != len(graph):
        raise CircularDependencyError("检测到循环依赖！")

    return result
