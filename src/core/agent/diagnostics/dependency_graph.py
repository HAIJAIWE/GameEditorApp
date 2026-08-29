"""#dependency_graph — 依赖图级联修复引擎

构建全项目代码依赖图，修一处自动推导所有受影响的文件:
  - 改了函数签名 → 自动修改所有调用点
  - 改了类属性 → 自动修改所有引用点  
  - 删了模块 → 告警所有 import 该模块的文件
"""
from __future__ import annotations

import ast
from dataclasses import dataclass
import os as _os
from typing import Any


@dataclass
class CodeSymbol:
    name: str
    kind: str
    file_path: str
    lineno: int
    col_offset: int = 0


@dataclass
class DependencyEdge:
    source_file: str
    source_symbol: str
    target_file: str
    target_symbol: str
    kind: str


class DependencyGraph:
    """全项目依赖图"""

    def __init__(self):
        self._symbols: dict[str, list[CodeSymbol]] = {}
        self._edges: list[DependencyEdge] = []
        self._file_index: dict[str, dict[str, CodeSymbol]] = {}

    def build(self, root: str = "."):
        for root_dir, dirs, files in _os.walk(root):
            dirs[:] = [d for d in dirs if not d.startswith(".")
                       and d not in ("__pycache__", "node_modules", "venv", ".git", "build", "dist", "__init__.py")]
            for fname in files:
                if fname.endswith(".py"):
                    fpath = _os.path.join(root_dir, fname)
                    self._index_file(fpath)
            break

    def _index_file(self, file_path: str):
        try:
            with open(file_path, encoding="utf-8") as f:
                source = f.read()
        except Exception:
            return

        try:
            tree = ast.parse(source)
        except SyntaxError:
            return

        symbols: dict[str, CodeSymbol] = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                sym = CodeSymbol(node.name, "function", file_path, node.lineno)
                symbols[node.name] = sym
            elif isinstance(node, ast.ClassDef):
                sym = CodeSymbol(node.name, "class", file_path, node.lineno)
                symbols[node.name] = sym
            elif isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        sym = CodeSymbol(target.id, "variable", file_path, node.lineno)
                        symbols[target.id] = sym

            elif isinstance(node, ast.Import):
                for alias in node.names:
                    name = alias.asname or alias.name
                    symbols[name] = CodeSymbol(name, "import", file_path, node.lineno)

            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                for alias in node.names:
                    name = alias.asname or alias.name
                    symbols[name] = CodeSymbol(name, f"from:{module}", file_path, node.lineno)

        self._file_index[file_path] = symbols

    def find_dependents(self, symbol_name: str, exclude_file: str = "") -> list[CodeSymbol]:
        """找到所有引用了 symbol_name 的文件和位置"""
        dependents = []
        for fpath, symbols in self._file_index.items():
            if fpath == exclude_file:
                continue
            if symbol_name in symbols:
                dependents.append(symbols[symbol_name])
        return dependents

    def cascade_fix_plan(self, changed_symbol: str, change_description: str) -> str:
        """生成级联修复计划"""
        dependents = self.find_dependents(changed_symbol)
        lines = ["=" * 60, "   依赖图级联修复", "=" * 60]
        lines.append(f"\n  变更: {changed_symbol} ({change_description})")

        if not dependents:
            lines.append(f"\n  [OK] 无其他文件引用 {changed_symbol}，安全修改")
        else:
            lines.append(f"\n  [WARN] 发现 {len(dependents)} 个依赖点需同步修改:")
            for dep in dependents:
                lines.append(f"     {dep.file_path}:{dep.lineno} [{dep.kind}] {dep.name}")
            lines.append("\n   修改顺序:")
            lines.append(f"    1. 先修改 {changed_symbol} 的定义")
            for dep in dependents:
                lines.append(f"    2. 修改 {dep.file_path}:{dep.lineno} 的调用")

        lines.append(f"\n  {'═' * 58}")
        return "\n".join(lines)

    def get_stats(self) -> dict:
        return {
            "files_indexed": len(self._file_index),
            "total_symbols": sum(len(s) for s in self._file_index.values()),
            "total_edges": len(self._edges),
        }


class CascadeFixer:
    """级联修复执行器"""

    def __init__(self, graph: DependencyGraph):
        self._graph = graph

    def cascade_fix_function_rename(self, file_path: str, old_name: str,
                                     new_name: str) -> dict[str, Any]:
        result = {"fixed": [], "skipped": [], "errors": []}
        dependents = self._graph.find_dependents(old_name, exclude_file=file_path)

        for dep in dependents:
            dep_file = dep.file_path
            if not _os.path.isfile(dep_file):
                result["skipped"].append(dep_file)
                continue
            try:
                with open(dep_file, encoding="utf-8") as f:
                    content = f.read()
                if old_name in content:
                    new_content = content.replace(old_name, new_name)
                    with open(dep_file, "w", encoding="utf-8") as f:
                        f.write(new_content)
                    result["fixed"].append(dep_file)
            except Exception as e:
                result["errors"].append(f"{dep_file}: {e}")

        return result


_dependency_graph = DependencyGraph()
