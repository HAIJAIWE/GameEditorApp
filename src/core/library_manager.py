"""库管理器：管理多个游戏项目库"""
from dataclasses import dataclass
from datetime import datetime
import json
import os
from pathlib import Path
import shutil
from typing import Optional

from common.logger import get_logger
from config.constants import DEFAULT_FILENAME, SCHEMA_FILENAME
from core.type_schema import TypeSchema, create_default_rpg_schema

INITIAL_LIBRARY_NAME = "初始库"

logger = get_logger()


@dataclass
class LibraryInfo:
    name: str
    path: Path
    created_at: str = ""
    description: str = ""
    data_count: int = 0
    is_initial: bool = False

    @property
    def can_delete(self) -> bool:
        return not self.is_initial

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "path": str(self.path),
            "created_at": self.created_at,
            "description": self.description,
            "data_count": self.data_count,
            "is_initial": self.is_initial,
        }

    @classmethod
    def from_dict(cls, data: dict) -> LibraryInfo:
        return cls(
            name=data["name"],
            path=Path(data["path"]),
            created_at=data.get("created_at", ""),
            description=data.get("description", ""),
            data_count=data.get("data_count", 0),
            is_initial=data.get("is_initial", False),
        )


class LibraryManager:
    def __init__(self, base_dir: Path):
        self.base_dir = Path(base_dir)
        self.libraries_dir = self.base_dir / "libraries"
        self.libraries_dir.mkdir(parents=True, exist_ok=True)
        self._active_library: Optional[LibraryInfo] = None
        self._libraries: dict[str, LibraryInfo] = {}
        self._type_schemas: dict[str, TypeSchema] = {}
        self._cached_default_schema = None
        self._last_scan_mtime = 0

    @property
    def active_library(self) -> Optional[LibraryInfo]:
        return self._active_library

    @property
    def active_library_name(self) -> str:
        return self._active_library.name if self._active_library else ""

    @property
    def active_planning_dir(self) -> Optional[Path]:
        """获取活跃库的策划案目录"""
        if self._active_library:
            return Path(self._active_library.path) / "planning"
        return None

    def get_type_schema(self, library_name: str = None) -> Optional[TypeSchema]:
        """获取库的类型模式"""
        name = library_name or self.active_library_name
        if not name:
            return None
        if name not in self._type_schemas:
            lib = self._libraries.get(name)
            if lib:
                schema_path = Path(lib.path) / SCHEMA_FILENAME
            else:
                schema_path = self.libraries_dir / name / SCHEMA_FILENAME
            schema = TypeSchema.load(schema_path)
            if schema:
                self._type_schemas[name] = schema
            return schema
        return self._type_schemas[name]

    def get_active_type_schema(self) -> Optional[TypeSchema]:
        return self.get_type_schema()

    def reload_type_schema(self, library_name: str = None):
        """强制重新加载类型模式（类型编辑器修改后调用），并同步全局常量"""
        name = library_name or self.active_library_name
        if name in self._type_schemas:
            del self._type_schemas[name]
        # 重新加载后同步更新全局常量，确保 DATA_TYPES 等与磁盘一致
        schema = self.get_type_schema(name)
        if schema is not None:
            from config.constants import reload_from_type_schema
            reload_from_type_schema(
                schema.plural_keys,
                schema.type_names,
                schema.type_plurals,
                {t.id: t.color for t in schema.types}
            )
            # 通知观察者 schema 已变更
            try:
                from common.event_bus import EventBus
                EventBus().emit("schema_changed", schema=schema, library_name=name)
            except Exception as e:
                logger.warning(f"操作失败: {e}")

    def set_type_schema(self, schema: TypeSchema, library_name: str = None) -> None:
        """更新内存缓存的类型模式（用于动态注册新类型后）

        Args:
            schema: 新的 TypeSchema 实例
            library_name: 库名（默认活跃库）
        """
        name = library_name or self.active_library_name
        if not name:
            return
        self._type_schemas[name] = schema
        # 同步全局常量
        from config.constants import reload_from_type_schema
        reload_from_type_schema(
            schema.plural_keys,
            schema.type_names,
            schema.type_plurals,
            {t.id: t.color for t in schema.types}
        )
        # 通知观察者 schema 已变更
        try:
            from common.event_bus import EventBus
            EventBus().emit("schema_changed", schema=schema, library_name=name)
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def scan_libraries(self, force: bool = False):
        """扫描所有库目录。

        增量优化：通过 _last_scan_mtime 跟踪 libraries_dir 的修改时间，
        若 mtime 未变且已有缓存数据，则跳过重扫，避免高频调用时的重复 IO。

        Args:
            force: True 时强制重新扫描（用于库创建/删除/重命名后）
        """
        if not self.libraries_dir.exists():
            self.libraries_dir.mkdir(parents=True, exist_ok=True)

        # 增量扫描：mtime 未变 + 已有库数据 + 非强制 → 跳过
        try:
            current_mtime = int(self.libraries_dir.stat().st_mtime)
        except OSError:
            current_mtime = 0
        if not force and self._libraries and current_mtime == self._last_scan_mtime:
            return

        self._libraries.clear()

        if self._cached_default_schema is None:
            self._cached_default_schema = create_default_rpg_schema()
        latest_schema = self._cached_default_schema

        for lib_dir in self.libraries_dir.iterdir():
            if lib_dir.is_dir() and (lib_dir / DEFAULT_FILENAME).exists():
                info = self._load_library_info(lib_dir)
                if info:
                    if info.name == INITIAL_LIBRARY_NAME:
                        info.is_initial = True
                    self._libraries[info.name] = info

                    # 自动检查并升级该库的schema
                    self._upgrade_library_schema(lib_dir, info.name, latest_schema)

        if not self._libraries:
            self._ensure_initial_library()

        # 确保有活跃库：如果没有活跃库，自动激活初始库
        if not self._active_library and INITIAL_LIBRARY_NAME in self._libraries:
            self.switch_library(INITIAL_LIBRARY_NAME, persist=False)
            get_logger().info(f"已自动激活初始库: {INITIAL_LIBRARY_NAME}")

        # 更新扫描时间戳（仅在扫描完成后，避免半完成状态被后续跳过）
        self._last_scan_mtime = current_mtime

    def _upgrade_library_schema(self, lib_dir: Path, lib_name: str, latest_schema: TypeSchema):
        """检查并升级单个库的schema到最新版本

        Args:
            lib_dir: 库目录路径
            lib_name: 库名称
            latest_schema: 最新的schema定义（来自代码）
        """
        schema_path = lib_dir / SCHEMA_FILENAME

        try:
            # 加载当前库的schema
            current_schema = TypeSchema.load(schema_path)

            if current_schema is None:
                # 没有schema文件，直接使用最新版本
                latest_schema.save(schema_path)
                self._type_schemas[lib_name] = latest_schema
                get_logger().info(f"库「{lib_name}」已创建新的schema文件 (v{latest_schema.version})")
                return

            # 检查是否需要升级
            if current_schema.needs_upgrade(latest_schema):
                old_version = current_schema.version
                old_types = set(current_schema.type_ids)

                # 执行合并（保留用户自定义字段）
                changed = current_schema.merge_with(latest_schema)

                if changed:
                    new_types = set(current_schema.type_ids)
                    added_types = new_types - old_types

                    # 保存更新后的schema
                    current_schema.save(schema_path)

                    # 更新内存中的缓存
                    self._type_schemas[lib_name] = current_schema

                    # 为新增类型初始化数据文件中的空数组
                    if added_types:
                        self._add_new_type_data(lib_dir, current_schema, added_types)

                    get_logger().info(
                        f"库「{lib_name}」schema已从 v{old_version} 升级到 v{current_schema.version}"
                        + (f"，新增类型: {added_types}" if added_types else "")
                    )
                else:
                    # 即使没有变化，也更新缓存
                    self._type_schemas[lib_name] = current_schema
            else:
                # 不需要升级，直接缓存
                self._type_schemas[lib_name] = current_schema

        except Exception as e:
            get_logger().error(f"升级库「{lib_name}」schema失败: {e}")

    def _add_new_type_data(self, lib_dir: Path, schema: TypeSchema, new_type_ids: set):
        """为新增的数据类型在数据文件中初始化空数组

        Args:
            lib_dir: 库目录
            schema: 更新后的schema
            new_type_ids: 新增的类型ID集合
        """
        data_file = lib_dir / DEFAULT_FILENAME

        try:
            with open(data_file, encoding='utf-8') as f:
                data = json.load(f)

            modified = False
            for type_id in new_type_ids:
                type_def = schema.get_type(type_id)
                if type_def and type_def.plural_key not in data:
                    data[type_def.plural_key] = []
                    modified = True
                    get_logger().debug(f"  已为库添加空数据数组: {type_def.plural_key}")

            if modified:
                with open(data_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)

        except Exception as e:
            get_logger().error(f"初始化新类型数据失败: {e}")

    def _load_library_info(self, lib_dir: Path) -> Optional[LibraryInfo]:
        try:
            data_count = 0
            info_data = {
                "name": lib_dir.name,
                "path": str(lib_dir),
                "created_at": "",
                "description": "",
                "data_count": 0,
            }

            info_file = lib_dir / "library.json"
            if info_file.exists():
                with open(info_file, encoding="utf-8") as f:
                    saved = json.load(f)
                info_data.update(saved)
                # 路径始终以实际目录为准，避免 library.json 中遗留的过时绝对路径
                info_data["path"] = str(lib_dir)
                data_count = saved.get("data_count", 0)

            if data_count <= 0:
                data_file = lib_dir / DEFAULT_FILENAME
                if data_file.exists():
                    try:
                        with open(data_file, encoding="utf-8") as f:
                            data = json.load(f)
                        data_count = sum(len(v) for k, v in data.items()
                                         if isinstance(v, list) and k != "metadata")
                    except Exception as e:
                        logger.warning(f"操作失败: {e}")
                info_data["data_count"] = data_count

            return LibraryInfo.from_dict(info_data)
        except Exception as e:
            get_logger().warning(f"读取库信息失败: {lib_dir} — {e}")
            return None

    def save_library_info(self, library: LibraryInfo):
        info_file = Path(library.path) / "library.json"
        with open(info_file, "w", encoding="utf-8") as f:
            json.dump(library.to_dict(), f, ensure_ascii=False, indent=2)

    def _ensure_initial_library(self):
        if INITIAL_LIBRARY_NAME in self._libraries:
            return
        lib = self.create_library(INITIAL_LIBRARY_NAME, "默认初始库，不可删除")
        if lib:
            lib.is_initial = True
            self.save_library_info(lib)
            get_logger().info(f"已自动创建初始库: {INITIAL_LIBRARY_NAME}")

            # 为初始库填充示例数据
            self._populate_sample_data(lib)

            # 创建后立即激活
            if not self._active_library:
                self.switch_library(INITIAL_LIBRARY_NAME, persist=False)
                get_logger().info(f"已自动激活初始库: {INITIAL_LIBRARY_NAME}")

    def _populate_sample_data(self, library: LibraryInfo):
        """为初始库填充示例数据（样本数据定义见 data.sample_data.py）"""
        lib_dir = Path(library.path)
        data_file = lib_dir / DEFAULT_FILENAME

        try:
            with open(data_file, encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            get_logger().error(f"读取初始库数据失败: {e}")
            return

        try:
            from data.sample_data import SAMPLE_DATA
            # 覆盖各数据类型的示例内容，其余元数据键保持不变
            data.update(SAMPLE_DATA)

            with open(data_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            library.data_count = sum(
                len(v) for k, v in data.items() if isinstance(v, list) and k != "metadata"
            )
            self.save_library_info(library)
            get_logger().info(f"已为初始库填充示例数据，共{library.data_count}条记录")

            # 创建示例策划案文档
            self._create_sample_planning_docs(lib_dir)

        except Exception as e:
            get_logger().error(f"写入示例数据失败: {e}")


    def _create_sample_planning_docs(self, lib_dir: Path):
        """创建示例策划案文档（内容定义见 data.sample_data.py）"""
        planning_dir = lib_dir / "planning"
        planning_docs_file = planning_dir / "planning_docs_v3.json"

        try:
            from data.sample_data import SAMPLE_PLANNING_DOCS
            sample_docs = SAMPLE_PLANNING_DOCS

            planning_dir.mkdir(parents=True, exist_ok=True)
            with open(planning_docs_file, 'w', encoding='utf-8') as f:
                json.dump(sample_docs, f, ensure_ascii=False, indent=2)
            get_logger().info(f"已创建{len(sample_docs)}个示例策划案文档")

        except Exception as e:
            get_logger().error(f"创建示例策划案失败: {e}")


    def create_library(self, name: str, description: str = "") -> Optional[LibraryInfo]:
        lib_dir = self.libraries_dir / name
        if lib_dir.exists():
            get_logger().warning(f"库 '{name}' 已存在")
            return None

        lib_dir.mkdir(parents=True, exist_ok=True)
        (lib_dir / "planning").mkdir(parents=True, exist_ok=True)

        schema = create_default_rpg_schema()

        initial_data = {"metadata": {"library": name, "created_at": datetime.now().isoformat()}}
        for t in schema.types:
            initial_data[t.plural_key] = []

        with open(lib_dir / DEFAULT_FILENAME, "w", encoding="utf-8") as f:
            json.dump(initial_data, f, ensure_ascii=False, indent=2)

        schema_path = lib_dir / SCHEMA_FILENAME
        schema.save(schema_path)
        self._type_schemas[name] = schema

        info = LibraryInfo(
            name=name,
            path=lib_dir,
            created_at=datetime.now().strftime("%Y-%m-%d %H:%M"),
            description=description,
            data_count=0,
        )
        self.save_library_info(info)
        self._libraries[name] = info
        return info

    def switch_library(self, name: str, persist: bool = True) -> bool:
        if name not in self._libraries:
            self.scan_libraries(force=True)
        if name not in self._libraries:
            return False
        self._active_library = self._libraries[name]
        if name not in self._type_schemas:
            self.get_type_schema(name)
        if persist:
            self._save_active_library()
        return True

    def _save_active_library(self):
        """持久化记录当前活跃库"""
        state_file = self.libraries_dir / ".active_library"
        try:
            if self._active_library:
                state_file.write_text(self._active_library.name, encoding="utf-8")
            elif state_file.exists():
                state_file.unlink()
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def restore_active_library(self) -> bool:
        """启动时恢复上次活跃的库；若目标库已不存在，回退到初始库"""
        state_file = self.libraries_dir / ".active_library"
        if not state_file.exists():
            return False
        try:
            name = state_file.read_text(encoding="utf-8").strip()
            if name and self.switch_library(name, persist=False):
                return True
            # 目标库已被删除（如手动清理测试残留），回退到初始库避免"无活跃库"
            if name and self.switch_library(INITIAL_LIBRARY_NAME, persist=False):
                logger.warning(f"上次活跃库 {name!r} 不存在，已回退到 {INITIAL_LIBRARY_NAME}")
                return True
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        return False

    def get_all_libraries(self) -> list[LibraryInfo]:
        self.scan_libraries(force=True)
        return list(self._libraries.values())

    def get_data_path(self) -> Optional[Path]:
        if not self._active_library:
            return None
        return Path(self._active_library.path) / DEFAULT_FILENAME

    def ensure_ceshu_dir(self) -> Optional[Path]:
        """确保当前活跃库的策划书目录存在"""
        if not self._active_library:
            return None
        ceshu_dir = Path(self._active_library.path) / "ceshu"
        ceshu_dir.mkdir(parents=True, exist_ok=True)
        return ceshu_dir

    def get_schema_path(self) -> Optional[Path]:
        if not self._active_library:
            return None
        return Path(self._active_library.path) / SCHEMA_FILENAME

    def rename_library(self, name: str, new_name: str) -> bool:
        if new_name in self._libraries or name not in self._libraries:
            return False
        lib = self._libraries[name]
        new_dir = self.libraries_dir / new_name
        try:
            shutil.move(str(lib.path), str(new_dir))
            lib.name = new_name
            lib.path = new_dir
            del self._libraries[name]
            self._libraries[new_name] = lib
            self.save_library_info(lib)
            if new_name in self._type_schemas:
                del self._type_schemas[new_name]
            if self._active_library and self._active_library.name == name:
                self._active_library = lib
            return True
        except Exception as e:
            get_logger().error(f"重命名库失败: {e}")
            return False

    def delete_library(self, name: str) -> bool:
        if name not in self._libraries:
            get_logger().error(f"库 '{name}' 不存在于管理器中")
            return False
        lib = self._libraries[name]

        # 检查是否是初始库，初始库不可删除
        if lib.is_initial:
            get_logger().warning(f"尝试删除初始库 '{name}'，操作被拒绝")
            return False

        lib_path = Path(lib.path)

        if not lib_path.exists():
            get_logger().warning(f"库路径不存在: {lib_path}")
            del self._libraries[name]
            if name in self._type_schemas:
                del self._type_schemas[name]
            if self._active_library and self._active_library.name == name:
                self._active_library = None
                self._save_active_library()
            return True

        try:
            # Windows: 强制删除只读文件
            import stat
            for root, dirs, files in os.walk(lib_path):
                for fname in files:
                    fp = Path(root) / fname
                    try:
                        fp.chmod(stat.S_IWRITE)
                    except Exception as e:
                        logger.warning(f"操作失败: {e}")
                for dname in dirs:
                    dp = Path(root) / dname
                    try:
                        dp.chmod(stat.S_IWRITE)
                    except Exception as e:
                        logger.warning(f"操作失败: {e}")

            shutil.rmtree(lib_path, onerror=lambda func, path, exc_info: None)

            # 验证删除是否成功
            if lib_path.exists():
                get_logger().error(f"删除库失败: 文件夹仍存在 {lib_path}")
                return False

            del self._libraries[name]
            if name in self._type_schemas:
                del self._type_schemas[name]
            if self._active_library and self._active_library.name == name:
                self._active_library = None
                self._save_active_library()
            return True
        except Exception as e:
            get_logger().error(f"删除库失败: {e}")
            return False

    def migrate_legacy_library(self, name: str) -> bool:
        """为未配有 type_schema.json 的旧库自动生成模式文件（向后兼容）"""
        if name not in self._libraries:
            return False
        lib = self._libraries[name]
        schema_path = Path(lib.path) / SCHEMA_FILENAME
        if schema_path.exists():
            return True

        schema = create_default_rpg_schema()
        try:
            schema.save(schema_path)
            self._type_schemas[name] = schema
            get_logger().info(f"已为库 '{name}' 自动生成 type_schema.json")
            return True
        except Exception as e:
            get_logger().error(f"迁移库 '{name}' 失败: {e}")
            return False

    def force_upgrade_all_schemas(self) -> dict[str, bool]:
        """强制升级所有库的schema到最新版本（用于手动触发或热更新）

        Returns:
            Dict[str, bool]: 库名称 -> 是否成功升级
        """
        results = {}
        latest_schema = create_default_rpg_schema()

        for lib_name, lib in self._libraries.items():
            lib_dir = Path(lib.path)
            try:
                self._upgrade_library_schema(lib_dir, lib_name, latest_schema)
                results[lib_name] = True
            except Exception as e:
                get_logger().error(f"强制升级库「{lib_name}」失败: {e}")
                results[lib_name] = False

        upgraded_count = sum(1 for v in results.values() if v)
        get_logger().info(f"Schema强制升级完成：{upgraded_count}/{len(results)} 个库成功")
        return results

    def prepare_active_schema(self) -> Optional[TypeSchema]:
        """准备活跃库的类型模式，必要时自动迁移"""
        if not self._active_library:
            return None
        name = self._active_library.name
        schema = self.get_type_schema(name)
        if schema is None:
            self.migrate_legacy_library(name)
            schema = self.get_type_schema(name)
        return schema

    def copy_data_from_library(self, source_name: str, target_name: str,
                                include_planning: bool = True) -> dict:
        """将源库的游戏数据和策划方案复制/追加到目标库

        Args:
            source_name: 源库名称
            target_name: 目标库名称
            include_planning: 是否同时复制策划方案

        Returns:
            dict: {"success": bool, "data_count": int, "docs_count": int, "error": str}
        """
        result = {"success": False, "data_count": 0, "docs_count": 0, "error": ""}

        if source_name not in self._libraries:
            result["error"] = f"源库「{source_name}」不存在"
            return result
        if target_name not in self._libraries:
            result["error"] = f"目标库「{target_name}」不存在"
            return result

        source_lib = self._libraries[source_name]
        target_lib = self._libraries[target_name]
        source_data_file = Path(source_lib.path) / DEFAULT_FILENAME
        target_data_file = Path(target_lib.path) / DEFAULT_FILENAME

        if not source_data_file.exists():
            result["error"] = f"源库「{source_name}」没有数据文件"
            return result

        try:
            source_data = json.loads(source_data_file.read_text(encoding="utf-8"))
            if not isinstance(source_data, dict):
                result["error"] = "源库数据格式错误"
                return result

            target_data = {}
            if target_data_file.exists():
                target_data = json.loads(target_data_file.read_text(encoding="utf-8"))
            if not isinstance(target_data, dict):
                target_data = {}

            imported = 0
            for key, values in source_data.items():
                if key == "metadata":
                    continue
                if not isinstance(values, list):
                    continue
                existing = target_data.get(key, [])
                if not isinstance(existing, list):
                    existing = []
                existing_ids = {item.get("id", "") for item in existing if isinstance(item, dict)}
                for item in values:
                    if not isinstance(item, dict):
                        continue
                    item_id = item.get("id", "")
                    if item_id and item_id in existing_ids:
                        continue
                    existing.append(item)
                    if item_id:
                        existing_ids.add(item_id)
                    imported += 1
                target_data[key] = existing

            target_data.setdefault("metadata", {}).update({
                "library": target_name,
                "updated_at": datetime.now().isoformat(),
                "imported_from": source_name,
            })

            target_data_file.write_text(
                json.dumps(target_data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            result["data_count"] = imported

        except Exception as e:
            result["error"] = f"复制游戏数据失败: {e}"
            get_logger().error(result["error"])
            return result

        if include_planning:
            try:
                source_planning = Path(source_lib.path) / "planning" / "planning_docs_v3.json"
                target_planning_dir = Path(target_lib.path) / "planning"
                target_planning = target_planning_dir / "planning_docs_v3.json"

                if source_planning.exists():
                    source_docs = json.loads(source_planning.read_text(encoding="utf-8"))
                    if isinstance(source_docs, list):
                        target_docs = []
                        existing_ids = set()
                        if target_planning.exists():
                            target_docs = json.loads(target_planning.read_text(encoding="utf-8"))
                            if isinstance(target_docs, list):
                                existing_ids = {
                                    d.get("id", "") for d in target_docs
                                    if isinstance(d, dict)
                                }

                        for doc in source_docs:
                            if not isinstance(doc, dict):
                                continue
                            doc_id = doc.get("id", "")
                            if doc_id and doc_id in existing_ids:
                                continue
                            target_docs.append(doc)
                            if doc_id:
                                existing_ids.add(doc_id)

                        target_planning_dir.mkdir(parents=True, exist_ok=True)
                        target_planning.write_text(
                            json.dumps(target_docs, ensure_ascii=False, indent=2),
                            encoding="utf-8"
                        )
                        result["docs_count"] = len(target_docs)
            except Exception as e:
                get_logger().warning(f"复制策划方案失败: {e}")

        result["success"] = True
        get_logger().info(
            f"库数据迁移: {source_name} -> {target_name}, "
            f"数据{result['data_count']}条, 方案{result['docs_count']}个"
        )
        return result
