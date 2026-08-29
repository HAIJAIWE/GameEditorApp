"""隐私保护模块单元测试"""
import sys
import os

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest
from unittest.mock import MagicMock
from security.privacy import summarize_sensitive, content_filter, delete_user_data


class TestSummarizeSensitive:
    """summarize_sensitive 方法测试"""

    def test_summarize_sensitive_api_key(self):
        """API key 应该被脱敏"""
        text = "api_key=abcdef1234567890abcdef1234567890"
        result = summarize_sensitive(text)
        assert "abcdef1234567890" not in result
        assert "REDACTED" in result

    def test_summarize_sensitive_password(self):
        """密码应该被脱敏"""
        text = "password=my_secret_pass123"
        result = summarize_sensitive(text)
        assert "my_secret_pass123" not in result
        assert "REDACTED" in result

    def test_summarize_sensitive_phone(self):
        """中国手机号应该被脱敏"""
        text = "联系电话：13812345678"
        result = summarize_sensitive(text)
        assert "13812345678" not in result
        assert "REDACTED" in result

    def test_summarize_sensitive_email(self):
        """邮箱地址应该被脱敏"""
        text = "联系邮箱：user@example.com"
        result = summarize_sensitive(text)
        assert "user@example.com" not in result
        assert "REDACTED" in result

    def test_summarize_sensitive_id_number(self):
        """18位身份证号应该被脱敏"""
        text = "身份证号：110101199001011234"
        result = summarize_sensitive(text)
        assert "110101199001011234" not in result
        assert "REDACTED" in result

    def test_summarize_sensitive_normal_text(self):
        """普通游戏数据应该原样通过"""
        text = "角色名称：战士，等级：10，生命值：100"
        result = summarize_sensitive(text)
        assert result == text

    def test_summarize_sensitive_truncation(self):
        """超长内容应该被截断"""
        text = "A" * 3000
        result = summarize_sensitive(text)
        assert len(result) <= 2010  # 2000 + "...[截断]"
        assert "截断" in result


class TestContentFilter:
    """content_filter 测试"""

    def test_content_filter(self):
        """content_filter 应该调用 summarize_sensitive"""
        text = "password=secret123 data"
        result = content_filter(text)
        assert "secret123" not in result
        assert "REDACTED" in result


class TestDeleteUserData:
    """delete_user_data 测试"""

    def test_delete_user_data(self):
        """delete_user_data 应该清除记忆数据"""
        memory = MagicMock()
        memory._data_dir = MagicMock()
        memory._data_dir.__truediv__ = MagicMock(return_value=MagicMock())
        # 模拟文件不存在的情况
        mock_path = MagicMock()
        mock_path.exists.return_value = False
        memory._data_dir.__truediv__ = MagicMock(return_value=mock_path)

        result = delete_user_data(memory)
        assert result is True
        memory.clear_session.assert_called_once()
        memory._short_term.clear.assert_called_once()
