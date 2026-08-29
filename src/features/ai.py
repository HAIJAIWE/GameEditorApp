"""AI功能模块 - AI生成内容、AI分析等"""

from typing import Any, Optional

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
)

from common.logger import get_logger
from config.settings import get_config

logger = get_logger()
from features._ai_dialog import (  # noqa: F401  # re-export，供 tests/test_ai_parsing 等外部模块导入
    AIGenerateDialog,
    AIGenerateThread,
    find_matching_brace,
    parse_ai_result,
)


def show_ai_generate_dialog(
    main_window: QMainWindow, data_type: str, initial_prompt: str = ""
) -> Optional[dict[str, Any]]:
    """显示AI生成对话框

    Args:
        main_window: 主窗口实例
        data_type: 数据类型
        initial_prompt: 初始提示词（可选，用于传入策划方案等上下文）

    Returns:
        生成的数据（可能是数组或单个对象）
    """
    config = get_config()
    if not config.enabled:
        QMessageBox.information(main_window, "提示", "请先在设置中启用API")
        return None

    # 获取本地已有的数据
    existing_names = []
    existing_roles = []
    existing_monsters = []
    if hasattr(main_window, "data_manager"):
        from config.constants import DATA_TYPE_PLURALS

        data_type_plural = DATA_TYPE_PLURALS.get(data_type, data_type + "s")

        try:
            existing_data = main_window.data_manager.data.get(data_type_plural, [])
            existing_names = [item.get("name", "") for item in existing_data if item.get("name")]
            get_logger().info(f"找到 {len(existing_names)} 个现有数据: {existing_names[:10]}")
        except Exception as e:
            get_logger().warning(f"获取现有数据失败: {e}")

        if data_type == "skill":
            try:
                existing_roles = main_window.data_manager.data.get("roles", [])
                existing_monsters = main_window.data_manager.data.get("monsters", [])
                get_logger().info(f"找到 {len(existing_roles)} 个角色, {len(existing_monsters)} 个怪物")
            except Exception as e:
                get_logger().warning(f"获取角色/怪物数据失败: {e}")

    existing_equips = []
    planning_text = ""
    if hasattr(main_window, "data_manager"):
        try:
            existing_equips = main_window.data_manager.data.get("equips", [])
        except Exception as e:
            get_logger().warning(f"获取装备数据失败: {e}")

        try:
            planning_data = main_window.data_manager.data.get("planning", "")
            if isinstance(planning_data, str) and len(planning_data) > 10:
                planning_text = planning_data
            elif isinstance(planning_data, dict):
                import json

                planning_text = json.dumps(planning_data, ensure_ascii=False, indent=2)
        except Exception as e:
            get_logger().warning(f"获取策划文档失败: {e}")

    # 构建用户提示词 - 区分策划上下文和普通生成
    user_initial_prompt = ""

    # 如果有初始提示词，检查是否是策划上下文（包含特定标记）
    if initial_prompt:
        if "【重要】请严格按照以下游戏策划案来生成数据" in initial_prompt:
            user_initial_prompt = initial_prompt
        else:
            user_initial_prompt = initial_prompt

    # 如果没有用户提示词，使用默认提示词
    if not user_initial_prompt:
        if data_type == "skill":
            user_initial_prompt = """请为奇幻RPG游戏设计一个技能，要求：
1. 技能名称要有奇幻色彩（如"暗影裂空斩"、"圣光洗礼"）
2. 类型可以是攻击/治疗/防御/控制/增益/减益
3. 数值设定合理，考虑游戏平衡性
4. 效果描述清晰，有具体的视觉表现
5. 冷却时间和消耗要符合游戏节奏
6. 技能之间有潜在的组合连招空间"""
        elif data_type == "role":
            user_initial_prompt = """请为奇幻RPG游戏设计一个角色，要求：
1. 角色名称要有辨识度，符合其种族和职业设定
2. 职业定位清晰（坦克/输出/辅助/治疗/控制之一）
3. 属性数值平衡，有明确的优势和劣势
4. 有独特的背景故事和人设特点
5. 种族和派系设定要自洽，符合游戏世界观"""
        elif data_type == "monster":
            user_initial_prompt = """请为奇幻RPG游戏设计一个怪物，要求：
1. 怪物名称具有游戏感（根据等级设计普通名或Boss名）
2. 等级与属性成正比，低等级怪物数值保守
3. 行为模式多样化（攻击性/防御性/游荡/召唤等）
4. 难度标注准确（简单→首领梯度合理）
5. 掉落经验和难度匹配
6. 可以设计独特的行为机制增加战斗趣味性"""
        elif data_type == "equip":
            user_initial_prompt = """请为奇幻RPG游戏设计一件装备，要求：
1. 装备名称体现稀有度和属性特点
2. 部位与属性加成逻辑一致（武器+攻击、胸甲+防御、戒指+暴击等）
3. 稀有度梯度合理（普通→传说的数值递增）
4. 有职业适配性，某些装备限定特定职业
5. 传说级装备有独特的特殊效果描述"""
        elif data_type == "item":
            user_initial_prompt = """请为奇幻RPG游戏设计一个道具，要求：
1. 道具名称直观，玩家一看就知道用途
2. 类型明确（消耗品/材料/任务道具/货币/配方）
3. 品质和稀有度与道具效果匹配
4. 如果是消耗品，明确使用效果和数值
5. 考虑道具之间的合成或升级关系"""
        elif data_type == "task":
            user_initial_prompt = """请为奇幻RPG游戏设计一个任务，要求：
1. 任务名称概括核心目标，副标题增加叙事感
2. 任务类型多样化（主线/支线/日常/隐藏等）
3. 目标描述清晰，玩家能明确知道要做什么
4. 难度与奖励成正比
5. NPC和地点名称与世界观一致
6. 可以有任务链的前置和后续关联"""
        elif data_type == "dialog":
            user_initial_prompt = """请为奇幻RPG游戏设计一段NPC对话，要求：
1. 对话有明确的叙事目的（推进剧情/提供情报/触发任务）
2. NPC性格通过语言风格体现（粗犷/优雅/神秘/狡黠）
3. 对话选项给玩家有意义的选择
4. 选项有不同后果（影响好感度/剧情走向/获得不同奖励）
5. 对话长度适中，不要冗长"""
        elif data_type == "story":
            user_initial_prompt = """请为奇幻RPG游戏设计一段剧情，要求：
1. 有明确的冲突和转折，避免平淡叙事
2. 角色动机合理，行为符合人设
3. 章节结构清晰（开端/发展/高潮/结局）
4. 关键事件有触发条件和完成条件
5. 与游戏世界观一致，不破坏已有设定
6. 为后续剧情留伏笔和扩展空间"""
        elif data_type == "achievement":
            user_initial_prompt = """请为奇幻RPG游戏设计一个成就，要求：
1. 成就名称有纪念意义或幽默感
2. 达成条件明确，玩家知道如何解锁
3. 成就难度梯度合理（简单→极难）
4. 奖励与难度匹配
5. 可以设计隐藏成就增加探索乐趣
6. 描述简洁有力，让人有成就感"""
        elif data_type == "talent":
            user_initial_prompt = """请为奇幻RPG游戏设计一个天赋，要求：
1. 天赋名称有辨识度和记忆点（如"烈焰之心"、"暗影亲和"）
2. 天赋类型明确（战斗/生存/探索/社交/制造）
3. 稀有度和等级匹配，梯度合理
4. 效果类型多样化（属性提升/技能增强/被动触发/条件激活/光环效果）
5. 解锁条件与天赋强度匹配
6. 考虑天赋之间的搭配和协同效果，避免设计冲突"""
        elif data_type == "planning":
            user_initial_prompt = """请生成一份完整的奇幻RPG游戏策划文档，要求：
1. 包含游戏理念、核心玩法、角色职业、战斗系统等完整内容
2. 世界观设定详实，有历史、地理、势力等背景
3. 数值设计有明确的公式和平衡思路
4. 剧情主线清晰，有吸引人的故事驱动
5. 文档结构层次分明，便于开发团队参考"""
        else:
            user_initial_prompt = "请生成符合奇幻RPG设定的游戏数据，要求数值平衡、名称有辨识度、描述清晰专业。"

    # 显示对话框，传入已有名称
    dialog = AIGenerateDialog(
        main_window,
        initial_prompt=user_initial_prompt,
        data_type=data_type,
        existing_names=existing_names,
        existing_roles=existing_roles,
        existing_monsters=existing_monsters,
        existing_equips=existing_equips,
        planning_text=planning_text,
    )
    if dialog.exec() == QDialog.DialogCode.Accepted:
        result = dialog.get_result()
        # 解析结果为结构化数据
        parsed_data = parse_ai_result(result, data_type)
        return parsed_data
    return None


def show_ai_review(main_window: QMainWindow) -> None:
    """显示AI内容审核"""
    from PyQt6.QtWidgets import QDialog

    dialog = QDialog(main_window)
    dialog.setWindowTitle("AI 内容审核")
    dialog.resize(500, 400)
    layout = QVBoxLayout(dialog)

    info = QLabel(
        "🧐 AI 内容审核\n\n"
        "此功能允许您使用 AI 对游戏内容进行自动审核，\n"
        "检查文本一致性、数值合理性、命名规范等。\n\n"
        "审核范围包括：\n"
        "• 角色/技能/装备描述文本\n"
        "• 数值平衡合理性\n"
        "• 命名规范一致性\n"
        "• 跨数据引用准确性\n\n"
        "当前版本可通过数字员工面板使用 AI 辅助审核。\n"
        "在数字员工中输入「帮我审核当前数据」即可。"
    )
    info.setWordWrap(True)
    layout.addWidget(info)

    btn = QPushButton("关闭")
    btn.clicked.connect(dialog.accept)
    row = QHBoxLayout()
    row.addStretch()
    row.addWidget(btn)
    layout.addLayout(row)
    dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dialog.show()


def show_ai_balance_analysis(main_window: QMainWindow) -> None:
    """显示AI平衡分析

    Args:
        main_window: 主窗口实例
    """
    logger = get_logger()
    config = get_config()

    from PyQt6.QtWidgets import QDialog

    dialog = QDialog(main_window)
    dialog.setWindowTitle("🤖 AI平衡性分析")
    dialog.resize(800, 600)

    layout = QVBoxLayout(dialog)

    info_label = QLabel("选择分析类型，AI将分析游戏数据的平衡性并给出建议\n提示：需要先在设置中启用API并配置API Key")
    layout.addWidget(info_label)

    analysis_combo = QComboBox()
    analysis_combo.addItems(["技能平衡性分析", "角色平衡性分析", "怪物难度曲线分析", "整体游戏平衡分析"])
    layout.addWidget(analysis_combo)

    result_text = QTextEdit()
    result_text.setReadOnly(True)
    result_text.setPlaceholderText("AI分析结果将显示在这里...")
    layout.addWidget(result_text)

    analyze_btn = QPushButton("🔍 开始AI分析")
    layout.addWidget(analyze_btn)

    def perform_analysis():
        if not config.enabled:
            QMessageBox.warning(dialog, "提示", "请先在设置中启用API并配置API Key")
            return

        analyze_btn.setEnabled(False)
        analyze_btn.setText("分析中...")
        result_text.clear()
        result_text.append("正在请求AI分析...\n")

        analysis_type = analysis_combo.currentText()
        data = main_window.data_manager.data

        # 构建分析提示（CRISPE框架完整版）
        prompt = f"""【角色】
你是一位顶级游戏数值策划，拥有丰富的MMORPG和单机RPG数值设计经验。你善于发现数值异常、评估平衡性、给出可落地的调整方案。

【上下文】
这是一个奇幻RPG游戏项目的数据分析请求。数据涵盖技能、角色、怪物、装备、天赋、道具、任务、对话、剧情、成就共10大类型，需要通过系统性分析确保游戏体验的完整性和平衡性。

【指令】
对当前游戏数据进行{analysis_type}：

【数据全貌】
"""

        # --- 技能 ---
        if "skills" in data and data["skills"]:
            total = len(data["skills"])
            prompt += f"\n◆ 技能（{total}个）\n"
            for s in data["skills"][:10]:
                extras = []
                if s.get("damage_type"):
                    extras.append(f"伤害:{s['damage_type']}")
                if s.get("cd"):
                    extras.append(f"冷却:{s['cd']}s")
                if s.get("multiplier"):
                    extras.append(f"倍率:×{s['multiplier']}")
                extra_str = " | ".join(extras) if extras else ""
                prompt += f"  {s.get('name', '?')} [{s.get('type', '?')}] 数值:{s.get('value', 0)}"
                if extra_str:
                    prompt += f" ({extra_str})"
                prompt += f" → {s.get('desc', '?')[:40]}\n"

        # --- 角色 ---
        if "roles" in data and data["roles"]:
            total = len(data["roles"])
            prompt += f"\n◆ 角色（{total}个）\n"
            for r in data["roles"][:10]:
                prompt += f"  {r.get('name', '?')} [{r.get('job', '?')}/{r.get('race', '?')}] HP:{r.get('hp', 0)} ATK:{r.get('atk', 0)} DEF:{r.get('def', 0)} → {r.get('desc', '?')[:40]}\n"

        # --- 怪物 ---
        if "monsters" in data and data["monsters"]:
            total = len(data["monsters"])
            prompt += f"\n◆ 怪物（{total}个）\n"
            for m in data["monsters"][:10]:
                prompt += f"  {m.get('name', '?')} Lv{m.get('level', 0)} [{m.get('category', '?')}/{m.get('difficulty', '?')}] HP:{m.get('hp', 0)} ATK:{m.get('atk', 0)} EXP:{m.get('exp', 0)} → {m.get('desc', '?')[:40]}\n"

        # --- 装备 ---
        if "equips" in data and data["equips"]:
            total = len(data["equips"])
            prompt += f"\n◆ 装备（{total}个）\n"
            for e in data["equips"][:10]:
                prompt += f"  {e.get('name', '?')} [{e.get('rare', '?')}/{e.get('part', '?')}] 职业:{e.get('job', '?')} 效果:{e.get('effect', '?')} +{e.get('value', 0)} → {e.get('desc', '?')[:40]}\n"

        # --- 道具 ---
        if "items" in data and data["items"]:
            total = len(data["items"])
            prompt += f"\n◆ 道具（{total}个）\n"
            for it in data["items"][:8]:
                prompt += f"  {it.get('name', '?')} [{it.get('type', '?')}/{it.get('rare', '?')}] 效果:{it.get('effect', '?')} +{it.get('value', 0)}\n"

        # --- 任务 ---
        if "tasks" in data and data["tasks"]:
            total = len(data["tasks"])
            prompt += f"\n◆ 任务（{total}个）\n"
            for t in data["tasks"][:8]:
                prompt += f"  {t.get('name', '?')} [{t.get('type', '?')}] 难度:{t.get('difficulty', '?')} Lv{t.get('level', 0)} 奖励:{t.get('reward', '?')[:30]}\n"

        # --- 对话 ---
        if "dialogs" in data and data["dialogs"]:
            prompt += f"\n◆ 对话（{len(data['dialogs'])}段）\n"
            for d in data["dialogs"][:5]:
                prompt += f"  {d.get('name', '?')} [{d.get('speaker', '?')}] → {d.get('desc', '?')[:40]}\n"

        # --- 剧情 ---
        if "stories" in data and data["stories"]:
            prompt += f"\n◆ 剧情（{len(data['stories'])}章）\n"
            for st in data["stories"][:5]:
                prompt += f"  第{st.get('order', '?')}章:{st.get('name', '?')} [{st.get('type', '?')}] 场景:{st.get('scene', '?')}\n"

        # --- 成就 ---
        if "achievements" in data and data["achievements"]:
            prompt += f"\n◆ 成就（{len(data['achievements'])}个）\n"
            for a in data["achievements"][:5]:
                prompt += f"  {a.get('name', '?')} → {a.get('condition', '?')[:40]}\n"

        prompt += """
【输出要求】
按以下结构输出分析结果，使用中文：

1. 📊 数据概览
   - 各类型数据量是否合理（哪些过多/过少/缺失）
   - 数据类型之间的关联是否完整（如：技能是否绑定到角色、对话是否关联任务）

2. ⚠️ 平衡性问题
   - 逐条列出数值异常（过高/过低/不合理的条目）
   - 用 ⚠️ 标记严重问题，💡 标记可优化项
   - 检查组内数值梯度是否平滑（如等级1→10→50→100的怪物属性是否合理递增）

3. 🔧 调整方案
   - 每个问题给出：目标项名 → 当前值 → 建议值 → 调整理由
   - 不只调数值，也可建议补充缺失类型或调整设计方向

4. 📈 整体评分
   - 1-10分综合评分
   - 简述评分依据（数据完整性、数值合理性、内容多样性各占权重）

分析要具体可执行，指出具体的条目名称和数值，不要泛泛而谈。"""

        # 在 QThread 中调用 AI 避免阻塞 UI

        analysis_thread = [None]

        def on_finished(success: bool, response: str):
            result_text.clear()
            if success and response:
                result_text.append(f"📊 {analysis_type}\n")
                result_text.append("=" * 50 + "\n\n")
                result_text.append(response)
                logger.info(f"AI平衡分析完成：{analysis_type}")
            else:
                result_text.append(f"❌ 分析失败：{response}")
            analyze_btn.setEnabled(True)
            analyze_btn.setText("🔍 开始AI分析")

        thread = AIGenerateThread(prompt)
        thread.finished.connect(on_finished)
        thread.start()
        # 持有引用避免被 GC
        analysis_thread[0] = thread

    analyze_btn.clicked.connect(perform_analysis)
    dialog.exec()


def show_ai_settings(main_window: QMainWindow) -> None:
    """显示AI设置（已在菜单中配置）

    Args:
        main_window: 主窗口实例
    """
    from features.advanced import show_api_config

    show_api_config(main_window)


# ========== 无弹窗直调：供技能体系调用 ==========


def ai_generate_game_data(data_type: str, user_input: str = "", existing_context: dict = None) -> Optional[dict]:
    """动态 AI 生成游戏数据——根据 type_schema 自动构建 prompt，支持任意游戏类型。

    Returns: 生成的数据 dict，失败返回 None
    """
    from common.ai_client import generate_text
    from common.logger import get_logger
    from config.settings import get_config

    config = get_config()
    logger = get_logger()

    if not config.enabled or not config.api_key:
        return None

    # === 从 type_schema 动态读取字段定义 ===
    field_desc, field_json = _build_field_prompt(data_type)

    system_prompt = (
        "你是一个资深游戏策划，专精于游戏数据设计。\n"
        "请根据指定的字段结构生成游戏数据，要求：\n"
        "1. 名称要有辨识度和记忆点，使用中文，符合奇幻/仙侠/武侠风格\n"
        "2. 数值合理平衡，符合游戏设计逻辑\n"
        "3. 描述简洁有力，突出核心特色\n"
        "4. 严格按照下方 JSON 格式输出，不要添加任何解释、markdown标记或额外文字\n\n"
        f"字段结构：\n{field_json}\n\n"
        f"字段说明：\n{field_desc}"
    )

    user_prompt = f"请生成一个 {data_type} 类型的数据，所有文字用中文"
    if user_input:
        user_prompt += f"，具体要求：{user_input}"
    if existing_context:
        names = existing_context.get("names", [])
        if names:
            user_prompt += f"\n避免与已有名称重复：{', '.join(names[:5])}"

    try:
        success, result = generate_text(config, user_prompt, system_prompt)
        if not success:
            logger.warning(f"AI生成失败: {result}")
            return None

        result_clean = result.replace("```json", "").replace("```", "").strip()
        start = result_clean.find("{")
        end = result_clean.rfind("}")
        if start >= 0 and end > start:
            import json as _json

            data = _json.loads(result_clean[start : end + 1])
            logger.info(f"AI生成成功: {data.get('name', '?')}")
            return data
    except Exception as e:
        logger.warning(f"AI生成解析失败: {e}")

    return None


def _build_field_prompt(data_type: str) -> tuple:
    """根据 type_schema.json 动态构建字段 prompt。
    Returns: (field_desc: 字段中文说明, field_json: JSON模板)
    """
    import json as _json

    try:
        # 1. 先尝试 config
        from config.settings import get_config

        config = get_config()
        schema = config.get_type_schema()
        types = getattr(schema, "types", []) if schema else []

        # 2. 如果 config 没有，直接从文件读
        if not types:
            from pathlib import Path

            # data_dir 是 src/data，type_schema 在项目根 data/
            project_root = Path(__file__).resolve().parent.parent.parent
            libraries_dir = project_root / "data" / "libraries"
            if libraries_dir.exists():
                for lib_dir in libraries_dir.iterdir():
                    sf = lib_dir / "type_schema.json"
                    if sf.exists():
                        schema_data = _json.loads(sf.read_text(encoding="utf-8"))
                        types = schema_data.get("data_types", [])
                        break

        # 3. 匹配 data_type
        for t in types:
            type_id = t.get("id", "")
            if type_id == data_type:
                fields = [
                    f for f in t.get("form_fields", []) if f.get("name") not in ("id",) and f.get("editable", True)
                ]
                if not fields:
                    break
                desc_lines = []
                json_obj = {"name": "string — 名称"}
                for f in fields:
                    fname = f["name"]
                    flabel = f.get("label", fname).rstrip(":")
                    ftype = f.get("type", "entry")
                    values = f.get("values", [])
                    if values:
                        desc_lines.append(f"  {fname}({flabel}): 可选={values}")
                        json_obj[fname] = f"可选: {values[0]}"
                    elif ftype == "spinbox":
                        desc_lines.append(f"  {fname}({flabel}): 数值")
                        json_obj[fname] = 0
                    elif ftype == "text":
                        desc_lines.append(f"  {fname}({flabel}): 文本")
                        json_obj[fname] = "描述"
                    elif ftype == "checkbox":
                        desc_lines.append(f"  {fname}({flabel}): true/false")
                        json_obj[fname] = False
                    else:
                        desc_lines.append(f"  {fname}({flabel}): 文本")
                        json_obj[fname] = "值"
                return "\n".join(desc_lines), _json.dumps(json_obj, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"操作失败: {e}")

    return f"请生成 {data_type} 类型的游戏数据，输出纯JSON", '{"name":"名称","description":"描述"}'
