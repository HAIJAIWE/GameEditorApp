"""N13: 自定义 GDD 模板管理器 — 用户可保存当前章节为可复用模板

模板存储位置: data/custom_templates/{category}.json
其中 category = chapter_key 或 "global"（跨章节通用模板）

每个模板结构:
    {
        "id": str,            # 模板唯一 ID
        "name": str,          # 模板名称
        "description": str,   # 模板描述
        "tags": list[str],    # 标签列表
        "chapter_key": str,   # 所属章节键名（如 "meta" / "vision"）
        "data": dict,         # 与 CeshuModel.get_chapter(key) 字段对齐的数据
        "created_at": str,    # 创建时间
        "updated_at": str,    # 更新时间
        "source_game": str    # 来源游戏名（可选）
    }

CustomTemplateManager 是纯 Python 实现，不依赖 PyQt6，可独立用于脚本与测试。
"""
from __future__ import annotations

from datetime import datetime
import json
import os
from pathlib import Path
from typing import Any
import uuid

# 模板存储根目录名（相对于工作目录的 data/）
CUSTOM_TEMPLATES_DIR_NAME: str = "custom_templates"

# 全局分类（用于不绑定具体章节的模板）
GLOBAL_CATEGORY: str = "global"


class CustomTemplateManager:
    """自定义模板管理器 — 纯 Python，不依赖 PyQt6。

    模板按分类（category）持久化到独立 JSON 文件：
    ``<root>/custom_templates/<category>.json``，其中 category 为章节键或
    ``"global"``。每文件结构为 ``{"templates": [template, ...]}``。

    自定义模板与 ``src/ui/ceshu/chapter_templates.py`` 中的内置
    ``CHAPTER_TEMPLATES`` 严格区分：本管理器只读写 custom_templates 目录，
    不会污染或覆盖内置模板常量。
    """

    def __init__(self, data_root: str | Path = "data") -> None:
        """初始化自定义模板管理器。

        Args:
            data_root: 数据根目录路径，模板将存储在其下的
                ``custom_templates/`` 子目录中。
        """
        self._data_root = Path(data_root)
        self._templates_dir = self._data_root / CUSTOM_TEMPLATES_DIR_NAME

    # ── 路径与加载 ──

    @property
    def templates_dir(self) -> Path:
        """返回模板存储目录路径。"""
        return self._templates_dir

    def _category_path(self, category: str) -> Path:
        """获取指定分类的 JSON 文件路径。

        Args:
            category: 分类名（章节键或 "global"）。空字符串归一化为 "global"。

        Returns:
            该分类的 JSON 文件路径。
        """
        cat = category or GLOBAL_CATEGORY
        # 防止路径穿越：仅允许字母数字下划线
        safe_cat = "".join(c for c in cat if c.isalnum() or c in ("_", "-")) or GLOBAL_CATEGORY
        return self._templates_dir / f"{safe_cat}.json"

    def _load_category(self, category: str) -> list[dict]:
        """从磁盘加载指定分类的模板列表。

        Args:
            category: 分类名。

        Returns:
            模板字典列表；文件不存在或损坏时返回空列表。
        """
        path = self._category_path(category)
        if not path.exists():
            return []
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            templates = data.get("templates", []) if isinstance(data, dict) else []
            return [t for t in templates if isinstance(t, dict)]
        except (json.JSONDecodeError, OSError):
            return []

    def _save_category(self, category: str, templates: list[dict]) -> None:
        """持久化指定分类的模板列表到磁盘（原子写入）。

        Args:
            category: 分类名。
            templates: 模板字典列表。
        """
        path = self._category_path(category)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(".json.tmp")
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump({"templates": templates}, f, ensure_ascii=False, indent=2)
            os.replace(str(tmp_path), str(path))
        except Exception:
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except Exception:
                    pass
            raise

    def _load_all_categories(self) -> dict[str, list[dict]]:
        """加载所有分类的模板。

        Returns:
            ``{category: [template, ...]}`` 字典。
        """
        result: dict[str, list[dict]] = {}
        if not self._templates_dir.exists():
            return result
        for path in sorted(self._templates_dir.glob("*.json")):
            category = path.stem
            try:
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
                templates = data.get("templates", []) if isinstance(data, dict) else []
                result[category] = [t for t in templates if isinstance(t, dict)]
            except (json.JSONDecodeError, OSError):
                continue
        return result

    # ── CRUD ──

    def save_template(self, name: str, description: str, tags: list[str],
                      chapter_key: str, data: dict,
                      source_game: str = "") -> dict:
        """保存新模板。

        Args:
            name: 模板名称（不能为空）。
            description: 模板描述。
            tags: 标签列表。
            chapter_key: 所属章节键名（如 "meta"）；为空时归入 "global"。
            data: 模板数据（与 CeshuModel.get_chapter 字段对齐）。
            source_game: 来源游戏名（可选）。

        Returns:
            新建的模板字典。

        Raises:
            ValueError: name 为空时。
        """
        if not name or not name.strip():
            raise ValueError("模板名称不能为空")
        category = chapter_key or GLOBAL_CATEGORY
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        template = {
            "id": uuid.uuid4().hex[:12],
            "name": name.strip(),
            "description": description or "",
            "tags": [t.strip() for t in (tags or []) if t and t.strip()],
            "chapter_key": chapter_key or "",
            "data": data if isinstance(data, dict) else {},
            "created_at": now,
            "updated_at": now,
            "source_game": source_game or "",
        }
        templates = self._load_category(category)
        templates.append(template)
        self._save_category(category, templates)
        return template

    def list_templates(self, chapter_key: str = "") -> list[dict]:
        """列出模板。

        Args:
            chapter_key: 若指定，仅返回该章节的模板；否则返回全部自定义模板。

        Returns:
            模板列表（按 created_at 升序）。
        """
        if chapter_key:
            templates = self._load_category(chapter_key)
        else:
            all_cats = self._load_all_categories()
            templates = [t for ts in all_cats.values() for t in ts]
        return sorted(templates, key=lambda t: t.get("created_at", ""))

    def get_template(self, template_id: str) -> dict | None:
        """按 ID 获取模板。

        Args:
            template_id: 模板 ID。

        Returns:
            模板字典；若不存在返回 None。
        """
        if not template_id:
            return None
        for templates in self._load_all_categories().values():
            for t in templates:
                if t.get("id") == template_id:
                    return t
        return None

    def update_template(self, template_id: str, **fields: Any) -> bool:
        """更新指定模板的字段。

        支持的可更新字段：name / description / tags / chapter_key /
        data / source_game。若 chapter_key 改变，模板会迁移到新分类文件。

        Args:
            template_id: 模板 ID。
            **fields: 要更新的字段。

        Returns:
            是否更新成功（False 表示 ID 不存在）。
        """
        if not template_id:
            return False
        # 找到原模板与其分类
        all_cats = self._load_all_categories()
        old_category: str | None = None
        target: dict | None = None
        for cat, templates in all_cats.items():
            for t in templates:
                if t.get("id") == template_id:
                    old_category = cat
                    target = t
                    break
            if target is not None:
                break
        if target is None or old_category is None:
            return False

        # 校验新名称非空
        new_name = fields.get("name")
        if new_name is not None and (not new_name or not str(new_name).strip()):
            return False

        # 计算新分类
        new_chapter_key = fields.get("chapter_key", target.get("chapter_key", ""))
        new_category = new_chapter_key or GLOBAL_CATEGORY

        # 更新字段
        for k, v in fields.items():
            if k in ("name", "description", "tags", "chapter_key",
                     "data", "source_game"):
                if k == "name":
                    target[k] = str(v).strip()
                elif k == "tags":
                    target[k] = [str(t).strip() for t in v if v and str(t).strip()] if v else []
                elif k == "data":
                    target[k] = v if isinstance(v, dict) else {}
                else:
                    target[k] = v
        target["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # 若分类未变则原地写回；否则迁移
        if new_category == old_category:
            self._save_category(old_category, all_cats[old_category])
        else:
            # 从旧分类移除
            old_list = [t for t in all_cats[old_category] if t.get("id") != template_id]
            self._save_category(old_category, old_list)
            # 加入新分类
            new_list = self._load_category(new_category)
            new_list.append(target)
            self._save_category(new_category, new_list)
        return True

    def delete_template(self, template_id: str) -> bool:
        """删除指定模板。

        Args:
            template_id: 模板 ID。

        Returns:
            是否删除成功（False 表示 ID 不存在）。
        """
        if not template_id:
            return False
        all_cats = self._load_all_categories()
        for cat, templates in all_cats.items():
            new_list = [t for t in templates if t.get("id") != template_id]
            if len(new_list) != len(templates):
                self._save_category(cat, new_list)
                return True
        return False

    def search_templates(self, keyword: str) -> list[dict]:
        """跨分类搜索模板。

        关键词大小写不敏感，匹配 name / description / tags / source_game
        字段。空字符串返回全部模板。

        Args:
            keyword: 关键词。

        Returns:
            匹配的模板列表。
        """
        all_templates = self.list_templates()
        if not keyword:
            return all_templates
        kw = keyword.lower()
        results: list[dict] = []
        for t in all_templates:
            name = (t.get("name") or "").lower()
            desc = (t.get("description") or "").lower()
            tags = " ".join(t.get("tags") or []).lower()
            source = (t.get("source_game") or "").lower()
            if kw in name or kw in desc or kw in tags or kw in source:
                results.append(t)
        return results

    def export_templates(self, output_path: str) -> str:
        """导出全部自定义模板为 JSON 文件。

        Args:
            output_path: 输出文件路径。

        Returns:
            实际写入的文件路径。
        """
        all_cats = self._load_all_categories()
        # 展平为列表，保留分类信息
        flat: list[dict] = []
        for cat, templates in sorted(all_cats.items()):
            for t in templates:
                entry = dict(t)
                entry["_category"] = cat
                flat.append(entry)
        out_path = Path(output_path)
        if out_path.suffix.lower() != ".json":
            out_path = out_path.with_suffix(".json")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "_export_meta": {
                        "export_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "template_count": len(flat),
                    },
                    "templates": flat,
                },
                f, ensure_ascii=False, indent=2,
            )
        return str(out_path)

    def import_templates(self, input_path: str, overwrite: bool = False) -> int:
        """从 JSON 文件导入模板。

        Args:
            input_path: 输入文件路径。
            overwrite: 是否覆盖同名（同 ID）模板。

        Returns:
            实际导入的模板数量。
        """
        path = Path(input_path)
        if not path.exists():
            return 0
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            return 0
        if isinstance(data, dict):
            templates = data.get("templates", [])
        elif isinstance(data, list):
            templates = data
        else:
            return 0
        if not isinstance(templates, list):
            return 0

        imported = 0
        existing_ids = {t.get("id") for t in self.list_templates()}
        # 按 chapter_key 分组以减少磁盘 IO
        bucket: dict[str, list[dict]] = {}
        for raw in templates:
            if not isinstance(raw, dict):
                continue
            tid = raw.get("id") or uuid.uuid4().hex[:12]
            if tid in existing_ids and not overwrite:
                # 跳过已存在模板
                continue
            if tid in existing_ids and overwrite:
                # 先删除旧模板
                self.delete_template(tid)
            chapter_key = raw.get("chapter_key", "")
            category = chapter_key or GLOBAL_CATEGORY
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            template: dict[str, Any] = {
                "id": tid,
                "name": (raw.get("name") or "").strip() or "未命名模板",
                "description": raw.get("description") or "",
                "tags": [str(t).strip() for t in raw.get("tags") or [] if str(t).strip()],
                "chapter_key": chapter_key or "",
                "data": raw.get("data") if isinstance(raw.get("data"), dict) else {},
                "created_at": raw.get("created_at") or now,
                "updated_at": now,
                "source_game": raw.get("source_game") or "",
            }
            bucket.setdefault(category, []).append(template)
            imported += 1

        for category, new_templates in bucket.items():
            existing = self._load_category(category)
            existing.extend(new_templates)
            self._save_category(category, existing)
        return imported

    # ── 统计 ──

    def count_all(self) -> int:
        """返回全部自定义模板数量。"""
        return sum(len(ts) for ts in self._load_all_categories().values())

    def count_by_chapter(self) -> dict[str, int]:
        """按章节统计模板数量。

        Returns:
            ``{chapter_key: count}`` 字典（不含 "global" 分类）。
        """
        result: dict[str, int] = {}
        for cat, templates in self._load_all_categories().items():
            if cat == GLOBAL_CATEGORY:
                continue
            result[cat] = len(templates)
        return result
