"""游戏数据编辑器 - 墨白启动器

应用程序入口
"""
import faulthandler
import sys
import traceback

from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import QApplication, QMessageBox

# 设置 Windows 控制台 UTF-8 编码（集中管理，避免副作用）
if sys.platform == 'win32':
    import io as _io
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    if hasattr(sys.stderr, 'buffer'):
        sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 捕获 segfault 到文件（Qt C++ 层崩溃也留记录）
import os

_crash_log = os.path.join(os.path.dirname(__file__), "logs", "crash.log")
os.makedirs(os.path.dirname(_crash_log), exist_ok=True)
_crash_fd = os.open(_crash_log, os.O_WRONLY | os.O_CREAT | os.O_APPEND)
faulthandler.enable(file=_crash_fd)

# 捕获 Python 异常（包括 Qt slot 里被吞的）
def _excepthook(exc_type, exc_value, exc_tb):
    with open(_crash_log, "a") as f:
        f.write("\n=== Unhandled Python exception ===\n")
        traceback.print_exception(exc_type, exc_value, exc_tb, file=f)
        f.write("=== End exception ===\n")
    traceback.print_exception(exc_type, exc_value, exc_tb)
sys.excepthook = _excepthook

from common import get_logger
from common.sentry_client import capture_exception, init_sentry
from ui import MainWindow


def main():
    """应用程序主函数"""
    logger = get_logger()
    logger.info("Starting Game Editor App...")

    from PyQt6.QtWidgets import QStyleFactory

    app = QApplication(sys.argv)
    app.setStyle(QStyleFactory.create("Fusion"))
    app.setApplicationName("墨白启动器")
    app.setApplicationVersion("4.0.0")

    font = QFont("Microsoft YaHei", 10)
    app.setFont(font)

    window = None
    try:
        window = MainWindow()
        window.show()
        logger.info("App started successfully!")
        exit_code = app.exec()
        logger.info(f"App closed with exit code: {exit_code}")
        sys.exit(exit_code)
    except Exception as e:
        error_detail = traceback.format_exc()
        logger.critical(f"应用程序启动失败: {error_detail}")
        capture_exception()
        QMessageBox.critical(
            None,
            "启动失败",
            f"应用程序启动时发生错误：\n\n{e}\n\n详细信息已写入日志文件。"
        )
        sys.exit(1)


init_sentry()

if __name__ == "__main__":
    main()
