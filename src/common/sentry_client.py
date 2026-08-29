"""Sentry 远程错误上报客户端"""
import os

from common.logger import get_logger

logger = get_logger()

# Sentry DSN - 从环境变量读取，没有则不启用
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")

_HAS_SENTRY = False
_sentry_client = None

def init_sentry(dsn: str = ""):
    """初始化 Sentry"""
    global _sentry_client, _HAS_SENTRY, SENTRY_DSN

    dsn = dsn or SENTRY_DSN
    if not dsn:
        logger.info("Sentry 未配置（无 SENTRY_DSN），错误上报已禁用")
        return

    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=dsn,
            traces_sample_rate=0.1,  # 10% 采样
            environment="production" if not __debug__ else "development",
        )
        _HAS_SENTRY = True
        _sentry_client = sentry_sdk
        logger.info(f"Sentry 初始化成功 (DSN: {dsn[:20]}...)")
    except ImportError:
        logger.warning("sentry_sdk 未安装，错误上报已禁用")


def capture_exception(exc_info=None):
    """捕获异常"""
    global _HAS_SENTRY, _sentry_client
    if _HAS_SENTRY and _sentry_client:
        _sentry_client.capture_exception(exc_info)
        return True
    return False


def capture_message(message: str, level: str = "error"):
    """捕获消息"""
    global _HAS_SENTRY, _sentry_client
    if _HAS_SENTRY and _sentry_client:
        _sentry_client.capture_message(message, level=level)
        return True
    return False
