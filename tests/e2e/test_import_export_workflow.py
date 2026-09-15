"""数据导入/导出 E2E 测试：外部数据文件接入工作流

覆盖外部 CSV/JSON 数据文件 → DataImporter 解析与类型映射 →
写入数据管理器 → 保存/重载 的完整闭环，另覆盖导入器边界行为。

基于真实 API：
  - DataImporter.import_file(path, field_mapping, type_mapping, skip_errors) -> ImportResult
  - ImportResult: imported_data / success_count / error_count / success_rate / errors
  - DataManager.add_item / save_file / open_file
"""
import csv
from pathlib import Path


class TestImportExportWorkflow:
    """外部数据接入完整工作流测试"""

    @staticmethod
    def _write_csv(path: Path, headers: list[str], rows: list[list[str]]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(headers)
            writer.writerows(rows)

    def test_csv_import_into_data_manager(self, data_manager, temp_workspace):
        """CSV → 导入 → 写入数据管理器 → 保存 → 重载"""
        from common.data_importer import DataImporter

        csv_file = temp_workspace / "import.csv"
        self._write_csv(csv_file, ["name", "level", "hp"], [
            ["战士", 10, 200],
            ["法师", 8, 150],
        ])

        result = DataImporter().import_file(str(csv_file))
        assert result.success_rate == 1.0
        assert len(result.imported_data) == 2
        assert result.imported_data[0]["name"] == "战士"
        assert result.imported_data[0]["hp"] == "200"  # 未做类型映射时为字符串

        for row in result.imported_data:
            data_manager.add_item("roles", row)
        assert len(data_manager.data["roles"]) >= 2

        # 保存并重载，验证数据闭环
        data_file = temp_workspace / "imported.json"
        assert data_manager.save_file(data_file) is True

        from core.data_manager import OptimizedDataManager
        new_mgr = OptimizedDataManager()
        assert new_mgr.open_file(data_file) is True
        names = [r["name"] for r in new_mgr.data.get("roles", [])]
        assert "战士" in names and "法师" in names
        new_mgr._saved_version = new_mgr._data_version
        new_mgr.current_file = None
        new_mgr.shutdown()

    def test_csv_import_with_type_mapping(self, temp_workspace):
        """导入时类型映射：字符串 → 数值/列表"""
        from common.data_importer import DataImporter

        csv_file = temp_workspace / "mapped.csv"
        self._write_csv(csv_file, ["name", "tags", "level"], [
            ["火球术", "火系,攻击", "12"],
        ])

        result = DataImporter().import_file(
            str(csv_file),
            type_mapping={"level": "int", "tags": "list"},
        )
        assert result.success_rate == 1.0
        item = result.imported_data[0]
        assert item["level"] == 12
        assert item["tags"] == ["火系", "攻击"]

    def test_import_unsupported_format(self, temp_workspace):
        """不支持的文件格式返回结构化错误结果，不崩溃"""
        from common.data_importer import DataImporter

        bad_file = temp_workspace / "data.txt"
        bad_file.write_text("hello", encoding="utf-8")

        result = DataImporter().import_file(str(bad_file))
        assert result.success_count == 0
        assert result.error_count >= 0
        assert result.errors, "不支持的格式应给出错误说明"

    def test_csv_preview(self, temp_workspace):
        """导入界面前置预览：CSV 表头与前 N 行"""
        from common.data_importer import DataImporter

        csv_file = temp_workspace / "preview.csv"
        self._write_csv(csv_file, ["name", "level"], [
            ["战士", 10],
            ["法师", 8],
            ["牧师", 6],
            ["盗贼", 9],
            ["弓手", 7],
        ])

        headers, rows = DataImporter.preview(str(csv_file), max_rows=3)
        assert headers == ["name", "level"]
        assert len(rows) == 3, "预览只返回前 3 行"
        assert rows[0] == ["战士", "10"]
