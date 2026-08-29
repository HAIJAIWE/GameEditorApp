"""Agent OS §12 — 用户反馈仪表盘：赞/踩统计"""
import json
from pathlib import Path


class FeedbackDashboard:
    """赞/踩/举报 统计"""

    def __init__(self, data_dir: Path = None):
        self._dir = data_dir or Path("data/feedback")
        self._dir.mkdir(parents=True, exist_ok=True)
        self._file = self._dir / "feedback_stats.json"
        self._stats = self._load()

    def _load(self) -> dict:
        if self._file.exists():
            return json.loads(self._file.read_text())
        return {"likes": 0, "dislikes": 0, "reports": 0, "sessions": 0, "history": []}

    def _save(self):
        self._file.write_text(json.dumps(self._stats, ensure_ascii=False, indent=2))

    def like(self, session_id: str = "", comment: str = ""):
        self._stats["likes"] += 1
        self._stats["sessions"] += 1
        self._stats["history"].append({"type": "like", "session": session_id, "comment": comment[:200]})
        self._save()

    def dislike(self, session_id: str = "", comment: str = ""):
        self._stats["dislikes"] += 1
        self._stats["sessions"] += 1
        self._stats["history"].append({"type": "dislike", "session": session_id, "comment": comment[:200]})
        self._save()
        # 自动触发反思
        from testing.auto_evaluator import auto_reflect_if_low
        auto_reflect_if_low("dislike", comment, None, None)

    def report(self, session_id: str = "", comment: str = ""):
        self._stats["reports"] += 1
        self._stats["sessions"] += 1
        self._stats["history"].append({"type": "report", "session": session_id, "comment": comment[:200]})
        self._save()

    def summary(self) -> str:
        s = self._stats
        total = max(s["likes"] + s["dislikes"], 1)
        return (
            f"反馈统计: 赞 {s['likes']}({s['likes']*100//total}%) | "
            f"踩 {s['dislikes']}({s['dislikes']*100//total}%) | "
            f"举报 {s['reports']} | 总会话 {s['sessions']}"
        )


_dashboard = None

def get_feedback_dashboard() -> FeedbackDashboard:
    global _dashboard
    if _dashboard is None:
        _dashboard = FeedbackDashboard()
    return _dashboard
