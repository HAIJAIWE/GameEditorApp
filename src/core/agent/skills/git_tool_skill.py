"""Git 工具 — diff/status/log/commit 操作（对应 OpenClaw diffs 扩展）"""
from __future__ import annotations

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import normalize_params


class GitToolSkill(BaseSkill):
    name = "tool.git"
    description = "Git 版本控制操作：diff/status/log/commit/blame"
    version = "1.0.0"
    parameters = []

    PARAMS_SCHEMA = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["status", "diff", "log", "commit", "blame", "branch", "add", "push", "pull"],
                "description": "操作: status/diff/log/commit/blame/branch/add/push/pull"
            },
            "path": {
                "type": "string",
                "description": "仓库路径(默认当前目录)"
            },
            "message": {
                "type": "string",
                "description": "提交信息(commit动作)"
            },
            "file": {
                "type": "string",
                "description": "文件路径(diff/blame动作)"
            },
            "branch": {
                "type": "string",
                "description": "分支名(branch/push/pull)"
            }
        },
        "required": ["action"]
    }

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        logger = get_logger()
        action = params.get("action", "status")
        repo_path = params.get("path", params.get("repo", "."))
        file_path = params.get("file", "")
        n = params.get("count", params.get("n", 10))

        try:
            from git import InvalidGitRepositoryError, Repo
        except ImportError:
            return {"success": False, "error": "请安装 gitpython: pip install gitpython", "message": ""}

        try:
            repo = Repo(repo_path)
        except InvalidGitRepositoryError:
            return {"success": False, "error": f"不是 Git 仓库: {repo_path}", "message": ""}

        try:
            if action == "status":
                return self._status(repo, logger)
            elif action == "diff":
                return self._diff(repo, file_path, logger)
            elif action == "log":
                return self._log(repo, int(n), logger)
            elif action == "branch":
                return self._branch(repo, logger)
            elif action == "add":
                return self._add(repo, params.get("file", "."), logger)
            elif action == "commit":
                return self._commit(repo, params.get("message", ""), logger)
            elif action == "push":
                return self._push(repo, params.get("branch", ""), logger)
            elif action == "pull":
                return self._pull(repo, params.get("branch", ""), logger)
            elif action == "blame":
                return self._blame(repo, file_path, logger)
            else:
                # 修复：之前未知 action 静默退化为 status，现返回 error
                return {"success": False,
                        "error": f"未知 git action: {action}（支持: status/diff/log/branch/add/commit/push/pull/blame）",
                        "message": ""}
        except Exception as e:
            return {"success": False, "error": str(e), "message": ""}

    def _add(self, repo, file_path: str, logger) -> dict:
        """git add <file>"""
        if not file_path:
            return {"success": False, "error": "add 需要 file 参数", "message": ""}
        try:
            repo.index.add([file_path])
            return {"success": True, "message": f"已暂存: {file_path}", "data": {"staged": file_path}}
        except Exception as e:
            return {"success": False, "error": f"暂存失败: {e}", "message": ""}

    def _commit(self, repo, message: str, logger) -> dict:
        """git commit -m <message>"""
        if not message:
            return {"success": False, "error": "commit 需要 message 参数", "message": ""}
        try:
            commit = repo.index.commit(message)
            return {"success": True, "message": f"已提交: {commit.hexsha[:8]}",
                    "data": {"hash": commit.hexsha[:8], "message": message}}
        except Exception as e:
            return {"success": False, "error": f"提交失败: {e}", "message": ""}

    def _push(self, repo, branch: str, logger) -> dict:
        """git push origin <branch>"""
        try:
            if not branch:
                branch = repo.active_branch.name
            origin = repo.remote("origin") if repo.remotes else None
            if origin is None:
                return {"success": False, "error": "未配置 remote origin", "message": ""}
            origin.push(branch)
            return {"success": True, "message": f"已推送: {branch}", "data": {"branch": branch}}
        except Exception as e:
            return {"success": False, "error": f"推送失败: {e}", "message": ""}

    def _pull(self, repo, branch: str, logger) -> dict:
        """git pull origin <branch>"""
        try:
            if not branch:
                branch = repo.active_branch.name
            origin = repo.remote("origin") if repo.remotes else None
            if origin is None:
                return {"success": False, "error": "未配置 remote origin", "message": ""}
            origin.pull(branch)
            return {"success": True, "message": f"已拉取: {branch}", "data": {"branch": branch}}
        except Exception as e:
            return {"success": False, "error": f"拉取失败: {e}", "message": ""}

    def _blame(self, repo, file_path: str, logger) -> dict:
        """git blame <file> — 显示每行最后修改者"""
        if not file_path:
            return {"success": False, "error": "blame 需要 file 参数", "message": ""}
        try:
            blame_data = []
            for commit, lines in repo.blame(rev="HEAD", file=file_path):
                for line_no, line_content in lines:
                    blame_data.append({
                        "line": line_no,
                        "hash": commit.hexsha[:8],
                        "author": str(commit.author),
                        "date": commit.committed_datetime.strftime("%Y-%m-%d"),
                        "content": line_content.decode("utf-8", errors="replace") if isinstance(line_content, bytes) else str(line_content),
                    })
            return {"success": True, "message": f"已分析 {len(blame_data)} 行",
                    "data": {"blame": blame_data[:100], "total_lines": len(blame_data)}}
        except Exception as e:
            return {"success": False, "error": f"blame 失败: {e}", "message": ""}

    def _status(self, repo, logger) -> dict:
        status = {}
        status["branch"] = repo.active_branch.name
        status["unstaged"] = [{"path": i.a_path, "change_type": str(i.change_type)} for i in repo.index.diff(None)]
        status["staged"] = [{"path": i.a_path, "change_type": str(i.change_type)} for i in repo.index.diff("HEAD")]
        status["untracked"] = repo.untracked_files[:20]
        status["is_dirty"] = repo.is_dirty()
        return {"success": True, "message": "", "data": status}

    def _diff(self, repo, file_path: str, logger) -> dict:
        if file_path:
            diffs = repo.index.diff(None, paths=file_path) or repo.index.diff("HEAD", paths=file_path)
        else:
            diffs = repo.index.diff(None) or repo.index.diff("HEAD")
        lines = []
        for d in diffs[:10]:
            lines.append(f"{d.change_type}: {d.a_path}")
            if d.diff:
                diff_text = d.diff.decode("utf-8", errors="replace")[:1000]
                lines.append(diff_text)
        return {"success": True, "message": "", "data": {"diff": "\n".join(lines)}}

    def _log(self, repo, n: int, logger) -> dict:
        commits = []
        for c in list(repo.iter_commits(max_count=n)):
            commits.append({
                "hash": c.hexsha[:8], "author": str(c.author),
                "date": c.committed_datetime.strftime("%Y-%m-%d %H:%M"),
                "message": c.message.split("\n")[0],
            })
        return {"success": True, "message": "", "data": {"commits": commits}}

    def _branch(self, repo, logger) -> dict:
        branches = [{"name": b.name, "is_head": b.name == repo.active_branch.name}
                     for b in repo.branches]
        return {"success": True, "message": "", "data": {"branches": branches, "current": repo.active_branch.name}}
