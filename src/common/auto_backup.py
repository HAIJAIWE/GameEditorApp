from common.logger import get_logger

logger = get_logger()

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
import json
import logging
from pathlib import Path
import threading
import time
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class BackupEntry:
    timestamp: float
    file_path: str
    size_bytes: int
    label: str = ""


class AutoBackup:
    _instance: Optional[AutoBackup] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._backup_dir: Optional[Path] = None
        self._max_backups: int = 20
        self._interval_seconds: int = 300
        self._timer: Optional[threading.Timer] = None
        self._running: bool = False
        self._data_provider: Optional[Callable[[], dict]] = None
        self._on_recovery_found: Optional[Callable[[dict], None]] = None
        self._backups: list[BackupEntry] = []

    def configure(
        self,
        backup_dir: str,
        data_provider: Callable[[], dict],
        on_recovery_found: Optional[Callable[[dict], None]] = None,
        interval_seconds: int = 300,
        max_backups: int = 20,
    ):
        self._backup_dir = Path(backup_dir)
        self._backup_dir.mkdir(parents=True, exist_ok=True)
        self._interval_seconds = interval_seconds
        self._max_backups = max_backups
        self._data_provider = data_provider
        self._on_recovery_found = on_recovery_found
        self._load_existing_backups()
        logger.info("自动备份已配置: %s, 间隔=%ds, 上限=%d",
                     self._backup_dir, interval_seconds, max_backups)

    def start(self):
        if self._running:
            return
        self._running = True
        self._schedule_next()
        logger.info("自动备份已启动")

    def stop(self):
        self._running = False
        if self._timer:
            self._timer.cancel()
            self._timer = None
        logger.info("自动备份已停止")

    def _schedule_next(self):
        if not self._running:
            return
        self._timer = threading.Timer(self._interval_seconds, self._on_tick)
        self._timer.daemon = True
        self._timer.start()

    def _on_tick(self):
        self.backup()
        self._schedule_next()

    def backup(self, label: str = "") -> Optional[str]:
        if not self._data_provider or not self._backup_dir:
            logger.warning("自动备份未配置, 跳过")
            return None
        try:
            data = self._data_provider()
            timestamp = time.time()
            ts_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"backup_{ts_str}.json"
            if label:
                filename = f"backup_{ts_str}_{label}.json"
            filepath = self._backup_dir / filename

            content = json.dumps(data, ensure_ascii=False, indent=2)
            from common.common import atomic_write_text
            atomic_write_text(filepath, content, encoding="utf-8")
            size = len(content.encode("utf-8"))

            entry = BackupEntry(
                timestamp=timestamp, file_path=str(filepath),
                size_bytes=size, label=label
            )
            self._backups.append(entry)
            self._rotate()
            logger.info("备份完成: %s (%d bytes)", filename, size)
            return str(filepath)
        except Exception as e:
            logger.error("备份失败: %s", e)
            return None

    def _rotate(self):
        while len(self._backups) > self._max_backups:
            oldest = self._backups.pop(0)
            try:
                Path(oldest.file_path).unlink(missing_ok=True)
            except Exception as e:
                logger.warning("清理旧备份失败: %s", e)

    def _load_existing_backups(self):
        if not self._backup_dir:
            return
        self._backups.clear()
        for f in sorted(self._backup_dir.glob("backup_*.json")):
            try:
                stat = f.stat()
                self._backups.append(BackupEntry(
                    timestamp=stat.st_mtime,
                    file_path=str(f),
                    size_bytes=stat.st_size,
                ))
            except Exception as e:
                logger.warning(f"操作失败: {e}")

    def list_backups(self) -> list[dict]:
        return [
            {
                "timestamp": b.timestamp,
                "label": b.label,
                "size_kb": round(b.size_bytes / 1024, 1),
                "time_str": datetime.fromtimestamp(b.timestamp).strftime("%Y-%m-%d %H:%M:%S"),
                "file": b.file_path,
            }
            for b in sorted(self._backups, key=lambda x: x.timestamp, reverse=True)
        ]

    def get_latest_backup(self) -> Optional[dict]:
        if not self._backups:
            return None
        latest = max(self._backups, key=lambda b: b.timestamp)
        try:
            content = Path(latest.file_path).read_text(encoding="utf-8")
            return json.loads(content)
        except Exception as e:
            logger.error("读取最新备份失败: %s", e)
            return None

    def recover_latest(self) -> bool:
        data = self.get_latest_backup()
        if data is None:
            logger.warning("没有可恢复的备份")
            return False
        if self._on_recovery_found:
            try:
                self._on_recovery_found(data)
                logger.info("数据已从备份恢复")
                return True
            except Exception as e:
                logger.error("恢复回调执行失败: %s", e)
                return False
        return False

    def check_crash_recovery(self) -> Optional[dict]:
        if not self._backup_dir:
            return None
        crash_flag = self._backup_dir / ".crash_pending"
        if crash_flag.exists():
            logger.warning("检测到上次异常退出，尝试恢复...")
            crash_flag.unlink()
            return self.get_latest_backup()
        crash_flag.write_text(str(int(time.time())))
        return None

    def mark_clean_exit(self):
        if self._backup_dir:
            crash_flag = self._backup_dir / ".crash_pending"
            crash_flag.unlink(missing_ok=True)

    def clear_all(self):
        self._backups.clear()
        if self._backup_dir:
            for f in self._backup_dir.glob("backup_*.json"):
                f.unlink(missing_ok=True)
        logger.info("所有备份已清除")


def get_auto_backup() -> AutoBackup:
    return AutoBackup()
