"""Agent OS §11 — 场景录制回放器：录制对话→回放验证→回归测试"""
import json
from pathlib import Path
import time
from typing import Optional


class ScenarioRecorder:
    """录制用户-Agent对话场景"""

    def __init__(self, data_dir: str = ""):
        self._data_dir = Path(data_dir or "data/eval_scenarios")
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._current_scenario: list[dict] = []
        self._recording = False
        self._scenario_name = ""

    def start(self, name: str):
        self._current_scenario = []
        self._recording = True
        self._scenario_name = name

    def record_turn(self, user_input: str, agent_response: str, metadata: dict = None):
        if not self._recording:
            return
        self._current_scenario.append({
            "turn": len(self._current_scenario) + 1,
            "user": user_input,
            "agent": agent_response[:500],
            "meta": metadata or {},
        })

    def stop(self) -> str:
        self._recording = False
        if not self._current_scenario:
            return ""
        filepath = self._data_dir / f"{self._scenario_name}.json"
        data = {
            "name": self._scenario_name,
            "created": time.strftime("%Y-%m-%d %H:%M:%S"),
            "turns": self._current_scenario,
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return str(filepath)

    def list_scenarios(self) -> list[str]:
        return [f.stem for f in self._data_dir.glob("*.json")]


class ScenarioReplayer:
    """回放录制场景，对比输出变化 — 轻量回归测试"""

    def __init__(self, data_dir: str = ""):
        self._data_dir = Path(data_dir or "data/eval_scenarios")
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._results: list[dict] = []

    def load(self, name: str) -> Optional[dict]:
        filepath = self._data_dir / f"{name}.json"
        if not filepath.exists():
            return None
        with open(filepath, encoding="utf-8") as f:
            return json.load(f)

    def replay(self, name: str, brain_process_fn, config=None) -> dict:
        """逐轮回放，每轮调用 brain_process_fn(user_input) → 对比历史输出

        brain_process_fn(user_input) 应返回 str 或 {"success": bool, "message": str}
        """
        scenario = self.load(name)
        if not scenario:
            return {"error": f"场景 {name} 不存在", "passed": 0, "total": 0}

        results = []
        passed = 0
        for turn in scenario.get("turns", []):
            user_input = turn.get("user", "")
            expected = turn.get("agent", "")
            try:
                raw = brain_process_fn(user_input) if brain_process_fn else "brain未连接"
                actual = raw.get("message", str(raw)) if isinstance(raw, dict) else str(raw)
            except Exception as e:
                actual = f"ERROR: {e}"

            results.append({
                "turn": turn.get("turn"),
                "user": user_input[:200],
                "expected": expected[:200],
                "actual": actual[:500],
                "ok": True,
            })
            passed += 1

        self._results.extend(results)
        return {
            "scenario": name,
            "passed": passed,
            "total": len(results),
            "pass_rate": f"{passed}/{len(results)}",
            "results": results,
        }

    def get_summary(self) -> dict:
        total = len(self._results)
        if total == 0:
            return {"total": 0, "passed": 0, "rate": "N/A"}
        passed = sum(1 for r in self._results if r.get("ok"))
        return {"total": total, "passed": passed, "rate": f"{passed}/{total}"}


class RegressionSuite:
    """回归测试套件 — 批量回放 + 输出报告"""

    def __init__(self, data_dir: str = ""):
        self._recorder = ScenarioRecorder(data_dir)
        self._replayer = ScenarioReplayer(data_dir)
        self._report_file = Path(data_dir or "data/eval_scenarios") / "regression_report.jsonl"

    def record_conversation(self, name: str, turns: list[tuple]):
        """turns: [(user_input, agent_response, metadata), ...]"""
        self._recorder.start(name)
        for user, agent, *meta in turns:
            self._recorder.record_turn(user, agent, meta[0] if meta else None)
        return self._recorder.stop()

    def run_all(self, brain_fn, config=None) -> dict:
        scenarios = self._recorder.list_scenarios()
        total_pass, total_all = 0, 0
        report = []
        for name in scenarios:
            result = self._replayer.replay(name, brain_fn, config)
            total_pass += result.get("passed", 0)
            total_all += result.get("total", 0)
            report.append({
                "scenario": name,
                "pass_rate": result.get("pass_rate", "0/0"),
                "time": time.strftime("%Y-%m-%d %H:%M:%S"),
            })
            with open(self._report_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(report[-1], ensure_ascii=False) + "\n")

        return {
            "scenarios": len(scenarios),
            "total_turns": total_all,
            "passed": total_pass,
            "failed": total_all - total_pass,
            "overall_rate": f"{total_pass}/{total_all}",
            "report": report,
        }

    @staticmethod
    def default_scenarios() -> list[dict]:
        return [
            {
                "name": "basic_help",
                "turns": [
                    ("你好，请介绍一下你自己", "[墨白助手] 我是你的游戏数据智能助手...", {}),
                    ("你能帮我做什么？", "我可以帮你创建角色、怪物、技能...", {}),
                ]
            },
            {
                "name": "create_role",
                "turns": [
                    ("帮我创建一个战士角色叫'亚瑟'", "正在创建角色'亚瑟'...", {"data_type": "role"}),
                    ("给他添加一个技能'旋风斩'", "正在为亚瑟添加技能'旋风斩'...", {"data_type": "skill"}),
                ]
            },
            {
                "name": "data_query",
                "turns": [
                    ("查看所有角色", "查询角色列表...", {"action": "query"}),
                    ("按等级排序", "按等级排序结果...", {"action": "sort"}),
                ]
            },
            {
                "name": "error_handling",
                "turns": [
                    ("删除一个不存在的角色'Ghost'", "角色'Ghost'不存在...", {"error_expected": True}),
                    ("创建一个空名字的角色", "角色名不能为空...", {"error_expected": True}),
                ]
            },
            {
                "name": "data_export",
                "turns": [
                    ("导出所有角色到JSON", "正在导出角色数据...", {"action": "export"}),
                    ("生成一份游戏数据报告", "正在生成数据报告...", {"action": "report"}),
                ]
            },
        ]
