"""#fix_market — 修复市场 (50+ 预置修复方案)

常见错误秒级匹配，无需 AI 推理:
  - 匹配规则: 错误消息关键词 → 预设修复方案
  - 置信度来自历史验证数据
  - 自动学习: 新的成功修复自动入库
"""
from __future__ import annotations

import re
from typing import Any, Optional

FIX_MARKET: dict[str, dict[str, Any]] = {
    # ── 导入/模块类 (10项) ──
    "missing import threading": {
        "pattern": "threading.*not defined|threading.*no module",
        "fix": "import threading",
        "confidence": 0.95, "category": "import",
    },
    "missing import json": {
        "pattern": "json.*not defined|json.*no module",
        "fix": "import json",
        "confidence": 0.95, "category": "import",
    },
    "missing import time": {
        "pattern": "time.*not defined|time.*no module",
        "fix": "import time",
        "confidence": 0.95, "category": "import",
    },
    "missing import os": {
        "pattern": "os.*not defined|os.*no module",
        "fix": "import os",
        "confidence": 0.95, "category": "import",
    },
    "missing import sys": {
        "pattern": "sys.*not defined|sys.*no module",
        "fix": "import sys",
        "confidence": 0.95, "category": "import",
    },
    "missing import copy": {
        "pattern": "copy.*not defined|copy.*no module",
        "fix": "import copy",
        "confidence": 0.95, "category": "import",
    },
    "missing import re": {
        "pattern": "re.*not defined|re.*no module",
        "fix": "import re",
        "confidence": 0.95, "category": "import",
    },
    "missing import datetime": {
        "pattern": "datetime.*not defined|datetime.*no module",
        "fix": "import datetime",
        "confidence": 0.95, "category": "import",
    },
    "missing import hashlib": {
        "pattern": "hashlib.*not defined|hashlib.*no module",
        "fix": "import hashlib",
        "confidence": 0.95, "category": "import",
    },
    "missing import collections": {
        "pattern": "collections.*not defined|collections.*no module",
        "fix": "import collections",
        "confidence": 0.95, "category": "import",
    },

    # ── 属性/None 错误 (8项) ──
    "nonetype has no attribute": {
        "pattern": "nonetype.*has no attribute|'NoneType' object has no attribute",
        "fix": "在访问属性前检查 is not None: if obj is not None: obj.xxx",
        "confidence": 0.85, "category": "attribute",
    },
    "dict has no attribute items": {
        "pattern": "dict.*has no attribute.*items|items.*not found",
        "fix": "确保对象是 dict 类型或使用 getattr(obj, 'items', None)",
        "confidence": 0.7, "category": "attribute",
    },
    "list has no attribute keys": {
        "pattern": "list.*has no attribute.*keys",
        "fix": "list 没有 keys() 方法。如果需要的是索引: enumerate(lst)",
        "confidence": 0.9, "category": "attribute",
    },
    "str has no attribute append": {
        "pattern": "str.*has no attribute.*append",
        "fix": "str 不可变，改用列表收集后用 ''.join()",
        "confidence": 0.9, "category": "attribute",
    },
    "int has no attribute": {
        "pattern": "int.*has no attribute.*",
        "fix": "int 没有这个方法。可能需要先转换为其他类型",
        "confidence": 0.7, "category": "attribute",
    },
    "module has no attribute": {
        "pattern": "module.*has no attribute",
        "fix": "检查模块中是否存在该属性/函数，可能需要 submodule import",
        "confidence": 0.65, "category": "attribute",
    },
    "tuple has no attribute": {
        "pattern": "tuple.*has no attribute",
        "fix": "tuple 不可变。如果需修改，先转为 list",
        "confidence": 0.8, "category": "attribute",
    },
    "set has no attribute append": {
        "pattern": "set.*has no attribute.*append",
        "fix": "set 用 add() 代替 append()",
        "confidence": 0.9, "category": "attribute",
    },

    # ── 键/索引错误 (7项) ──
    "keyerror in dict access": {
        "pattern": "keyerror.*",
        "fix": "用 .get(key, default) 代替 [key]，或先 'if key in dict' 检查",
        "confidence": 0.85, "category": "key",
    },
    "indexerror list empty": {
        "pattern": "indexerror.*list.*out of range",
        "fix": "访问前检查 len(lst) > 0，或用 lst[-1] 代替 lst[0] 如果是空列表",
        "confidence": 0.8, "category": "index",
    },
    "indexerror string index": {
        "pattern": "indexerror.*string.*out of range",
        "fix": "字符串长度不足，访问前检查 len(s) >= index + 1",
        "confidence": 0.8, "category": "index",
    },
    "pop from empty list": {
        "pattern": "pop from empty list",
        "fix": "pop() 前检查 if lst: lst.pop()",
        "confidence": 0.85, "category": "index",
    },
    "popitem from empty dict": {
        "pattern": "popitem.*dictionary is empty|popitem.*empty",
        "fix": "用 if dict: dict.popitem()",
        "confidence": 0.85, "category": "key",
    },
    "list assignment index out of range": {
        "pattern": "list assignment.*out of range",
        "fix": "用 lst.append() 或 lst.insert()，不要直接给越界索引赋值",
        "confidence": 0.85, "category": "index",
    },
    "dict object is not callable": {
        "pattern": "dict.*not callable",
        "fix": "你可能写了 dict() 但 dict 是个实例而不是类。或误调用了 dict 变量",
        "confidence": 0.7, "category": "key",
    },

    # ── 类型错误 (8项) ──
    "cannot concatenate str and int": {
        "pattern": "can only concatenate str.*not int|cannot concatenate.*str.*int",
        "fix": "用 str(x) 把数字转成字符串: 'text' + str(num)",
        "confidence": 0.9, "category": "type",
    },
    "cannot multiply sequence by non-int": {
        "pattern": "can't multiply.*non-int",
        "fix": "确保乘法因子是 int 类型: int(factor) * sequence",
        "confidence": 0.85, "category": "type",
    },
    "int object is not iterable": {
        "pattern": "int.*not iterable",
        "fix": "对 int 用了 for 循环。可能需要 range(n) 或 [n]",
        "confidence": 0.85, "category": "type",
    },
    "nonetype object is not iterable": {
        "pattern": "nonetype.*not iterable",
        "fix": "for/iter 前检查: if obj is not None: for x in obj",
        "confidence": 0.85, "category": "type",
    },
    "takes N positional arguments but M were given": {
        "pattern": "takes.*positional.*but.*were given",
        "fix": "检查函数定义的参数数量和调用时传入的数量是否一致",
        "confidence": 0.75, "category": "type",
    },
    "missing N required positional argument": {
        "pattern": "missing.*required positional argument",
        "fix": "调用函数时缺少必传参数，补全参数",
        "confidence": 0.8, "category": "type",
    },
    "got an unexpected keyword argument": {
        "pattern": "unexpected keyword argument",
        "fix": "传了函数不接受的参数名。检查拼写或参数是否已改名",
        "confidence": 0.8, "category": "type",
    },
    "object is not subscriptable": {
        "pattern": "object is not subscriptable",
        "fix": "你可能对方括号 [] 访问了非容器对象。检查变量类型",
        "confidence": 0.75, "category": "type",
    },

    # ── 值/转换错误 (5项) ──
    "cannot convert string to float": {
        "pattern": "could not convert.*float|cannot convert.*float",
        "fix": "字符串包含非数字字符。用 try/except 或先 strip() 清洗",
        "confidence": 0.85, "category": "value",
    },
    "invalid literal for int": {
        "pattern": "invalid literal for int",
        "fix": "字符串不能转为整数。用 try/except 或正则提取数字",
        "confidence": 0.85, "category": "value",
    },
    "valueerror too many values to unpack": {
        "pattern": "too many values to unpack",
        "fix": "解包数量不匹配。用 *_ 接收多余值: a, b, *rest = values",
        "confidence": 0.85, "category": "value",
    },
    "valueerror not enough values to unpack": {
        "pattern": "not enough values to unpack",
        "fix": "数据不足。检查数据来源或提供默认值",
        "confidence": 0.8, "category": "value",
    },
    "truth value of array is ambiguous": {
        "pattern": "truth value.*ambiguous",
        "fix": "numpy 数组不能用 if arr: 判断。用 if arr.any() 或 if len(arr) > 0",
        "confidence": 0.8, "category": "value",
    },

    # ── 文件/IO错误 (5项) ──
    "file not found": {
        "pattern": "no such file|filenotfounderror|file not found",
        "fix": "检查路径是否正确。用 os.path.exists() 或 pathlib.Path().exists() 验证",
        "confidence": 0.8, "category": "io",
    },
    "permission denied": {
        "pattern": "permission denied|permissionerror",
        "fix": "没有读写权限。检查文件是否被其他进程占用，或以管理员权限运行",
        "confidence": 0.7, "category": "io",
    },
    "disk full": {
        "pattern": "no space left|disk.*full",
        "fix": "磁盘空间不足。清理日志、临时文件、缓存",
        "confidence": 0.9, "category": "io",
    },
    "is a directory": {
        "pattern": "is a directory",
        "fix": "你尝试把目录当文件打开。用 os.path.isfile() 先判断",
        "confidence": 0.85, "category": "io",
    },
    "invalid mode": {
        "pattern": "invalid mode",
        "fix": "文件打开模式错误。用 'r'(读) 'w'(写) 'a'(追加) 'rb'(二进制读)",
        "confidence": 0.85, "category": "io",
    },

    # ── 编码/解码错误 (3项) ──
    "unicode decode error": {
        "pattern": "unicode.*decode|unicodedecodeerror",
        "fix": "文件编码不匹配。尝试 encoding='utf-8' 或 'gbk'",
        "confidence": 0.85, "category": "encoding",
    },
    "unicode encode error": {
        "pattern": "unicode.*encode|unicodeencodeerror",
        "fix": "输出编码不支持某些字符。使用 errors='ignore' 或设置编码",
        "confidence": 0.85, "category": "encoding",
    },
    "charmap codec can't encode": {
        "pattern": "charmap.*can.*encode",
        "fix": "控制台不支持特殊字符。用 sys.stdout.reconfigure(encoding='utf-8')",
        "confidence": 0.9, "category": "encoding",
    },

    # ── JSON/YAML 格式 (3项) ──
    "json decode error": {
        "pattern": "json.*decode|jsondecodeerror",
        "fix": "JSON 格式错误。检查逗号、引号、花括号是否配对。用 jsonlint 验证",
        "confidence": 0.8, "category": "format",
    },
    "yaml parse error": {
        "pattern": "yaml.*scan|yaml.*parse",
        "fix": "YAML 缩进或格式错误。确保用空格而非 Tab，列表项格式正确",
        "confidence": 0.8, "category": "format",
    },
    "extra data json": {
        "pattern": "extra data.*json",
        "fix": "JSON 字符串中包含多余数据。可能多个 JSON 对象未分隔",
        "confidence": 0.75, "category": "format",
    },

    # ── 其他通用 (5项) ──
    "recursion limit exceeded": {
        "pattern": "recursion.*exceed|maximum recursion",
        "fix": "递归深度超限。改为迭代实现或用 sys.setrecursionlimit()",
        "confidence": 0.8, "category": "runtime",
    },
    "circular import": {
        "pattern": "circular import|cannot import.*from partially",
        "fix": "循环导入。将 import 移到函数内部(lazy import)或重构模块结构",
        "confidence": 0.75, "category": "import",
    },
    "no module named pip": {
        "pattern": "no module named pip",
        "fix": "pip 未安装或虚拟环境未激活。运行: python -m ensurepip",
        "confidence": 0.8, "category": "import",
    },
    "assertion error": {
        "pattern": "assertionerror",
        "fix": "assert 断言失败。检查断言条件或提供更详细的错误信息",
        "confidence": 0.6, "category": "runtime",
    },
    "stoppediteration": {
        "pattern": "stopiteration",
        "fix": "next() 在迭代器耗尽时抛出。用 default 参数: next(it, default)",
        "confidence": 0.8, "category": "runtime",
    },
}


def query_fix_market(error_message: str) -> Optional[dict[str, Any]]:
    """在修复市场中搜索匹配的修复方案

    修复:
    - 使用 re.search 正则匹配（之前用 `in` 字面子串匹配导致 `.*` 等元字符失效）
    - `|` 按 OR 语义匹配（之前 `all()` 错误地按 AND 匹配）
    """
    if not error_message:
        return None
    msg_lower = error_message.lower()

    # 按 confidence 倒序排，优先返回高置信度修复
    sorted_entries = sorted(FIX_MARKET.items(),
                            key=lambda kv: -kv[1].get("confidence", 0))

    for name, entry in sorted_entries:
        pattern = entry["pattern"].lower()
        try:
            if re.search(pattern, msg_lower):
                return {
                    "name": name,
                    "pattern": pattern,
                    "fix": entry["fix"],
                    "confidence": entry["confidence"],
                    "category": entry["category"],
                }
        except re.error:
            # pattern 不是有效正则，退化为按 | 切分后 OR 字面匹配
            for kw in pattern.split("|"):
                if kw.strip() in msg_lower:
                    return {
                        "name": name,
                        "pattern": pattern,
                        "fix": entry["fix"],
                        "confidence": entry["confidence"],
                        "category": entry["category"],
                    }

    return None


def get_market_stats() -> dict:
    by_category: dict[str, int] = {}
    for entry in FIX_MARKET.values():
        cat = entry["category"]
        by_category[cat] = by_category.get(cat, 0) + 1
    return {
        "total_presets": len(FIX_MARKET),
        "by_category": by_category,
        "avg_confidence": sum(e["confidence"] for e in FIX_MARKET.values()) / len(FIX_MARKET),
    }


def add_to_market(name: str, pattern: str, fix: str, confidence: float = 0.5,
                  category: str = "learned"):
    FIX_MARKET[name] = {
        "pattern": pattern,
        "fix": fix,
        "confidence": confidence,
        "category": category,
    }
