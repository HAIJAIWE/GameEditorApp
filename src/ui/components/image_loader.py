"""图片加载组件 - 支持延迟加载和缓存"""
from concurrent.futures import ThreadPoolExecutor
import os

from PIL import Image
from PyQt6.QtCore import QObject, Qt, QThread, pyqtSignal
from PyQt6.QtGui import QImage, QPixmap
from PyQt6.QtWidgets import QLabel

from common.logger import get_logger
from ui.themes import theme_color

logger = get_logger()

class ImageLoadWorker(QThread):
    """图片加载工作线程"""

    loaded = pyqtSignal(str, QPixmap)
    error = pyqtSignal(str, str)

    def __init__(self, file_path, target_size=None):
        """初始化工作线程

        Args:
            file_path: 文件路径
            target_size: 目标大小
        """
        super().__init__()
        self.file_path = file_path
        self.target_size = target_size

    def run(self):
        """运行加载"""
        try:
            if not os.path.exists(self.file_path):
                self.error.emit(self.file_path, "文件不存在")
                return

            image = Image.open(self.file_path)
            image = image.convert("RGBA")

            if self.target_size:
                image.thumbnail((self.target_size.width(), self.target_size.height()), Image.Resampling.LANCZOS)

            data = image.tobytes("raw", "RGBA")
            qimage = QImage(data, image.width, image.height, QImage.Format.Format_RGBA8888)
            pixmap = QPixmap.fromImage(qimage)

            self.loaded.emit(self.file_path, pixmap)

        except Exception as e:
            self.error.emit(self.file_path, str(e))


class LazyImageLoader(QObject):
    """延迟加载图片的管理器"""

    MAX_CACHE_SIZE = 50
    MAX_CACHE_BYTES = 100 * 1024 * 1024  # 100MB 字节上限
    _instances = []
    _loaded_signal = pyqtSignal(str, object, object)

    def __init__(self):
        super().__init__()
        self.logger = get_logger()
        self.cache = {}
        self._cache_lru: list = []  # LRU 顺序（最近使用的在末尾）
        self._cache_sizes: dict = {}  # 每个缓存项的大致字节数
        self._total_cache_bytes = 0
        self.loading_workers = {}
        self.executor = ThreadPoolExecutor(max_workers=4)
        LazyImageLoader._instances.append(self)
        self._loaded_signal.connect(self._handle_loaded)

    def _load_image_data(self, file_path, target_size=None):
        """在工作线程中加载图片数据，返回 QImage（线程安全）

        Args:
            file_path: 文件路径
            target_size: 目标大小

        Returns:
            QImage 对象，或 None
        """
        if not os.path.exists(file_path):
            return None
        try:
            image = Image.open(file_path)
            image = image.convert("RGBA")

            if target_size:
                image.thumbnail((target_size.width(), target_size.height()), Image.Resampling.LANCZOS)

            data = image.tobytes("raw", "RGBA")
            qimage = QImage(data, image.width, image.height, QImage.Format.Format_RGBA8888)
            return qimage.copy()
        except Exception:
            self.logger.warning("图片加载失败")
            return None

    def get_image_sync(self, file_path, target_size=None):
        """同步获取图片

        Args:
            file_path: 文件路径
            target_size: 目标大小

        Returns:
            QPixmap对象
        """
        if file_path in self.cache:
            return self.cache[file_path]

        qimage = self._load_image_data(file_path, target_size)
        if qimage is None:
            return None

        pixmap = QPixmap.fromImage(qimage)
        self._add_to_cache(file_path, pixmap)
        return pixmap

    def get_image_async(self, file_path, callback, target_size=None):
        """异步获取图片

        Args:
            file_path: 文件路径
            callback: 回调函数
            target_size: 目标大小
        """
        if file_path in self.cache:
            # 缓存命中，更新 LRU 顺序
            if file_path in self._cache_lru:
                self._cache_lru.remove(file_path)
            self._cache_lru.append(file_path)
            callback(file_path, self.cache[file_path])
            return

        if file_path in self.loading_workers:
            return

        self.loading_workers[file_path] = True
        future = self.executor.submit(self._load_image_data, file_path, target_size)
        future.add_done_callback(
            lambda f: self._on_future_done(file_path, f, callback)
        )

    def _on_future_done(self, file_path, future, callback):
        """Future 完成回调（在工作线程中执行），通过信号切换到主线程"""
        try:
            qimage = future.result()
        except Exception:
            qimage = None
        self._loaded_signal.emit(file_path, qimage, callback)

    def _handle_loaded(self, file_path, qimage, callback):
        """处理加载完成（在主线程中执行）"""
        if file_path in self.loading_workers:
            del self.loading_workers[file_path]

        if qimage is not None:
            pixmap = QPixmap.fromImage(qimage)
            self._on_loaded(file_path, pixmap, callback)
        else:
            self._on_error(file_path, "加载失败", callback)

    def _on_loaded(self, file_path, pixmap, callback):
        """加载完成

        Args:
            file_path: 文件路径
            pixmap: 图片
            callback: 回调
        """
        self._add_to_cache(file_path, pixmap)
        callback(file_path, pixmap)

    def _on_error(self, file_path, error, callback):
        """加载错误

        Args:
            file_path: 文件路径
            error: 错误信息
            callback: 回调
        """
        self.logger.warning(f"图片加载失败: {file_path}, 错误: {error}")
        callback(file_path, None)

    def _add_to_cache(self, file_path, pixmap):
        """添加到缓存，带 LRU 淘汰 + 字节上限控制

        Args:
            file_path: 文件路径
            pixmap: 图片
        """
        # 估算图片内存占用 (RGBA: width * height * 4)
        size_estimate = pixmap.width() * pixmap.height() * 4

        # 如果已在缓存中，先移除旧记录
        if file_path in self.cache:
            if file_path in self._cache_lru:
                self._cache_lru.remove(file_path)
            self._total_cache_bytes -= self._cache_sizes.get(file_path, 0)
            del self._cache_sizes[file_path]

        # LRU 淘汰：按字节上限淘汰最久未使用的项
        while (self._total_cache_bytes + size_estimate > self.MAX_CACHE_BYTES
               and len(self._cache_lru) > 0):
            oldest = self._cache_lru.pop(0)
            if oldest in self.cache:
                self._total_cache_bytes -= self._cache_sizes.get(oldest, 0)
                del self.cache[oldest]
                del self._cache_sizes[oldest]
                self.logger.debug(f"[Cache] LRU淘汰: {oldest}")

        # 同时保留条数上限保护（防止大量极小图片撑爆 LRU 列表）
        while len(self.cache) >= self.MAX_CACHE_SIZE and len(self._cache_lru) > 0:
            oldest = self._cache_lru.pop(0)
            if oldest in self.cache:
                self._total_cache_bytes -= self._cache_sizes.get(oldest, 0)
                del self.cache[oldest]
                del self._cache_sizes[oldest]

        self.cache[file_path] = pixmap
        self._cache_lru.append(file_path)
        self._cache_sizes[file_path] = size_estimate
        self._total_cache_bytes += size_estimate
        self.logger.debug(f"[Cache] 添加: {file_path} ({size_estimate / 1024:.0f}KB, "
                          f"总计: {self._total_cache_bytes / 1024 / 1024:.1f}MB)")

    def clear_cache(self):
        """清空缓存"""
        self.cache.clear()
        self._cache_lru.clear()
        self._cache_sizes.clear()
        self._total_cache_bytes = 0

    def shutdown(self):
        self.loading_workers.clear()
        self.executor.shutdown(wait=False)

    @classmethod
    def shutdown_all(cls):
        for instance in list(cls._instances):
            try:
                instance.shutdown()
            except Exception:
                logger.exception("图片处理线程清理异常")
        cls._instances.clear()


class LazyImageLabel(QLabel):
    """延迟加载功能的图片标签"""

    def __init__(self, parent=None, placeholder_text="无图片"):
        """初始化标签

        Args:
            parent: 父组件
            placeholder_text: 占位文本
        """
        super().__init__(parent)
        self.placeholder_text = placeholder_text
        self.current_path = None
        self.target_size = None
        self.loader = LazyImageLoader()

        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setStyleSheet(f"background-color: {theme_color('input_bg')}; border: 1px solid {theme_color('border')};")
        self.setText(placeholder_text)
        self.setMinimumSize(100, 100)

    def set_target_size(self, size):
        """设置目标大小

        Args:
            size: 目标大小
        """
        self.target_size = size
        self.setMinimumSize(size)

    def load_image(self, file_path):
        """加载图片

        Args:
            file_path: 文件路径
        """
        if not file_path or not os.path.exists(file_path):
            self.setText(self.placeholder_text)
            self.current_path = None
            return

        if file_path == self.current_path:
            return

        self.current_path = file_path
        self.setText("加载中...")

        self.loader.get_image_async(
            file_path,
            self._on_image_loaded,
            self.target_size
        )

    def _on_image_loaded(self, file_path, pixmap):
        """图片加载完成

        Args:
            file_path: 文件路径
            pixmap: 图片
        """
        if file_path != self.current_path:
            return

        if pixmap:
            self.setPixmap(pixmap)
            self.setStyleSheet("border: 1px solid #ccc;")
        else:
            self.setText("加载失败")

    def clear(self):
        """清空图片"""
        self.current_path = None
        self.setText(self.placeholder_text)
        self.setStyleSheet(f"background-color: {theme_color('input_bg')}; border: 1px solid {theme_color('border')};")
