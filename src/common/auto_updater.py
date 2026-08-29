"""自动更新检查模块"""
import json
from typing import Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

from common.logger import get_logger

logger = get_logger()

GITHUB_API_URL = "https://api.github.com/repos/{owner}/{repo}/releases/latest"

class AutoUpdater:
    """自动更新检查器"""

    def __init__(self, owner: str = "", repo: str = "", current_version: str = ""):
        self._owner = owner
        self._repo = repo
        self._current_version = current_version

    def check_update(self) -> Optional[dict]:
        """检查是否有新版本"""
        if not self._owner or not self._repo:
            logger.debug("未配置 owner/repo，跳过更新检查")
            return None

        url = GITHUB_API_URL.format(owner=self._owner, repo=self._repo)
        try:
            req = Request(url, headers={"Accept": "application/json"})
            with urlopen(req, timeout=10) as resp:  # nosec B310
                data = json.loads(resp.read().decode("utf-8"))

            latest_version = data.get("tag_name", "").lstrip("v")
            if self._compare_versions(latest_version, self._current_version) > 0:
                logger.info(f"发现新版本: {latest_version} (当前: {self._current_version})")
                return {
                    "version": latest_version,
                    "url": data.get("html_url", ""),
                    "body": data.get("body", ""),
                }
            return None
        except URLError as e:
            logger.debug(f"更新检查失败: {e}")
            return None
        except Exception as e:
            logger.debug(f"更新检查异常: {e}")
            return None

    @staticmethod
    def _compare_versions(v1: str, v2: str) -> int:
        """比较版本号，v1 > v2 返回正数"""
        try:
            parts1 = [int(x) for x in v1.split(".")]
            parts2 = [int(x) for x in v2.split(".")]
            for a, b in zip(parts1, parts2, strict=False):
                if a != b:
                    return a - b
            return len(parts1) - len(parts2)
        except (ValueError, AttributeError):
            return 0
