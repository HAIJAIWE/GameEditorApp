"""AI解析功能单元测试"""
import unittest
import sys
import os

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SRC = os.path.join(_PROJ_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest
pytest.importorskip("PyQt6")  # PyQt6 缺失时跳过整个模块

from features.ai import parse_ai_result


class TestAIParsing(unittest.TestCase):
    """AI解析功能测试"""

    def test_parse_valid_json_object(self):
        """测试解析有效的JSON对象"""
        result = parse_ai_result('{"name": "烈焰斩", "type": "\u653b\u51fb", "value": 100, "cd": 5}')
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)
        self.assertIn("items", result)
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["name"], "\u70c8\u7130\u65a9")

    def test_parse_markdown_code_block(self):
        """测试解析markdown代码块中的JSON"""
        result = parse_ai_result("```json\n{\"name\":\"\u706b\u7403\u672f\",\"type\":\"\u653b\u51fb\",\"value\":80}\n```")
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)
        self.assertIn("items", result)
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["name"], "\u706b\u7403\u672f")

    def test_parse_json_array(self):
        """测试解析JSON数组"""
        result = parse_ai_result("[{\"name\":\"\u51b0\u96ea\u7206\"},{\"name\":\"\u96f7\u7535\u51fb\"}]")
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)

    def test_parse_achievement_special_case(self):
        """测试解析成就特殊字段"""
        result = parse_ai_result("{\"description\":\"\u5b8c\u6210\u6240\u6709\u4efb\u52a1\",\"condition\":\"\u5b8c\u6210100\u4e2a\u4efb\u52a1\",\"reward\":\"\u79f0\u53f7\"}")
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)

    def test_parse_empty_input(self):
        """测试解析空输入"""
        result = parse_ai_result("")
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)

    def test_parse_invalid_input(self):
        """测试解析无效输入"""
        result = parse_ai_result("这不是JSON")
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)

    def test_find_matching_brace(self):
        """测试找到匹配的大括号"""
        from features.ai import find_matching_brace
        result = find_matching_brace("{hello{world}there}", 0)
        self.assertEqual(result, 18)


if __name__ == "__main__":
    unittest.main()
