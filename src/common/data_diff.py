from dataclasses import dataclass, field
from enum import Enum
import json
from typing import Any


class DiffType(Enum):
    ADDED = "added"
    REMOVED = "removed"
    MODIFIED = "modified"
    UNCHANGED = "unchanged"


@dataclass
class DiffEntry:
    path: str
    diff_type: DiffType
    old_value: Any = None
    new_value: Any = None
    children: list[DiffEntry] = field(default_factory=list)

    def to_dict(self) -> dict:
        result = {
            "path": self.path,
            "type": self.diff_type.value,
        }
        if self.diff_type == DiffType.MODIFIED:
            result["old"] = self._safe_serialize(self.old_value)
            result["new"] = self._safe_serialize(self.new_value)
        elif self.diff_type == DiffType.ADDED:
            result["new"] = self._safe_serialize(self.new_value)
        elif self.diff_type == DiffType.REMOVED:
            result["old"] = self._safe_serialize(self.old_value)
        if self.children:
            result["children"] = [c.to_dict() for c in self.children]
        return result

    @staticmethod
    def _safe_serialize(value: Any) -> Any:
        if isinstance(value, (str, int, float, bool, type(None))):
            return value
        if isinstance(value, (list, tuple)):
            return [DiffEntry._safe_serialize(v) for v in value]
        if isinstance(value, dict):
            return {k: DiffEntry._safe_serialize(v) for k, v in value.items()}
        return str(value)


class DataDiff:
    @staticmethod
    def compare(old_data: Any, new_data: Any, path: str = "") -> list[DiffEntry]:
        entries: list[DiffEntry] = []

        if isinstance(old_data, dict) and isinstance(new_data, dict):
            entries.extend(DataDiff._compare_dict(old_data, new_data, path))
        elif isinstance(old_data, list) and isinstance(new_data, list):
            entries.extend(DataDiff._compare_list(old_data, new_data, path))
        elif old_data != new_data:
            entries.append(DiffEntry(
                path=path or "<root>",
                diff_type=DiffType.MODIFIED,
                old_value=old_data,
                new_value=new_data,
            ))

        return entries

    @classmethod
    def _compare_dict(cls, old: dict, new: dict, path: str) -> list[DiffEntry]:
        entries: list[DiffEntry] = []
        all_keys = set(old.keys()) | set(new.keys())

        for key in sorted(all_keys):
            key_path = f"{path}.{key}" if path else key
            if key not in old:
                entries.append(DiffEntry(
                    path=key_path, diff_type=DiffType.ADDED, new_value=new[key]
                ))
            elif key not in new:
                entries.append(DiffEntry(
                    path=key_path, diff_type=DiffType.REMOVED, old_value=old[key]
                ))
            elif isinstance(old[key], dict) and isinstance(new[key], dict):
                children = cls._compare_dict(old[key], new[key], key_path)
                if children:
                    entries.append(DiffEntry(
                        path=key_path, diff_type=DiffType.MODIFIED,
                        children=children
                    ))
            elif isinstance(old[key], list) and isinstance(new[key], list):
                children = cls._compare_list(old[key], new[key], key_path)
                if children:
                    entries.append(DiffEntry(
                        path=key_path, diff_type=DiffType.MODIFIED,
                        children=children
                    ))
            elif old[key] != new[key]:
                entries.append(DiffEntry(
                    path=key_path, diff_type=DiffType.MODIFIED,
                    old_value=old[key], new_value=new[key],
                ))

        return entries

    @classmethod
    def _compare_list(cls, old: list, new: list, path: str) -> list[DiffEntry]:
        entries: list[DiffEntry] = []
        max_len = max(len(old), len(new))

        for i in range(max_len):
            item_path = f"{path}[{i}]"
            if i >= len(old):
                entries.append(DiffEntry(
                    path=item_path, diff_type=DiffType.ADDED, new_value=new[i]
                ))
            elif i >= len(new):
                entries.append(DiffEntry(
                    path=item_path, diff_type=DiffType.REMOVED, old_value=old[i]
                ))
            elif old[i] != new[i]:
                if isinstance(old[i], dict) and isinstance(new[i], dict):
                    children = cls._compare_dict(old[i], new[i], item_path)
                    if children:
                        entries.append(DiffEntry(
                            path=item_path, diff_type=DiffType.MODIFIED,
                            children=children
                        ))
                else:
                    entries.append(DiffEntry(
                        path=item_path, diff_type=DiffType.MODIFIED,
                        old_value=old[i], new_value=new[i],
                    ))

        return entries

    @staticmethod
    def format_summary(diffs: list[DiffEntry]) -> str:
        added = sum(1 for d in diffs if d.diff_type == DiffType.ADDED)
        removed = sum(1 for d in diffs if d.diff_type == DiffType.REMOVED)
        modified = sum(1 for d in diffs if d.diff_type == DiffType.MODIFIED)
        total = added + removed + modified
        return f"共 {total} 处变更: +{added} 新增, -{removed} 删除, ~{modified} 修改"

    @staticmethod
    def format_diff_report(diffs: list[DiffEntry], indent: int = 0) -> str:
        lines: list[str] = []
        prefix = "  " * indent
        for entry in diffs:
            icon = {"added": "+", "removed": "-", "modified": "~", "unchanged": " "}
            line = f"{prefix}{icon.get(entry.diff_type.value, '?')} {entry.path}"
            if entry.diff_type == DiffType.MODIFIED and not entry.children:
                old_str = str(entry.old_value)[:60]
                new_str = str(entry.new_value)[:60]
                line += f"  [{old_str}] -> [{new_str}]"
            elif entry.diff_type == DiffType.ADDED:
                line += f"  = {str(entry.new_value)[:60]}"
            elif entry.diff_type == DiffType.REMOVED:
                line += f"  was {str(entry.old_value)[:60]}"
            lines.append(line)
            if entry.children:
                lines.append(DataDiff.format_diff_report(entry.children, indent + 1))
        return "\n".join(lines)

    @staticmethod
    def to_json(diffs: list[DiffEntry]) -> str:
        return json.dumps(
            {"summary": DataDiff.format_summary(diffs),
             "changes": [d.to_dict() for d in diffs]},
            ensure_ascii=False, indent=2
        )

    @staticmethod
    def compare_items_by_id(
        old_items: list[dict], new_items: list[dict], id_field: str = "id"
    ) -> list[DiffEntry]:
        old_map = {item.get(id_field): item for item in old_items if item.get(id_field)}
        new_map = {item.get(id_field): item for item in new_items if item.get(id_field)}
        entries: list[DiffEntry] = []

        for item_id in sorted(set(old_map.keys()) & set(new_map.keys())):
            diffs = DataDiff.compare(old_map[item_id], new_map[item_id], str(item_id))
            if diffs:
                entries.extend(diffs)

        for item_id in sorted(set(new_map.keys()) - set(old_map.keys())):
            entries.append(DiffEntry(
                path=str(item_id), diff_type=DiffType.ADDED,
                new_value=new_map[item_id].get("name", item_id)
            ))

        for item_id in sorted(set(old_map.keys()) - set(new_map.keys())):
            entries.append(DiffEntry(
                path=str(item_id), diff_type=DiffType.REMOVED,
                old_value=old_map[item_id].get("name", item_id)
            ))

        return entries
