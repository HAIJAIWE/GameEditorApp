"""logger 日志系统模块单元测试

覆盖 AppLogger 单例、LogCaptureHandler 环形缓冲区、get_recent_logs、
enable/disable_agent_trace 以及日志目录创建的多级回退逻辑。
"""
import sys
import os
import logging

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest

from common.logger import AppLogger, get_logger, LogCaptureHandler


# ── 辅助 fixture ──

@pytest.fixture
def fresh_logger():
    """重置 AppLogger 单例与全局 logger 状态，便于测试初始化逻辑

    测试结束后恢复原状态，避免污染其他测试。
    """
    ge_logger = logging.getLogger("GameEditorApp")
    saved_handlers = list(ge_logger.handlers)
    saved_level = ge_logger.level
    for h in list(ge_logger.handlers):
        ge_logger.removeHandler(h)

    saved_instance = AppLogger._instance
    saved_initialized = AppLogger._initialized
    saved_agent = AppLogger._agent_handler
    AppLogger._instance = None
    AppLogger._initialized = False
    AppLogger._agent_handler = None

    yield

    # 恢复：清除测试期间添加的 handler，再装回原 handler
    for h in list(ge_logger.handlers):
        ge_logger.removeHandler(h)
    for h in saved_handlers:
        ge_logger.addHandler(h)
    ge_logger.setLevel(saved_level)
    AppLogger._instance = saved_instance
    AppLogger._initialized = saved_initialized
    AppLogger._agent_handler = saved_agent


def _make_record(msg, level=logging.INFO):
    """构造一条 LogRecord 供 handler 测试使用"""
    return logging.LogRecord(
        name="test", level=level, pathname="", lineno=0,
        msg=msg, args=None, exc_info=None,
    )


# ── AppLogger 单例 ──

class TestAppLoggerSingleton:
    """AppLogger 单例模式测试"""

    def test_singleton_identity(self):
        """两次实例化应返回同一对象"""
        a = AppLogger()
        b = AppLogger()
        assert a is b

    def test_get_logger_returns_applogger_instance(self):
        """get_logger() 返回 AppLogger 单例"""
        logger = get_logger()
        assert isinstance(logger, AppLogger)
        assert logger is AppLogger()

    def test_logger_has_named_logger(self):
        """内部 logger 名为 GameEditorApp"""
        logger = AppLogger()
        assert logger.logger.name == "GameEditorApp"


# ── LogCaptureHandler 环形缓冲区 ──

class TestLogCaptureHandler:
    """LogCaptureHandler 环形缓冲区测试"""

    def test_buffer_collects_emitted_records(self):
        """emit 后 get_recent 返回格式化后的日志条目"""
        handler = LogCaptureHandler(capacity=10)
        handler.handle(_make_record("hello world", logging.INFO))
        recent = handler.get_recent(10)
        assert len(recent) == 1
        assert "hello world" in recent[0]
        # 格式包含级别
        assert "INFO" in recent[0]

    def test_buffer_capacity_truncates_old(self):
        """deque maxlen 截断 — 超过容量后只保留最近 N 条"""
        handler = LogCaptureHandler(capacity=3)
        for i in range(5):
            handler.handle(_make_record(f"msg-{i}", logging.INFO))
        recent = handler.get_recent(10)
        assert len(recent) == 3
        assert "msg-2" in recent[0]
        assert "msg-4" in recent[2]

    def test_get_recent_limit_n(self):
        """get_recent(n) 最多返回 n 条（取最近 n 条）"""
        handler = LogCaptureHandler(capacity=20)
        for i in range(10):
            handler.handle(_make_record(f"msg-{i}", logging.INFO))
        recent = handler.get_recent(3)
        assert len(recent) == 3
        assert "msg-9" in recent[-1]

    def test_get_recent_empty(self):
        """空缓冲区 get_recent 返回空列表"""
        handler = LogCaptureHandler()
        assert handler.get_recent(5) == []

    def test_buffer_formatter_contains_level_and_time(self):
        """格式化输出包含级别标签 [INFO]"""
        handler = LogCaptureHandler()
        handler.handle(_make_record("warn-test", logging.WARNING))
        recent = handler.get_recent(1)
        assert "[WARNING]" in recent[0]


# ── get_recent_logs ──

class TestGetRecentLogs:
    """get_recent_logs 静态方法测试"""

    def test_get_recent_logs_returns_list(self):
        """get_recent_logs 返回列表类型"""
        logs = AppLogger.get_recent_logs(5)
        assert isinstance(logs, list)

    def test_get_recent_logs_captures_info(self):
        """info 级别日志被捕获处理器收集（handler 级别为 INFO）"""
        logger = AppLogger()
        marker = "___unique_marker_info_log___"
        logger.info(marker)
        logs = AppLogger.get_recent_logs(50)
        assert any(marker in line for line in logs)

    def test_get_recent_logs_does_not_capture_debug(self):
        """debug 级别日志不被捕获处理器收集（handler 级别 INFO > DEBUG）"""
        logger = AppLogger()
        marker = "___unique_marker_debug_log___"
        logger.debug(marker)
        logs = AppLogger.get_recent_logs(50)
        assert not any(marker in line for line in logs)


# ── enable/disable_agent_trace ──

class TestAgentTrace:
    """enable/disable_agent_trace 测试"""

    def test_enable_agent_trace_sets_handler(self, fresh_logger):
        """enable_agent_trace 后 _agent_handler 被设置且 handler 加入 logger"""
        logger = AppLogger()
        assert AppLogger._agent_handler is None
        logger.enable_agent_trace()
        assert AppLogger._agent_handler is not None
        assert AppLogger._agent_handler in logger.logger.handlers

    def test_enable_agent_trace_idempotent(self, fresh_logger):
        """重复 enable 不重复添加 handler"""
        logger = AppLogger()
        logger.enable_agent_trace()
        first_handler = AppLogger._agent_handler
        logger.enable_agent_trace()  # 第二次应直接返回
        assert AppLogger._agent_handler is first_handler
        # logger.handlers 中该 handler 只出现一次
        assert logger.logger.handlers.count(first_handler) == 1

    def test_disable_agent_trace_removes_handler(self, fresh_logger):
        """disable_agent_trace 移除 handler 并清空 _agent_handler"""
        logger = AppLogger()
        logger.enable_agent_trace()
        handler = AppLogger._agent_handler
        logger.disable_agent_trace()
        assert AppLogger._agent_handler is None
        assert handler not in logger.logger.handlers

    def test_disable_without_enable_no_op(self, fresh_logger):
        """未 enable 时 disable 不抛异常"""
        logger = AppLogger()
        assert AppLogger._agent_handler is None
        logger.disable_agent_trace()  # 不应抛异常
        assert AppLogger._agent_handler is None

    def test_enable_then_disable_then_re_enable(self, fresh_logger):
        """启用→禁用→再启用 循环正常工作"""
        logger = AppLogger()
        logger.enable_agent_trace()
        assert AppLogger._agent_handler is not None
        logger.disable_agent_trace()
        assert AppLogger._agent_handler is None
        logger.enable_agent_trace()
        assert AppLogger._agent_handler is not None
        assert AppLogger._agent_handler in logger.logger.handlers


# ── 日志目录创建（多级回退） ──

class TestLogDirectoryCreation:
    """日志目录创建的多级回退逻辑测试"""

    def test_log_dir_via_app_root_env(self, fresh_logger, tmp_path, monkeypatch):
        """APP_ROOT 环境变量优先 — 在 APP_ROOT/logs 创建目录"""
        app_root = tmp_path / "myapp_root"
        monkeypatch.setenv("APP_ROOT", str(app_root))
        # 确保不受 frozen 影响（APP_ROOT 优先级最高）
        AppLogger()
        assert app_root.joinpath("logs").exists()
        assert app_root.joinpath("logs").is_dir()

    def test_log_dir_default_project_root(self, fresh_logger, tmp_path, monkeypatch):
        """无 APP_ROOT 且非 frozen — 使用项目根目录（src 的父父父）的 logs"""
        monkeypatch.delenv("APP_ROOT", raising=False)
        # 模拟开发环境：frozen 属性不存在
        monkeypatch.delattr(sys, "frozen", raising=False)
        AppLogger()
        # 项目根目录 = src/common/logger.py 的 parent.parent.parent
        expected = (
            os.path.dirname(os.path.dirname(os.path.dirname(
                os.path.abspath(__import__("common.logger").__file__)
            ))) + os.sep + "logs"
        )
        assert os.path.isdir(expected)

    def test_log_dir_frozen_uses_executable_dir(self, fresh_logger, tmp_path, monkeypatch):
        """打包环境（sys.frozen=True）— 使用可执行文件所在目录的 logs"""
        monkeypatch.delenv("APP_ROOT", raising=False)
        fake_exe = tmp_path / "frozen_app" / "editor.exe"
        fake_exe.parent.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(sys, "frozen", True, raising=False)
        monkeypatch.setattr(sys, "executable", str(fake_exe))
        AppLogger()
        assert fake_exe.parent.joinpath("logs").exists()


# ── 日志方法基本可用性 ──

class TestAppLoggerMethods:
    """AppLogger 各级日志方法测试"""

    def test_log_methods_do_not_raise(self):
        """debug/info/warning/error/critical 调用均不抛异常"""
        logger = AppLogger()
        logger.debug("debug msg")
        logger.info("info msg")
        logger.warning("warning msg")
        logger.error("error msg")
        # critical 默认带 exc_info=True，但不抛异常
        try:
            logger.critical("critical msg")
        except Exception:
            pytest.fail("critical 不应抛异常")
