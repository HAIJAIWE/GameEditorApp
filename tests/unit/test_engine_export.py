"""引擎导出模块单元测试"""
import os
import sys
import unittest

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SRC = os.path.join(_PROJ_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest

pytest.importorskip("PyQt6")  # PyQt6 缺失时跳过整个模块

import features.engine_export as ee


class TestEngineExportModule(unittest.TestCase):
    """引擎导出模块定义测试"""

    def test_module_imports(self):
        self.assertTrue(hasattr(ee, "export_to_unity"))
        self.assertTrue(hasattr(ee, "export_to_unreal"))
        self.assertTrue(hasattr(ee, "export_to_godot"))
        self.assertTrue(hasattr(ee, "export_to_cocos2d"))
        self.assertTrue(hasattr(ee, "show_game_data_preview"))

    def test_function_signatures(self):
        from inspect import signature

        for func_name in ["export_to_unity", "export_to_unreal", "export_to_godot", "export_to_cocos2d"]:
            func = getattr(ee, func_name)
            sig = signature(func)
            params = list(sig.parameters.keys())
            self.assertIn("main_window", params, f"{func_name} should have main_window parameter")


if __name__ == "__main__":
    unittest.main()
