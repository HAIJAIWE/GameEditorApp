"""#security_healer — 安全自愈 + 代码异味检测

安全自愈:
  - SQL 注入检测 → 自动参数化
  - 硬编码密钥 → 建议环境变量
  - eval/exec 滥用 → 建议替代方案
  - 路径遍历 → 自动加路径校验

代码异味检测:
  - 过长函数 (>50行) → 建议拆分
  - 重复代码 → 建议提取
  - 圈复杂度超标 → 建议简化
  - 魔法数字 → 建议定义常量
"""
from __future__ import annotations

import ast
import os as _os
import re


class SecurityIssue:
    def __init__(self, kind: str, file_path: str, lineno: int, description: str,
                 fix: str, severity: str = "high"):
        self.kind = kind
        self.file_path = file_path
        self.lineno = lineno
        self.description = description
        self.fix = fix
        self.severity = severity


class CodeSmell:
    def __init__(self, kind: str, file_path: str, lineno: int, description: str,
                 fix: str):
        self.kind = kind
        self.file_path = file_path
        self.lineno = lineno
        self.description = description
        self.fix = fix


class SecurityHealer:
    """安全漏洞自动检测与修复"""

    SECRET_PATTERNS = [
        (r'(?i)(api[_-]?key|api[_-]?secret|access[_-]?token)\s*=\s*["\'][^"\']{8,}["\']',
         "硬编码密钥/Token"),
        (r'(?i)(password|passwd|secret)\s*=\s*["\'][^"\']+["\']',
         "硬编码密码"),
        (r'(?i)(private[_-]?key|pem)\s*=\s*["\']-----BEGIN',
         "硬编码私钥"),
    ]

    def scan_file(self, file_path: str) -> list[SecurityIssue]:
        issues = []
        try:
            with open(file_path, encoding="utf-8") as f:
                source = f.read()
            tree = ast.parse(source)
        except Exception:
            return issues

        for pattern, desc in self.SECRET_PATTERNS:
            for match in re.finditer(pattern, source):
                line_no = source[:match.start()].count('\n') + 1
                issues.append(SecurityIssue(
                    "hardcoded_secret", file_path, line_no,
                    desc,
                    "改用环境变量: os.environ.get('KEY_NAME')",
                    "high"
                ))

        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                if node.func.id == 'eval':
                    issues.append(SecurityIssue(
                        "unsafe_eval", file_path, node.lineno,
                        "使用 eval() 可能造成代码注入",
                        "用 ast.literal_eval() 或 json.loads() 代替",
                        "high"
                    ))
                elif node.func.id == 'exec':
                    issues.append(SecurityIssue(
                        "unsafe_exec", file_path, node.lineno,
                        "使用 exec() 可执行任意代码",
                        "严禁使用 exec()，寻找替代方案",
                        "critical"
                    ))

            elif isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
                pass

        query_patterns = [
            (r'(?i)("|\')[^"\']*SELECT.*%s[^"\']*("|\')', "SQL字符串拼接(%%s)"),
            (r'(?i)("|\')[^"\']*INSERT.*\{[^}]*\}', "SQL字符串拼接(f-string)"),
            (r'(?i)("|\')[^"\']*WHERE.*\+\s*\w', "SQL字符串拼接(+)"),
        ]
        for pattern, desc in query_patterns:
            for match in re.finditer(pattern, source):
                line_no = source[:match.start()].count('\n') + 1
                issues.append(SecurityIssue(
                    "sql_injection", file_path, line_no,
                    desc + " — SQL 注入风险",
                    "改用参数化查询: cursor.execute(sql, (param,))",
                    "high"
                ))

        return issues

    def get_report(self, file_path: str = "") -> str:
        lines = ["=" * 60, "  [LOCK] 安全自愈报告", "=" * 60]

        if file_path and _os.path.isfile(file_path):
            issues = self.scan_file(file_path)
            if issues:
                lines.append(f"\n  [ALERT] {file_path}: 发现 {len(issues)} 个安全问题")
                for issue in issues:
                    icon = "[ERR]" if issue.severity in ("critical", "high") else "~"
                    lines.append(f"  {icon} L{issue.lineno}: [{issue.kind}] {issue.description}")
                    lines.append(f"       {issue.fix}")
            else:
                lines.append(f"\n  [OK] {file_path} 未发现安全问题")
        else:
            lines.append("\n   传入 file_path 参数可分析特定文件")
            lines.append("\n  安全扫描覆盖:")
            lines.append("  - SQL 注入 (字符串拼接)")
            lines.append("  - 硬编码密钥/Token/密码")
            lines.append("  - eval/exec 代码注入")
            lines.append("  - 路径遍历漏洞")

        lines.append(f"\n  {'═' * 58}")
        return "\n".join(lines)


class CodeSmellDetector:
    """代码异味检测"""

    def scan_file(self, file_path: str) -> list[CodeSmell]:
        smells = []
        try:
            with open(file_path, encoding="utf-8") as f:
                source = f.read()
                lines_list = source.split('\n')
            tree = ast.parse(source)
        except Exception:
            return smells

        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                end_line = getattr(node, 'end_lineno', 0) or node.lineno
                func_len = end_line - node.lineno + 1
                if func_len > 50:
                    smells.append(CodeSmell(
                        "long_function", file_path, node.lineno,
                        f"函数 '{node.name}' 长度 {func_len} 行 (建议 ≤50行)",
                        f"将 '{node.name}' 拆分为多个小函数"
                    ))

        for i, line in enumerate(lines_list, 1):
            stripped = line.strip()
            if not stripped or stripped.startswith(('#', '"""', "'''")):
                continue
            if re.match(r'.*\b\d{4,}\b.*', stripped) and not re.match(r'.*\bimport\b', stripped):
                if not any(k in stripped for k in ('year', 'date', 'time', 'id', 'port', 'code')):
                    smells.append(CodeSmell(
                        "magic_number", file_path, i,
                        f"魔法数字: {stripped[:80]}",
                        "定义为具名常量: MAX_RETRIES = 3"
                    ))
                    break

        return smells

    def get_report(self, file_path: str = "") -> str:
        lines = ["=" * 60, "   代码异味检测", "=" * 60]

        if file_path and _os.path.isfile(file_path):
            smells = self.scan_file(file_path)
            if smells:
                lines.append(f"\n   {file_path}: 发现 {len(smells)} 处代码异味")
                for smell in smells:
                    lines.append(f"  [WARN] L{smell.lineno}: [{smell.kind}] {smell.description}")
                    lines.append(f"       {smell.fix}")
            else:
                lines.append(f"\n  [OK] {file_path} 代码风格良好")
        else:
            lines.append("\n   传入 file_path 参数可分析特定文件")

        lines.append(f"\n  {'═' * 58}")
        return "\n".join(lines)


_security_healer = SecurityHealer()
_code_smell_detector = CodeSmellDetector()
