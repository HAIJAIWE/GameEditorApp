from __future__ import annotations

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import normalize_params


class GameBalanceSkill(BaseSkill):
    name = "tool.game_balance"
    description = "游戏平衡分析: 战斗力曲线、属性分布、数值合理性检查"
    version = "1.0.0"
    parameters = [
        {"name": "action", "required": True, "description": "analyze/check/compare/recommend"},
        {"name": "data_type", "required": False, "description": "角色(role)/技能(skill)/怪物(monster)/装备(equip)"},
        {"name": "field", "required": False, "description": "分析字段: atk/def/hp/power/cost"},
        {"name": "sort_by", "required": False, "description": "排序字段"},
    ]
    tags = ["balance", "analysis", "design", "gameplay", "power"]

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        self._logger = get_logger()
        action = params.get("action", "analyze")
        data_type = params.get("data_type", "role")

        dm = context.get("data_manager")
        if not dm:
            main_win = context.get("main_window")
            if main_win:
                dm = getattr(main_win, 'data_manager', None)
        if not dm:
            return {"success": False, "error": "数据管理器未初始化", "message": ""}

        from core.agent.skills.common import _resolve_plural
        plural = _resolve_plural(data_type)
        items = dm.data.get(plural, []) if hasattr(dm, 'data') else []
        if not items:
            return {"success": False, "error": f"没有 {data_type} 数据", "message": ""}

        items_list = items if isinstance(items, list) else list(items.values())

        try:
            if action == "analyze":
                return self._analyze(items_list, data_type)
            elif action == "power_curve":
                return self._power_curve(items_list, data_type)
            elif action == "outlier_check":
                return self._outlier_check(items_list, data_type, params)
            else:
                return {"success": False, "error": f"未知action: {action}", "message": ""}
        except Exception as e:
            self._logger.error(f"平衡分析失败: {e}", exc_info=True)
            return {"success": False, "error": str(e), "message": ""}

    def _analyze(self, items: list, dtype: str) -> dict:
        numeric_fields = self._find_numeric_fields(items)
        if not numeric_fields:
            return {"success": True, "message": "无可分析的数值字段", "data": None}

        stats = {}
        for field in numeric_fields[:6]:
            values = [self._get_num(item, field) for item in items]
            values = [v for v in values if v is not None]
            if not values:
                continue
            values.sort()
            total = len(values)
            stats[field] = {
                "min": min(values), "max": max(values),
                "mean": round(sum(values) / total, 1),
                "median": values[total // 2] if total > 0 else 0,
                "range": max(values) - min(values),
                "max/min": round(max(values) / min(values), 1) if min(values) > 0 else "N/A",
            }

        lines = [f"## {dtype} 数值分析 ({len(items)}条)\n"]
        for field, s in stats.items():
            ratio = s["max/min"]
            status = "✓" if (isinstance(ratio, (int, float)) and ratio < 10) else "[WARN] 差距大"
            lines.append(
                f"**{field}**: 最小{s['min']} / 最大{s['max']} / "
                f"平均{s['mean']} / 倍率{ratio} {status}"
            )
        return {"success": True, "message": "\n".join(lines), "data": stats}

    def _power_curve(self, items: list, dtype: str) -> dict:
        fields = self._find_numeric_fields(items)
        if not fields:
            return {"success": True, "message": "无可分析的数值字段", "data": None}

        items_sorted = sorted(
            [i for i in items if isinstance(i, dict) and i.get("name")],
            key=lambda x: self._get_num(x, fields[0]) if self._get_num(x, fields[0]) else 0
        )

        lines = [f"## {dtype} 成长曲线\n"]
        for item in items_sorted[-15:]:
            name = item.get("name", "?")
            parts = [f"{self._get_num(item, f, '')}" for f in fields[:4]]
            lines.append(f"- {name}: {' / '.join(str(p) for p in parts)}")

        return {"success": True, "message": "\n".join(lines),
                "data": {"count": len(items), "sorted_by": fields[0]}}

    def _outlier_check(self, items: list, dtype: str, params: dict) -> dict:
        field = params.get("field")
        if not field:
            field = self._find_numeric_fields(items)[0] if self._find_numeric_fields(items) else None
        if not field:
            return {"success": False, "error": "无可分析字段", "message": ""}

        values = [(self._get_num(item, field) or 0, item) for item in items if isinstance(item, dict)]
        values.sort()

        if len(values) < 5:
            return {"success": True, "message": "数据量太少(<5)，无法判断异常值", "data": None}

        nums = [v[0] for v in values]
        avg = sum(nums) / len(nums)
        std = (sum((n - avg) ** 2 for n in nums) / len(nums)) ** 0.5

        outliers = []
        for val, item in values:
            if abs(val - avg) > 2.5 * std and abs(val - avg) > 0.01:
                name = item.get("name", "?")
                direction = "偏高" if val > avg else "偏低"
                outliers.append(f"- {name}: {field}={val} 显著{direction}(均值{avg:.1f}±{std:.1f})")

        if outliers:
            return {"success": True,
                    "message": f"## 异常值检测 ({field})\n" + "\n".join(outliers[:10]),
                    "data": {"field": field, "outliers": len(outliers), "mean": round(avg, 1)}}
        return {"success": True, "message": f"## 异常值检测 ({field})\n未发现显著异常值", "data": {"field": field, "mean": round(avg, 1)}}

    @staticmethod
    def _find_numeric_fields(items: list) -> list:
        field_counts: dict[str, int] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            for k, v in item.items():
                if k in ("id", "name", "description", "notes", "type"):
                    continue
                if isinstance(v, (int, float)):
                    field_counts[k] = field_counts.get(k, 0) + 1
        return [k for k, c in sorted(field_counts.items(), key=lambda x: -x[1]) if c > 0]

    @staticmethod
    def _get_num(item, field, default=0):
        if not isinstance(item, dict):
            return default
        val = item.get(field)
        if isinstance(val, dict):
            val = val.get("value", val.get("base", 0))
        return val if isinstance(val, (int, float)) else default
