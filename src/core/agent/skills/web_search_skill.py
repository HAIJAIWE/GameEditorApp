from __future__ import annotations

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import normalize_params


class WebSearchSkill(BaseSkill):
    name = "system.web_search"
    description = "联网搜索网页内容、查找信息，返回摘要和来源链接"
    version = "1.0.0"
    parameters: list = []

    PARAMS_SCHEMA = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["search", "open"],
                "description": "操作类型: search(搜索)/open(打开网页)"
            },
            "query": {
                "type": "string",
                "description": "搜索关键词(search动作)"
            },
            "url": {
                "type": "string",
                "description": "要打开的网页URL(open动作)"
            }
        },
        "required": ["action"]
    }

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        logger = get_logger()
        action = params.get("action", "search")
        query = params.get("query", params.get("keyword", params.get("url", "")))

        if action == "open":
            return self._open_url(query, logger)

        if not query:
            return {"success": False, "error": "缺少搜索关键词", "message": ""}

        import importlib.util
        if importlib.util.find_spec("requests"):
            try:
                return self._search_duckduckgo(query, logger)
            except Exception as e:
                logger.warning(f"DuckDuckGo search failed: {e}")
        else:
            logger.info("requests 未安装，使用 urllib 降级搜索")

        try:
            return self._search_urllib(query, logger)
        except Exception as e2:
            return {"success": False, "error": f"搜索失败: {e2}", "message": ""}

    def _search_urllib(self, query: str, logger) -> dict:
        import re
        import urllib.parse
        import urllib.request

        url = "https://html.duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        with urllib.request.urlopen(req, timeout=15) as resp:  # nosec B310
            text = resp.read().decode("utf-8", errors="replace")

        results = []
        for item in re.findall(
            r'<a rel="nofollow" class="result__a" href="(.*?)">(.*?)</a>.*?'
            r'<a class="result__snippet"[^>]*>(.*?)</a>',
            text, re.DOTALL
        ):
            results.append({
                "title": re.sub(r'<[^>]+>', '', item[1]).strip(),
                "url": item[0],
                "snippet": re.sub(r'<[^>]+>', '', item[2]).strip(),
            })

        if results:
            return {"success": True, "message": "", "data": {
                "results": results[:5],
                "query": query,
                "source": "duckduckgo_urllib"
            }}
        return {"success": False, "error": "未找到结果", "message": ""}

    def _search_duckduckgo(self, query: str, logger) -> dict:
        import requests
        url = "https://html.duckduckgo.com/html/"
        resp = requests.post(url, data={"q": query}, timeout=15, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        resp.raise_for_status()

        import re
        results = []
        for item in re.findall(
            r'<a rel="nofollow" class="result__a" href="(.*?)">(.*?)</a>.*?'
            r'<a class="result__snippet"[^>]*>(.*?)</a>',
            resp.text, re.DOTALL
        ):
            results.append({
                "title": re.sub(r'<[^>]+>', '', item[1]).strip(),
                "url": item[0],
                "snippet": re.sub(r'<[^>]+>', '', item[2]).strip(),
            })

        if results:
            return {"success": True, "message": "", "data": {
                "results": results[:5],
                "query": query,
                "source": "duckduckgo"
            }}
        return {"success": False, "error": "未找到结果", "message": ""}

    def _search_bing(self, query: str, logger) -> dict:
        import requests
        url = "https://www.bing.com/search"
        resp = requests.get(url, params={"q": query}, timeout=15, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        resp.raise_for_status()

        import re
        results = []
        for item in re.findall(
            r'<li class="b_algo".*?<a href="(.*?)".*?>(.*?)</a>.*?<p>(.*?)</p>',
            resp.text, re.DOTALL
        ):
            results.append({
                "title": re.sub(r'<[^>]+>', '', item[1]).strip(),
                "url": item[0],
                "snippet": re.sub(r'<[^>]+>', '', item[2]).strip(),
            })

        if results:
            return {"success": True, "message": "", "data": {
                "results": results[:5],
                "query": query,
                "source": "bing"
            }}
        return {"success": False, "error": "未找到结果", "message": ""}

    def _open_url(self, url: str, logger) -> dict:
        # 修复 P2-31: 添加 urllib 降级路径 — requests 缺失或失败时回退 urllib
        if not url.startswith("http"):
            url = "https://" + url

        import re
        UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        text: str = ""
        status_code: int = 0

        # 路径1：requests
        try:
            import requests
            resp = requests.get(url, timeout=15, headers={"User-Agent": UA})
            resp.raise_for_status()
            text = resp.text
            status_code = resp.status_code
        except ImportError:
            logger.info("requests 未安装，使用 urllib 降级打开网页")
        except Exception as e:
            logger.warning(f"requests 打开网页失败，降级到 urllib: {e}")

        # 路径2：urllib 降级
        if not text:
            try:
                import urllib.request
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=15) as resp:  # nosec B310
                    raw = resp.read()
                    status_code = resp.status
                    # 尝试从 headers 推断编码，否则 utf-8 + 容错
                    charset = resp.headers.get_content_charset() or "utf-8"
                    try:
                        text = raw.decode(charset, errors="replace")
                    except (LookupError, TypeError):
                        text = raw.decode("utf-8", errors="replace")
            except Exception as e:
                return {"success": False, "error": f"打开网页失败: {e}", "message": ""}

        try:
            body = re.search(r'<body[^>]*>(.*?)</body>', text, re.DOTALL)
            content = re.sub(r'<[^>]+>', '', body.group(1) if body else text)
            content = re.sub(r'\s+', ' ', content).strip()[:3000]
            return {"success": True, "message": "", "data": {
                "url": url,
                "content": content,
                "status": status_code
            }}
        except Exception as e:
            return {"success": False, "error": f"解析网页失败: {e}", "message": ""}
