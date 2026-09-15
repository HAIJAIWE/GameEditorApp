"""策划书管理器 — CRUD 操作、导入导出、路径管理

CeshuManager 是唯一的数据访问层，所有 ceshu.json 读写都通过它。
每本策划书存储为独立文件：data/libraries/<lib>/ceshu/{ceshu_id}.json
"""
from __future__ import annotations

from datetime import datetime
import json
import os
from pathlib import Path
from typing import Any, Optional
import uuid

from common.logger import get_logger

from .ceshu_model import CeshuModel
from .ceshu_template import CeshuTemplate


class CeshuManager:
    """策划书 CRUD 管理器"""

    def __init__(self, library_root: str | Path):
        self._lib_root = Path(library_root)
        self._template = CeshuTemplate()
        self._logger = get_logger()
        # list_ceshu 缓存：{library: (dir_mtime_str, file_count, results)}
        # 当目录 mtime 或文件数变化时自动失效，避免 O(N²) 重复读盘
        self._list_cache: dict[str, tuple[float, int, list]] = {}

    def _get_dir_signature(self, ceshu_dir: Path) -> tuple[float, int]:
        """获取目录签名（mtime + 文件数）用于缓存失效判断"""
        try:
            mtime = ceshu_dir.stat().st_mtime
            files = list(ceshu_dir.glob("*.json"))
            return (mtime, len(files))
        except Exception:
            return (0.0, 0)

    # --- 路径工具 ---

    def _ceshu_dir(self, library: str) -> Path:
        return self._lib_root / library / "ceshu"

    def get_ceshu_path(self, ceshu_id: str, library: str) -> Path:
        """获取策划书文件路径"""
        return self._ceshu_dir(library) / f"{ceshu_id}.json"

    def ceshu_exists(self, ceshu_id: str, library: str) -> bool:
        """检查策划书是否存在"""
        return self.get_ceshu_path(ceshu_id, library).exists()

    # --- CRUD ---

    def list_ceshu(self, library: str, keyword: str = "",
                   force_refresh: bool = False) -> list:
        """列出指定库中的所有策划书（带 mtime 缓存，避免 O(N²) 重复读盘）

        Args:
            library: 库名
            keyword: 关键词过滤（按名称/标签，不区分大小写）
            force_refresh: 强制刷新缓存，忽略目录签名检查
        """
        ceshu_dir = self._ceshu_dir(library)
        if not ceshu_dir.exists():
            return []

        # 检查缓存：目录 mtime + 文件数未变则直接复用
        signature = self._get_dir_signature(ceshu_dir)
        cached = self._list_cache.get(library)
        if (not force_refresh
                and cached is not None
                and (cached[0], cached[1]) == signature):
            results = cached[2]
        else:
            results = self._scan_ceshu_dir(ceshu_dir, library)
            self._list_cache[library] = (signature[0], signature[1], results)

        # keyword 过滤（不影响缓存，只在返回时过滤）
        if not keyword:
            return results
        filtered = []
        for c in results:
            name = c.get("name", "")
            if keyword.lower() in name.lower():
                filtered.append(c)
                continue
            tags = " ".join(c.get("tags", []))
            if keyword.lower() in tags.lower():
                filtered.append(c)
        return filtered

    def _scan_ceshu_dir(self, ceshu_dir: Path, library: str) -> list:
        """全量扫描策划书目录（实际读盘）"""
        results = []
        for f in sorted(ceshu_dir.glob("*.json")):
            try:
                with open(f, encoding="utf-8") as fh:
                    data = json.load(fh)
                model = CeshuModel.from_dict(data)
                name = model.meta.get("game_name", "未命名")
                results.append({
                    "ceshu_id": model.ceshu_id,
                    "name": name,
                    "game_type": model.meta.get("game_type", ""),
                    "status": model.meta.get("status", "draft"),
                    "updated_at": model.updated_at or model.created_at,
                    "tags": model.meta.get("tags", []),
                    "progress": model.chapter_progress().get("total", 0),
                    "enabled_editors": model.compute_enabled_editors(),
                    # P8: 版本管理信息
                    "version_label": model.version_label,
                    "parent_id": model.parent_id,
                    "is_active": model.is_active,
                    "is_main": not model.parent_id,
                    "version_note": model.version_note,
                    "path": str(f),
                })
            except Exception as e:
                self._logger.warning(f"读取策划书失败 {f}: {e}")
        return results

    def _invalidate_cache(self, library: str) -> None:
        """失效指定库的 list_ceshu 缓存（写操作后调用）"""
        self._list_cache.pop(library, None)

    def get_ceshu(self, ceshu_id: str, library: str) -> CeshuModel:
        """加载策划书

        Args:
            ceshu_id: 策划书 ID
            library: 库名

        Returns:
            加载完成的 CeshuModel

        Raises:
            FileNotFoundError: 文件不存在
            ValueError: JSON 损坏或格式错误（附用户友好消息）
        """
        path = self.get_ceshu_path(ceshu_id, library)
        if not path.exists():
            raise FileNotFoundError(f"策划书 {ceshu_id} 不存在: {path}")
        try:
            return CeshuModel.from_json_file(str(path))
        except ValueError:
            # JSON 损坏：尝试从临时备份恢复
            backup = self._find_latest_tmp_backup(ceshu_id, library)
            if backup is not None:
                try:
                    return CeshuModel.from_json_file(str(backup))
                except Exception:
                    pass
            # 无法恢复，抛出原始错误
            raise

    def _find_latest_tmp_backup(self, ceshu_id: str, library: str) -> Optional[Path]:
        """查找最新的临时备份文件（save_ceshu 的原子写入可能留下 .tmp）

        匹配模式：.{ceshu_id}.json*.tmp（兼容新旧 tmp 命名）
        """
        ceshu_dir = self._ceshu_dir(library)
        if not ceshu_dir.exists():
            return None
        candidates = list(ceshu_dir.glob(f".{ceshu_id}.json*.tmp"))
        if not candidates:
            return None
        # 按 mtime 倒序，取最新
        candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        return candidates[0]

    def recover_ceshu(self, ceshu_id: str, library: str) -> Optional[CeshuModel]:
        """尝试恢复损坏的策划书（从 .tmp 备份或部分解析）

        Args:
            ceshu_id: 策划书 ID
            library: 库名

        Returns:
            恢复后的 CeshuModel；若无法恢复返回 None
        """
        path = self.get_ceshu_path(ceshu_id, library)
        # 1. 尝试从 .tmp 备份恢复
        backup = self._find_latest_tmp_backup(ceshu_id, library)
        if backup is not None:
            try:
                return CeshuModel.from_json_file(str(backup))
            except Exception as e:
                self._logger.warning(f"从备份恢复失败 {backup}: {e}")
        # 2. 尝试从损坏文件中提取可用数据（部分恢复）
        if path.exists():
            try:
                with open(path, encoding="utf-8") as f:
                    raw = f.read()
                # 尝试定位最后一个完整 JSON 对象
                # 简单策略：截断到最后一个 '}' 并尝试解析
                last_brace = raw.rfind("}")
                if last_brace > 0:
                    truncated = raw[:last_brace + 1]
                    data = json.loads(truncated)
                    if isinstance(data, dict):
                        return CeshuModel.from_dict(data)
            except Exception as e:
                self._logger.warning(f"部分恢复失败 {path}: {e}")
        return None

    def create_ceshu(self, library: str, template_name: str = "", meta: dict | None = None) -> CeshuModel:
        """创建新策划书，可选从模板加载"""
        model = CeshuModel()
        if template_name:
            tmpl = self._template.get_template(template_name)
            if tmpl:
                model = CeshuModel.from_dict(tmpl.get("data", {}))
                model.ceshu_id = str(uuid.uuid4())[:8]  # 重新生成 ID
                model.created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if meta:
            model.meta.update(meta)
        self.save_ceshu(model, library)
        return model

    def save_ceshu(self, model: CeshuModel, library: str) -> None:
        """保存策划书到文件（原子写入：temp + os.replace 防止崩溃损坏）

        v5.0: 保存后发射 `ceshu_changed` 事件，供 CeshuDataSync 等组件响应

        并发安全：使用 PID + 时间戳生成唯一 tmp 文件名，避免多进程同时
        保存同一策划书时 tmp 文件互相覆盖。
        """
        model.touch()
        ceshu_dir = self._ceshu_dir(library)
        ceshu_dir.mkdir(parents=True, exist_ok=True)
        path = ceshu_dir / f"{model.ceshu_id}.json"
        # 唯一 tmp 文件名：包含 PID + 时间戳，避免并发保存冲突
        tmp_suffix = f".{os.getpid()}.{datetime.now().strftime('%H%M%S%f')}.tmp"
        tmp_path = ceshu_dir / f".{model.ceshu_id}.json{tmp_suffix}"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(model.to_dict(), f, ensure_ascii=False, indent=2)
            os.replace(str(tmp_path), str(path))  # 原子替换
            self._invalidate_cache(library)
            self._logger.info(f"策划书已保存: {path}")
            # v5.0: 发射事件让 CeshuDataSync 等组件响应（防循环：source="save"）
            try:
                from common.event_bus import EventBus
                EventBus().emit("ceshu_changed",
                                ceshu_id=model.ceshu_id, library=library,
                                source="save")
            except Exception as ev_err:
                self._logger.debug(f"发射 ceshu_changed 事件失败（不影响保存）: {ev_err}")
        except Exception as e:
            # 清理临时文件
            try:
                if tmp_path.exists():
                    tmp_path.unlink()
            except Exception:
                pass
            self._logger.error(f"保存策划书失败: {e}")
            raise

    def delete_ceshu(self, ceshu_id: str, library: str) -> bool:
        """删除策划书"""
        path = self.get_ceshu_path(ceshu_id, library)
        if not path.exists():
            return False
        try:
            path.unlink()
            self._invalidate_cache(library)
            self._logger.info(f"策划书已删除: {path}")
            return True
        except Exception as e:
            self._logger.error(f"删除策划书失败: {e}")
            raise

    def rename_ceshu(self, library: str, ceshu_id: str, new_name: str) -> bool:
        """重命名策划书"""
        try:
            model = self.get_ceshu(ceshu_id, library)
            model.meta["game_name"] = new_name
            self.save_ceshu(model, library)
            self._invalidate_cache(library)
            self._logger.info(f"策划书已重命名: {ceshu_id} → {new_name}")
            return True
        except Exception as e:
            self._logger.error(f"重命名策划书失败: {e}")
            return False

    def duplicate_ceshu(self, library: str, ceshu_id: str) -> Optional[CeshuModel]:
        """复制策划书（生成新ID）"""
        try:
            model = self.get_ceshu(ceshu_id, library)
            data = model.to_dict()
            data["ceshu_id"] = str(uuid.uuid4())[:8]
            data["meta"]["game_name"] = model.meta.get("game_name", "未命名") + " (副本)"
            data["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            data["updated_at"] = data["created_at"]
            new_model = CeshuModel.from_dict(data)
            self.save_ceshu(new_model, library)
            self._invalidate_cache(library)
            self._logger.info(f"策划书已复制: {ceshu_id} → {new_model.ceshu_id}")
            return new_model
        except Exception as e:
            self._logger.error(f"复制策划书失败: {e}")
            return None

    # --- P8: 版本管理 ---

    def derive_version(self, library: str, parent_ceshu_id: str,
                       version_label: str = "", version_note: str = "") -> Optional[CeshuModel]:
        """P8: 基于父策划书派生新版本

        - 复制父策划书全部内容
        - parent_id 指向父策划书
        - 默认非激活（父策划书仍是激活版本）
        - 版本标签自动递增（如父 v1.0 → 子 v1.1）
        """
        try:
            parent = self.get_ceshu(parent_ceshu_id, library)
            data = parent.to_dict()

            # 计算 parent_id：如果父是主策划，parent_id 指向它；如果父是子策划，继承其 parent_id（同根）
            real_parent_id = parent.parent_id or parent.ceshu_id

            # 自动计算版本号
            if not version_label:
                existing = self.list_versions(library, real_parent_id)
                version_label = self._next_version_label(
                    parent.version_label,
                    [v.get("version_label", "") for v in existing]
                )

            data["ceshu_id"] = str(uuid.uuid4())[:8]
            data["parent_id"] = real_parent_id
            data["version_label"] = version_label
            data["version_note"] = version_note
            data["is_active"] = False  # 新版本默认非激活
            data["meta"] = dict(data.get("meta", {}))
            data["meta"]["game_name"] = parent.meta.get("game_name", "未命名")
            data["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            data["updated_at"] = data["created_at"]

            new_model = CeshuModel.from_dict(data)
            self.save_ceshu(new_model, library)
            self._invalidate_cache(library)
            self._logger.info(
                f"[P8] 派生新版本: {parent_ceshu_id}({parent.version_label}) → "
                f"{new_model.ceshu_id}({version_label})"
            )
            return new_model
        except Exception as e:
            self._logger.error(f"[P8] 派生版本失败: {e}", exc_info=True)
            return None

    def list_versions(self, library: str, root_ceshu_id: str) -> list:
        """P8: 列出同一版本链下的所有策划书（主+所有子版本）

        利用 list_ceshu 缓存，避免对每个子策划重复读盘（O(N²) → O(N)）

        Args:
            library: 库名
            root_ceshu_id: 根策划书 ID（主策划 ID）

        Returns:
            按版本号排序的列表，每项含 ceshu_id/version_label/is_active/updated_at/name
        """
        all_ceshus = self.list_ceshu(library)
        # 直接使用 list_ceshu 已返回的 parent_id 字段过滤，无需再读盘
        versions = [
            c for c in all_ceshus
            if c.get("ceshu_id") == root_ceshu_id or c.get("parent_id") == root_ceshu_id
        ]
        # 主策划排首位，其余按 version_label 排序
        def _sort_key(c):
            label = c.get("version_label", "v0.0")
            try:
                nums = label.lstrip("vV").split(".")
                return tuple(int(n) for n in nums[:2])
            except Exception:
                return (0, 0)
        main_list = [c for c in versions if c.get("ceshu_id") == root_ceshu_id]
        sub_list = sorted([c for c in versions if c.get("ceshu_id") != root_ceshu_id],
                          key=_sort_key)
        return main_list + sub_list

    def set_active_version(self, library: str, ceshu_id: str) -> bool:
        """P8: 将指定版本设为激活（同版本链下其他版本取消激活）

        利用 list_versions 缓存的 is_active 字段，仅对当前激活的版本读+写，
        避免对每个版本都重复读盘
        """
        try:
            target = self.get_ceshu(ceshu_id, library)
            root_id = target.parent_id or target.ceshu_id
            versions = self.list_versions(library, root_id)
            for v in versions:
                vid = v.get("ceshu_id", "")
                if vid == ceshu_id:
                    continue
                # 利用缓存中的 is_active 字段，仅对激活版本读+写
                if not v.get("is_active", False):
                    continue
                try:
                    m = self.get_ceshu(vid, library)
                    m.is_active = False
                    self.save_ceshu(m, library)
                    self._invalidate_cache(library)
                except Exception:
                    continue
            # 激活目标
            target.is_active = True
            self.save_ceshu(target, library)
            self._invalidate_cache(library)
            self._logger.info(f"[P8] 已激活版本: {ceshu_id}({target.version_label})")
            return True
        except Exception as e:
            self._logger.error(f"[P8] 激活版本失败: {e}", exc_info=True)
            return False

    @staticmethod
    def _next_version_label(parent_label: str, existing_labels: list) -> str:
        """计算下一个版本号：v1.0 → v1.1 → v1.2 ..."""
        try:
            nums = parent_label.lstrip("vV").split(".")
            major, minor = int(nums[0]), int(nums[1]) if len(nums) > 1 else 0
        except Exception:
            major, minor = 1, 0

        # 找出已存在的同 major 版本号
        used_minors = {minor}
        for lbl in existing_labels:
            try:
                parts = lbl.lstrip("vV").split(".")
                if int(parts[0]) == major:
                    used_minors.add(int(parts[1]) if len(parts) > 1 else 0)
            except Exception:
                continue

        next_minor = max(used_minors) + 1
        return f"v{major}.{next_minor}"

    # --- 导入/导出 ---

    def export_ceshu(self, ceshu_id: str, library: str, output: str,
                     include_version_chain: bool = False) -> str:
        """导出策划书为独立 .ceshu 文件

        Args:
            ceshu_id: 策划书 ID
            library: 库名
            output: 输出路径
            include_version_chain: P10 是否包含完整版本链（同根的所有版本）
        """
        model = self.get_ceshu(ceshu_id, library)
        out_path = Path(output)
        if out_path.suffix != ".ceshu":
            out_path = out_path.with_suffix(".ceshu")
        out_path.parent.mkdir(parents=True, exist_ok=True)

        if include_version_chain:
            # P10: 导出完整版本链
            root_id = model.parent_id or model.ceshu_id
            versions = self.list_versions(library, root_id)
            chain_data: dict[str, Any] = {
                "_export_meta": {
                    "export_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "source_library": library,
                    "root_ceshu_id": root_id,
                    "version_count": len(versions),
                },
                "versions": [],
            }
            for v in versions:
                try:
                    m = self.get_ceshu(v.get("ceshu_id", ""), library)
                    chain_data["versions"].append(m.to_dict())
                except Exception:
                    continue
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(chain_data, f, ensure_ascii=False, indent=2)
        else:
            # P10: 单版本导出，附加导出元数据
            data = model.to_dict()
            data["_export_meta"] = {
                "export_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "source_library": library,
                "is_version_chain_export": False,
            }
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        return str(out_path)

    def export_ceshu_markdown(self, ceshu_id: str, library: str, output: str,
                             include_validation_report: bool = True) -> str:
        """N9: 导出策划书为 Markdown 文档（适合 Git 版本控制，18 章完整结构）

        Args:
            ceshu_id: 策划书 ID
            library: 库名
            output: 输出路径（自动补 .md 后缀）
            include_validation_report: 是否附加校验报告附录

        Returns:
            实际输出的文件路径
        """
        from .ceshu_markdown_exporter import export_ceshu_to_markdown
        model = self.get_ceshu(ceshu_id, library)
        out_path = export_ceshu_to_markdown(model, output, include_validation_report)
        self._logger.info(f"[N9] 策划书已导出为 Markdown: {out_path}")
        return out_path

    def export_ceshu_html(self, ceshu_id: str, library: str, output: str,
                         include_validation_report: bool = True) -> str:
        """N12: 导出策划书为交互式 HTML 文档（带目录导航、主题切换）

        Args:
            ceshu_id: 策划书 ID
            library: 库名
            output: 输出路径（自动补 .html 后缀）
            include_validation_report: 是否附加校验报告附录

        Returns:
            实际输出的文件路径
        """
        from .ceshu_html_exporter import export_ceshu_to_html
        model = self.get_ceshu(ceshu_id, library)
        out_path = export_ceshu_to_html(model, output, include_validation_report)
        self._logger.info(f"[N12] 策划书已导出为 HTML: {out_path}")
        return out_path

    def export_ceshu_docx(self, ceshu_id: str, library: str, output: str,
                          include_validation_report: bool = True) -> str:
        """v5.0: 导出策划书为工业级 Word 文档（.docx，18 章结构）

        Args:
            ceshu_id: 策划书 ID
            library: 库名
            output: 输出路径（自动补 .docx 后缀）
            include_validation_report: 是否附加校验报告附录

        Returns:
            实际输出的文件路径
        """
        from .ceshu_docx_exporter import export_ceshu_to_docx
        model = self.get_ceshu(ceshu_id, library)
        out_path = export_ceshu_to_docx(model, output, include_validation_report)
        self._logger.info(f"[v5.0] 策划书已导出为 docx: {out_path}")
        return out_path

    def export_ceshu_pdf(self, ceshu_id: str, library: str, output: str,
                         include_validation_report: bool = True) -> str:
        """F5: 导出策划书为 PDF（带书签大纲，18 章完整结构）

        Args:
            ceshu_id: 策划书 ID
            library: 库名
            output: 输出路径（自动补 .pdf 后缀）
            include_validation_report: 是否附加校验报告附录

        Returns:
            实际输出的文件路径
        """
        from .ceshu_pdf_exporter import export_ceshu_to_pdf
        model = self.get_ceshu(ceshu_id, library)
        out_path = export_ceshu_to_pdf(model, output, include_validation_report)
        self._logger.info(f"[F5] 策划书已导出为 PDF: {out_path}")
        return out_path

    def export_ceshu_pptx(self, ceshu_id: str, library: str, output: str,
                          include_validation_report: bool = True) -> str:
        """N3: 导出策划书为 PowerPoint 演示文稿（16:9 宽屏，18 章完整结构）

        Args:
            ceshu_id: 策划书 ID
            library: 库名
            output: 输出路径（自动补 .pptx 后缀）
            include_validation_report: 是否附加校验报告附录

        Returns:
            实际输出的文件路径
        """
        from .ceshu_pptx_exporter import export_ceshu_to_pptx
        model = self.get_ceshu(ceshu_id, library)
        out_path = export_ceshu_to_pptx(model, output, include_validation_report)
        self._logger.info(f"[N3] 策划书已导出为 PPT: {out_path}")
        return out_path

    def export_ceshu_excel(self, ceshu_id: str, library: str, output: str) -> str:
        """N16: 导出策划书为 Excel 工作簿（多 Sheet 数据分析）

        Args:
            ceshu_id: 策划书 ID
            library: 库名
            output: 输出路径（自动补 .xlsx 后缀）

        Returns:
            实际输出的文件路径
        """
        from .ceshu_excel_exporter import export_ceshu_to_excel
        model = self.get_ceshu(ceshu_id, library)
        out_path = export_ceshu_to_excel(model, output)
        self._logger.info(f"[N16] 策划书已导出为 Excel: {out_path}")
        return out_path

    def import_ceshu(self, filepath: str, library: str) -> CeshuModel:
        """导入 .ceshu 文件到指定库"""
        try:
            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)
        except FileNotFoundError:
            self._logger.error(f"导入文件不存在: {filepath}")
            raise
        except json.JSONDecodeError as e:
            self._logger.error(f"导入文件 JSON 格式错误: {e}")
            raise
        model = CeshuModel.from_dict(data)
        model.ceshu_id = str(uuid.uuid4())[:8]  # 新 ID 避免冲突
        self.save_ceshu(model, library)
        return model

    # --- 最近打开 ---

    def get_recent_ceshus(self, library: str, count: int = 5) -> list:
        """获取最近编辑的策划书"""
        ceshus = self.list_ceshu(library)
        ceshus.sort(key=lambda c: c.get("updated_at", ""), reverse=True)
        return ceshus[:count]

    # --- 库管理辅助 ---

    def ensure_ceshu_dir(self, library: str) -> Path:
        """确保 ceshu 目录存在"""
        d = self._ceshu_dir(library)
        d.mkdir(parents=True, exist_ok=True)
        return d

    def get_ceshu_files(self, library: str) -> list:
        """列出库下所有 ceshu JSON 文件路径"""
        d = self._ceshu_dir(library)
        if not d.exists():
            return []
        return sorted(d.glob("*.json"))
