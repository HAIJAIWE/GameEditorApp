"""日志系统模块 - 提供统一的日志记录功能"""
from collections import deque
import logging
import logging.handlers
import os
from pathlib import Path
import sys
import threading
from typing import Optional


class LogCaptureHandler(logging.Handler):
    """环形缓冲区日志处理器 — 保留最近 N 条日志供 LLM 地图注入"""

    def __init__(self, capacity: int = 50):
        super().__init__()
        self._buffer: deque = deque(maxlen=capacity)
        self.setLevel(logging.INFO)
        self.setFormatter(logging.Formatter(
            '[%(levelname)s] %(asctime)s %(message)s',
            datefmt='%H:%M:%S'
        ))

    def emit(self, record: logging.LogRecord):
        try:
            msg = self.format(record)
            self._buffer.append(msg)
        except Exception:
            pass

    def get_recent(self, n: int = 20) -> list[str]:
        return list(self._buffer)[-n:]


class AppLogger:
    """应用日志管理器"""

    _instance: Optional[AppLogger] = None
    _initialized: bool = False
    _lock = threading.Lock()
    _agent_handler: Optional[logging.Handler] = None

    def __new__(cls) -> AppLogger:
        """单例模式确保只有一个日志实例"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """初始化日志系统"""
        if AppLogger._initialized:
            return

        self.logger = logging.getLogger("GameEditorApp")
        self.logger.setLevel(logging.DEBUG)

        # 防止重复添加handler
        if self.logger.handlers:
            AppLogger._initialized = True
            return

        # 创建日志目录（基于应用根目录，避免打包后 CWD 不可控）
        # 优先级：APP_ROOT 环境变量 > 可执行文件所在目录 > 项目根目录 > 当前工作目录
        if os.environ.get("APP_ROOT"):
            log_dir = Path(os.environ["APP_ROOT"]) / "logs"
        elif getattr(sys, "frozen", False):
            # PyInstaller 打包后，使用可执行文件所在目录
            log_dir = Path(sys.executable).parent / "logs"
        else:
            # 开发环境：使用项目根目录（src 的父目录）
            log_dir = Path(__file__).resolve().parent.parent.parent / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)

        # 文件处理器 - 轮转日志，单文件最大 10MB，保留 5 个备份
        log_file = log_dir / "app.log"
        file_handler = logging.handlers.RotatingFileHandler(
            log_file, encoding='utf-8', maxBytes=10 * 1024 * 1024, backupCount=5
        )
        file_handler.setLevel(logging.DEBUG)

        # 控制台处理器 - 默认只显示WARNING及以上
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.WARNING)

        # 环形捕获处理器 — 保留最近50条日志供 AI 地图读取
        self._capture_handler = LogCaptureHandler(capacity=50)
        self.logger.addHandler(self._capture_handler)

        # 格式化器
        self._formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(self._formatter)
        console_handler.setFormatter(self._formatter)

        self.logger.addHandler(file_handler)
        self.logger.addHandler(console_handler)

        AppLogger._initialized = True

    def enable_agent_trace(self):
        """启用 Agent 追踪日志到控制台（INFO 级别）"""
        if AppLogger._agent_handler:
            return  # 已启用
        handler = logging.StreamHandler()
        handler.setLevel(logging.INFO)
        handler.setFormatter(logging.Formatter(
            '🔍 %(asctime)s [Agent] %(message)s',
            datefmt='%H:%M:%S'
        ))
        self.logger.addHandler(handler)
        AppLogger._agent_handler = handler
        self.info("[Agent] 追踪日志已启用")

    def disable_agent_trace(self):
        """关闭 Agent 追踪日志"""
        if AppLogger._agent_handler:
            self.logger.removeHandler(AppLogger._agent_handler)
            AppLogger._agent_handler = None

    @staticmethod
    def get_recent_logs(n: int = 10) -> list[str]:
        instance = AppLogger()
        handler = getattr(instance, '_capture_handler', None)
        if handler:
            return handler.get_recent(n)
        return []

    def debug(self, msg: str, *args, **kwargs):
        """记录调试信息"""
        self.logger.debug(msg, *args, **kwargs)

    def info(self, msg: str, *args, **kwargs):
        """记录一般信息"""
        self.logger.info(msg, *args, **kwargs)

    def warning(self, msg: str, *args, **kwargs):
        """记录警告信息"""
        self.logger.warning(msg, *args, **kwargs)

    def error(self, msg: str, *args, exc_info: bool = False, **kwargs):
        """记录错误信息"""
        self.logger.error(msg, *args, exc_info=exc_info, **kwargs)

    def critical(self, msg: str, *args, exc_info: bool = True, **kwargs):
        """记录严重错误"""
        self.logger.critical(msg, *args, exc_info=exc_info, **kwargs)


def get_logger() -> AppLogger:
    """获取日志实例的便捷函数"""
    return AppLogger()
