from common.logger import get_logger

logger = get_logger()

from collections.abc import Callable
import csv
from dataclasses import dataclass, field
import json
import logging
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class ImportResult:
    file_path: str
    format: str
    total_rows: int
    success_count: int
    error_count: int
    errors: list[str] = field(default_factory=list)
    imported_data: list[dict[str, Any]] = field(default_factory=list)

    @property
    def success_rate(self) -> float:
        if self.total_rows == 0:
            return 0.0
        return self.success_count / self.total_rows


class DataImporter:
    SUPPORTED_FORMATS = {".csv", ".json", ".xlsx", ".xls"}

    def __init__(self):
        self._field_mappers: dict[str, Callable[[Any], Any]] = {}
        self._type_mappers: dict[str, Callable[[str], Any]] = {}

    @staticmethod
    def detect_format(filepath: str) -> Optional[str]:
        ext = Path(filepath).suffix.lower()
        if ext in DataImporter.SUPPORTED_FORMATS:
            return ext
        return None

    @staticmethod
    def preview(filepath: str, max_rows: int = 5) -> tuple[list[str], list[list[str]]]:
        ext = Path(filepath).suffix.lower()
        if ext == ".csv":
            return DataImporter._preview_csv(filepath, max_rows)
        elif ext == ".json":
            return DataImporter._preview_json(filepath, max_rows)
        elif ext in (".xlsx", ".xls"):
            return DataImporter._preview_excel(filepath, max_rows)
        return [], []

    @staticmethod
    def _preview_csv(filepath: str, max_rows: int) -> tuple[list[str], list[list[str]]]:
        with open(filepath, encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            headers = next(reader, [])
            rows = []
            for i, row in enumerate(reader):
                if i >= max_rows:
                    break
                rows.append(row)
        return headers, rows

    @staticmethod
    def _preview_json(filepath: str, max_rows: int) -> tuple[list[str], list[list[str]]]:
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)
        items = data if isinstance(data, list) else [data]
        if not items:
            return [], []
        headers = list(items[0].keys())[:20]
        rows = [[str(item.get(h, "")) for h in headers] for item in items[:max_rows]]
        return headers, rows

    @staticmethod
    def _preview_excel(filepath: str, max_rows: int) -> tuple[list[str], list[list[str]]]:
        try:
            import openpyxl
            wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
            ws = wb.active
            headers = [cell.value or "" for cell in next(ws.iter_rows(min_row=1, max_row=1))]
            rows = []
            for i, row in enumerate(ws.iter_rows(min_row=2, max_row=max_rows + 1)):
                rows.append([str(cell.value or "") for cell in row])
            wb.close()
            return headers, rows
        except ImportError:
            logger.error("openpyxl 未安装, 无法导入 Excel")
            return [], []

    def import_file(
        self,
        filepath: str,
        field_mapping: Optional[dict[str, str]] = None,
        type_mapping: Optional[dict[str, str]] = None,
        skip_errors: bool = True,
    ) -> ImportResult:
        ext = Path(filepath).suffix.lower()
        if ext == ".csv":
            return self._import_csv(filepath, field_mapping, type_mapping, skip_errors)
        elif ext == ".json":
            return self._import_json(filepath, field_mapping, type_mapping, skip_errors)
        elif ext in (".xlsx", ".xls"):
            return self._import_excel(filepath, field_mapping, type_mapping, skip_errors)
        return ImportResult(
            file_path=filepath, format="unknown",
            total_rows=0, success_count=0, error_count=0,
            errors=[f"不支持的文件格式: {ext}"],
        )

    def _apply_field_mapping(
        self, row: list[str], headers: list[str],
        field_mapping: Optional[dict[str, str]]
    ) -> dict[str, Any]:
        result: dict[str, str] = {}
        if field_mapping:
            for source_field, target_field in field_mapping.items():
                if source_field in headers:
                    idx = headers.index(source_field)
                    result[target_field] = row[idx] if idx < len(row) else ""
        else:
            for i, h in enumerate(headers):
                result[h] = row[i] if i < len(row) else ""
        return result

    def _convert_types(
        self, data: dict[str, Any],
        type_mapping: Optional[dict[str, str]]
    ) -> dict[str, Any]:
        if not type_mapping:
            return data
        converters = {
            "int": lambda v: int(v) if v else 0,
            "float": lambda v: float(v) if v else 0.0,
            "bool": lambda v: str(v).lower() in ("true", "1", "yes", "是"),
            "str": lambda v: str(v),
            "list": lambda v: [x.strip() for x in str(v).split(",") if x.strip()],
            "json": lambda v: json.loads(v) if isinstance(v, str) else v,
        }
        for field, type_name in type_mapping.items():
            if field in data and type_name in converters:
                try:
                    data[field] = converters[type_name](data[field])
                except (ValueError, TypeError):
                    logger.warning("类型转换失败: %s -> %s", field, type_name)
        return data

    def _import_csv(
        self, filepath: str, field_mapping: Optional[dict[str, str]],
        type_mapping: Optional[dict[str, str]], skip_errors: bool,
    ) -> ImportResult:
        result = ImportResult(file_path=filepath, format="csv", total_rows=0, success_count=0, error_count=0)
        try:
            with open(filepath, encoding="utf-8-sig") as f:
                reader = csv.reader(f)
                headers = next(reader, [])
                for row_num, row in enumerate(reader, start=2):
                    result.total_rows += 1
                    try:
                        item = self._apply_field_mapping(row, headers, field_mapping)
                        item = self._convert_types(item, type_mapping)
                        result.imported_data.append(item)
                        result.success_count += 1
                    except Exception as e:
                        result.error_count += 1
                        result.errors.append(f"第{row_num}行: {e}")
                        if not skip_errors:
                            break
        except Exception as e:
            result.errors.append(f"读取失败: {e}")
        return result

    def _import_json(
        self, filepath: str, field_mapping: Optional[dict[str, str]],
        type_mapping: Optional[dict[str, str]], skip_errors: bool,
    ) -> ImportResult:
        result = ImportResult(file_path=filepath, format="json", total_rows=0, success_count=0, error_count=0)
        try:
            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)
            items = data if isinstance(data, list) else [data]
            result.total_rows = len(items)
            for i, item in enumerate(items):
                try:
                    if field_mapping:
                        mapped = {}
                        for src, tgt in field_mapping.items():
                            mapped[tgt] = item.get(src, "")
                        item = mapped
                    item = self._convert_types(item, type_mapping)
                    result.imported_data.append(item)
                    result.success_count += 1
                except Exception as e:
                    result.error_count += 1
                    result.errors.append(f"第{i+1}项: {e}")
                    if not skip_errors:
                        break
        except Exception as e:
            result.errors.append(f"读取失败: {e}")
        return result

    def _import_excel(
        self, filepath: str, field_mapping: Optional[dict[str, str]],
        type_mapping: Optional[dict[str, str]], skip_errors: bool,
    ) -> ImportResult:
        result = ImportResult(file_path=filepath, format="excel", total_rows=0, success_count=0, error_count=0)
        try:
            import openpyxl
            wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
            ws = wb.active
            headers = [str(cell.value or "") for cell in next(ws.iter_rows(min_row=1, max_row=1))]
            row_headers = headers.copy()
            for row_num, row in enumerate(ws.iter_rows(min_row=2), start=2):
                result.total_rows += 1
                try:
                    values = [str(cell.value or "") for cell in row]
                    item = self._apply_field_mapping(values, row_headers, field_mapping)
                    item = self._convert_types(item, type_mapping)
                    result.imported_data.append(item)
                    result.success_count += 1
                except Exception as e:
                    result.error_count += 1
                    result.errors.append(f"第{row_num}行: {e}")
                    if not skip_errors:
                        break
            wb.close()
        except ImportError:
            result.errors.append("openpyxl 未安装, 请执行 pip install openpyxl")
        except Exception as e:
            result.errors.append(f"读取失败: {e}")
        return result

    @staticmethod
    def analyze_headers(filepath: str) -> list[dict[str, Any]]:
        ext = Path(filepath).suffix.lower()
        headers, sample_rows = DataImporter.preview(filepath, 3)
        result = []
        for i, h in enumerate(headers):
            samples = [row[i] if i < len(row) else "" for row in sample_rows]
            result.append({
                "index": i,
                "name": h,
                "samples": [s for s in samples if s],
                "suggested_type": DataImporter._guess_type(samples),
            })
        return result

    @staticmethod
    def _guess_type(samples: list[str]) -> str:
        if not samples:
            return "str"
        for s in samples:
            if not s:
                continue
            try:
                int(s)
                return "int"
            except ValueError as e:
                logger.debug(f"操作失败: {e}")
            try:
                float(s)
                return "float"
            except ValueError as e:
                logger.debug(f"操作失败: {e}")
            if s.lower() in ("true", "false", "yes", "no"):
                return "bool"
        return "str"
