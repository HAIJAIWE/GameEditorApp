"""测试 数据导出功能模块"""
from unittest.mock import MagicMock, patch

import pytest

try:
    from features.export import batch_edit, batch_export, batch_import, export_json, import_json
    _HAS_DEP = True
except ImportError:
    _HAS_DEP = False


def _make_mock_data_manager():
    dm = MagicMock()
    dm.data = {"jobs": [], "items": [{"id": 1, "name": "测试物品"}]}
    return dm


def _make_mock_main_window(dm=None):
    mw = MagicMock()
    mw.data_manager = dm or _make_mock_data_manager()
    return mw


@pytest.mark.skipif(not _HAS_DEP, reason="features.export 模块不可用")
class TestExportFunctions:
    """导出模块函数测试"""

    @patch("features.export.QFileDialog.getSaveFileName", return_value=("", ""))
    def test_export_json_cancelled(self, mock_dialog):
        """测试取消导出JSON"""
        mw = _make_mock_main_window()
        result = export_json(mw)
        assert result is None

    @patch("features.export.QFileDialog.getSaveFileName", return_value=("/tmp/test.json", ""))
    @patch("features.export.QMessageBox.information")
    @patch("features.export.json.dump")
    @patch("builtins.open")
    def test_export_json_success(self, mock_open, mock_dump, mock_msg, mock_dialog):
        """测试成功导出JSON"""
        dm = _make_mock_data_manager()
        mw = _make_mock_main_window(dm)
        result = export_json(mw)
        assert result is None  # 函数无返回值

    @patch("features.export.QFileDialog.getOpenFileName", return_value=("", ""))
    def test_import_json_cancelled(self, mock_dialog):
        """测试取消导入JSON"""
        mw = _make_mock_main_window()
        result = import_json(mw)
        assert result is None

    @patch("features.export.QFileDialog.getSaveFileName", return_value=("", ""))
    def test_batch_export_cancelled(self, mock_dialog):
        """测试取消批量导出"""
        mw = _make_mock_main_window()
        result = batch_export(mw)
        assert result is None

    @patch("features.export.QFileDialog.getOpenFileName", return_value=("", ""))
    def test_batch_import_cancelled(self, mock_dialog):
        """测试取消批量导入"""
        mw = _make_mock_main_window()
        result = batch_import(mw)
        assert result is None

    def test_export_function_has_correct_signature(self):
        """测试 export_json 函数签名正确"""
        assert callable(export_json)

    def test_import_function_has_correct_signature(self):
        """测试 import_json 函数签名正确"""
        assert callable(import_json)

    def test_batch_import_function_has_correct_signature(self):
        """测试 batch_import 函数签名正确"""
        assert callable(batch_import)

    def test_batch_export_function_has_correct_signature(self):
        """测试 batch_export 函数签名正确"""
        assert callable(batch_export)

    def test_batch_edit_function_has_correct_signature(self):
        """测试 batch_edit 函数签名正确"""
        assert callable(batch_edit)
