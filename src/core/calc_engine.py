"""属性计算引擎 - 拓扑排序 + 动态计算"""
import threading
from typing import Optional

from common.graph import topological_sort as graph_topological_sort


class AttributeCalcEngine:
    """
    属性计算引擎
    
    功能：
    1. 管理属性依赖关系（有向图）
    2. 拓扑排序计算顺序
    3. 检测循环依赖
    4. 动态计算属性值
    """

    def __init__(self):
        # 属性定义：{attr_name: {"type": "base|derived|combat", "formula": {...}, "min": x, "max": x}}
        self.attrs: dict[str, dict] = {}
        # 当前基础属性值（可变的输入值）
        self.base_values: dict[str, float] = {}
        # 可重入锁，保护共享状态的并发安全（支持同一线程嵌套调用）
        self._lock = threading.RLock()

    def set_attr_def(self, name: str, attr_type: str, formula: dict, min_val: Optional[float] = None, max_val: Optional[float] = None):
        """设置属性定义"""
        with self._lock:
            self.attrs[name] = {
                "type": attr_type,
                "formula": formula,  # {"力量": 10, "体质": 20} 表示 力量*10 + 体质*20
                "min": min_val,
                "max": max_val,
            }

    def remove_attr(self, name: str):
        """删除属性，同时从所有公式中移除引用（线程安全）"""
        with self._lock:
            if name in self.attrs:
                del self.attrs[name]
            # 同时从所有公式中移除引用
            for attr_def in self.attrs.values():
                attr_def["formula"].pop(name, None)

    def set_base_value(self, name: str, value: float):
        """设置基础属性值"""
        with self._lock:
            self.base_values[name] = value

    def get_base_value(self, name: str) -> float:
        """获取基础属性值"""
        with self._lock:
            return self.base_values.get(name, 0)

    def _get_dependencies(self, attr_name: str) -> list[str]:
        """获取某个属性依赖的所有其他属性"""
        with self._lock:
            if attr_name not in self.attrs:
                return []
            return list(self.attrs[attr_name]["formula"].keys())

    def topological_sort(self) -> list[str]:
        """
        拓扑排序，确保计算顺序正确
        
        例如：HP依赖力量，力量是基础属性
        那么计算顺序应该是：力量 → HP
        
        Raises:
            CircularDependencyError: 如果检测到循环依赖
        """
        with self._lock:
            graph = {}
            for name in self.attrs:
                graph[name] = self._get_dependencies(name)
            return graph_topological_sort(graph)

    def calculate_single(self, attr_name: str, context: dict[str, float]) -> float:
        """计算单个属性值"""
        if attr_name not in self.attrs:
            return 0

        attr_def = self.attrs[attr_name]

        # 基础属性直接返回值
        if attr_def["type"] == "base":
            return context.get(attr_name, 0)

        # 派生/战斗属性用公式计算
        formula = attr_def["formula"]
        value = 0
        for dep_name, coeff in formula.items():
            if coeff != 0:
                value += coeff * context.get(dep_name, 0)

        # 应用min/max约束
        if attr_def["min"] is not None:
            value = max(value, attr_def["min"])
        if attr_def["max"] is not None:
            value = min(value, attr_def["max"])

        return value

    def calculate_all(self) -> dict[str, float]:
        """
        计算所有属性值
        
        Returns:
            {attr_name: value, ...}
        """
        # 从基础属性开始
        results = dict(self.base_values)

        # 拓扑排序计算
        sorted_attrs = self.topological_sort()

        for attr_name in sorted_attrs:
            if attr_name in self.base_values:
                continue  # 基础属性已存在

            results[attr_name] = self.calculate_single(attr_name, results)

        return results

    def get_formula_string(self, attr_name: str) -> str:
        """获取属性的可读公式字符串"""
        if attr_name not in self.attrs:
            return ""

        formula = self.attrs[attr_name]["formula"]
        parts = []
        for dep_name, coeff in formula.items():
            if coeff != 0:
                parts.append(f"{dep_name}×{coeff}")

        return " + ".join(parts) if parts else "0"

    def export_to_json(self) -> dict:
        """导出为JSON格式（用于保存）"""
        return {
            "attributes": {
                name: {
                    "type": defn["type"],
                    "formula": defn["formula"],
                    "min": defn["min"],
                    "max": defn["max"],
                }
                for name, defn in self.attrs.items()
            },
            "base_values": dict(self.base_values),
        }

    def import_from_json(self, data: dict):
        """从JSON导入"""
        self.attrs = {}
        self.base_values = {}

        for name, defn in data.get("attributes", {}).items():
            if not isinstance(defn, dict):
                continue
            self.set_attr_def(
                name=name,
                attr_type=defn.get("type", "base"),
                formula=defn.get("formula", {}),
                min_val=defn.get("min"),
                max_val=defn.get("max"),
            )

        self.base_values = data.get("base_values", {})
