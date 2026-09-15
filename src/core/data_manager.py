"""数据管理核心模块 - 提供高性能的数据管理功能"""
from collections import OrderedDict
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
import json
import os
from pathlib import Path
import re
from threading import Lock
from typing import Any, Optional, cast
import uuid

from common.logger import get_logger
from config.constants import CACHE_SIZE, DATA_TYPE_PREFIXES, DATA_TYPES, SEARCH_CACHE_SIZE, THREAD_POOL_SIZE
from config.settings import get_config
from core.operation_log import OperationLog

_ID_DIGITS = re.compile(r'\d+')


@dataclass
class CacheEntry:
    """缓存条目数据类"""
    data: Any
    timestamp: float = field(default_factory=lambda: datetime.now().timestamp())
    access_count: int = 0


class OptimizedDataManager:
    """高性能数据管理器 - 包含缓存、异步加载、多线程支持"""

    def __init__(self, progress_callback: Optional[Callable] = None):
        """初始化数据管理器

        Args:
            progress_callback: 进度回调函数，签名为 (message: str, percent: int) -> None
        """
        self.logger = get_logger()
        self.config = get_config()
        self.progress_callback = progress_callback

        # 启动时先扫描所有库（确保 _libraries 已填充）
        lm = self.config.library_manager
        lm.scan_libraries()

        # 然后恢复上次活跃的库
        lm.restore_active_library()

        self.lock = Lock()

        # 数据存储 — 从类型模式动态初始化
        schema = self.config.get_type_schema()
        if schema:
            schema_keys = schema.plural_keys
        else:
            schema_keys = DATA_TYPES
        self.data: dict[str, list[dict[str, Any]]] = {
            key: [] for key in schema_keys
        }
        self.id_counters: dict[str, int] = {
            key: 1 for key in schema_keys
        }
        self._id_index: dict[str, dict[str, int]] = {
            key: {} for key in schema_keys
        }
        self.current_file: Optional[Path] = None

        # 缓存系统（OrderedDict 支持LRU淘汰）
        self.cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self.executor = ThreadPoolExecutor(max_workers=THREAD_POOL_SIZE)

        # 数据版本号 — 每次增删改自增，搜索缓存据此自动失效
        self._data_version: int = 0
        self._saved_version: int = 0
        self._search_cache: OrderedDict[tuple[str, str], tuple[int, list[dict[str, Any]]]] = OrderedDict()

        # 加载数据：优先从活跃库加载
        # 注意：不再回退到旧版default.json文件，因为现在始终有初始库
        active_file = self.config.active_data_file
        if active_file and active_file.exists():
            try:
                self._report_progress("正在加载数据...", 0)
                self.open_file(active_file)
                self._report_progress("数据加载完成", 100)
            except Exception as e:
                self.logger.error(f"无法加载库数据: {e}", exc_info=True)
        else:
            # 理论上不应该到达这里，因为library_manager会确保有活跃的初始库
            self.logger.warning("未找到活跃库的数据文件，将使用空数据初始化")
            self._report_progress("使用空数据初始化", 100)

    def get_active_library_name(self) -> str:
        """获取当前活跃库名称"""
        lm = self.config.library_manager
        return lm.active_library_name or "默认库"

    def reload_from_library(self) -> bool:
        """从当前活跃库重新加载数据（库切换后调用）"""
        from config.constants import reload_from_type_schema
        schema = self.config.get_type_schema()
        if schema:
            reload_from_type_schema(
                schema.plural_keys,
                schema.type_names,
                schema.type_plurals,
                {t.id: t.color for t in schema.types}
            )
        active_file = self.config.active_data_file
        if active_file and active_file.exists():
            return self.open_file(active_file)
        return False

    def _rebuild_id_index(self):
        """重建ID索引（数据加载或结构变更后调用）"""
        self._id_index = {key: {} for key in self.data}
        for key, items in self.data.items():
            if not isinstance(items, list):
                continue
            for idx, item in enumerate(items):
                if isinstance(item, dict):
                    item_id = item.get('id')
                    if item_id:
                        self._id_index[key][str(item_id)] = idx

    def _rebuild_index_and_counters(self):
        """重建ID索引和ID计数器（单次遍历，替代分开调用 _rebuild_id_index + update_id_counters）

        性能优化：将两次全量遍历合并为一次，减少 50% 开销。
        用于 open_file 的大数据集加载场景。
        """
        self._id_index = {key: {} for key in self.data}
        self.id_counters = {key: 1 for key in self.data}

        for key, items in self.data.items():
            if not isinstance(items, list):
                continue
            max_num = 0
            for idx, item in enumerate(items):
                if not isinstance(item, dict):
                    continue
                item_id = item.get('id')
                if not item_id:
                    continue
                # 索引：str(id) → 行号
                self._id_index[key][str(item_id)] = idx
                # 计数器：提取数字部分，跟踪最大值
                try:
                    num = self._parse_id_number(str(item_id))
                    if num > max_num:
                        max_num = num
                except (ValueError, TypeError):
                    continue
            self.id_counters[key] = max_num + 1

    def rebuild_data_structure(self):
        """类型模式变更后重建内部数据结构（保留已有数据）"""
        schema = self.config.get_type_schema()
        if not schema:
            return

        new_keys = schema.plural_keys

        old_data = dict(self.data)

        self.data = {key: [] for key in new_keys}
        self.id_counters = {key: 1 for key in new_keys}

        for t in schema.types:
            old_key_for_type = None
            for old_key in old_data:
                if old_key == t.plural_key:
                    old_key_for_type = old_key
                    break

            if old_key_for_type and old_key_for_type in old_data:
                self.data[t.plural_key] = old_data[old_key_for_type]
                max_id = 0
                for item in self.data[t.plural_key]:
                    iid = item.get("id", 0)
                    if isinstance(iid, int) and iid > max_id:
                        max_id = iid
                self.id_counters[t.plural_key] = max(max_id + 1, 1)

        self._invalidate_cache()
        self._data_version += 1
        self._rebuild_id_index()

    def _report_progress(self, message: str, percent: int):
        """报告进度

        Args:
            message: 进度消息
            percent: 进度百分比 (0-100)
        """
        if self.progress_callback:
            self.progress_callback(message, min(100, max(0, percent)))

    def _get_cache_key(self, data_type: str, item_id: str) -> str:
        """生成缓存键

        Args:
            data_type: 数据类型
            item_id: 项目ID

        Returns:
            缓存键字符串
        """
        return f"{data_type}_{item_id}"

    def _cache_item(self, data_type: str, item_id: str, item: dict[str, Any]):
        """缓存项目（LRU淘汰策略）

        Args:
            data_type: 数据类型
            item_id: 项目ID
            item: 项目数据
        """
        key = self._get_cache_key(data_type, item_id)
        with self.lock:
            if key in self.cache:
                # 已存在则移到末尾（最近访问）
                del self.cache[key]
            elif len(self.cache) >= CACHE_SIZE:
                # 淘汰最久未访问的（OrderedDict头部）
                oldest_key = next(iter(self.cache))
                del self.cache[oldest_key]
            self.cache[key] = CacheEntry(data=item.copy())

    def _get_cached_item(self, data_type: str, item_id: str) -> Optional[dict[str, Any]]:
        """获取缓存的项目（LRU：访问时移到末尾）

        Args:
            data_type: 数据类型
            item_id: 项目ID

        Returns:
            缓存的项目数据，如果不存在返回None
        """
        key = self._get_cache_key(data_type, item_id)
        with self.lock:
            if key in self.cache:
                entry = self.cache.pop(key)
                entry.access_count += 1
                entry.timestamp = datetime.now().timestamp()
                self.cache[key] = entry  # 重新插入到末尾（最近访问）
                return entry.data.copy()
        return None

    def _invalidate_cache(self, data_type: Optional[str] = None):
        """使缓存失效

        Args:
            data_type: 指定数据类型，如果为None则清除所有缓存
        """
        with self.lock:
            if data_type:
                keys_to_delete = [k for k in self.cache.keys() if k.startswith(f"{data_type}_")]
                for key in keys_to_delete:
                    del self.cache[key]
            else:
                self.cache.clear()

    def update_id_counters(self):
        """更新ID计数器"""
        self._report_progress("正在更新ID计数器...", 50)

        for key in list(self.data.keys()):
            self._sync_id_counter(key)

        self._report_progress("ID计数器更新完成", 100)

    def _sync_id_counter(self, data_type: str):
        """同步单个类型的ID计数器（删除后调用，避免全量扫描）"""
        items = self.data.get(data_type, [])
        if isinstance(items, list) and items:
            max_id = 0
            for item in items:
                try:
                    item_id_str = str(item.get('id', ''))
                    if not item_id_str:
                        continue
                    num = self._parse_id_number(item_id_str)
                    if num > max_id:
                        max_id = num
                except (ValueError, TypeError):
                    continue
            self.id_counters[data_type] = max_id + 1
        else:
            self.id_counters[data_type] = 1

    def _parse_id_number(self, id_str: str) -> int:
        if '_' in id_str:
            parts = id_str.split('_')
            if len(parts) >= 2:
                return int(parts[-1])
        match = _ID_DIGITS.search(id_str)
        if match:
            return int(match.group())
        raise ValueError(f"无法从 '{id_str}' 提取数字ID")

    def generate_id(self, data_type: str) -> str:
        """生成新的ID（线程安全）
        格式: 模块前缀 + 3位数字 (如 ROLE001, SKILL005)

        Args:
            data_type: 数据类型 (单数如 role / 复数如 roles 均可)

        Returns:
            新的ID字符串
        """
        from config.constants import DATA_TYPE_PLURALS

        prefix = DATA_TYPE_PREFIXES.get(data_type)
        if prefix is None:
            if data_type in DATA_TYPE_PLURALS:
                singular = DATA_TYPE_PLURALS[data_type]
            else:
                singular = None
                for k, v in DATA_TYPE_PLURALS.items():
                    if v == data_type:
                        singular = k
                        break
            prefix = DATA_TYPE_PREFIXES.get(singular) if singular else None
        if prefix is None:
            prefix = data_type[:2].upper()

        counter_keys_to_try = [data_type]
        if data_type in DATA_TYPE_PLURALS:
            counter_keys_to_try.append(DATA_TYPE_PLURALS[data_type])
        else:
            for k, v in DATA_TYPE_PLURALS.items():
                if v == data_type:
                    counter_keys_to_try.append(k)
                    break

        with self.lock:
            for ck in counter_keys_to_try:
                if ck in self.id_counters:
                    new_id = self.id_counters[ck]
                    self.id_counters[ck] += 1
                    return f"{prefix}{new_id:03d}"

        return f"{prefix}{uuid.uuid4().hex[:6].upper()}"

    def open_file(self, file_path: Path) -> bool:
        """打开数据文件（同步）

        Args:
            file_path: 文件路径

        Returns:
            是否成功打开
        """
        try:
            self._report_progress(f"正在加载文件: {file_path.name}...", 10)

            if not file_path.exists():
                self.logger.error(f"文件不存在: {file_path}")
                return False

            with open(file_path, encoding='utf-8') as f:
                temp_data = json.load(f)

            self._report_progress("验证数据格式...", 50)

            if not isinstance(temp_data, dict):
                self.logger.error("数据格式不正确，不是字典类型")
                return False

            schema = self.config.get_type_schema()
            schema_keys = [t.plural_key for t in schema.types] if schema else DATA_TYPES
            for key in schema_keys:
                if key not in temp_data:
                    temp_data[key] = []
                elif not isinstance(temp_data[key], list):
                    temp_data[key] = []

            self._report_progress("更新索引...", 80)

            self.data = temp_data
            self._clean_metadata_fields()
            self.current_file = file_path
            self._invalidate_cache()
            self._data_version += 1
            self._saved_version = self._data_version
            # 合并索引重建+计数器更新为单次遍历（减少 50% 全量扫描开销）
            self._rebuild_index_and_counters()

            self._report_progress("文件加载完成", 100)
            self.logger.info(f"成功加载文件: {file_path}")
            return True

        except json.JSONDecodeError as e:
            self.logger.error(f"JSON格式错误: {e}", exc_info=True)
            return False
        except PermissionError:
            self.logger.error(f"没有文件读取权限: {file_path}")
            return False
        except Exception as e:
            self.logger.error(f"无法打开文件: {e}", exc_info=True)
            return False

    def open_file_async(self, file_path: Path, callback: Optional[Callable[[bool], None]] = None) -> Future:
        """打开数据文件（异步）

        Args:
            file_path: 文件路径
            callback: 完成回调函数

        Returns:
            Future对象
        """
        future = self.executor.submit(self.open_file, file_path)
        if callback:
            future.add_done_callback(lambda f: callback(f.result()))
        return future

    def save_file(self, file_path: Optional[Path] = None) -> bool:
        """保存数据文件（同步，不发送进度回调）

        Args:
            file_path: 文件路径，如果为None则使用当前文件

        Returns:
            是否成功保存
        """
        if not file_path:
            file_path = self.current_file or self.config.active_data_file or self.config.default_file

        try:
            file_dir = file_path.parent
            if file_dir and not file_dir.exists():
                file_dir.mkdir(parents=True, exist_ok=True)

            self._clean_metadata_fields()

            temp_file = file_path.with_suffix(file_path.suffix + ".tmp")

            # 使用紧凑JSON格式（去除indent，减少文件大小和写入时间）
            with open(temp_file, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, ensure_ascii=False, separators=(',', ':'))

            # 原子替换
            os.replace(temp_file, file_path)

            self.current_file = file_path
            self._saved_version = self._data_version
            self.logger.info(f"成功保存文件: {file_path}")
            return True

        except Exception as e:
            self.logger.error(f"无法保存文件: {e}", exc_info=True)
            return False

    def save_file_async(self, file_path: Optional[Path] = None,
                        callback: Optional[Callable[[bool], None]] = None) -> Future:
        """保存数据文件（异步）

        Args:
            file_path: 文件路径
            callback: 完成回调函数

        Returns:
            Future对象
        """
        future = self.executor.submit(self.save_file, file_path)
        if callback:
            future.add_done_callback(lambda f: callback(f.result()))
        return future

    def get_item(self, data_type: str, item_id: str) -> Optional[dict[str, Any]]:
        """获取项目

        Args:
            data_type: 数据类型
            item_id: 项目ID

        Returns:
            项目数据，如果不存在返回None
        """
        cached = self._get_cached_item(data_type, item_id)
        if cached:
            return cached

        # 加锁读取索引+数据，避免与并发写操作产生竞态
        with self.lock:
            if data_type in self._id_index and item_id in self._id_index[data_type]:
                idx = self._id_index[data_type][item_id]
                items = self.data.get(data_type, [])
                if idx < len(items):
                    item = items[idx]
                    if item.get('id') == item_id:
                        # 缓存写入会再次获取锁，但 self.lock 是 Lock（不可重入），
                        # 因此先拷贝数据出锁外再缓存
                        item_copy = item.copy()
                    else:
                        item_copy = None
                else:
                    item_copy = None
            else:
                item_copy = None

        if item_copy is not None:
            self._cache_item(data_type, item_id, item_copy)
            return item_copy

        return None

    def add_item(self, data_type: str, item: dict[str, Any]) -> str:
        """添加项目

        Args:
            data_type: 数据类型
            item: 项目数据

        Returns:
            新项目的ID
        """
        if data_type not in self.data:
            self.data[data_type] = []

        item_id = item.get('id')
        if not item_id:
            item_id = self.generate_id(data_type)
            item['id'] = item_id

        with self.lock:
            self.data[data_type].append(item)
            self._data_version += 1
            self._id_index.setdefault(data_type, {})[item_id] = len(self.data[data_type]) - 1
        self._invalidate_cache(data_type)
        OperationLog.record("create", data_type, item_id,
                            item_name=item.get("name", "") or str(item_id),
                            before=None, after=item)
        self.logger.debug(f"添加项目: {data_type}/{item_id}")
        return item_id

    def update_item(self, data_type: str, item_id: str, item: dict[str, Any]) -> bool:
        if data_type not in self.data:
            return False

        type_index = self._id_index.get(data_type, {})
        idx = type_index.get(item_id)
        if idx is not None and 0 <= idx < len(self.data[data_type]):
            with self.lock:
                existing = self.data[data_type][idx]
                before_copy = existing.copy()
                existing.update(item)
                self.data[data_type][idx] = existing
                self._data_version += 1
                type_index[item_id] = idx
            self._invalidate_cache(data_type)
            OperationLog.record("update", data_type, item_id,
                                item_name=item.get("name", "") or str(item_id),
                                before=before_copy, after=existing)
            self.logger.debug(f"更新项目: {data_type}/{item_id}")
            return True
        return False

    def delete_item(self, data_type: str, item_id: str) -> bool:
        if data_type not in self.data:
            return False

        type_index = self._id_index.get(data_type, {})
        removed_idx = type_index.get(item_id)
        if removed_idx is None:
            return False

        with self.lock:
            # 二次确认索引仍然有效（防止并发删除导致索引偏移）
            if item_id not in self._id_index.get(data_type, {}):
                return False
            current_idx = self._id_index[data_type][item_id]
            # 验证索引处的数据确实匹配
            items_list = self.data[data_type]
            if current_idx >= len(items_list) or items_list[current_idx].get('id') != item_id:
                # 索引失效，重建索引后重试
                self._rebuild_id_index()
                new_idx = self._id_index.get(data_type, {}).get(item_id)
                if new_idx is None:
                    return False
                current_idx = new_idx

            before_item = self.data[data_type][current_idx].copy()
            self.data[data_type].pop(current_idx)
            # 重建该类型的索引（比手动调整更可靠，避免并发问题）
            self._id_index[data_type] = {}
            for idx, item in enumerate(self.data[data_type]):
                iid = item.get('id')
                if iid:
                    self._id_index[data_type][str(iid)] = idx
            self._data_version += 1

        self._invalidate_cache(data_type)
        self._sync_id_counter(data_type)
        OperationLog.record("delete", data_type, item_id,
                            item_name=before_item.get("name", "") or str(item_id),
                            before=before_item, after=None)
        self.logger.debug(f"删除项目: {data_type}/{item_id}")
        return True

    def search_items(self, data_type: str, query: str) -> list[dict[str, Any]]:
        """搜索项目（优化版：字段级索引 + 缓存）

        Args:
            data_type: 数据类型
            query: 搜索关键词

        Returns:
            匹配的项目列表
        """
        # 检查缓存（缓存读自身使用 lock，见 _get_cached_item 同款模式）
        cache_key = (data_type, query)
        with self.lock:
            if cache_key in self._search_cache:
                cached_version, cached_results = self._search_cache[cache_key]
                if cached_version == self._data_version:
                    self._search_cache.move_to_end(cache_key)
                    return cached_results

        # 加锁读取数据快照，避免与并发写操作产生竞态
        with self.lock:
            current_version = self._data_version
            if not query or data_type not in self.data:
                # 拷贝列表，避免外部修改影响内部数据
                results = [dict(item) for item in self.data.get(data_type, [])]
                # 缓存写入需要锁，但 Lock 不可重入，先退出当前 with 块
                snapshot_all = results
                snapshot_empty = True
            else:
                items_snapshot = list(self.data[data_type])
                snapshot_empty = False
                snapshot_all = None

        if snapshot_empty:
            with self.lock:
                # snapshot_empty 为 True 时 snapshot_all 必然是刚拷贝的列表，cast 仅为类型声明
                self._search_cache[cache_key] = (current_version, cast(list, snapshot_all))
                if len(self._search_cache) > SEARCH_CACHE_SIZE:
                    oldest = next(iter(self._search_cache))
                    del self._search_cache[oldest]
            return cast(list, snapshot_all)

        # 优化搜索：仅搜索关键字段，避免将整个字典转为字符串
        query_lower = query.lower()
        results = []

        # 定义优先搜索的关键字段（按重要性排序）
        key_fields = ['name', 'desc', 'description', 'title', 'content']

        for item in items_snapshot:
            matched = False

            # 首先搜索关键字段（快速路径）
            for fld in key_fields:
                if fld in item:
                    field_value = str(item[fld]).lower()
                    if query_lower in field_value:
                        matched = True
                        break

            # 如果关键字段未匹配，再搜索其他字段（慢速路径）
            if not matched:
                for fld, value in item.items():
                    if fld in key_fields:
                        continue  # 已搜索过
                    if isinstance(value, (str, int, float)):
                        if query_lower in str(value).lower():
                            matched = True
                            break

            if matched:
                results.append(item)

        # 更新缓存（LRU淘汰）
        with self.lock:
            if len(self._search_cache) >= SEARCH_CACHE_SIZE:
                oldest = next(iter(self._search_cache))
                del self._search_cache[oldest]
            self._search_cache[cache_key] = (self._data_version, results)
        return results

    def clear_search_cache(self):
        """清除搜索缓存"""
        self._search_cache.clear()

    def clear_all(self) -> bool:
        """清空所有数据

        Returns:
            是否成功清空
        """
        self._report_progress("正在清空数据...", 50)

        self.data = {
            key: [] for key in list(self.data.keys())
        }
        self.id_counters = {
            key: 0 for key in list(self.data.keys())
        }
        self._invalidate_cache()
        self._data_version += 1
        self._rebuild_id_index()

        self._report_progress("数据已清空", 100)
        self.logger.info("所有数据已清空")
        return True

    def __del__(self):
        """析构时确保资源释放"""
        self.close()

    def close(self):
        """关闭数据管理器，释放资源（线程安全）"""
        try:
            if self.current_file and self._has_unsaved_changes():
                self.logger.info("检测到未保存的更改，正在保存...")
                self.save_file()

            if hasattr(self, 'executor') and self.executor:
                self.executor.shutdown(wait=True, cancel_futures=True)
                self.logger.info("线程池已关闭")

            self._invalidate_cache()
            self.clear_search_cache()

            self.logger.info("数据管理器已安全关闭")
        except Exception as e:
            self.logger.error(f"关闭数据管理器时出错: {e}", exc_info=True)

    def shutdown(self):
        """兼容旧 API 的关闭方法"""
        self.close()

    def _has_unsaved_changes(self) -> bool:
        return self._data_version > self._saved_version

    def get_ceshu_path(self) -> Optional[Path]:
        """获取当前活跃库的策划书目录路径"""
        lm = self.config.library_manager
        active = lm.active_library
        if not active:
            return None
        return Path(active.path) / "ceshu"

    def _clean_metadata_fields(self):
        cleaned = 0
        for _key, items in self.data.items():
            if not isinstance(items, list):
                continue
            for item in items:
                if isinstance(item, dict):
                    for meta_key in ("_base_type",):
                        if meta_key in item:
                            del item[meta_key]
                            cleaned += 1
        if cleaned > 0:
            self.logger.info(f"已清理 {cleaned} 个内部元数据字段")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()
        return False
