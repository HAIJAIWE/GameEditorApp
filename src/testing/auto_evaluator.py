"""Agent OS §9 — 评估与对齐层：LLM-as-Judge 自动评分 + 评估历史追踪"""

from common.logger import get_logger

logger = get_logger()

import json
from pathlib import Path
import time


def evaluate_response(user_input: str, agent_response: str, config) -> tuple[int, str, dict]:
    """用另一个 LLM 调用对 agent 输出多维度打分（1-10分）
    
    Returns: (score, feedback, dimensions)
    """
    from common.ai_client import generate_text

    judge_prompt = (
        "你是一个质量评估器。对以下AI助手的回复进行四维打分（每维度1-10分）。\n"
        "评估维度：准确性(是否事实正确)、相关性(是否贴合用户需求)、"
        "格式规范(结构清晰易读)、简洁有力(无冗余废话)\n\n"
        f"用户输入: {user_input[:200]}\n"
        f"AI回复: {agent_response[:500]}\n\n"
        "请只输出一个JSON:\n"
        '{"score": 综合分(1-10), "dimensions": {"accuracy": 分, "relevance": 分, "format": 分, "conciseness": 分}, "feedback": "简短反馈"}'
    )

    try:
        success, result = generate_text(config, judge_prompt, None, None)
        if not success:
            return 5, "评分失败", {"accuracy": 5, "relevance": 5, "format": 5, "conciseness": 5}

        clean = result.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean)
        dimensions = data.get("dimensions", {})
        return (
            int(data.get("score", 5)),
            data.get("feedback", "无反馈"),
            {
                "accuracy": int(dimensions.get("accuracy", 5)),
                "relevance": int(dimensions.get("relevance", 5)),
                "format": int(dimensions.get("format", 5)),
                "conciseness": int(dimensions.get("conciseness", 5)),
            },
        )
    except Exception:
        return 5, "评分异常", {"accuracy": 5, "relevance": 5, "format": 5, "conciseness": 5}


def auto_reflect_if_low(user_input: str, agent_response: str, config, memory) -> dict:
    """评分低于6分时自动触发反思记录。Returns: {score, feedback, dimensions, reflected}"""
    score, feedback, dimensions = evaluate_response(user_input, agent_response, config)
    reflected = False
    if score < 6:
        memory.save_learning("low_score",
            f"评分{score}/10: {feedback}\n用户输入: {user_input[:100]}\n回复: {agent_response[:200]}")
        reflected = True
    # Agent OS §9: 记录评估历史
    _save_eval_history(user_input[:100], agent_response[:200], score, feedback, dimensions)
    return {"score": score, "feedback": feedback, "dimensions": dimensions, "reflected": reflected}


def get_eval_stats(memory_dir: str = None, n: int = 50) -> dict:
    """Agent OS §9: 评估统计 — 返回最近的评分趋势"""
    history = _load_eval_history(memory_dir, n)
    if not history:
        return {"count": 0, "avg_score": 0, "min_score": 0, "max_score": 0, "below_6": 0, "trend": "无数据"}

    scores = [h.get("score", 5) for h in history]
    below_6 = sum(1 for s in scores if s < 6)
    trend = "上升" if len(scores) >= 3 and scores[-1] > scores[0] else (
        "下降" if len(scores) >= 3 and scores[-1] < scores[0] else "平稳"
    )
    dims = history[-1].get("dimensions", {}) if history else {}
    return {
        "count": len(scores),
        "avg_score": round(sum(scores) / len(scores), 1),
        "min_score": min(scores),
        "max_score": max(scores),
        "below_6": below_6,
        "below_6_rate": f"{below_6}/{len(scores)}",
        "trend": trend,
        "last_dimensions": dims,
    }


def _get_eval_file(memory_dir: str = None) -> Path:
    if memory_dir:
        return Path(memory_dir) / "eval_history.jsonl"
    from pathlib import Path as P
    return P(__file__).resolve().parent.parent.parent / "data" / "memory" / "eval_history.jsonl"


def _save_eval_history(user_input: str, response: str, score: int, feedback: str, dimensions: dict):
    try:
        fp = _get_eval_file()
        fp.parent.mkdir(parents=True, exist_ok=True)
        entry = {
            "timestamp": time.time(),
            "time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "user": user_input,
            "response": response,
            "score": score,
            "feedback": feedback,
            "dimensions": dimensions,
        }
        with open(fp, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        logger.warning(f"操作失败: {e}")


def _load_eval_history(memory_dir: str = None, n: int = 50) -> list:
    fp = _get_eval_file(memory_dir)
    if not fp.exists():
        return []
    entries = []
    try:
        with open(fp, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except Exception:
        return []
    return entries[-n:]
