"""N4: 工业级 GDD 评分引擎 — 结构完整度 + 内容质量 + 市场潜力

评分维度（总分 100）：
- 结构完整度 (30 分)：18 章完成度 + 必填字段覆盖
- 内容质量 (40 分)：字数达标率 + 字段充实度 + 一致性
- 市场潜力 (30 分)：竞品分析 + 商业模式 + MVP 可行性

输出：
- 总分 + 三维度分项得分
- 各章节评分明细
- 改进建议清单
- 同行业对比（基于游戏类型基准）
"""
from __future__ import annotations

from dataclasses import dataclass, field
import logging
import re
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from core.ceshu.ceshu_model import CeshuModel

logger = logging.getLogger(__name__)


@dataclass
class ChapterScore:
    """章节评分"""
    chapter_key: str
    chapter_label: str
    score: float              # 0-100
    completion: float         # 0-1（来自 chapter_progress）
    word_count: int
    benchmark_word: tuple[int, int, int]   # (min, max, mid)
    has_required: bool        # 必填字段是否齐全
    missing_required: list[str]            # 缺失的必填字段
    notes: list[str] = field(default_factory=list)  # 改进建议


@dataclass
class ScoreReport:
    """评分报告"""
    total_score: float                  # 总分 0-100
    structure_score: float              # 结构完整度 0-30
    content_quality_score: float        # 内容质量 0-40
    market_potential_score: float       # 市场潜力 0-30
    grade: str                          # S/A/B/C/D
    chapter_scores: list[ChapterScore]  # 章节评分明细
    suggestions: list[str]              # 改进建议
    industry_benchmark: dict[str, Any]  # 同行业基准对比
    pass_status: dict[str, bool]        # 各项及格状态


# === 字数基准（来自 word_stats_dialog，与 F6 对齐） ===
CHAPTER_WORD_BENCHMARK = {
    "meta":            (50,   300,  150),
    "vision":          (200,  800,  400),
    "worldview":       (500,  1500, 800),
    "gameplay":        (500,  1500, 800),
    "systems":         (300,  1000, 500),
    "numeric":         (400,  1200, 600),
    "art":             (300,  1000, 500),
    "tech":            (400,  1200, 600),
    "resources":       (300,  1000, 500),
    "market_analysis": (400,  1200, 600),
    "characters":      (400,  1200, 600),
    "combat":          (400,  1200, 600),
    "economy":         (400,  1200, 600),
    "monetization":    (300,  1000, 500),
    "mvp":             (300,  1000, 500),
    "risk_handling":   (300,  1000, 500),
    "audio":           (200,  800,  400),
    "accessibility":   (200,  800,  400),
}

# === 同行业基准（按游戏类型） ===
INDUSTRY_BENCHMARKS: dict[str, dict[str, Any]] = {
    "RPG": {
        "label": "RPG / ARPG",
        "structure_avg": 25,    # 行业平均结构分（满分 30）
        "quality_avg": 30,      # 行业平均质量分（满分 40）
        "market_avg": 22,       # 行业平均市场分（满分 30）
        "total_avg": 77,
        "top_games": ["原神", "古剑奇谭", "鬼谷八荒"],
    },
    "MMORPG": {
        "label": "MMORPG",
        "structure_avg": 26,
        "quality_avg": 32,
        "market_avg": 23,
        "total_avg": 81,
        "top_games": ["魔兽世界", "最终幻想 14", "剑网 3"],
    },
    "ARPG": {
        "label": "ARPG",
        "structure_avg": 24,
        "quality_avg": 28,
        "market_avg": 21,
        "total_avg": 73,
        "top_games": ["暗黑破坏神 4", "流放之路", "永劫无间"],
    },
    "MOBA": {
        "label": "MOBA",
        "structure_avg": 27,
        "quality_avg": 33,
        "market_avg": 24,
        "total_avg": 84,
        "top_games": ["英雄联盟", "王者荣耀", "Dota 2"],
    },
    "FPS": {
        "label": "FPS / TPS",
        "structure_avg": 25,
        "quality_avg": 30,
        "market_avg": 22,
        "total_avg": 77,
        "top_games": ["CS2", "瓦罗兰特", "Apex"],
    },
    "SLG": {
        "label": "SLG / 战略",
        "structure_avg": 26,
        "quality_avg": 31,
        "market_avg": 22,
        "total_avg": 79,
        "top_games": ["文明 6", "三国志", "全战"],
    },
    "休闲益智": {
        "label": "休闲 / 益智",
        "structure_avg": 22,
        "quality_avg": 26,
        "market_avg": 20,
        "total_avg": 68,
        "top_games": ["开心消消乐", "羊了个羊", "糖豆人"],
    },
    "放置": {
        "label": "放置 / 挂机",
        "structure_avg": 22,
        "quality_avg": 25,
        "market_avg": 19,
        "total_avg": 66,
        "top_games": ["剑与远征", "咸鱼之王", "放置奇兵"],
    },
    "default": {
        "label": "通用基准",
        "structure_avg": 23,
        "quality_avg": 28,
        "market_avg": 20,
        "total_avg": 71,
        "top_games": [],
    },
}


# === 评分权重与阈值常量 ===
# 章节评分权重：完成度 / 字数达标 / 必填字段
WEIGHT_COMPLETION = 0.5
WEIGHT_WORD_COUNT = 0.3
WEIGHT_REQUIRED = 0.2

# 结构分权重与满分（完成率 60% + 必填字段覆盖 40%，满分 30）
STRUCT_WEIGHT_COMPLETION = 0.6
STRUCT_WEIGHT_REQUIRED = 0.4
STRUCT_FULL_SCORE = 30

# 内容质量分满分与一致性扣分规则
QUALITY_FULL_SCORE = 40
CONSISTENCY_PENALTY_PER_ERROR = 2   # 每个一致性错误扣 2 分
CONSISTENCY_PENALTY_MAX = 15        # 一致性扣分上限

# 市场潜力分满分
MARKET_FULL_SCORE = 30

# 及格阈值（60% 视为及格）
PASS_THRESHOLD = 0.6
PASS_THRESHOLDS = {
    "structure": round(STRUCT_FULL_SCORE * PASS_THRESHOLD),    # 18
    "quality": round(QUALITY_FULL_SCORE * PASS_THRESHOLD),     # 24
    "market": round(MARKET_FULL_SCORE * PASS_THRESHOLD),       # 18
    "total": round(100 * PASS_THRESHOLD),                      # 60
}

# 市场潜力评分规则表：章节 -> [(字段名, 分值, 最小长度或 None)]
# 当最小长度非 None 时，字段值需为可取 len 的容器且长度达标才得分。
MARKET_SCORE_RULES: dict[str, list[tuple[str, int, int | None]]] = {
    "market_analysis": [
        ("target_market", 2, None),
        ("competitors", 3, 2),
        ("market_size", 2, None),
        ("kpi_forecast", 3, None),
    ],
    "monetization": [
        ("payment_model", 2, None),
        ("pricing_tiers", 3, 3),
        ("iap_design", 3, None),
        ("arpu_target", 2, None),
    ],
    "mvp": [
        ("mvp_scope", 3, None),
        ("mvp_timeline", 2, None),
        ("milestones", 3, 2),
        ("success_criteria", 2, None),
    ],
}


# 预编译正则：避免每次调用 _count_words_in_chapter 时重复编译模式
_RE_CHINESE_CHARS = re.compile(r'[\u4e00-\u9fff]')
_RE_ENGLISH_WORDS = re.compile(r'[a-zA-Z0-9]+')


def _count_words_in_chapter(chapter_data: Any) -> int:
    """递归统计章节字数（中文按字符 + 英文按词）。

    Args:
        chapter_data: 章节数据，支持 str / dict / list / 其他类型。

    Returns:
        统计得到的字数（中文字符数 + 英文词数）；无法识别的类型返回 0。
    """
    if isinstance(chapter_data, str):
        # 使用预编译模式，避免每次调用重新编译正则
        chinese_chars = len(_RE_CHINESE_CHARS.findall(chapter_data))
        english_words = len(_RE_ENGLISH_WORDS.findall(chapter_data))
        return chinese_chars + english_words
    elif isinstance(chapter_data, dict):
        return sum(_count_words_in_chapter(v) for v in chapter_data.values())
    elif isinstance(chapter_data, list):
        return sum(_count_words_in_chapter(item) for item in chapter_data)
    return 0


def _grade_from_score(score: float) -> str:
    """根据总分映射等级（S/A/B/C/D）。

    Args:
        score: 总分 0-100。

    Returns:
        等级字符：S(>=90) / A(>=80) / B(>=70) / C(>=60) / D(<60)。
    """
    if score >= 90:
        return "S"
    elif score >= 80:
        return "A"
    elif score >= 70:
        return "B"
    elif score >= 60:
        return "C"
    else:
        return "D"


def _grade_label(grade: str) -> str:
    return {
        "S": "S 卓越 — 工业级标杆",
        "A": "A 优秀 — 接近工业级",
        "B": "B 良好 — 基本达标",
        "C": "C 合格 — 待优化",
        "D": "D 不足 — 需重做",
    }.get(grade, "未知")


# === 主评分函数 ===

def score_ceshu(model: CeshuModel) -> ScoreReport:
    """N4: 评估 CeshuModel 的工业级 GDD 评分。

    编排各维度子评分（结构 / 质量 / 市场），汇总生成评分报告。

    Args:
        model: CeshuModel 实例。

    Returns:
        ScoreReport 评分报告，包含总分、三维度分项、章节明细、
        改进建议、同行业基准对比与及格状态。
    """
    from core.ceshu.ceshu_model import (
        CHAPTER_KEYS,
        CHAPTER_LABELS,
        CHAPTER_REQUIRED_FIELDS,
    )

    chapter_scores = _score_chapters(
        model, CHAPTER_KEYS, CHAPTER_LABELS, CHAPTER_REQUIRED_FIELDS
    )
    structure_score, struct_info, empty_count = _calc_structure_score(
        chapter_scores, CHAPTER_KEYS, CHAPTER_REQUIRED_FIELDS
    )
    quality_score, errors = _calc_quality_score(chapter_scores, model)
    market_score = _calc_market_score(model)

    total = round(structure_score + quality_score + market_score, 1)
    grade = _grade_from_score(total)

    suggestions = _build_suggestions(
        empty_count=empty_count,
        missing_required_total=struct_info["missing_required_total"],
        missing_required_count=struct_info["missing_required_count"],
        errors=errors,
        chapter_scores=chapter_scores,
        structure_score=structure_score,
        quality_score=quality_score,
        market_score=market_score,
        chapter_labels=CHAPTER_LABELS,
    )
    industry_benchmark = _build_industry_benchmark(
        model, structure_score, quality_score, market_score, total
    )
    pass_status = _build_pass_status(
        structure_score, quality_score, market_score, total
    )

    return ScoreReport(
        total_score=total,
        structure_score=structure_score,
        content_quality_score=quality_score,
        market_potential_score=market_score,
        grade=grade,
        chapter_scores=chapter_scores,
        suggestions=suggestions,
        industry_benchmark=industry_benchmark,
        pass_status=pass_status,
    )


def _score_chapters(
    model: CeshuModel,
    chapter_keys: list[str],
    labels: dict[str, str],
    required_fields: dict[str, list[str]],
) -> list[ChapterScore]:
    """遍历全部章节，计算单章评分。

    单章评分 = 完成度 * WEIGHT_COMPLETION + 字数达标 * WEIGHT_WORD_COUNT
              + 必填字段 * WEIGHT_REQUIRED。

    Args:
        model: CeshuModel 实例。
        chapter_keys: 章节键列表。
        labels: 章节键 → 中文标签映射。
        required_fields: 章节键 → 必填字段列表映射。

    Returns:
        各章节的 ChapterScore 列表。
    """
    progress = model.chapter_progress() if hasattr(model, 'chapter_progress') else {}
    chapter_scores: list[ChapterScore] = []
    for key in chapter_keys:
        label = labels.get(key, key)
        pct = progress.get(key, 0)
        pct_val = int(pct * 100) if isinstance(pct, (int, float)) else 0

        chapter_data = model.get_chapter(key) if hasattr(model, 'get_chapter') else {}
        word_count = _count_words_in_chapter(chapter_data)
        benchmark = CHAPTER_WORD_BENCHMARK.get(key, (0, 0, 0))

        # 必填字段检查
        required = required_fields.get(key, [])
        missing: list[str] = []
        if required and isinstance(chapter_data, dict):
            for f in required:
                v = chapter_data.get(f)
                if v in (None, "", [], {}):
                    missing.append(f)
        has_required = len(missing) == 0

        # 单章评分：完成度 50% + 字数达标 30% + 必填字段 20%
        completion_score = min(100, pct_val)
        word_score = 100
        if benchmark[2] > 0:
            if word_count == 0:
                word_score = 0
            elif word_count < benchmark[0]:
                word_score = 30
            elif word_count < benchmark[2]:
                word_score = 60 + int(40 * (word_count - benchmark[0]) /
                                       max(1, benchmark[2] - benchmark[0]))
            elif word_count <= benchmark[1]:
                word_score = 100
            else:
                word_score = 90  # 略超不算扣分
        required_score = 100 if has_required else max(0, 100 - 30 * len(missing))
        ch_score = (completion_score * WEIGHT_COMPLETION
                    + word_score * WEIGHT_WORD_COUNT
                    + required_score * WEIGHT_REQUIRED)

        notes: list[str] = []
        if pct_val < 50:
            notes.append(f"完成度仅 {pct_val}%，需补充内容")
        if word_count < benchmark[0] and benchmark[0] > 0:
            notes.append(f"字数 {word_count} < 最低标准 {benchmark[0]}")
        if missing:
            notes.append(f"缺失必填字段: {', '.join(missing)}")

        chapter_scores.append(ChapterScore(
            chapter_key=key,
            chapter_label=label,
            score=round(ch_score, 1),
            completion=pct,
            word_count=word_count,
            benchmark_word=benchmark,
            has_required=has_required,
            missing_required=missing,
            notes=notes,
        ))
    return chapter_scores


def _calc_structure_score(
    chapter_scores: list[ChapterScore],
    chapter_keys: list[str],
    required_fields: dict[str, list[str]],
) -> tuple[float, dict, int]:
    """计算结构完整度分（满分 STRUCT_FULL_SCORE）。

    完成率 * STRUCT_WEIGHT_COMPLETION + 必填字段覆盖率 * STRUCT_WEIGHT_REQUIRED，
    再折算到满分制。

    Args:
        chapter_scores: 各章节评分。
        chapter_keys: 全部章节键。
        required_fields: 章节键 → 必填字段列表映射。

    Returns:
        (structure_score, info_dict, empty_count) 三元组：
        - structure_score: 结构分（0-30）
        - info_dict: 含 completed_count / half_count / empty_count /
          missing_required_total / missing_required_count
        - empty_count: 完全未填写的章节数
    """
    completed_count = 0
    half_count = 0
    empty_count = 0
    missing_required_total: list[tuple[str, list[str]]] = []

    for c in chapter_scores:
        pct = c.completion
        pct_val = int(pct * 100) if isinstance(pct, (int, float)) else 0
        if pct_val >= 100:
            completed_count += 1
        elif pct_val > 0:
            half_count += 1
        else:
            empty_count += 1
        if c.missing_required:
            missing_required_total.append((c.chapter_key, c.missing_required))

    completion_rate = (completed_count * 1.0 + half_count * 0.5) / len(chapter_keys)
    total_required = sum(len(required_fields.get(k, [])) for k in chapter_keys)
    missing_required_count = sum(len(m[1]) for m in missing_required_total)
    required_coverage = 1.0 - (missing_required_count / max(1, total_required))
    structure_score = round(
        (completion_rate * STRUCT_WEIGHT_COMPLETION
         + required_coverage * STRUCT_WEIGHT_REQUIRED) * STRUCT_FULL_SCORE, 1
    )

    info = {
        "completed_count": completed_count,
        "half_count": half_count,
        "empty_count": empty_count,
        "missing_required_total": missing_required_total,
        "missing_required_count": missing_required_count,
    }
    return structure_score, info, empty_count


def _calc_quality_score(
    chapter_scores: list[ChapterScore],
    model: CeshuModel,
) -> tuple[float, list[str]]:
    """计算内容质量分（满分 QUALITY_FULL_SCORE）。

    由平均章节分折算到 40 分制，再减去一致性校验扣分。

    Args:
        chapter_scores: 各章节评分。
        model: CeshuModel 实例，用于一致性校验。

    Returns:
        (quality_score, errors) 二元组：质量分（0-40）与一致性错误列表。
    """
    avg_chapter_score = (sum(c.score for c in chapter_scores) / len(chapter_scores)
                         if chapter_scores else 0)

    # 一致性校验（异常时记录日志，按无错误处理）
    errors: list[str] = []
    if hasattr(model, 'validate'):
        try:
            errors = model.validate() or []
        except Exception as e:
            logger.warning("model.validate() 抛出异常，按无错误处理: %s", e)
            errors = []

    consistency_penalty = min(
        CONSISTENCY_PENALTY_MAX, len(errors) * CONSISTENCY_PENALTY_PER_ERROR
    )
    quality_score = round(
        avg_chapter_score / 100 * QUALITY_FULL_SCORE - consistency_penalty, 1
    )
    quality_score = max(0, min(QUALITY_FULL_SCORE, quality_score))
    return quality_score, errors


def _score_market_section(data: Any, rules: list[tuple[str, int, int | None]]) -> int:
    """根据规则表为单个市场章节评分。

    Args:
        data: 章节数据（应为 dict，其他类型返回 0）。
        rules: 评分规则列表，每项为 (字段名, 分值, 最小长度或 None)。
            字段值为 falsy 时不计分；当最小长度非 None 时，字段值需为
            可取 len 的容器且长度达标才得分。

    Returns:
        该章节累计得分。
    """
    if not isinstance(data, dict):
        return 0
    score = 0
    for field_name, points, min_len in rules:
        value = data.get(field_name)
        if not value:
            continue
        if min_len is not None and len(value) < min_len:
            continue
        score += points
    return score


def _calc_market_score(model: CeshuModel) -> float:
    """计算市场潜力分（满分 MARKET_FULL_SCORE）。

    市场分析 + 商业模式 + MVP 可行性各 10 分（由 MARKET_SCORE_RULES 驱动），
    另对愿景差异化给予 +1 加分。

    Args:
        model: CeshuModel 实例。

    Returns:
        市场潜力分（0-30）。
    """
    market_data = model.get_chapter("market_analysis") if hasattr(model, 'get_chapter') else {}
    monetization_data = model.get_chapter("monetization") if hasattr(model, 'get_chapter') else {}
    mvp_data = model.get_chapter("mvp") if hasattr(model, 'get_chapter') else {}
    vision_data = model.get_chapter("vision") if hasattr(model, 'get_chapter') else {}

    score = 0
    score += _score_market_section(market_data, MARKET_SCORE_RULES["market_analysis"])
    score += _score_market_section(monetization_data, MARKET_SCORE_RULES["monetization"])
    score += _score_market_section(mvp_data, MARKET_SCORE_RULES["mvp"])

    # 差异化加分
    if isinstance(vision_data, dict) and vision_data.get("differentiation"):
        score = min(MARKET_FULL_SCORE, score + 1)

    return round(score, 1)


def _build_suggestions(
    *,
    empty_count: int,
    missing_required_total: list[tuple[str, list[str]]],
    missing_required_count: int,
    errors: list[str],
    chapter_scores: list[ChapterScore],
    structure_score: float,
    quality_score: float,
    market_score: float,
    chapter_labels: dict[str, str],
) -> list[str]:
    """生成改进建议清单。

    Args:
        empty_count: 完全未填写的章节数。
        missing_required_total: 缺失必填字段的 (章节键, 缺失字段列表) 列表。
        missing_required_count: 缺失必填字段总数。
        errors: 一致性校验错误列表。
        chapter_scores: 各章节评分。
        structure_score: 结构完整度分。
        quality_score: 内容质量分。
        market_score: 市场潜力分。
        chapter_labels: 章节键 → 中文标签映射。

    Returns:
        改进建议字符串列表；全部表现良好时返回肯定提示。
    """
    suggestions: list[str] = []
    if empty_count > 0:
        suggestions.append(f"📋 有 {empty_count} 章完全未填写，请优先补全核心章节（meta/vision/gameplay）")
    if missing_required_total:
        suggestions.append(f"⚠️ 共缺失 {missing_required_count} 个必填字段，影响结构完整度评分")
        for k, miss in missing_required_total[:5]:
            label = chapter_labels.get(k, k)
            suggestions.append(f"   - {label}: {', '.join(miss)}")
    if errors:
        suggestions.append(f"🔍 校验发现 {len(errors)} 个一致性问题，建议通过「校验」按钮查看详情")
    # 字数不足章节
    low_word_chapters = [c for c in chapter_scores
                         if c.word_count < c.benchmark_word[0] and c.benchmark_word[0] > 0]
    if low_word_chapters:
        suggestions.append(f"📝 {len(low_word_chapters)} 章字数低于最低标准，建议扩充内容")
    # 评分维度建议
    if structure_score < 20:
        suggestions.append("🏗️ 结构完整度偏低，建议优先补全必填字段")
    if quality_score < 25:
        suggestions.append("✍️ 内容质量偏低，建议参考「字数」按钮的写作建议")
    if market_score < 20:
        suggestions.append("📈 市场潜力偏低，建议完善市场分析、商业模式、MVP 规划三章")

    if not suggestions:
        suggestions.append("✅ 各维度表现良好，已达到工业级标准！")
    return suggestions


def _build_industry_benchmark(
    model: CeshuModel,
    structure: float,
    quality: float,
    market: float,
    total: float,
) -> dict[str, Any]:
    """构建同行业基准对比数据。

    Args:
        model: CeshuModel 实例，用于读取 game_type。
        structure: 结构完整度分。
        quality: 内容质量分。
        market: 市场潜力分。
        total: 总分。

    Returns:
        包含行业均值与差距（vs_*）的字典。
    """
    game_type = model.meta.get("game_type", "") if hasattr(model, 'meta') else ""
    benchmark = INDUSTRY_BENCHMARKS.get(game_type, INDUSTRY_BENCHMARKS["default"])
    return {
        "game_type": game_type,
        "label": benchmark["label"],
        "structure_avg": benchmark["structure_avg"],
        "quality_avg": benchmark["quality_avg"],
        "market_avg": benchmark["market_avg"],
        "total_avg": benchmark["total_avg"],
        "top_games": benchmark["top_games"],
        "vs_structure": round(structure - benchmark["structure_avg"], 1),
        "vs_quality": round(quality - benchmark["quality_avg"], 1),
        "vs_market": round(market - benchmark["market_avg"], 1),
        "vs_total": round(total - benchmark["total_avg"], 1),
    }


def _build_pass_status(
    structure: float,
    quality: float,
    market: float,
    total: float,
) -> dict[str, bool]:
    """计算各维度及格状态。

    Args:
        structure: 结构完整度分。
        quality: 内容质量分。
        market: 市场潜力分。
        total: 总分。

    Returns:
        各维度是否及格（对照 PASS_THRESHOLDS）的字典。
    """
    return {
        "structure": structure >= PASS_THRESHOLDS["structure"],
        "quality": quality >= PASS_THRESHOLDS["quality"],
        "market": market >= PASS_THRESHOLDS["market"],
        "total": total >= PASS_THRESHOLDS["total"],
    }


def grade_label(grade: str) -> str:
    """获取等级对应的中文文字说明。

    Args:
        grade: 等级字符 S/A/B/C/D。

    Returns:
        等级说明文本，如 "S 卓越 — 工业级标杆"。
    """
    return _grade_label(grade)
