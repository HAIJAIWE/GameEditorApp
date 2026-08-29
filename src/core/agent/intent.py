from __future__ import annotations

import json
import re
from typing import Optional

from common.logger import get_logger
from core.agent.models import Intent

logger = get_logger()


_INTENT_TEMPLATES = [
    # (action, [primary_keywords], [boost_keywords], weight)
    ("file_read",  ["读", "读取", "查看", "打开", "显示", "看"], ["文件", "内容", "里面", "txt", "md", "py", "json", "log", "toml", "cfg", "ini"], 0.90),
    ("file_write", ["写入", "保存", "创建文件", "新建文件", "生成文件"], ["文件", "内容", "路径", "txt", "md", "json"], 0.85),
    ("file_search", ["列出", "找", "搜索", "查找", "目录", "文件夹", "里面有什么", "有哪些文件"], ["文件", "目录", "文件夹", "ls", "dir"], 0.85),
    ("file_organize", ["整理", "归档", "移动", "清理"], ["文件", "文件夹", "目录"], 0.85),
    ("shell_execute", ["执行", "运行", "跑", "命令行", "终端", "cmd", "shell", "bash"], ["命令", "脚本", "python", "node", "npm", "pip", "git", "echo", "dir", "ls"], 0.90),
    ("system_info", ["系统", "内存", "CPU", "磁盘", "进程", "配置", "环境", "信息", "状态", "版本"], ["查看", "查询", "多大", "多少", "看看", "检查"], 0.85),
    ("get_time", ["几点了", "几点", "时间", "日期", "今天", "现在几点", "现在时间"], ["现在", "当前", "什么"], 0.90),
    ("web_search", ["搜索", "查", "搜", "百度", "谷歌", "网上", "联网"], ["一下", "帮我", "信息", "资料"], 0.80),
    ("web_open", ["打开网页", "打开网站", "浏览网页"], ["http", "www"], 0.90),
    ("code_generate", ["写代码", "生成代码", "写脚本", "实现功能", "帮我写", "生成脚本", "编写", "写函数", "写类", "写程序", "写", "生成"], ["函数", "代码", "脚本", "程序", "类", "模块", "接口", "算法", "Python", "Java", "C++", "JS", "HTML", "CSS", "SQL", "前端", "后端", "API", "页面", "登录"], 0.92),
    ("code_debug", ["调试", "修bug", "fix", "排查", "报错", "错误", "bug"], ["代码", "程序"], 0.85),
    ("game_create", ["创建", "新建", "添加", "生成", "做", "设计", "做一个", "设计一个", "搞一个", "来个", "来把", "来一个"], ["角色", "怪物", "技能", "装备", "道具", "法师", "战士", "武器", "天赋", "成就", "任务", "剧情", "对话", "物品", "职业"], 0.82),
    ("game_update", ["修改", "更新", "改成", "改", "设置", "编辑"], ["属性", "字段", "值", "攻击", "防御", "等级", "血量", "法力"], 0.85),
    ("batch_create", ["几个", "一批", "一批次", "多个", "两个", "三个", "四个", "五个", "创建", "生成", "做", "来", "搞", "批量"], ["技能", "角色", "怪物", "装备", "道具", "武器"], 0.88),
    ("game_query", ["有哪些", "列出", "查询", "找一下", "看看", "有什么", "哪个", "几个", "多少", "哪些",
                     "最高的", "最高", "最低的", "最低", "最好的", "最好", "最厉害", "最强的", "最强",
                     "最快的", "最快", "最弱的", "最弱", "最大的", "最大", "最小的", "最小"],
     ["角色", "怪物", "技能", "装备", "道具", "武器", "天赋", "任务", "职业", "法师", "战士", "数据", "攻击", "防御", "血量", "法力", "等级"], 0.90),
    ("game_delete", ["删除", "移除", "删掉"], ["条目", "数据", "角色", "技能", "装备"], 0.85),
    ("batch_create", ["批量"], ["创建", "生成", "个"], 0.90),
    ("schema_edit", ["加字段", "加属性", "删字段", "改字段", "新增字段", "添加属性"], ["配置", "类型"], 0.85),
    ("planning_create", ["创建策划", "新建策划", "新建方案", "创建方案", "策划案",
     "写策划", "写方案", "写个方案", "做方案", "做个方案", "弄方案", "搞方案",
     "策划方案", "设计方案", "方案怎么写", "怎么做方案", "如何写方案",
     "写个", "做个", "弄个"], ["策划", "方案", "设计"], 0.90),
    ("planning_update", ["修改策划", "更新策划", "编辑方案", "改策划", "改方案", "改改方案"], [], 0.90),
    ("planning_export", ["导出策划", "导出方案"], [], 0.90),
    ("ui_preview", ["看看界面", "界面有什么", "预览界面", "当前布局", "界面", "布局"], ["控件", "窗口"], 0.85),
    ("help", ["帮助", "能做什么", "功能", "怎么用", "介绍", "帮助"], [], 0.85),
]

CATEGORY_MAP = {
    "file_organize": "system_operation",
    "file_search": "system_operation",
    "file_read": "system_operation",
    "file_write": "system_operation",
    "web_search": "browser",
    "web_open": "browser",
    "code_generate": "code",
    "code_debug": "code",
    "shell_execute": "system_operation",
    "data_analyze": "data",
    "notify": "system_operation",
    "read_file": "system_operation",
    "write_file": "system_operation",
    "app_launch": "system_operation",
    "system_info": "system_operation",
    "game_create": "game_data",
    "game_update": "game_data",
    "game_delete": "game_data",
    "batch_create": "game_data",
    "game_query": "game_data",
    "schema_edit": "system_operation",
    "planning_create": "planning",
    "planning_update": "planning",
    "planning_export": "planning",
    "document_extract": "system_operation",
    "git_tool": "system_operation",
    "web_readability": "system_operation",
    "canvas": "system_operation",
    "ui_preview": "system_operation",
    "help": "meta",
    "chat": "meta",
    "code_explain": "code",
    "data_visualize": "data",
    "get_time": "system_operation",
}


class IntentParser:
    CONFIDENCE_LOW = 0.5
    CONFIDENCE_MID = 0.60

    def __init__(self, call_ai=None):
        self._call_ai = call_ai
        self._logger = get_logger()
        self._feedback_stats: dict = {}

    def learn_from_execution(self, intent_action: str, success: bool, user_phrasing: str = ""):
        """根据工具执行结果反馈，自动调整意图模板权重和新关键词

        Args:
            intent_action: 匹配的意图动作名
            success: 工具执行是否成功
            user_phrasing: 用户原始输入文本（用于提取新关键词）
        """
        stats = self._feedback_stats.setdefault(intent_action, {"success": 0, "failure": 0, "novel_words": {}})
        if success:
            stats["success"] += 1
        else:
            stats["failure"] += 1

        total = stats["success"] + stats["failure"]
        success_rate = stats["success"] / max(total, 1)

        for template in _INTENT_TEMPLATES:
            if template[0] != intent_action:
                continue
            action, keywords, boosts, base_weight = template
            original_weight = base_weight

            if success and total >= 2:
                adjustment = 0.05 * success_rate
                new_weight = min(original_weight + adjustment, 0.98)
                template = (action, keywords, boosts, new_weight)
                _INTENT_TEMPLATES[_INTENT_TEMPLATES.index(template)] = template
                if abs(new_weight - original_weight) > 0.01:
                    self._logger.debug(
                        f"[Intent:Learn] {action} 权重调整: {original_weight:.3f}→{new_weight:.3f} "
                        f"(成功={stats['success']} 失败={stats['failure']})"
                    )
            elif not success and total >= 3 and success_rate < 0.5:
                new_weight = max(original_weight - 0.03, 0.55)
                template = (action, keywords, boosts, new_weight)
                idx = _INTENT_TEMPLATES.index(template)
                _INTENT_TEMPLATES[idx] = template
                self._logger.debug(
                    f"[Intent:Learn] {action} 降权: {original_weight:.3f}→{new_weight:.3f}"
                )

            if success and user_phrasing and total >= 2:
                new_words = self._extract_novel_keywords(user_phrasing, keywords, boosts)
                for word in new_words:
                    stats["novel_words"][word] = stats["novel_words"].get(word, 0) + 1
                confirmed_words = [
                    w for w, cnt in stats["novel_words"].items()
                    if cnt >= 3 and w not in boosts
                ]
                if confirmed_words:
                    template = (action, keywords, boosts + confirmed_words)
                    idx = _INTENT_TEMPLATES.index((action, keywords, boosts, new_weight if 'new_weight' in dir() else base_weight))
                    _INTENT_TEMPLATES[idx] = template
                    for w in confirmed_words:
                        del stats["novel_words"][w]
                    self._logger.info(f"[Intent:Learn] {action} 新增关键词: {confirmed_words}")

            break

    def _extract_novel_keywords(self, text: str, existing_keywords: list, existing_boosts: list) -> list:
        """从用户输入提取不在已有模板中的潜在关键词"""
        existing_set = set(existing_keywords + existing_boosts)
        words = re.findall(r'[\u4e00-\u9fff]{2,4}|\b[a-z_]+\b', text.lower())
        novel = []
        for w in words:
            w_clean = w.strip()
            if w_clean and w_clean not in existing_set and len(w_clean) >= 2:
                novel.append(w_clean)
        return list(dict.fromkeys(novel))[:5]

    def parse(self, user_input: str, context: Optional[dict] = None) -> Intent:
        quick = self._quick_match(user_input)
        if quick and quick.confidence >= self.CONFIDENCE_MID:
            self._logger.info(f"[Intent] 关键词匹配: {quick.action} ({quick.confidence:.0%})")
            return quick

        if quick is None:
            self._logger.info("[Intent] 无关键词匹配，尝试深度解析")
        else:
            self._logger.info(f"[Intent] 关键词置信度不足({quick.confidence:.0%})，尝试深度解析")
        deep = self._deep_parse(user_input, context)
        return deep

    def _quick_match(self, user_input: str) -> Optional[Intent]:
        """关键词加权评分匹配，比纯正则更灵活"""
        text = user_input.lower()
        best_action = None
        best_score = 0.0
        alternatives = []

        # 预检测上下文特征
        has_path = bool(re.search(r'[A-Za-z]:[/\\]|[/\\][^\s,，。]+\.\w+|\b\w+\.(?:txt|md|py|json|log|toml|cfg|ini|yaml|yml|csv|xml|html|js|ts|css)\b', user_input))
        has_command = bool(re.search(r'\b(python|node|npm|pip|git|cmd|bash|echo|dir|ls)\s', text) or re.search(r'^\s*[\w]+\s+-', text))
        has_url = bool(re.search(r'https?://', text))
        has_gamedata = bool(re.search(r'(创建|新建|添加|生成|修改|删除|移除).{0,10}(角色|怪物|技能|装备|道具|法师|战士|武器|天赋|任务|剧情|对话|职业)', text))
        has_number = bool(re.search(r'\d+', text))
        has_file_context = bool(re.search(r'文件|目录|文件夹|里面|内容|代码|脚本|配置', text))

        for action, keywords, boosts, base_weight in _INTENT_TEMPLATES:
            kw_score = 0
            matched_kw = []

            for kw in keywords:
                if kw.lower() in text:
                    kw_score += 1
                    matched_kw.append(kw)

            boost_score = 0
            for bk in boosts:
                if bk.lower() in text:
                    boost_score += 0.3

            if kw_score == 0:
                continue

            # 基础分 = 命中关键词数 / (关键词总数 * 0.5 + 1)
            total_kw = len(keywords)
            density = min(kw_score / max(total_kw * 0.4, 1), 1.0)
            score = base_weight * (0.6 + 0.4 * density) + boost_score * 0.15

            # 上下文奖励
            if has_path and action in ("file_read", "file_write", "file_search"):
                score += 0.10
            if has_file_context and action in ("file_read", "file_write", "file_search"):
                score += 0.08
            if has_file_context and action == "web_search":
                score -= 0.10  # "搜索文件" 应该走 file_search
            if has_command and action == "shell_execute":
                score += 0.15
            if has_url and action in ("web_search", "web_open"):
                score += 0.10
            if has_gamedata and action.startswith("game_"):
                score += 0.10
            if has_gamedata and action in ("file_search", "file_read"):
                score -= 0.15  # "列出角色" 是查询不是文件操作
            if has_number and action == "batch_create":
                score += 0.20  # 数字+创建 → 批量
            if has_number and action == "game_create" and re.search(r'\d+\s*个', user_input):
                score -= 0.30  # 数字+个 → 不是单个创建，强烈降权

            score = min(score, 1.0)

            if score > best_score:
                best_score = score
                best_action = action

            if score >= 0.4:
                alternatives.append({"action": action, "score": score})

        if not best_action:
            return None

        best_params = {"quick_match": True}
        params = self._extract_params(user_input, best_action, best_params)
        alternatives = sorted(alternatives, key=lambda x: x["score"], reverse=True)[:3]

        return Intent(
            action=best_action,
            category=CATEGORY_MAP.get(best_action, "unknown"),
            params=params,
            raw_input=user_input,
            confidence=min(best_score, 0.95),
            alternatives=alternatives,
        )

    def _extract_params(self, user_input: str, action: str, base_params: dict) -> dict:
        params = dict(base_params)
        text = user_input

        # --- 路径检测（多策略）---
        # 策略1：带扩展名的文件名（任意位置）
        ext_match = re.search(r'\b([\w./\\-]+\.(?:txt|md|py|json|log|toml|cfg|ini|yaml|yml|csv|xml|html|js|ts|css|bat|sh|ps1))', text)
        if ext_match:
            params["path"] = ext_match.group(1)

        # 策略2：Windows 绝对路径
        if "path" not in params:
            win_path = re.search(r'([A-Za-z]:[/\\][^\s,，。！？]+)', text)
            if win_path:
                params["path"] = win_path.group(1)

        # 策略3：Unix 风格路径
        if "path" not in params:
            unix_path = re.search(r'(/[^\s,，。！？]{2,})', text)
            if unix_path:
                params["path"] = unix_path.group(1)

        # 策略4："目录" / "文件夹" 后面的路径
        if "path" not in params:
            dir_path = re.search(r'(?:目录|文件夹|路径)[：:\s]*["\']?([^\s"\',，。！？]{3,})["\']?', text)
            if dir_path:
                params["path"] = dir_path.group(1)

        # --- 文件名当 keyword ---
        file_patterns = re.findall(r'(?:文件|文档|图片|代码|脚本)[：:\s]*["\']?([^\s"\',，。！？]+)["\']?', text)
        if file_patterns and "keyword" not in params:
            params["keyword"] = file_patterns[0]

        # --- 命令提取 ---
        if action == "shell_execute":
            # 策略1：引号内的完整命令
            cmd_quoted = re.search(r'["\'](.{3,})["\']', text)
            if cmd_quoted:
                params["command"] = cmd_quoted.group(1)
            # 策略2：检测可执行程序名 + 参数（python/node/npm/pip/git/dir/ls/echo）
            elif re.search(r'\b(python|node|npm|pip|git|dir|ls|echo|cmd|bash)\s', text):
                m = re.search(r'\b((?:python|node|npm|pip|git|dir|ls|echo|cmd|bash)\s+.+?)(?:\s+(?:一下|看看|试试|运行|执行|跑|吧|哈|呗))?\s*$', text)
                if m:
                    params["command"] = m.group(1).strip()
            # 策略3："用 XXX 运行/执行" → 提取 XXX
            elif re.search(r'用\s+.+\s+(?:运行|执行|跑)', text):
                m = re.search(r'用\s+(.+?)\s+(?:运行|执行|跑)', text)
                if m:
                    params["command"] = m.group(1).strip()
            # 策略4："运行/执行 XXX" → 提取 XXX 之后的内容
            else:
                cmd_after = re.search(r'(?:执行|运行|跑)[：:\s]*(.+)', text)
                if cmd_after:
                    cmd = cmd_after.group(1).strip()
                    cmd = re.sub(r'(一下|看看|试试)$', '', cmd).strip()
                    if cmd:
                        params["command"] = cmd

        # --- URL ---
        url_pattern = re.findall(r'(https?://[^\s,，。！？]+)', text)
        if url_pattern:
            params["url"] = url_pattern[0]

        # --- 游戏数据 ---
        type_names = "技能|角色|装备|怪物|道具|天赋|称号|成就|职业|增益|物品|任务|法师|法术|战士|武器|防具|饰品|药水|卷轴|对话|剧情"
        dt_match = re.findall(rf'(创建|新建|添加|修改|更新|编辑|删除|移除|生成|做|设计|做一个|设计一个|搞一个|来个|来把|来一个).*?({type_names})', text)
        if dt_match:
            type_map = {
                "技能": "skill", "角色": "role", "装备": "equip", "怪物": "monster",
                "道具": "item", "天赋": "talent", "称号": "title", "成就": "achievement",
                "职业": "job", "增益": "buff", "物品": "item", "任务": "task",
                "法师": "role", "法术": "skill", "战士": "role", "武器": "equip",
                "防具": "equip", "饰品": "equip", "药水": "item", "卷轴": "item",
                "对话": "dialog", "剧情": "story",
            }
            params["data_type"] = type_map.get(dt_match[0][1], dt_match[0][1])

        name_match = re.findall(r'(?:叫|名为|叫做|名称|名字)[：:\s]*["\']?([^"\'\s，。！？]{1,10})', text)
        if name_match:
            name = name_match[0]
            # 去掉可能残留的关键词前缀
            for prefix in ['叫', '名为', '叫做', '是']:
                if name.startswith(prefix) and len(name) > len(prefix):
                    name = name[len(prefix):]
            params["name"] = name

        # --- 数据提取（game_create/update/query）---
        if action in ("game_create", "game_update"):
            desc = text
            if name_match:
                desc = desc.replace(name_match[0], "", 1)
            for kw in ["创建", "新建", "添加", "修改", "更新", "帮我", "叫", "名字", "名称", "一个"]:
                desc = desc.replace(kw, "", 1)
            desc = re.sub(r'[，,。.！!？?]', ' ', desc).strip()
            if desc:
                params["data"] = desc

        # batch_create 参数提取
        if action == "batch_create":
            count_m = re.search(r'(\d+)\s*个', text)
            if count_m:
                params["count"] = count_m.group(1)

        if action == "game_query":
            # 提取关键词：去掉查询词后剩余的核心词
            query_text = text
            # 先处理复合短语
            for qw in ["有多少个", "有多少", "有几个", "一共多少", "总共有多少", "一共有多少",
                        "所有", "全部", "整个"]:
                query_text = query_text.replace(qw, "")
            # 再处理单词
            for qw in ["有哪些", "列出", "查询", "找一下", "看看", "有什么", "哪个", "几个", "多少", "哪些",
                        "最高的", "最高", "最低的", "最低", "最好的", "最好", "最厉害", "最强的", "最强",
                        "最快的", "最快", "最弱的", "最弱", "最大的", "最大", "最小的", "最小",
                        "有", "的", "谁", "什么"]:
                query_text = query_text.replace(qw, "")
            # 提取排序字段
            # 提取排序字段
            sort_match = re.search(r'(?:按|按照|根据|以)(攻击|防御|血量|法力|等级|力量|智力|敏捷|速度|暴击)(?:力|值)?', query_text)
            if sort_match:
                sort_map = {"攻击": "atk", "防御": "def", "血量": "hp", "法力": "mp",
                            "等级": "level", "力量": "str", "智力": "int", "敏捷": "agi",
                            "速度": "speed", "暴击": "crit"}
                params["sort_by"] = sort_map.get(sort_match.group(1), "")
            # 提取 limit
            limit_match = re.search(r'(前|前\s*)(\d+)', query_text)
            if limit_match:
                params["limit"] = limit_match.group(2)
            # 关键词（可能为空，如"谁最强"不需要关键词过滤）
            keyword = query_text.strip().strip("？?！!。，,的").strip()
            if keyword:
                params["keyword"] = keyword
            # 智能推断 data_type + 排序（独立于关键词）
            type_hints = {
                "角色": "role", "怪物": "monster", "技能": "skill",
                "装备": "equip", "道具": "item", "天赋": "talent",
                "法师": "role", "战士": "role", "武器": "equip",
                "防具": "equip", "药水": "item", "任务": "task",
                "职业": "job", "成就": "achievement", "称号": "title",
                "对话": "dialog", "剧情": "story", "魔法": "skill",
            }
            for hint, type_id in type_hints.items():
                if hint in query_text:
                    params["data_type"] = type_id
                    break
            # 极值查询：没有明确 data_type 但有不带"的"的极值词 → 默认全搜+limit=1
            if not params.get("data_type") and (
                "最强" in text or "最厉害" in text or "最好" in text
                or "最高" in text or "最快" in text or "最大" in text
                or "最弱" in text or "最慢" in text
            ):
                params["limit"] = params.get("limit", "1")
                if not params.get("sort_by"):
                    params["sort_by"] = "atk"

        # --- 默认 action ---
        default_actions = {
            "system_info": "info", "shell_execute": "exec", "app_launch": "launch",
            "file_organize": "organize", "file_read": "read", "file_write": "write",
            "file_search": "list", "game_create": "create", "game_update": "update",
            "game_delete": "delete", "batch_create": "batch", "schema_edit": "add_field",
            "game_query": "query",
            "get_time": "time",
        }
        if "action" not in params and action in default_actions:
            params["action"] = default_actions[action]

        return params

    def _deep_parse(self, user_input: str, context: Optional[dict] = None) -> Intent:
        try:
            from common.ai_client import generate_text as _api_generate
            from config.settings import get_config

            config = get_config()
            call_ai = self._call_ai if self._call_ai else (
                lambda c, p, s, m=None: _api_generate(c, p, s, m)
            )

            has_ai = (self._call_ai is not None) or config.enabled
            if not has_ai:
                return self._fallback_intent(user_input)

            available_actions = [
                {"action": "file_organize", "desc": "整理/归档/移动文件"},
                {"action": "file_search", "desc": "查找/搜索文件"},
                {"action": "file_read", "desc": "读取/查看文件内容"},
                {"action": "file_write", "desc": "写入/创建/保存文件"},
                {"action": "web_search", "desc": "联网搜索/查询信息"},
                {"action": "web_open", "desc": "打开指定网页/URL"},
                {"action": "code_generate", "desc": "编写/生成代码"},
                {"action": "code_debug", "desc": "调试/修复代码bug"},
                {"action": "code_explain", "desc": "解释/分析已有代码"},
                {"action": "shell_execute", "desc": "执行命令行/终端操作"},
                {"action": "data_analyze", "desc": "分析/统计/对比数据"},
                {"action": "data_visualize", "desc": "数据可视化/图表生成"},
                {"action": "schedule_task", "desc": "定时任务/提醒/闹钟"},
                {"action": "app_launch", "desc": "打开/启动应用程序"},
                {"action": "system_info", "desc": "查询系统信息/状态"},
                {"action": "game_create", "desc": "创建/新建游戏数据条目（角色/怪物/技能/装备/道具等）"},
                {"action": "game_update", "desc": "修改/更新游戏数据条目的字段值"},
                {"action": "game_delete", "desc": "删除/移除游戏数据条目"},
                {"action": "game_query", "desc": "查询/列出/搜索游戏数据（如'有哪些角色'、'攻击力最高的怪物'）"},
                {"action": "batch_create", "desc": "批量创建多个游戏数据条目（如'创建10个角色'）"},
                {"action": "schema_edit", "desc": "编辑数据类型字段配置（添加/删除/修改字段）"},
                {"action": "help", "desc": "询问功能/帮助/介绍"},
                {"action": "chat", "desc": "闲聊/一般对话"},
            ]
            actions_text = "\n".join([f"  - {a['action']}: {a['desc']}" for a in available_actions])

            system_prompt = (
                "你是一个高精度的意图解析引擎。请对用户输入进行深度语义分析，输出严格的 JSON 格式。\n\n"
                "=== 可用的 action 类型 ===\n"
                f"{actions_text}\n\n"
                "=== category 映射规则 ===\n"
                "- file_* 操作归类为 system_operation\n"
                "- web_* 操作归类为 browser\n"
                "- code_* 操作归类为 code\n"
                "- data_* 操作归类为 data\n"
                "- schedule_task 归类为 schedule\n"
                "- app_launch / system_info 归类为 system_operation\n"
                "- help / chat 归类为 meta\n\n"
                "=== 输出格式（严格JSON）===\n"
                "{\n"
                '  "action": "匹配的最佳 action",\n'
                '  "category": "对应的大类",\n'
                '  "confidence": 0.0~1.0,\n'
                '  "params": {\n'
                '    "keyword": "提取的核心关键词",\n'
                '    "path": "文件/目录路径（如有）",\n'
                '    "url": "网页URL（如有）",\n'
                '    "target": "操作目标/归档目标",\n'
                '    "time": "时间表达式（如有）",\n'
                '    "location": "地点/目录位置（如有）",\n'
                '    "object": "操作对象（文件/应用/数据等）",\n'
                '    "constraints": ["约束条件1", "约束条件2"],\n'
                '    "language": "编程语言（code类意图，如有）",\n'
                '    "framework": "框架（code类意图，如有）",\n'
                '    "mode": "generate|debug|explain（code类意图）",\n'
                '    "data_type": "role|monster|skill|equip|talent|item|task|story|dialog|achievement（data类意图）",\n'
                '    "raw_query": "用户原始输入的精简版"\n'
                '  },\n'
                '  "alternatives": [\n'
                '    {"action": "备选意图1", "confidence": 0.5},\n'
                '    {"action": "备选意图2", "confidence": 0.3}\n'
                '  ],\n'
                '  "reasoning": "简短解析推理（20字以内）"\n'
                "}\n\n"
                "=== 解析原则 ===\n"
                "1. params 中仅包含能从输入中明确提取的字段，未提取到的字段省略不要\n"
                "2. constraints 为数组，列出用户明确提出的限制条件\n"
                "3. alternatives 列出 1~2 个次可能意图，按置信度降序\n"
                "4. 如果输入是纯粹闲聊/问候，action 用 chat\n"
                "5. 严格只输出 JSON，不要任何前置/后置文字，不要 markdown 代码块标记"
            )

            user_prompt = f"解析以下用户意图：\n{user_input}"
            if context:
                # 只传关键上下文，避免 token 浪费
                relevant_ctx = {}
                for k in ("preferences", "last_intent", "language"):
                    if k in context:
                        relevant_ctx[k] = context[k]
                if relevant_ctx:
                    user_prompt += f"\n\n上下文：{json.dumps(relevant_ctx, ensure_ascii=False)}"

            success, result = call_ai(config, user_prompt, system_prompt)
            if success:
                json_str = self._extract_json(result)
                parsed = json.loads(json_str)

                # 验证并规范化 alternatives
                alts = parsed.get("alternatives", [])
                if not isinstance(alts, list):
                    alts = []
                valid_alts = []
                for alt in alts:
                    if isinstance(alt, dict) and "action" in alt:
                        valid_alts.append({
                            "action": alt.get("action", "unknown"),
                            "score": alt.get("confidence", alt.get("score", 0.5)),
                        })
                valid_alts = sorted(valid_alts, key=lambda x: x["score"], reverse=True)[:2]

                # 规范化 params：移除空值
                params = parsed.get("params", {})
                clean_params = {}
                for k, v in params.items():
                    if v is None or v == "":
                        continue
                    if isinstance(v, list) and len(v) == 0:
                        continue
                    clean_params[k] = v

                return Intent(
                    action=parsed.get("action", "unknown"),
                    category=parsed.get("category", "unknown"),
                    params=clean_params,
                    raw_input=user_input,
                    confidence=float(parsed.get("confidence", 0.7)),
                    alternatives=valid_alts,
                )
        except Exception as e:
            self._logger.warning(f"Deep parse failed: {e}")

        return self._fallback_intent(user_input)

    def _fallback_intent(self, user_input: str) -> Intent:
        return Intent(
            action="chat",
            category="unknown",
            params={"message": user_input},
            raw_input=user_input,
            confidence=0.3,
        )

    @staticmethod
    def _extract_json(text: str) -> str:
        """从文本中提取最外层 JSON 对象，支持嵌套结构。"""
        # 先去掉可能的 markdown 代码块标记
        text = re.sub(r'```(?:json)?\s*', '', text)
        text = text.strip()

        # 尝试整段直接解析
        text_trimmed = text.strip()
        if text_trimmed.startswith("{") and text_trimmed.endswith("}"):
            try:
                json.loads(text_trimmed)
                return text_trimmed
            except json.JSONDecodeError as e:
                logger.debug(f"操作失败: {e}")

        # 用栈平衡匹配最外层花括号
        start = text.find("{")
        if start == -1:
            return text
        depth = 0
        for i, ch in enumerate(text[start:], start=start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start:i + 1]
        # 如果花括号未闭合，回退到简单正则
        m = re.search(r'\{[^{}]*\}', text)
        if m:
            return m.group()
        return text

# ═══════════════════════════════════════════════════
#  Planner — JSON 结构化计划生成（Agent OS 蓝图 §4）
# ═══════════════════════════════════════════════════

class Planner:
    """将用户需求转换为结构化 JSON 执行计划（Agent OS 蓝图 §4）"""

    PLAN_SYSTEM_PROMPT = """你是一个任务规划器。根据用户需求和可用工具列表，生成一个结构化的JSON执行计划。

=== 计划格式 ===
{
  "goal": "一句话概括用户目标",
  "strategy": "简短描述整体策略（1-2句）",
  "steps": [
    {
      "step": 1,
      "tool": "精确的工具名称（从可用工具列表中选）",
      "action": "工具的具体action（如query/create/list/read等）",
      "params": {"data_type": "role", "name": "火法"},
      "reason": "为什么需要这一步",
      "depends_on": null
    }
  ]
}

=== 规划规则 ===
1. 每步必须使用可用工具列表中的精确工具名，不能虚构工具
2. params 只填必要参数，不展开无关细节
3. 如果某步依赖上一步的结果，设置 depends_on 为前一步的 step 编号
4. 简单任务 1-2 步，复杂任务 3-5 步
5. 不确定数据时先查询(query)再操作(create/update)
6. 只输出 JSON，不要任何前置/后置文字，不要 markdown 代码块标记

=== 可用工具 ===
{tools_desc}

=== 用户需求 ===
{user_input}

请生成 JSON 计划："""

    PLAN_USER_PROMPT = "请为以上需求生成执行计划。只输出JSON。"

    def __init__(self, call_ai=None):
        self._call_ai = call_ai

    def plan(self, user_input: str, config, tools_desc: str) -> dict:
        """生成执行计划。失败时返回空的兜底计划。"""
        logger = get_logger()
        try:
            system_prompt = self.PLAN_SYSTEM_PROMPT.format(
                tools_desc=tools_desc,
                user_input=user_input
            )
            if self._call_ai:
                success, raw = self._call_ai(config, self.PLAN_USER_PROMPT, system_prompt)
                if success and raw:
                    plan_json = self._extract_json(str(raw))
                    plan = json.loads(plan_json)
                    steps = plan.get("steps", [])
                    logger.info(f"[Planner] 生成 {len(steps)} 步计划: {plan.get('goal', 'N/A')[:60]}")
                    return {
                        "goal": plan.get("goal", user_input[:50]),
                        "strategy": plan.get("strategy", ""),
                        "steps": [self._normalize_step(s) for s in steps],
                    }
        except Exception as e:
            logger.warning(f"[Planner] LLM 计划生成失败: {e}，降级到空计划")
        return {"goal": user_input[:50], "strategy": "", "steps": []}

    @staticmethod
    def _normalize_step(step: dict) -> dict:
        return {
            "step": step.get("step", 1),
            "tool": step.get("tool", ""),
            "action": step.get("action", step.get("params", {}).get("action", "")),
            "params": step.get("params", {}),
            "reason": step.get("reason", ""),
            "depends_on": step.get("depends_on"),
        }

    @staticmethod
    def _extract_json(text: str) -> str:
        text = str(text).strip()
        text = re.sub(r'```(?:json)?\s*', '', text)
        start = text.find("{")
        if start < 0:
            return "{}"
        depth = 0
        for i, ch in enumerate(text[start:], start=start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start:i + 1]
        raw = text[start:]
        if raw.count("{") > raw.count("}"):
            raw += "}" * (raw.count("{") - raw.count("}"))
        elif raw.count("}") > raw.count("{"):
            raw = "{" * (raw.count("}") - raw.count("{")) + raw
        try:
            import json
            json.loads(raw)
            return raw
        except json.JSONDecodeError as e:
            logger.debug(f"操作失败: {e}")
        m = re.search(r'\{[\s\S]*\}', text)
        return m.group() if m else "{}"
