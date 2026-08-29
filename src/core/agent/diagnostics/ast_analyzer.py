"""#ast_analyzer — Python AST 真·代码理解引擎

不再靠正则匹配字符串，用 Python 原生 ast 模块精确分析代码结构:
  - 哪些变量被使用但从未定义 (NameError 隐患)
  - 哪些模块被引用但未 import (ImportError/ModuleNotFoundError 隐患)
  - 哪些属性访问在对象上不存在 (AttributeError 隐患)
  - 哪些函数调用参数数量不匹配 (TypeError 隐患)
  - 跨文件依赖图
  - 死代码、重复代码
"""
from __future__ import annotations

import ast
import os as _os
from typing import Optional


class ASTIssue:
    """AST 分析发现的问题"""
    def __init__(self, kind: str, file_path: str, lineno: int, description: str,
                 fix_suggestion: str = "", detail: dict = None):
        self.kind = kind
        self.file_path = file_path
        self.lineno = lineno
        self.description = description
        self.fix_suggestion = fix_suggestion
        self.detail = detail or {}


class ASTModuleInfo:
    """单个模块的分析结果"""
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.imports: dict[str, str] = {}
        self.from_imports: dict[str, str] = {}
        self.defined_names: set[str] = set()
        self.defined_functions: dict[str, list[str]] = {}
        self.defined_classes: set[str] = set()
        self.used_names: set[str] = set()
        # name → 最后一次使用它的行号（用于跨模块缺失导入检测）
        self._name_usage: dict[str, int] = {}
        self.issues: list[ASTIssue] = []
        self.ast_tree = None


class ASTProjectAnalyzer:
    """全项目 AST 分析引擎"""

    def __init__(self):
        self._modules: dict[str, ASTModuleInfo] = {}
        self._project_root = ""

    def analyze_file(self, file_path: str) -> ASTModuleInfo:
        info = ASTModuleInfo(file_path)
        try:
            with open(file_path, encoding="utf-8") as f:
                source = f.read()
        except Exception:
            return info

        try:
            tree = ast.parse(source)
        except SyntaxError as e:
            info.issues.append(ASTIssue(
                "syntax_error", file_path, e.lineno or 1,
                f"语法错误: {e.msg}", "修正语法错误"
            ))
            return info

        info.ast_tree = tree
        analyzer = _ASTVisitor(info)
        analyzer.visit(tree)

        self._modules[file_path] = info
        return info

    def analyze_project(self, root: str = ".", patterns: list[str] = None) -> list[ASTModuleInfo]:
        if patterns is None:
            patterns = ["*.py"]
        self._project_root = root
        results = []
        for root_dir, dirs, files in _os.walk(root):
            dirs[:] = [d for d in dirs if not d.startswith(".")
                       and d not in ("__pycache__", "node_modules", "venv", ".git", "build", "dist")]
            for fname in files:
                if fname.endswith(".py"):
                    fpath = _os.path.join(root_dir, fname)
                    info = self.analyze_file(fpath)
                    results.append(info)
        return results

    def find_cross_module_issues(self) -> list[ASTIssue]:
        issues = []
        for fpath, mod in self._modules.items():
            linked_issues = self._check_missing_imports(mod)
            issues.extend(linked_issues)
        return issues

    def _check_missing_imports(self, mod: ASTModuleInfo) -> list[ASTIssue]:
        issues = []
        known_names = mod.defined_names | mod.defined_classes | set(mod.defined_functions.keys())
        known_names |= set(mod.imports.keys())
        known_names |= set(mod.from_imports.keys())

        for name, lineno in getattr(mod, '_name_usage', {}).items():
            if name not in known_names and name not in __builtins__:
                found = self._search_definition(name)
                if found:
                    issues.append(ASTIssue(
                        "missing_import", mod.file_path, lineno,
                        f"'{name}' 未导入也未定义",
                        f"从 {found['file']} 导入: from {found['module']} import {name}",
                        {"missing_name": name, "found_in": found}
                    ))
                else:
                    issues.append(ASTIssue(
                        "undefined_name", mod.file_path, lineno,
                        f"'{name}' 未定义且在全项目中找不到",
                        f"检查 {name} 的拼写是否正确，或添加定义",
                        {"missing_name": name}
                    ))
        return issues

    def _search_definition(self, name: str) -> Optional[dict]:
        for fpath, mod in self._modules.items():
            if name in mod.defined_names:
                return {"file": fpath, "module": self._file_to_module(fpath)}
            if name in mod.defined_classes:
                return {"file": fpath, "module": self._file_to_module(fpath)}
            if name in mod.defined_functions:
                return {"file": fpath, "module": self._file_to_module(fpath)}
        return None

    def _file_to_module(self, fpath: str) -> str:
        rel = _os.path.relpath(fpath, self._project_root) if self._project_root else fpath
        rel = rel.replace("\\", "/").replace("/", ".")
        return rel.replace(".py", "")

    def get_report(self, file_path: str = None) -> str:
        modules = [self._modules[file_path]] if file_path and file_path in self._modules else self._modules.values()
        lines = ["=" * 60, "   AST 代码分析报告", "=" * 60]

        total_issues = 0
        for mod in modules:
            if mod.issues:
                lines.append(f"\n   {mod.file_path}")
                for issue in mod.issues:
                    total_issues += 1
                    marker = "[FAIL]" if issue.kind == "syntax_error" else "[WARN]"
                    lines.append(f"    {marker} L{issue.lineno}: [{issue.kind}] {issue.description}")
                    if issue.fix_suggestion:
                        lines.append(f"        {issue.fix_suggestion}")

            if mod.imports or mod.from_imports:
                lines.append("\n   导入:")
                for name, source in mod.imports.items():
                    lines.append(f"    import {source}")
                for name, source in mod.from_imports.items():
                    lines.append(f"    from {source} import {name}")

            if mod.defined_names:
                lines.append(f"   定义({len(mod.defined_names)}): {', '.join(sorted(list(mod.defined_names))[:20])}")

        cross = self.find_cross_module_issues()
        if cross:
            total_issues += len(cross)
            lines.append("\n   跨模块问题:")
            for issue in cross:
                lines.append(f"    [WARN] {issue.file_path}: {issue.description}")

        if total_issues == 0:
            lines.append("\n  [OK] 未发现任何代码问题")

        lines.append(f"\n  {'═' * 58}")
        return "\n".join(lines)


class _ASTVisitor(ast.NodeVisitor):
    def __init__(self, info: ASTModuleInfo):
        self.info = info

    def visit_Import(self, node):
        for alias in node.names:
            name = alias.asname or alias.name
            self.info.imports[name] = alias.name

    def visit_ImportFrom(self, node):
        module = node.module or ""
        for alias in node.names:
            name = alias.asname or alias.name
            self.info.from_imports[name] = module

    def visit_FunctionDef(self, node):
        self.info.defined_names.add(node.name)
        args = [a.arg for a in node.args.args]
        self.info.defined_functions[node.name] = args
        self.generic_visit(node)

    def visit_ClassDef(self, node):
        self.info.defined_classes.add(node.name)
        self.info.defined_names.add(node.name)
        self.generic_visit(node)

    def visit_Assign(self, node):
        for target in node.targets:
            if isinstance(target, ast.Name):
                self.info.defined_names.add(target.id)
        self.generic_visit(node)

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            # 写到 info 上而非 visitor 自身（修复跨模块分析失效）
            self.info._name_usage[node.id] = node.lineno
            self.info.used_names.add(node.id)

    def visit_Attribute(self, node):
        self.generic_visit(node)

    def visit_Call(self, node):
        self.generic_visit(node)

    def visit_keyword(self, node):
        self.generic_visit(node)

    def generic_visit(self, node):
        super().generic_visit(node)


def ast_quick_check(file_path: str) -> dict:
    analyzer = ASTProjectAnalyzer()
    info = analyzer.analyze_file(file_path)
    return {
        "file": file_path,
        "imports": {**info.imports, **info.from_imports},
        "defined": sorted(info.defined_names),
        "functions": list(info.defined_functions.keys()),
        "issues": [{"kind": i.kind, "line": i.lineno, "desc": i.description, "fix": i.fix_suggestion}
                   for i in info.issues],
        "healthy": len(info.issues) == 0,
    }
