"""备份管理模块单元测试"""
import unittest
import sys
import os
import tempfile
import json
from pathlib import Path

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SRC = os.path.join(_PROJ_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest
pytest.importorskip("PyQt6")  # PyQt6 缺失时跳过整个模块

from features.backup import export_for_game


class TestExportForGame(unittest.TestCase):
    """游戏工程数据导出测试"""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.temp_file = Path(self.temp_dir) / "game_export.json"

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_export_empty_data(self):
        mock_dm = type("obj", (object,), {"data": {}})()
        result = export_for_game(mock_dm, self.temp_file)
        self.assertTrue(result)
        self.assertTrue(self.temp_file.exists())

        with open(self.temp_file, 'r', encoding='utf-8') as f:
            exported = json.load(f)
        self.assertEqual(exported, {})

    def test_export_with_data(self):
        game_data = {
            "skills": [{"name": "火球术", "value": 100}],
            "roles": [{"name": "战士", "hp": 1000}],
        }
        mock_dm = type("obj", (object,), {"data": game_data})()
        result = export_for_game(mock_dm, self.temp_file)
        self.assertTrue(result)

        with open(self.temp_file, 'r', encoding='utf-8') as f:
            exported = json.load(f)
        self.assertEqual(len(exported["skills"]), 1)
        self.assertEqual(exported["skills"][0]["name"], "火球术")

    def test_export_preserves_chinese(self):
        game_data = {
            "skills": [{"name": "火焰之舞", "desc": "华丽的火焰舞蹈技能"}],
        }
        mock_dm = type("obj", (object,), {"data": game_data})()
        result = export_for_game(mock_dm, self.temp_file)
        self.assertTrue(result)

        with open(self.temp_file, 'r', encoding='utf-8') as f:
            exported = json.load(f)
        self.assertEqual(exported["skills"][0]["name"], "火焰之舞")

    def test_export_invalid_path(self):
        mock_dm = type("obj", (object,), {"data": {}})()
        invalid_path = Path(self.temp_dir) / "nonexistent_dir" / "export.json"
        result = export_for_game(mock_dm, invalid_path)
        self.assertFalse(result)

    def test_export_large_dataset(self):
        game_data = {
            "skills": [{"name": f"技能{i}", "value": i * 10} for i in range(100)],
            "items": [{"name": f"道具{i}", "type": "消耗品"} for i in range(50)],
        }
        mock_dm = type("obj", (object,), {"data": game_data})()
        result = export_for_game(mock_dm, self.temp_file)
        self.assertTrue(result)

        with open(self.temp_file, 'r', encoding='utf-8') as f:
            exported = json.load(f)
        self.assertEqual(len(exported["skills"]), 100)
        self.assertEqual(len(exported["items"]), 50)


if __name__ == "__main__":
    unittest.main()
