"""#root_cause — 多层级根因分析引擎

不只是修表象(KeyError → 加 .get())，而是追踪到源头。

分析链路:
  表象错误 → 中间层(哪个调用传了空值?) → 上游(哪里生成了空数据?) → 根因(为什么?)

示例:
  KeyError: 'roles'
  → 第1层: .get('roles', []) 防御 (治标)
  → 第2层: 调用方传了不包含 'roles' 的 dict (定位到具体函数)
  → 第3层: 上游数据生成时漏填了 'roles' 字段 (定位到数据源)
  → 根因: Schema 定义需要 roles 但创建数据时未校验 (修 Schema 或加校验)
"""
from __future__ import annotations

import ast
from dataclasses import dataclass, field
import os as _os


@dataclass
class CauseLayer:
    level: int
    description: str
    location: str
    fix: str
    is_root: bool = False


@dataclass
class RootCauseReport:
    error_message: str
    symptom: str
    layers: list[CauseLayer] = field(default_factory=list)
    root_cause: str = ""
    suggested_fix: str = ""
    confidence: float = 0.0
    cross_file_impact: int = 0


class RootCauseAnalyzer:
    def analyze(self, error_message: str, traceback_info: dict = None) -> RootCauseReport:
        msg_lower = error_message.lower()
        report = RootCauseReport(error_message=error_message, symptom=error_message[:200])

        if "keyerror" in msg_lower:
            report = self._analyze_key_error(error_message, traceback_info)
        elif "attributeerror" in msg_lower:
            report = self._analyze_attribute_error(error_message, traceback_info)
        elif "nameerror" in msg_lower:
            report = self._analyze_name_error(error_message, traceback_info)
        elif "typeerror" in msg_lower:
            report = self._analyze_type_error(error_message, traceback_info)
        elif "modulenotfounderror" in msg_lower or "importerror" in msg_lower:
            report = self._analyze_import_error(error_message, traceback_info)
        else:
            report.layers = [
                CauseLayer(1, error_message[:150], "未知", "需人工分析", False)
            ]
            report.root_cause = "无法自动分析该错误类型"
            report.suggested_fix = "查看完整 traceback 获取更多信息"
            report.confidence = 0.1

        return report

    def _analyze_key_error(self, msg: str, tb: dict = None) -> RootCauseReport:
        import re
        key_match = re.search(r"KeyError:\s*'?(\w+)'?", msg)
        key_name = key_match.group(1) if key_match else "unknown"

        report = RootCauseReport(
            error_message=msg,
            symptom=f"访问字典时键 '{key_name}' 不存在",
        )

        file_path = tb["deepest_frame"]["file"] if tb and tb.get("deepest_frame") else ""
        lineno = tb["deepest_frame"]["line"] if tb and tb.get("deepest_frame") else 0

        report.layers = [
            CauseLayer(1, f"字典缺少键 '{key_name}'，直接访问导致 KeyError",
                       f"{file_path}:{lineno}" if file_path else "未知位置",
                       f"使用 .get('{key_name}', default_value) 代替 ['{key_name}']"),
        ]

        if file_path and _os.path.isfile(file_path):
            callers = self._find_callers(file_path, lineno)
            if callers:
                report.layers.append(CauseLayer(
                    2, f"调用方 {callers[0]['function']} 可能传了不包含 '{key_name}' 的数据",
                    f"{callers[0]['file']}:{callers[0]['line']}",
                    f"在 {callers[0]['function']} 中添加 '{key_name}' 字段的生成或校验逻辑"
                ))

        report.layers.append(CauseLayer(
            3, f"数据源头创建或传输过程中遗漏了 '{key_name}' 字段",
            "数据创建逻辑",
            f"在 Schema 或数据构造函数中确保 '{key_name}' 字段始终存在",
            is_root=True
        ))
        report.root_cause = f"数据流中 '{key_name}' 字段缺失，某处创建数据时未包含该字段"
        report.suggested_fix = f"治标: 用 .get('{key_name}', [])。治本: 在创建该数据的代码处添加 '{key_name}' 字段"
        report.confidence = 0.7
        return report

    def _analyze_attribute_error(self, msg: str, tb: dict = None) -> RootCauseReport:
        import re
        attr_match = re.search(r"AttributeError:\s*(.+)", msg)
        detail = attr_match.group(1) if attr_match else msg

        report = RootCauseReport(
            error_message=msg,
            symptom=f"对象缺少属性或方法: {detail}",
        )

        report.layers = [
            CauseLayer(1, f"尝试访问不存在的属性: {detail}",
                       tb["deepest_frame"]["file"] if tb and tb.get("deepest_frame") else "",
                       "检查属性名拼写是否正确"),
            CauseLayer(2, "对象可能是 NoneType，即变量未正确初始化",
                       "",
                       "在上游代码中确保对象被正确赋值，或在访问前检查 is not None",
                       is_root=True)
        ]
        report.root_cause = "对象为 None 或类型不匹配，上游未正确赋值"
        report.suggested_fix = "在访问属性前加 None 检查: if obj is not None: obj.xxx"
        report.confidence = 0.65
        return report

    def _analyze_name_error(self, msg: str, tb: dict = None) -> RootCauseReport:
        import re
        name_match = re.search(r"NameError:\s*name\s+'?(\w+)'?\s+is not defined", msg)
        name = name_match.group(1) if name_match else "unknown"

        report = RootCauseReport(
            error_message=msg,
            symptom=f"变量/函数 '{name}' 未定义",
        )

        file_path = tb["deepest_frame"]["file"] if tb and tb.get("deepest_frame") else ""

        report.layers = [
            CauseLayer(1, f"'{name}' 在当前作用域中未定义",
                       f"{file_path}:{tb['deepest_frame']['line']}" if tb and tb.get("deepest_frame") else "",
                       f"可能缺少 import {name} 或变量拼写错误"),
        ]

        known_missing_imports = {
            "threading": "多线程操作",
            "json": "JSON 序列化",
            "time": "时间操作",
            "os": "操作系统接口",
            "sys": "系统参数",
            "re": "正则表达式",
            "copy": "深拷贝",
            "math": "数学运算",
            "random": "随机数",
            "datetime": "日期时间",
            "collections": "容器数据类型",
            "itertools": "迭代工具",
            "functools": "函数工具",
            "pathlib": "文件路径",
            "hashlib": "哈希/加密",
        }

        if name in known_missing_imports:
            report.layers.append(CauseLayer(
                2, f"'{name}' 是 Python 标准库模块，代码中使用了它的功能但忘记 import",
                file_path,
                f"在文件顶部添加: import {name}",
                is_root=True
            ))
            report.root_cause = f"使用了 {known_missing_imports[name]}功能({name})但未导入"
            report.suggested_fix = f"在文件顶部添加 'import {name}'"
            report.confidence = 0.9
        else:
            report.layers.append(CauseLayer(
                2, f"'{name}' 不是标准库，可能是自定义变量/函数拼写错误或忘记定义",
                file_path,
                f"检查 {name} 是否在其他文件中已定义，或用 search_codebase 搜索",
                is_root=True
            ))
            report.root_cause = f"'{name}' 拼写错误、作用域问题、或忘记定义"
            report.suggested_fix = f"检查拼写是否正确，或添加 {name} 的定义"
            report.confidence = 0.5

        return report

    def _analyze_type_error(self, msg: str, tb: dict = None) -> RootCauseReport:
        report = RootCauseReport(
            error_message=msg,
            symptom="函数调用参数类型或数量不匹配",
        )
        report.layers = [
            CauseLayer(1, "调用时传入了错误类型或数量的参数",
                       tb["deepest_frame"]["file"] if tb and tb.get("deepest_frame") else "",
                       "检查函数签名并修正实参"),
            CauseLayer(2, "上游代码传参逻辑有误或数据转换遗漏",
                       "",
                       "追踪传参源头，确保参数类型和数量正确",
                       is_root=True)
        ]
        report.root_cause = "函数签名与调用点的参数不匹配"
        report.suggested_fix = "对齐实参与形参的类型和数量"
        report.confidence = 0.55
        return report

    def _analyze_import_error(self, msg: str, tb: dict = None) -> RootCauseReport:
        import re
        mod_match = re.search(r"(?:No module named|Failed to import)\s+'?(\w+)'?", msg)
        mod_name = mod_match.group(1) if mod_match else "unknown"

        report = RootCauseReport(
            error_message=msg,
            symptom=f"模块 '{mod_name}' 未找到",
        )

        stdlib = {"os", "sys", "json", "time", "re", "math", "random", "threading",
                  "datetime", "collections", "itertools", "functools", "pathlib",
                  "hashlib", "copy", "ast", "subprocess", "typing", "enum",
                  "dataclasses", "abc", "io", "csv", "xml", "html", "http",
                  "urllib", "socket", "sqlite3", "unittest", "logging", "traceback"}

        if mod_name in stdlib:
            report.layers = [
                CauseLayer(1, f"'{mod_name}' 是标准库但忘记导入",
                           tb["deepest_frame"]["file"] if tb and tb.get("deepest_frame") else "",
                           f"在文件顶部添加: import {mod_name}",
                           is_root=True)
            ]
            report.root_cause = f"使用了标准库 {mod_name} 但未 import"
            report.suggested_fix = f"添加 'import {mod_name}'"
            report.confidence = 0.95
        else:
            report.layers = [
                CauseLayer(1, f"'{mod_name}' 可能是 pip 包或项目内模块",
                           "",
                           f"如果是 pip 包: pip install {mod_name} 或修正模块名拼写"),
                CauseLayer(2, "检查是否为项目内部模块路径问题",
                           "",
                           "如果模块在项目中，检查 sys.path 和相对导入",
                           is_root=True)
            ]
            report.root_cause = f"模块 {mod_name} 不存在于环境中"
            report.suggested_fix = f"1) pip install {mod_name}  2) 检查模块名是否拼写正确"
            report.confidence = 0.6

        return report

    def _find_callers(self, file_path: str, target_line: int = 0) -> list[dict]:
        if not _os.path.isfile(file_path):
            return []
        try:
            with open(file_path, encoding="utf-8") as f:
                tree = ast.parse(f.read())
        except Exception:
            return []

        callers = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and hasattr(node, 'lineno'):
                callers.append({
                    "function": getattr(node.func, 'id', getattr(node.func, 'attr', 'unknown')),
                    "line": node.lineno,
                    "file": file_path,
                })
        return callers


def analyze_root_cause(error_message: str, traceback_info: dict = None) -> str:
    analyzer = RootCauseAnalyzer()
    report = analyzer.analyze(error_message, traceback_info)

    lines = ["=" * 60, "   多层级根因分析", "=" * 60]
    lines.append(f"\n  表象: {report.symptom}")

    lines.append("\n  ── 分析链路 ──")
    for layer in report.layers:
        marker = " 根因" if layer.is_root else f"L{layer.level} (中间层)"
        lines.append(f"  {marker}: {layer.description}")
        if layer.location:
            lines.append(f"       {layer.location}")
        lines.append(f"       {layer.fix}")

    lines.append("\n  ── 结论 ──")
    lines.append(f"  根因: {report.root_cause}")
    lines.append(f"  建议: {report.suggested_fix}")
    lines.append(f"  置信度: {report.confidence:.0%}")
    if report.cross_file_impact > 0:
        lines.append(f"  跨文件影响: {report.cross_file_impact} 个文件可能受影响")

    lines.append(f"\n  {'═' * 58}")
    return "\n".join(lines)
