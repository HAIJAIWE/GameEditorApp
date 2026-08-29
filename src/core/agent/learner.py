from __future__ import annotations

from collections import defaultdict
import time
from typing import Any

from common.logger import get_logger
from core.agent.memory import Memory
from core.agent.models import FeedbackRecord, Intent


class Learner:
    PATTERN_THRESHOLD = 3
    MAX_HISTORY = 50
    TEMPORAL_WINDOW_HOURS = 2

    def __init__(self, memory: Memory):
        self._memory = memory
        self._tool_log = []  # Agent OS: 工具调用日志
        self._logger = get_logger()
        self._action_counts: dict = defaultdict(int)
        self._usage_times: dict = defaultdict(list)
        self._operation_history: list[tuple] = []
        self._action_transitions: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._temporal_patterns: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._feedback_cache: dict[str, list[FeedbackRecord]] = defaultdict(list)
        self._last_action: str = ""

        self._warm_start()

    def _warm_start(self):
        """冷启动预热 — 注入游戏编辑器常见操作模式，避免全新 Learner 返回空"""
        common_actions = ["create_item", "query", "update_item", "search", "export_doc"]
        for act in common_actions:
            self._action_counts[act] = 2

        transitions = {
            "get_data_summary": {"search_items": 3, "create_item": 2},
            "search_items": {"update_current_item": 4, "delete_current_item": 1, "query": 3},
            "create_item": {"update_current_item": 3, "query": 2},
            "update_current_item": {"search_items": 2, "export_doc": 1},
            "query": {"update_item": 3, "export_doc": 2, "analyze": 2},
        }
        for src, dests in transitions.items():
            for dst, count in dests.items():
                self._action_transitions[src][dst] = count

        for hour in range(24):
            w = 1.0 if 9 <= hour <= 18 else 0.3
            for act, factor in [("query", 3), ("search_items", 2), ("create_item", 2),
                                ("update_current_item", 2), ("export_doc", 1)]:
                self._temporal_patterns[hour][act] = int(w * factor)

        self._logger.info("Learner 冷启动完成: 5 动作 + 6 转移组 + 24h 时态模板")

    # ====================================================================
    #  核心 refine: 基于历史 + 时间模式 + 反馈增强 Intent
    # ====================================================================

    def refine(self, intent: Intent) -> Intent:
        # 1. 偏好注入
        self._inject_preferences(intent)

        # 2. 操作历史自动推荐（上下文预测）
        self._inject_contextual_hints(intent)

        # 3. 时间模式推断
        self._inject_temporal_hints(intent)

        # 4. 基于反馈历史调整 confidence
        self._adjust_confidence_from_feedback(intent)

        # 5. 如果有备选意图列表，基于历史为每个备选意图打分
        if intent.alternatives:
            intent.alternatives = self._rank_alternatives(intent.alternatives)

        return intent

    # ====================================================================
    #  观察: 记录操作结果并挖掘模式
    # ====================================================================

    def observe(self, intent: Intent, result: dict, plan: Any = None):
        if intent is None:
            return
        now = time.time()
        self._record_tool(intent.action, intent.params, result.get("success", False),
                          result.get("message", ""), now, intent.confidence, plan.plan_id if plan else None)

    def observe_tool_call(self, tool_name: str, params: dict, success: bool,
                          result_msg: str = "", plan_id: str = None):
        self._record_tool(tool_name, params, success, result_msg, time.time(),
                          confidence=0.8 if success else 0.3, plan_id=plan_id)

    def _record_tool(self, action: str, params: dict, success: bool,
                     result_msg: str, now: float, confidence: float = 0.5,
                     plan_id: str = None):
        # 短期记忆
        self._memory.save_short_term(f"last_intent_{action}", params)
        self._memory.save_short_term("last_result", {"success": success, "message": result_msg[:200]})

        # 计数与时间
        self._action_counts[action] += 1
        self._usage_times[action].append(now)

        # 操作历史
        params_summary = self._summarize_params(params)
        self._operation_history.append((now, action, params_summary))
        # Agent OS 反思循环：记录工具调用
        self._tool_log.append({
            "action": action, "params": params_summary,
            "success": success, "result": result_msg,
            "timestamp": now,
        })
        if len(self._operation_history) > self.MAX_HISTORY:
            self._operation_history.pop(0)

        # 转移矩阵
        if self._last_action:
            self._action_transitions[self._last_action][action] += 1
        self._last_action = action

        # 时间模式：按小时分组
        hour = self._get_hour(now)
        self._temporal_patterns[hour][action] += 1

        # 行为日志
        self._memory.log_behavior(action, {
            "confidence": confidence,
            "plan_id": plan_id,
            "success": success,
            "timestamp": now,
        })

        # 如果操作成功率高，自动学习为偏好
        if success:
            self._learn_successful_params(action, params, confidence)

        self._mine_patterns()

    # ====================================================================
    #  反馈记录
    # ====================================================================

    def record_feedback(self, plan_id: str, rating: int, comment: str = ""):
        now = time.time()
        fb = FeedbackRecord(plan_id=plan_id, rating=rating, comment=comment, timestamp=now)
        self._memory.save_feedback(fb)

        # 缓存反馈用于 confidence 调整
        self._feedback_cache[plan_id].append(fb)
        if len(self._feedback_cache) > 100:
            oldest = min(self._feedback_cache.keys(), key=lambda k: self._feedback_cache[k][0].timestamp
                         if self._feedback_cache[k] else 0)
            del self._feedback_cache[oldest]

        if rating <= 2:
            self._memory.set_preference("last_bad_action", plan_id)
            self._logger.info(f"Negative feedback recorded for {plan_id}")

        # 根据反馈调整偏好
        if rating >= 4 and comment:
            self._extract_preference_from_feedback(comment)

    # ====================================================================
    #  个性化提示
    # ====================================================================

    def get_personalized_prompt(self) -> str:
        parts = []

        editor = self._memory.get_preference("code_editor")
        if editor:
            parts.append(f"用户偏好代码编辑器：{editor}")

        archive = self._memory.get_preference("archive_dir")
        if archive:
            parts.append(f"用户常用归档目录：{archive}")

        lang = self._memory.get_preference("language")
        if lang:
            parts.append(f"用户偏好语言：{lang}")

        # 常用操作提示
        habits = self.get_habits()
        if habits.get("frequent_actions"):
            top = habits["frequent_actions"][:3]
            parts.append(f"用户常用操作：{', '.join(a['action'] for a in top)}")

        # 时间模式提示
        current_hour = self._get_hour(time.time())
        if current_hour in self._temporal_patterns:
            peak_action = max(
                self._temporal_patterns[current_hour].items(),
                key=lambda x: x[1],
                default=(None, 0),
            )
            if peak_action[1] >= 2:
                parts.append(f"当前时段用户常进行：{peak_action[0]}")

        return "\n".join(parts) if parts else ""

    # ====================================================================
    #  习惯获取
    # ====================================================================

    def get_habits(self) -> dict:
        frequent = [
            {"action": k, "count": v}
            for k, v in sorted(
                self._action_counts.items(), key=lambda x: x[1], reverse=True
            )[:5]
        ]
        result = {"frequent_actions": frequent}

        # 推荐下一个可能操作
        if self._last_action and self._last_action in self._action_transitions:
            transitions = self._action_transitions[self._last_action]
            next_actions = sorted(transitions.items(), key=lambda x: x[1], reverse=True)[:3]
            if next_actions:
                result["suggested_next"] = [
                    {"action": a, "probability": round(c / sum(v for _, v in next_actions), 2)}
                    for a, c in next_actions
                ]

        # 时间模式总结
        result["temporal_patterns"] = {
            str(h): sorted(acts.items(), key=lambda x: x[1], reverse=True)[:3]
            for h, acts in sorted(self._temporal_patterns.items())
            if sum(acts.values()) >= 3
        }

        return result

    # ====================================================================
    #  私有方法 - 意图增强
    # ====================================================================

    def _inject_preferences(self, intent: Intent):
        """注入用户偏好到意图参数"""
        pref_action = self._memory.get_preference("default_action")
        if pref_action and not intent.params.get("action"):
            intent.params["action"] = pref_action

        pref_editor = self._memory.get_preference("code_editor")
        if pref_editor and intent.category == "code":
            intent.params["editor"] = pref_editor

        pref_lang = self._memory.get_preference("language")
        if pref_lang and intent.category == "code" and not intent.params.get("language"):
            intent.params["language"] = pref_lang

        archive_dir = self._memory.get_preference("archive_dir")
        if archive_dir and intent.action in ("file_organize", "file_search", "file_read", "file_write"):
            if not intent.params.get("target") and not intent.params.get("path"):
                intent.params["target"] = archive_dir

    def _inject_contextual_hints(self, intent: Intent):
        """基于操作历史推测上下文相关的参数"""
        if not self._operation_history:
            return

        # 查找最近一次相同 action 的参数，作为默认填充
        recent_same = None
        for ts, act, psum in reversed(self._operation_history):
            if act == intent.action:
                recent_same = psum
                break

        if recent_same:
            # 如果当前意图缺少 path/keyword，从历史中补充
            if not intent.params.get("path") and recent_same.get("path"):
                intent.params["path"] = recent_same["path"]
            if not intent.params.get("keyword") and recent_same.get("keyword"):
                intent.params["keyword"] = recent_same["keyword"]
            if not intent.params.get("language") and recent_same.get("language"):
                intent.params["language"] = recent_same["language"]

            # 附加历史提示
            intent.params.setdefault("_history_hint", f"最近也进行过 {intent.action} 操作")

        # 如果上一个操作后通常跟随某个操作，提升对应备选意图
        if self._last_action and self._last_action in self._action_transitions:
            transitions = self._action_transitions[self._last_action]
            total = sum(transitions.values())
            if total >= 3:
                # 如果当前意图置信度较低，尝试替换为高频后继
                predicted_next = max(transitions.items(), key=lambda x: x[1])
                prob = predicted_next[1] / total
                if intent.confidence < 0.5 and prob > 0.4:
                    # 不自作主张替换，但提供提示
                    intent.params.setdefault(
                        "_transition_hint",
                        f"上一步是 {self._last_action}，{prob * 100:.1f}% 概率接下来是 {predicted_next[0]}"
                    )

    def _inject_temporal_hints(self, intent: Intent):
        """基于时间模式推断意图"""
        current_hour = self._get_hour(time.time())

        if current_hour not in self._temporal_patterns:
            return

        hour_actions = self._temporal_patterns[current_hour]
        total = sum(hour_actions.values())
        if total < 3:
            return

        # 如果当前意图置信度低，且该时段有高频操作，尝试调整
        peak_action, peak_count = max(hour_actions.items(), key=lambda x: x[1])
        peak_prob = peak_count / total

        if peak_prob > 0.5 and intent.confidence < 0.6:
            # 提供时间模式提示但不强制覆盖
            intent.params.setdefault(
                "_temporal_hint",
                f"当前时段（{current_hour}:00）通常进行 {peak_action} 操作（{peak_prob * 100:.0f}%）"
            )

    def _adjust_confidence_from_feedback(self, intent: Intent):
        """根据该 action 的历史反馈调整 confidence"""
        # 统计该 action 的历史反馈评分
        ratings = []
        for fb_list in self._feedback_cache.values():
            for fb in fb_list:
                # 尝试从 plan_id 推断 action（plan_id 格式为 plan_xxxxx）
                ratings.append(fb.rating)

        if not ratings:
            return

        avg_rating = sum(ratings) / len(ratings)
        # 平均评分 4+ 提升 confidence，2- 降低
        if avg_rating >= 4.0:
            intent.confidence = min(1.0, intent.confidence + 0.08)
        elif avg_rating <= 2.0:
            intent.confidence = max(0.1, intent.confidence - 0.1)

        # 从长期记忆中读取与该 action 相关的反馈
        freq_key = f"frequent_action_{intent.action}"
        freq_data = self._memory.get_long_term(freq_key)
        if freq_data and isinstance(freq_data, dict):
            count = freq_data.get("count", 0)
            if count >= 5:
                intent.confidence = min(1.0, intent.confidence + 0.05)
                intent.params.setdefault("_habit_hint", f"这是你第 {count} 次进行 {intent.action} 操作")

    def _rank_alternatives(self, alternatives: list) -> list:
        """基于历史操作频率重新排序备选意图"""
        ranked = []
        for alt in alternatives:
            action = alt.get("action", "")
            score = alt.get("score", 0.5)
            # 如果该备选意图在历史中频繁出现，加分
            count = self._action_counts.get(action, 0)
            if count > 0:
                boost = min(0.15, count * 0.03)
                score = min(1.0, score + boost)
            ranked.append({"action": action, "score": round(score, 3)})
        return sorted(ranked, key=lambda x: x["score"], reverse=True)

    # ====================================================================
    #  私有方法 - 学习与挖掘
    # ====================================================================

    def _learn_successful_params(self, action: str, params: dict, confidence: float):
        """当操作成功时，自动学习参数模式"""
        if confidence >= 0.7:
            key = f"success_pattern_{action}"
            existing = self._memory.get_long_term(key) or {}
            if isinstance(existing, dict):
                for pk in ("keyword", "path", "language", "framework", "target"):
                    if pk in params and params[pk]:
                        existing.setdefault(pk, [])
                        if params[pk] not in existing[pk]:
                            existing[pk].append(params[pk])
                            if len(existing[pk]) > 10:
                                existing[pk].pop(0)
                self._memory.save_long_term(key, existing, source="learned")

    def _extract_preference_from_feedback(self, comment: str):
        """从正面反馈评论中提取偏好"""
        # 简单的关键词提取
        preferences_map = {
            "python": ("language", "python"),
            "javascript": ("language", "javascript"),
            "typescript": ("language", "typescript"),
            "java": ("language", "java"),
            "vscode": ("code_editor", "vscode"),
            "vsc": ("code_editor", "vscode"),
            "pycharm": ("code_editor", "pycharm"),
            "桌面": ("archive_dir", "桌面"),
            "文档": ("archive_dir", "文档"),
            "下载": ("archive_dir", "下载"),
        }
        comment_lower = comment.lower()
        for keyword, (pref_key, pref_val) in preferences_map.items():
            if keyword in comment_lower:
                self._memory.set_preference(pref_key, pref_val)
                self._logger.info(f"Learned preference from feedback: {pref_key}={pref_val}")

    def _mine_patterns(self):
        """挖掘操作模式并存储到长期记忆"""
        for action, count in self._action_counts.items():
            if count >= self.PATTERN_THRESHOLD:
                self._memory.save_long_term(
                    f"frequent_action_{action}",
                    {"count": count, "action": action},
                    source="mined",
                )

        # 挖掘转移模式
        for from_action, transitions in self._action_transitions.items():
            total = sum(transitions.values())
            if total >= self.PATTERN_THRESHOLD:
                for to_action, cnt in transitions.items():
                    if cnt >= self.PATTERN_THRESHOLD:
                        self._memory.save_long_term(
                            f"transition_{from_action}_to_{to_action}",
                            {"from": from_action, "to": to_action, "count": cnt, "probability": cnt / total},
                            source="mined",
                        )

    # ====================================================================
    #  工具方法
    # ====================================================================

    @staticmethod
    def _summarize_params(params: dict) -> dict:
        """提取参数摘要，避免存储过大的值"""
        summary = {}
        for k in ("keyword", "path", "target", "language", "framework", "mode", "data_type"):
            if k in params and params[k]:
                v = params[k]
                if isinstance(v, str) and len(v) > 100:
                    v = v[:100] + "..."
                summary[k] = v
        return summary

    @staticmethod
    def _get_hour(timestamp: float) -> int:
        """从时间戳提取小时（考虑时区偏移，这里使用本地时间）"""
        import datetime
        dt = datetime.datetime.fromtimestamp(timestamp)
        return dt.hour

    def get_recent_failures(self, limit: int = 5) -> list:
        """Agent OS 反思循环：获取最近的失败工具调用"""
        failures = []
        for entry in reversed(self._tool_log):
            if not entry.get("success", True):
                failures.append({
                    "tool": entry.get("action", "unknown"),
                    "error": str(entry.get("result", ""))[:100],
                    "time": entry.get("timestamp", 0),
                })
            if len(failures) >= limit:
                break
        return failures

    def generate_skill_template(self, action_pattern: str) -> dict:
        """Agent OS §8: 经验→技能模板规则映射

        当某个操作模式出现 >= PATTERN_THRESHOLD 次成功时，
        自动生成可复用的技能模板，写入 MEMORY.md 供后续快速匹配。
        """
        count = self._action_counts.get(action_pattern, 0)
        if count < self.PATTERN_THRESHOLD:
            return {"generated": False, "reason": f"仅{count}次(需≥{self.PATTERN_THRESHOLD})", "pattern": action_pattern}

        params_key = f"success_pattern_{action_pattern}"
        existing = self._memory.get_long_term(params_key)
        success_params = existing if isinstance(existing, dict) else {}

        template = {
            "type": "skill_template",
            "name": f"auto_{action_pattern}",
            "source": "learned_from_experience",
            "action": action_pattern,
            "confidence": min(1.0, 0.6 + count * 0.03),
            "patterns": {
                "common_params": list(success_params.keys()),
                "param_examples": {k: v[-3:] if isinstance(v, list) else v
                                   for k, v in success_params.items()},
            },
            "usage_count": count,
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

        self._memory.save_long_term(f"skill_template_{action_pattern}", template, confidence=0.9, source="auto_generated")
        self._memory.save_learning("skill_template",
            f"自动生成技能模板 skill_template_{action_pattern}（{action_pattern}成功{count}次）")

        return {"generated": True, "template": template}

    def apply_experience_rules(self, intent, context: dict = None) -> dict:
        """Agent OS §8: 经验规则应用 — 在执行前应用历史学习到的规则

        规则优先级：
        1. 成功模式匹配 → 自动注入推荐参数
        2. 失败模式预警 → 返回警告信息
        3. 操作转移概率 → 自动建议下一步
        """
        rules_applied = []
        warnings = []
        action = getattr(intent, 'action', str(intent)) if hasattr(intent, 'action') else str(intent)

        skill_tpl = self._memory.get_long_term(f"skill_template_{action}")
        if isinstance(skill_tpl, dict) and skill_tpl.get("generated"):
            rules_applied.append({
                "type": "skill_template",
                "action": action,
                "params": skill_tpl.get("patterns", {}).get("param_examples", {}),
                "confidence": skill_tpl.get("confidence", 0.5),
            })

        recent_failures = self.get_recent_failures(10)
        for f in recent_failures:
            if f.get("tool") == action:
                warnings.append({
                    "type": "failure_history",
                    "action": action,
                    "recent_error": f.get("error", "未知错误"),
                    "suggestion": f"该操作最近失败过，建议先检查: {f.get('error', '')}",
                })
                break

        total = sum(self._action_transitions.get(action, {}).values())
        if total >= 2:
            next_actions = sorted(
                self._action_transitions[action].items(),
                key=lambda x: x[1], reverse=True
            )[:3]
            rules_applied.append({
                "type": "transition_hint",
                "from_action": action,
                "suggested_next": [
                    {"action": a, "probability": round(c / total, 2)}
                    for a, c in next_actions
                ],
            })

        return {"rules_applied": rules_applied, "warnings": warnings, "total_rules": len(rules_applied)}
