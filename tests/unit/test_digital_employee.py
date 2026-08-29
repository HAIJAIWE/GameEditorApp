"""测试 数字员工 — 桌面智能助手"""
from unittest.mock import MagicMock, patch
from pathlib import Path

import pytest

try:
    from ui.digital_employee import (
        _get_skills_dirs, _parse_frontmatter, load_skill_groups,
        TaskSelectorDialog, DigitalPanel, DigitalEmployee
    )
    _HAS_DEP = True
except ImportError:
    _HAS_DEP = False


import sys
_PY314_PLUS = sys.version_info >= (3, 14)
@pytest.mark.skipif(not _HAS_DEP, reason="ui.digital_employee 模块不可用")
@pytest.mark.skipif(_PY314_PLUS, reason="Python 3.14+ 与 PyQt6 QWidget 创建存在 segfault")
class TestDigitalEmployeeUtils:
    """数字员工工具函数测试"""

    def test_get_skills_dirs_returns_list(self):
        """测试 _get_skills_dirs 返回列表"""
        dirs = _get_skills_dirs()
        assert isinstance(dirs, list)

    def test_parse_frontmatter_empty(self):
        """测试解析空 frontmatter"""
        result = _parse_frontmatter("")
        assert result == {}

    def test_parse_frontmatter_no_frontmatter(self):
        """测试解析无 frontmatter 文本"""
        result = _parse_frontmatter("普通文本\n没有frontmatter")
        assert result == {}

    def test_parse_frontmatter_valid(self):
        """测试解析有效 frontmatter"""
        text = """---
name: test
type: greeting
---
正文内容"""
        result = _parse_frontmatter(text)
        assert result["name"] == "test"
        assert result["type"] == "greeting"

    def test_parse_frontmatter_no_close(self):
        """测试解析未闭合的 frontmatter"""
        text = """---
name: test
没有闭合"""
        result = _parse_frontmatter(text)
        assert result == {}

    def test_parse_frontmatter_missing_colon(self):
        """测试解析缺少冒号的行"""
        text = """---
name: test
invalid line
---
正文"""
        result = _parse_frontmatter(text)
        assert result["name"] == "test"
        assert "invalid line" not in result

    def test_parse_frontmatter_quoted_values(self):
        """测试解析带引号的值"""
        text = '---\nname: "hello"\ntype: \'world\'\n---'
        result = _parse_frontmatter(text)
        assert result["name"] == "hello"
        assert result["type"] == "world"

    def test_parse_frontmatter_multiple_keys(self):
        """测试解析多键值"""
        text = """---
key1: value1
key2: value2
key3: value3
---"""
        result = _parse_frontmatter(text)
        assert len(result) == 3


@pytest.mark.skipif(not _HAS_DEP, reason="ui.digital_employee 模块不可用")
@pytest.mark.skipif(_PY314_PLUS, reason="Python 3.14+ 与 PyQt6 QWidget 创建存在 segfault")
class TestDigitalEmployeeClasses:
    """数字员工类测试 (mock_qt 模式)"""

    def test_digitalpanel_create(self, mock_qt):
        """测试 DigitalPanel 创建"""
        panel = DigitalPanel()
        assert panel is not None

    def test_digitalemployee_create(self, mock_qt):
        """测试 DigitalEmployee 创建"""
        de = DigitalEmployee()
        assert de is not None

    def test_taskselectordialog_create(self, mock_qt):
        """测试 TaskSelectorDialog 创建"""
        dialog = TaskSelectorDialog()
        assert dialog is not None

    def test_digitalpanel_worker_exists(self, mock_qt):
        """测试 DigitalPanel 有 worker 属性"""
        panel = DigitalPanel()
        assert panel.worker is not None
