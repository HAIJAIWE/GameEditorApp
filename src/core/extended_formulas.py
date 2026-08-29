"""扩展公式类型 - 支持线性、指数、分段、百分比等"""
import ast
from enum import Enum
import math
import operator as _op
from typing import Optional

_SAFE_BINOPS = {
    ast.Add: _op.add,
    ast.Sub: _op.sub,
    ast.Mult: _op.mul,
    ast.Div: _op.truediv,
    ast.FloorDiv: _op.floordiv,
    ast.Mod: _op.mod,
    ast.Pow: _op.pow,
    ast.LShift: _op.lshift,
    ast.RShift: _op.rshift,
    ast.BitOr: _op.or_,
    ast.BitAnd: _op.and_,
    ast.BitXor: _op.xor,
}

_SAFE_UNARYOPS = {
    ast.USub: _op.neg,
    ast.UAdd: _op.pos,
    ast.Not: _op.not_,
}

_SAFE_CMPOPS = {
    ast.Eq: _op.eq,
    ast.NotEq: _op.ne,
    ast.Lt: _op.lt,
    ast.LtE: _op.le,
    ast.Gt: _op.gt,
    ast.GtE: _op.ge,
}

_MATH_FUNCTIONS = {
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
    "int": int,
    "float": float,
    "log": math.log,
    "log10": math.log10,
    "log2": math.log2,
    "exp": math.exp,
    "sqrt": math.sqrt,
    "pow": pow,
    "ceil": math.ceil,
    "floor": math.floor,
}


class _FormulaVisitor(ast.NodeVisitor):
    def __init__(self, namespace: dict):
        self._ns = namespace

    def visit(self, node):
        return super().visit(node)

    def visit_Expression(self, node: ast.Expression):
        return self.visit(node.body)

    def visit_Constant(self, node: ast.Constant):
        return node.value

    def visit_Name(self, node: ast.Name):
        if node.id in self._ns:
            return self._ns[node.id]
        if node.id in _MATH_FUNCTIONS:
            return _MATH_FUNCTIONS[node.id]
        raise NameError(f"未知变量或函数: {node.id}")

    def visit_BinOp(self, node: ast.BinOp):
        op = _SAFE_BINOPS.get(type(node.op))
        if op is None:
            raise TypeError(f"不支持的运算符: {type(node.op).__name__}")
        return op(self.visit(node.left), self.visit(node.right))

    def visit_UnaryOp(self, node: ast.UnaryOp):
        op = _SAFE_UNARYOPS.get(type(node.op))
        if op is None:
            raise TypeError(f"不支持的一元运算符: {type(node.op).__name__}")
        return op(self.visit(node.operand))

    def visit_Compare(self, node: ast.Compare):
        left = self.visit(node.left)
        for op_node, comparator in zip(node.ops, node.comparators, strict=False):
            op = _SAFE_CMPOPS.get(type(op_node))
            if op is None:
                raise TypeError(f"不支持的比较运算符: {type(op_node).__name__}")
            right = self.visit(comparator)
            if not op(left, right):
                return 0.0
            left = right
        return 1.0

    def visit_BoolOp(self, node: ast.BoolOp):
        if isinstance(node.op, ast.And):
            result = 1.0
            for value_node in node.values:
                if not self.visit(value_node):
                    return 0.0
            return result
        elif isinstance(node.op, ast.Or):
            for value_node in node.values:
                if self.visit(value_node):
                    return 1.0
            return 0.0
        raise TypeError(f"不支持的布尔运算符: {type(node.op).__name__}")

    def visit_IfExp(self, node: ast.IfExp):
        return self.visit(node.body) if self.visit(node.test) else self.visit(node.orelse)

    def visit_Call(self, node: ast.Call):
        func = self.visit(node.func)
        if not callable(func):
            raise TypeError(f"{getattr(node.func, 'id', '?')} 不是可调用对象")
        args = [self.visit(a) for a in node.args]
        kwargs = {kw.arg: self.visit(kw.value) for kw in node.keywords}
        return func(*args, **kwargs)

    def generic_visit(self, node):
        raise TypeError(f"不支持的语法节点: {type(node).__name__}")


class FormulaType(Enum):
    """公式类型"""
    LINEAR = "linear"               # 线性公式: base + sum(coeff * attr)
    EXPONENTIAL = "exponential"     # 指数公式: base * (1 + rate)^attr
    PERCENTAGE = "percentage"       # 百分比公式: sum(attr * pct) / 100
    PIECEWISE = "piecewise"         # 分段函数: 不同区间不同公式
    MULTIPLIER = "multiplier"       # 倍率公式: base * sum(coeff * attr)
    LOGARITHMIC = "logarithmic"     # 对数公式: base + coeff * log(attr + 1)
    CUSTOM = "custom"               # 自定义公式: 使用Python表达式


class FormulaConfig:
    """公式配置"""

    def __init__(self,
                 formula_type: FormulaType = FormulaType.LINEAR,
                 coefficients: Optional[dict[str, float]] = None,
                 base_value: float = 0,
                 max_value: Optional[float] = None,
                 min_value: Optional[float] = None,
                 # 指数公式参数
                 rate: float = 0.0,
                 # 分段函数参数
                 pieces: Optional[list[dict]] = None,
                 # 自定义公式参数
                 custom_expr: str = ""):

        self.formula_type = formula_type
        self.coefficients = coefficients or {}
        self.base_value = base_value
        self.max_value = max_value
        self.min_value = min_value

        # 指数公式参数
        self.rate = rate

        # 分段函数参数
        # pieces = [{"min": 0, "max": 10, "coefficients": {...}}, ...]
        self.pieces = pieces or []

        # 自定义公式参数
        self.custom_expr = custom_expr

    def to_dict(self) -> dict:
        """序列化为字典"""
        return {
            "type": self.formula_type.value,
            "coefficients": self.coefficients,
            "base_value": self.base_value,
            "max_value": self.max_value,
            "min_value": self.min_value,
            "rate": self.rate,
            "pieces": self.pieces,
            "custom_expr": self.custom_expr,
        }

    @classmethod
    def from_dict(cls, data: dict) -> FormulaConfig:
        """从字典反序列化"""
        return cls(
            formula_type=FormulaType(data.get("type", "linear")),
            coefficients=data.get("coefficients", {}),
            base_value=data.get("base_value", 0),
            max_value=data.get("max_value"),
            min_value=data.get("min_value"),
            rate=data.get("rate", 0.0),
            pieces=data.get("pieces", []),
            custom_expr=data.get("custom_expr", ""),
        )


class ExtendedFormula:
    """扩展公式 - 支持多种公式类型"""

    def __init__(self, config: Optional[FormulaConfig] = None):
        self.config = config or FormulaConfig()

    def evaluate(self, context: dict[str, float], level: int = 1) -> float:
        """
        根据上下文计算值

        Args:
            context: 属性值字典 {attr_name: value}
            level: 等级（用于指数/对数公式）
        """
        formula_type = self.config.formula_type

        if formula_type == FormulaType.LINEAR:
            value = self._eval_linear(context)
        elif formula_type == FormulaType.EXPONENTIAL:
            value = self._eval_exponential(context, level)
        elif formula_type == FormulaType.PERCENTAGE:
            value = self._eval_percentage(context)
        elif formula_type == FormulaType.PIECEWISE:
            value = self._eval_piecewise(context)
        elif formula_type == FormulaType.MULTIPLIER:
            value = self._eval_multiplier(context)
        elif formula_type == FormulaType.LOGARITHMIC:
            value = self._eval_logarithmic(context)
        elif formula_type == FormulaType.CUSTOM:
            value = self._eval_custom(context, level)
        else:
            value = self._eval_linear(context)

        # 应用最小值约束
        if self.config.min_value is not None:
            value = max(value, self.config.min_value)

        # 应用最大值约束
        if self.config.max_value is not None:
            value = min(value, self.config.max_value)

        return value

    def _eval_linear(self, context: dict[str, float]) -> float:
        """线性公式: base + sum(coeff * attr)"""
        value = self.config.base_value
        for attr_name, coeff in self.config.coefficients.items():
            if coeff != 0:
                value += coeff * context.get(attr_name, 0)
        return value

    def _eval_exponential(self, context: dict[str, float], level: int = 1) -> float:
        """指数公式: base * (1 + rate)^level * sum(coeff * attr)"""
        if not self.config.coefficients:
            return self.config.base_value

        # 计算属性加权和
        weighted_sum = 0
        for attr_name, coeff in self.config.coefficients.items():
            weighted_sum += coeff * context.get(attr_name, 0)

        # 指数增长
        growth_factor = (1 + self.config.rate) ** (level - 1)
        return self.config.base_value + weighted_sum * growth_factor

    def _eval_percentage(self, context: dict[str, float]) -> float:
        """百分比公式: sum(attr * pct) / 100"""
        value = self.config.base_value
        for attr_name, pct in self.config.coefficients.items():
            if pct != 0:
                value += context.get(attr_name, 0) * pct / 100.0
        return value

    def _eval_piecewise(self, context: dict[str, float]) -> float:
        """分段函数: 根据属性值所在区间选择不同公式"""
        if not self.config.pieces:
            return self._eval_linear(context)

        # 使用第一个属性的值来决定区间
        first_attr = next(iter(self.config.coefficients.keys()), None)
        if not first_attr:
            return self.config.base_value

        attr_value = context.get(first_attr, 0)

        # 查找匹配的区间
        for piece in self.config.pieces:
            min_val = piece.get("min", float("-inf"))
            max_val = piece.get("max", float("inf"))

            if min_val <= attr_value < max_val:
                # 使用该区间的系数
                piece_coefficients = piece.get("coefficients", {})
                piece_base = piece.get("base_value", 0)

                value = piece_base
                for attr_name, coeff in piece_coefficients.items():
                    if coeff != 0:
                        value += coeff * context.get(attr_name, 0)
                return value

        # 没有匹配区间，使用默认
        return self._eval_linear(context)

    def _eval_multiplier(self, context: dict[str, float]) -> float:
        """倍率公式: base * (1 + sum(coeff * attr))"""
        multiplier = 1.0
        for attr_name, coeff in self.config.coefficients.items():
            if coeff != 0:
                multiplier += coeff * context.get(attr_name, 0)
        return self.config.base_value * multiplier

    def _eval_logarithmic(self, context: dict[str, float]) -> float:
        """对数公式: base + coeff * log(sum(attrs) + 1)"""
        if not self.config.coefficients:
            return self.config.base_value

        # 计算属性加权和
        weighted_sum = 0
        for attr_name, coeff in self.config.coefficients.items():
            weighted_sum += coeff * context.get(attr_name, 0)

        # 对数增长
        return self.config.base_value + math.log(weighted_sum + 1)

    def _eval_custom(self, context: dict[str, float], level: int = 1) -> float:
        if not self.config.custom_expr:
            return self.config.base_value

        try:
            namespace = dict(context)
            namespace["level"] = level
            namespace["base"] = self.config.base_value
            tree = ast.parse(self.config.custom_expr, mode='eval')
            result = _FormulaVisitor(namespace).visit(tree)
            return float(result)
        except Exception:
            return self.config.base_value

    def to_string(self, attr_name: str = "") -> str:
        """生成可读的公式字符串"""
        formula_type = self.config.formula_type

        if formula_type == FormulaType.LINEAR:
            return self._to_string_linear(attr_name)
        elif formula_type == FormulaType.EXPONENTIAL:
            return self._to_string_exponential(attr_name)
        elif formula_type == FormulaType.PERCENTAGE:
            return self._to_string_percentage(attr_name)
        elif formula_type == FormulaType.PIECEWISE:
            return self._to_string_piecewise(attr_name)
        elif formula_type == FormulaType.MULTIPLIER:
            return self._to_string_multiplier(attr_name)
        elif formula_type == FormulaType.LOGARITHMIC:
            return self._to_string_logarithmic(attr_name)
        elif formula_type == FormulaType.CUSTOM:
            return f"{attr_name} = {self.config.custom_expr}" if attr_name else self.config.custom_expr
        else:
            return self._to_string_linear(attr_name)

    def _to_string_linear(self, attr_name: str = "") -> str:
        parts = []
        if self.config.base_value != 0:
            parts.append(str(self.config.base_value))
        for name, coeff in self.config.coefficients.items():
            if coeff != 0:
                coeff_str = str(int(coeff)) if coeff == int(coeff) else str(coeff)
                parts.append(f"{name}*{coeff_str}")
        formula = " + ".join(parts) if parts else "0"
        return f"{attr_name} = {formula}" if attr_name else f"= {formula}"

    def _to_string_exponential(self, attr_name: str = "") -> str:
        base_part = str(self.config.base_value) if self.config.base_value != 0 else "0"
        rate_part = f"(1+{self.config.rate})^level"
        terms = []
        for name, coeff in self.config.coefficients.items():
            if coeff != 0:
                coeff_str = str(int(coeff)) if coeff == int(coeff) else str(coeff)
                terms.append(f"{name}*{coeff_str}")
        attr_part = " + ".join(terms) if terms else "0"
        formula = f"{base_part} + {attr_part} * {rate_part}"
        return f"{attr_name} = {formula}" if attr_name else f"= {formula}"

    def _to_string_percentage(self, attr_name: str = "") -> str:
        terms = []
        for name, pct in self.config.coefficients.items():
            if pct != 0:
                terms.append(f"{name}*{pct}%")
        formula = " + ".join(terms) if terms else "0"
        return f"{attr_name} = {formula}" if attr_name else f"= {formula}"

    def _to_string_piecewise(self, attr_name: str = "") -> str:
        if not self.config.pieces:
            return self._to_string_linear(attr_name)
        lines = []
        for piece in self.config.pieces:
            min_val = piece.get("min", "-∞")
            max_val = piece.get("max", "∞")
            coeffs = piece.get("coefficients", {})
            terms = []
            for name, coeff in coeffs.items():
                if coeff != 0:
                    coeff_str = str(int(coeff)) if coeff == int(coeff) else str(coeff)
                    terms.append(f"{name}*{coeff_str}")
            line = f"  [{min_val}~{max_val}]: {' + '.join(terms) if terms else '0'}"
            lines.append(line)
        header = f"{attr_name} = 分段函数:" if attr_name else "分段函数:"
        return header + "\n" + "\n".join(lines)

    def _to_string_multiplier(self, attr_name: str = "") -> str:
        terms = []
        for name, coeff in self.config.coefficients.items():
            if coeff != 0:
                coeff_str = str(int(coeff)) if coeff == int(coeff) else str(coeff)
                terms.append(f"{name}*{coeff_str}")
        formula = f"{self.config.base_value} * (1 + {' + '.join(terms) if terms else '0'})"
        return f"{attr_name} = {formula}" if attr_name else f"= {formula}"

    def _to_string_logarithmic(self, attr_name: str = "") -> str:
        terms = []
        for name, coeff in self.config.coefficients.items():
            if coeff != 0:
                coeff_str = str(int(coeff)) if coeff == int(coeff) else str(coeff)
                terms.append(f"{name}*{coeff_str}")
        formula = f"{self.config.base_value} + log({' + '.join(terms) if terms else '0'} + 1)"
        return f"{attr_name} = {formula}" if attr_name else f"= {formula}"

    def to_legacy_string(self) -> str:
        """生成旧版兼容的公式字符串"""
        if self.config.formula_type == FormulaType.LINEAR:
            parts = []
            if self.config.base_value != 0:
                parts.append(str(self.config.base_value))
            for name, coeff in self.config.coefficients.items():
                if coeff != 0:
                    coeff_str = str(int(coeff)) if coeff == int(coeff) else str(coeff)
                    parts.append(f"{name}*{coeff_str}")
            if parts:
                return "= " + " + ".join(parts)
            return "=0"
        else:
            # 非线性的公式使用类型标记
            return f"= {{type:{self.config.formula_type.value}}}"

    @classmethod
    def from_legacy_string(cls, formula_str: str, all_attr_names: list[str]) -> ExtendedFormula:
        """从旧版公式字符串解析（默认创建线性公式）"""
        from core.attr_system import Formula
        linear_formula = Formula.from_legacy_string(formula_str, all_attr_names)
        config = FormulaConfig(
            formula_type=FormulaType.LINEAR,
            coefficients=linear_formula.coefficients,
            base_value=linear_formula.base_value,
        )
        return cls(config)
