"""策划书 v5.0 工业级升级测试

覆盖：
- 18 章结构与 v4→v5 迁移
- 系统依赖检查 (SYSTEM_DEPENDENCIES / check_system_dependencies)
- 混合玩法预设 (HYBRID_GAMEPLAY_PRESETS / find_preset)
- 模块系统推荐 (MODULE_SYSTEM_RECOMMENDATIONS / get_recommended_systems)
- 章节间一致性校验 (validate 扩展)
- CeshuDataSync 双向同步
- docx 导出
- style/module_type 参数化生成辅助
"""
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))


# ========== 18 章结构 & 迁移 ==========

def test_chapter_keys_18():
    """v5.0: CHAPTER_KEYS 应为 18 章"""
    from core.ceshu import CHAPTER_KEYS, CHAPTER_LABELS
    assert len(CHAPTER_KEYS) == 18
    # 所有 key 都有中文标签
    for k in CHAPTER_KEYS:
        assert k in CHAPTER_LABELS, f"章节 {k} 缺少中文标签"
    # 包含 v5.0 新增的 9 章
    new_chapters = [
        "market_analysis", "characters", "combat", "economy",
        "monetization", "mvp", "risk_handling", "audio", "accessibility",
    ]
    for ch in new_chapters:
        assert ch in CHAPTER_KEYS, f"v5.0 新章节 {ch} 未在 CHAPTER_KEYS 中"


def test_v4_to_v5_migration():
    """v5.0: v4 数据应自动迁移到 v5 结构"""
    from core.ceshu import CeshuModel

    # 构造 v4 旧数据（9 章）
    v4_data = {
        "version": "4.0",
        "ceshu_id": "test_v4",
        "meta": {"game_name": "旧版游戏", "game_type": "RPG"},
        "vision": {
            "design_vision": "测试愿景",
            "competitive_analysis": [{"name": "竞品A"}],
            "business_model": "F2P",
        },
        "worldview": {"character_network": [{"name": "NPC1"}]},
        "systems": {
            "battle": {"enabled": True, "config": {"turn_mode": "turn_based"}},
            "character": {"enabled": True, "config": {}},
            "skill": {"enabled": True, "config": {}},
        },
        "resources": {"risk_matrix": [{"risk": "技术风险"}], "localization": ["zh"]},
        "tech": {"milestones": [{"name": "MVP"}]},
    }

    # from_dict 应自动检测 v4 并迁移
    model = CeshuModel.from_dict(v4_data)
    assert model.version == "5.0", f"迁移后版本应为 5.0, 实际 {model.version}"
    # 旧字段应迁移到新章节
    assert model.market_analysis  # 从 vision.competitive_analysis 迁移
    assert model.monetization  # 从 vision.business_model 迁移
    assert model.characters  # 从 worldview.character_network 迁移
    assert model.combat  # 从 systems.battle 迁移
    assert model.mvp  # 从 tech.milestones 迁移
    assert model.audio  # 默认创建
    assert model.risk_handling  # 从 resources.risk_matrix 迁移
    assert model.accessibility  # 从 resources.localization 迁移


def test_v5_round_trip():
    """v5.0: to_dict → from_dict 应保持数据完整"""
    from core.ceshu import CeshuModel
    m = CeshuModel()
    m.meta["game_name"] = "RoundTrip测试"
    m.style = "xianxia"
    m.module_type = "rpg"
    m.combat = {"combat_mode": "turn_based", "damage_formula": "atk - def"}
    m.monetization = {"payment_model": "f2p", "pricing_tiers": ["6", "30", "68"]}
    m.characters = {"main_npc_count": 5, "npc_list": ["张三", "李四"]}

    d = m.to_dict()
    assert d["style"] == "xianxia"
    assert d["module_type"] == "rpg"
    assert d["combat"]["combat_mode"] == "turn_based"

    m2 = CeshuModel.from_dict(d)
    assert m2.style == "xianxia"
    assert m2.module_type == "rpg"
    assert m2.combat["combat_mode"] == "turn_based"
    assert m2.monetization["pricing_tiers"] == ["6", "30", "68"]


# ========== 系统依赖检查 ==========

def test_system_dependencies_structure():
    """系统依赖关系常量结构正确"""
    from core.ceshu import SYSTEM_DEPENDENCIES
    assert "battle" in SYSTEM_DEPENDENCIES
    assert "character" in SYSTEM_DEPENDENCIES["battle"]  # 战斗依赖角色
    assert "skill" in SYSTEM_DEPENDENCIES["battle"]  # 战斗依赖技能
    assert "gacha" in SYSTEM_DEPENDENCIES
    assert "item" in SYSTEM_DEPENDENCIES["gacha"]  # 抽卡依赖物品
    assert "economy" in SYSTEM_DEPENDENCIES["gacha"]


def test_check_system_dependencies_no_missing():
    """所有依赖都满足时返回空列表"""
    from core.ceshu import check_system_dependencies
    # 启用所有依赖链：character + skill + battle
    result = check_system_dependencies(["character", "skill", "battle"])
    assert result == [], f"期望无缺失依赖, 实际 {result}"


def test_check_system_dependencies_missing():
    """检测到缺失依赖时返回提示"""
    from core.ceshu import check_system_dependencies
    # 只启用 battle，但缺少 character 和 skill
    result = check_system_dependencies(["battle"])
    assert len(result) == 1
    assert result[0]["system"] == "battle"
    assert "character" in result[0]["missing"]
    assert "skill" in result[0]["missing"]


def test_get_reverse_dependencies():
    """反向依赖映射正确"""
    from core.ceshu.ceshu_constants import get_reverse_dependencies
    rev = get_reverse_dependencies()
    # character 被多个系统依赖
    assert "character" in rev
    dependents = rev["character"]
    assert "battle" in dependents
    assert "skill" in dependents
    assert "equipment" in dependents


def test_validate_detects_missing_dependency():
    """校验方法应检测到系统依赖缺失"""
    from core.ceshu import CeshuModel
    m = CeshuModel()
    # 只启用 battle，不启用 character/skill
    m.set_system("battle", True)
    m.set_system("character", False)
    m.set_system("skill", False)
    errors = m.validate()
    dep_errors = [e for e in errors if "依赖缺失" in e]
    assert len(dep_errors) > 0, "应检测到依赖缺失"


# ========== 混合玩法预设 ==========

def test_hybrid_gameplay_presets_structure():
    """混合玩法预设结构完整"""
    from core.ceshu import HYBRID_GAMEPLAY_PRESETS
    assert len(HYBRID_GAMEPLAY_PRESETS) >= 8, f"预设数应 >=8, 实际 {len(HYBRID_GAMEPLAY_PRESETS)}"
    for key, preset in HYBRID_GAMEPLAY_PRESETS.items():
        assert "label" in preset, f"预设 {key} 缺少 label"
        assert "style" in preset, f"预设 {key} 缺少 style"
        assert "module_type" in preset, f"预设 {key} 缺少 module_type"
        assert "recommended_systems" in preset, f"预设 {key} 缺少 recommended_systems"
        assert "highlight" in preset, f"预设 {key} 缺少 highlight"
        assert isinstance(preset["recommended_systems"], list)


def test_find_preset_exact_match():
    """精确匹配风格+模块"""
    from core.ceshu import find_preset
    # 仙侠 + RPG 应匹配 xianxia_rpg
    preset = find_preset("xianxia", "rpg")
    assert preset is not None
    assert preset["style"] == "xianxia"
    assert preset["module_type"] == "rpg"
    assert "xianxia" in preset["key"]


def test_find_preset_fallback_style():
    """仅风格匹配时退化匹配"""
    from core.ceshu import find_preset
    # xianxia + 未知模块 → 退化到风格匹配
    preset = find_preset("xianxia", "unknown_module")
    assert preset is not None
    assert preset["style"] == "xianxia"


def test_find_preset_no_match():
    """完全不匹配时返回 None"""
    from core.ceshu import find_preset
    preset = find_preset("unknown_style", "unknown_module")
    assert preset is None


def test_get_preset_by_key():
    """按 key 获取预设"""
    from core.ceshu import get_preset_by_key
    preset = get_preset_by_key("xianxia_rpg")
    assert preset is not None
    assert preset["label"] == "仙侠 RPG"
    preset_none = get_preset_by_key("nonexistent_key")
    assert preset_none is None


# ========== 模块系统推荐 ==========

def test_module_system_recommendations():
    """模块推荐系统组合"""
    from core.ceshu import MODULE_SYSTEM_RECOMMENDATIONS
    # RPG 应推荐 character + battle + skill 等核心系统
    rpg = MODULE_SYSTEM_RECOMMENDATIONS.get("rpg")
    assert rpg is not None
    assert "character" in rpg["core_systems"]
    assert "battle" in rpg["core_systems"]
    assert "skill" in rpg["core_systems"]


def test_get_recommended_systems():
    """get_recommended_systems 返回 (core, optional) 元组"""
    from core.ceshu import get_recommended_systems
    core, optional = get_recommended_systems("mmorpg")
    assert "character" in core
    assert "battle" in core
    assert isinstance(optional, list)


def test_get_recommended_systems_unknown():
    """未知模块返回空列表"""
    from core.ceshu import get_recommended_systems
    core, optional = get_recommended_systems("unknown_module")
    assert core == []
    assert optional == []


# ========== 章节间一致性校验 ==========

def test_validate_combat_systems_consistency():
    """combat.combat_mode 与 systems.battle.config.turn_mode 不一致应告警"""
    from core.ceshu import CeshuModel
    m = CeshuModel()
    m.combat = {"combat_mode": "realtime"}
    m.set_system("battle", True, config={"turn_mode": "turn_based"})
    m.set_system("character", True)
    m.set_system("skill", True)
    errors = m.validate()
    consistency_errors = [e for e in errors if "combat_mode" in e and "turn_mode" in e]
    assert len(consistency_errors) > 0, "应检测到 combat_mode 与 turn_mode 不一致"


def test_validate_monetization_economy_consistency():
    """monetization.payment_model 与 systems.economy.config.payment_system 不一致应告警"""
    from core.ceshu import CeshuModel
    m = CeshuModel()
    m.monetization = {"payment_model": "p2p"}
    m.set_system("economy", True, config={"payment_system": "f2p"})
    m.set_system("item", True)  # economy 依赖 item
    errors = m.validate()
    pay_errors = [e for e in errors if "payment_model" in e and "payment_system" in e]
    assert len(pay_errors) > 0, "应检测到 payment_model 与 payment_system 不一致"


# ========== docx 导出 ==========

def test_docx_export():
    """docx 导出应生成有效 Word 文件"""
    try:
        from docx import Document  # type: ignore
    except ImportError:
        print("  ⏭️  python-docx 未安装，跳过 docx 导出测试")
        return

    from core.ceshu import CeshuModel
    from core.ceshu.ceshu_docx_exporter import export_ceshu_to_docx

    m = CeshuModel()
    m.meta["game_name"] = "导出测试"
    m.meta["game_type"] = "RPG"
    m.vision["design_vision"] = "这是一个测试愿景"
    m.combat = {"combat_mode": "turn_based"}

    tmp = tempfile.mkdtemp()
    try:
        out_path = os.path.join(tmp, "test.docx")
        result = export_ceshu_to_docx(m, out_path, include_validation_report=True)
        assert os.path.exists(result)
        # 验证 docx 可被 python-docx 读取
        doc = Document(result)
        # 应该有标题段落
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        assert len(paragraphs) > 0
        # 应包含游戏名称
        full_text = "\n".join(paragraphs)
        assert "导出测试" in full_text
    finally:
        shutil.rmtree(tmp)


def test_docx_export_includes_all_chapters():
    """docx 导出应包含全部 18 章"""
    try:
        from docx import Document  # type: ignore
    except ImportError:
        print("  ⏭️  python-docx 未安装，跳过 docx 导出测试")
        return

    from core.ceshu import CHAPTER_LABELS, CeshuModel
    from core.ceshu.ceshu_docx_exporter import export_ceshu_to_docx

    m = CeshuModel()
    m.meta["game_name"] = "全章节导出测试"
    tmp = tempfile.mkdtemp()
    try:
        out_path = os.path.join(tmp, "all_chapters.docx")
        export_ceshu_to_docx(m, out_path, include_validation_report=False)
        doc = Document(out_path)
        full_text = "\n".join([p.text for p in doc.paragraphs])
        # 验证所有 18 章标签都出现在文档中
        for _key, label in CHAPTER_LABELS.items():
            assert label in full_text, f"章节 '{label}' 未出现在 docx 中"
    finally:
        shutil.rmtree(tmp)


# ========== CeshuDataSync 双向同步 ==========

class _MockDataManager:
    """模拟 DataManager 用于测试"""

    def __init__(self):
        self.data = {"roles": [], "skills": [], "items": []}
        self.current_file = None

    def save_file(self, file_path=None):
        pass


def test_data_sync_systems_to_data():
    """systems → data 同步：确保数据结构存在"""
    from core.ceshu import CeshuDataSync, CeshuModel

    m = CeshuModel()
    m.set_system("character", True)  # data_type=character → roles
    m.set_system("skill", True)  # data_type=skill → skills

    mock_dm = _MockDataManager()
    # 删除 skills 键以测试自动创建
    del mock_dm.data["skills"]

    sync = CeshuDataSync(
        ceshu_manager=None,  # 测试不涉及 ceshu 保存
        data_manager=mock_dm,
        library_manager=None,
        config=None,
    )
    result = sync.sync_systems_to_data(m, "test_lib")
    # 应确保 skills 键存在
    assert "skills" in mock_dm.data
    # ensured_keys 应包含 skills
    assert "skills" in result["ensured_keys"]


def test_data_sync_progress_to_ceshu():
    """data → ceshu 同步：回填实际条目数"""
    from core.ceshu import CeshuDataSync, CeshuModel

    m = CeshuModel()
    # 设置 data_type 字段，使其与 DATA_TYPE_PLURALS 匹配
    m.set_system("character", True)
    m.systems["character"]["data_type"] = "role"  # character 系统 → role 数据类型
    m.set_system("skill", True)
    # skill 的 data_type 默认就是 skill，与 DATA_TYPE_PLURALS 一致

    mock_dm = _MockDataManager()
    mock_dm.data["roles"] = [{"id": "R1"}, {"id": "R2"}, {"id": "R3"}]  # 3 个角色
    mock_dm.data["skills"] = [{"id": "S1"}, {"id": "S2"}]  # 2 个技能

    sync = CeshuDataSync(
        ceshu_manager=None,
        data_manager=mock_dm,
        library_manager=None,
        config=None,
    )
    result = sync.sync_data_progress_to_ceshu(m, "test_lib", save=False)
    # 应回填 actual_count
    assert result.get("character") == 3, f"期望 3, 实际 {result.get('character')}"
    assert result.get("skill") == 2, f"期望 2, 实际 {result.get('skill')}"
    # model.systems 应被更新
    assert m.systems["character"]["config"]["actual_count"] == 3
    assert m.systems["skill"]["config"]["actual_count"] == 2


def test_data_sync_anti_loop():
    """防循环标志正常工作"""
    from core.ceshu import CeshuDataSync, CeshuModel

    m = CeshuModel()
    mock_dm = _MockDataManager()
    sync = CeshuDataSync(
        ceshu_manager=None,
        data_manager=mock_dm,
        config=None,
    )
    # 模拟正在同步中
    sync._syncing = True
    result = sync.sync_systems_to_data(m, "test_lib")
    # 应直接返回空结果，不执行同步
    assert result == {"added_types": [], "ensured_keys": [], "errors": []}


# ========== 风格推断 ==========

def test_infer_style_module():
    """从描述推断风格和模块类型"""
    try:
        from core.agent.skills.ceshu_skill import _infer_style_module
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise

    # 仙侠描述
    style, module = _infer_style_module("一款修仙RPG游戏，包含境界划分和宗门系统")
    assert style == "xianxia"
    assert module == "rpg"

    # 科幻描述
    style, module = _infer_style_module("未来科幻FPS射击游戏")
    assert style == "sci-fi"
    assert module == "fps"

    # 武侠描述
    style, module = _infer_style_module("武侠江湖SLG策略游戏")
    assert style == "wuxia"
    assert module == "slg"


def test_get_style_glossary():
    """风格术语表正常返回"""
    try:
        from core.agent.skills.ceshu_skill import _get_style_glossary
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise

    xianxia_glossary = _get_style_glossary("xianxia")
    assert "气血" in xianxia_glossary
    assert "灵力" in xianxia_glossary

    unknown = _get_style_glossary("unknown_style")
    assert unknown == ""


# ========== AgentRouter 18 章路由 ==========

def test_agent_router_18_chapters():
    """AgentRouter 应覆盖全部 18 章"""
    try:
        from core.agent.skills.ceshu_skill import AgentRouter
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise

    from core.ceshu import CHAPTER_KEYS
    for ch in CHAPTER_KEYS:
        agent = AgentRouter.route(ch)
        assert agent, f"章节 {ch} 未路由到智能体"
        prompt = AgentRouter.get_agent_prompt(ch)
        assert prompt, f"章节 {ch} 缺少提示语"


# ========== v5.0 优化2: 校验报告对话框 ==========

def test_validation_dialog_categorize():
    """v5.0 优化2: 错误分类函数 _categorize 应正确识别各类错误"""
    try:
        from ui.ceshu.validation_dialog import _CATEGORY_META, _categorize
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise

    # 必填字段
    assert _categorize("第一章·项目元信息：字段 'game_name' 为必填项") == "required"
    # 一致性冲突（硬）
    assert _categorize("一致性冲突：第十二章 combat.combat_mode='X' 与 第五章 systems.battle...") == "conflict"
    # 一致性警告（软）
    assert _categorize("一致性警告：第十六章 risk_handling.risk_matrix 与 第九章 resources...") == "warning"
    # 依赖缺失
    assert _categorize("依赖缺失：第五章 systems.battle 已启用，但其依赖系统 [character, skill] 未启用") == "dep"
    # 其他
    assert _categorize("未知问题") == "other"

    # 所有分类元数据完整
    for cat in ["required", "conflict", "warning", "dep", "other"]:
        meta = _CATEGORY_META[cat]
        assert "title" in meta and "icon" in meta and "color" in meta and "tip" in meta
        assert meta["title"], f"分类 {cat} 缺少 title"


def test_validation_dialog_importable():
    """v5.0 优化2: ValidationReportDialog 应可正常导入"""
    try:
        from ui.ceshu.validation_dialog import ValidationReportDialog
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert ValidationReportDialog is not None
    assert hasattr(ValidationReportDialog, "__init__")


def test_editor_view_has_validate_button():
    """v5.0 优化2: CeshuEditorView 应包含 _btn_validate 与 _on_validate"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    # 类应定义 _on_validate 方法（按钮通过该方法触发）
    assert hasattr(CeshuEditorView, "_on_validate"), "CeshuEditorView 缺少 _on_validate 方法"


# ========== v5.0 优化3: 章节完成度进度条 ==========

def test_chapter_panel_has_refresh_progress():
    """v5.0 优化3: ChapterEditPanel 应包含 refresh_progress 方法"""
    try:
        from ui.ceshu.chapter_panel import ChapterEditPanel, _CollapsibleSection
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert hasattr(ChapterEditPanel, "refresh_progress"), "ChapterEditPanel 缺少 refresh_progress 方法"
    assert hasattr(_CollapsibleSection, "set_progress"), "_CollapsibleSection 缺少 set_progress 方法"


def test_chapter_progress_calculation():
    """v5.0 优化3: CeshuModel.chapter_progress() 应返回 18 章 + total"""
    from core.ceshu import CHAPTER_KEYS, CeshuModel
    m = CeshuModel()
    progress = m.chapter_progress()
    # 18 章 + total
    for k in CHAPTER_KEYS:
        assert k in progress, f"章节 {k} 缺少进度数据"
        assert 0.0 <= progress[k] <= 1.0, f"章节 {k} 进度超出范围: {progress[k]}"
    assert "total" in progress
    assert 0.0 <= progress["total"] <= 1.0


# ========== v5.0 优化4: 补充混合玩法预设 ==========

def test_hybrid_presets_expanded():
    """v5.0 优化4: HYBRID_GAMEPLAY_PRESETS 应包含至少 18 个预设（原 10 + 新 8）"""
    from core.ceshu.ceshu_constants import HYBRID_GAMEPLAY_PRESETS
    assert len(HYBRID_GAMEPLAY_PRESETS) >= 18, f"预设数量不足: {len(HYBRID_GAMEPLAY_PRESETS)}"
    # 新增的 8 个预设 key 应存在
    new_keys = [
        "dark_fantasy_roguelike", "modern_military_fps", "anime_openworld",
        "xianxia_card", "post_apoc_tower_defense", "wuxia_arpg",
        "fantasy_slg", "cyberpunk_moba",
    ]
    for k in new_keys:
        assert k in HYBRID_GAMEPLAY_PRESETS, f"新增预设 {k} 不存在"


def test_hybrid_presets_structure_valid():
    """v5.0 优化4: 每个预设应包含完整字段（label/style/module_type/recommended_systems/highlight）"""
    from core.ceshu.ceshu_constants import HYBRID_GAMEPLAY_PRESETS
    required_fields = {"label", "style", "module_type", "secondary_modules",
                       "recommended_systems", "highlight"}
    for key, preset in HYBRID_GAMEPLAY_PRESETS.items():
        missing = required_fields - set(preset.keys())
        assert not missing, f"预设 {key} 缺少字段: {missing}"
        assert isinstance(preset["recommended_systems"], list), f"预设 {key} recommended_systems 应为列表"
        assert len(preset["recommended_systems"]) > 0, f"预设 {key} recommended_systems 不应为空"
        assert isinstance(preset["secondary_modules"], list), f"预设 {key} secondary_modules 应为列表"


def test_find_preset_new_styles():
    """v5.0 优化4: find_preset 应能匹配新增预设的风格+模块组合"""
    from core.ceshu.ceshu_constants import find_preset
    # 暗黑+roguelike
    p = find_preset("dark", "roguelike")
    assert p is not None, "dark+roguelike 未匹配到预设"
    assert p.get("key") == "dark_fantasy_roguelike"
    # 二次元+open_world
    p = find_preset("anime", "open_world")
    assert p is not None, "anime+open_world 未匹配到预设"
    assert p.get("key") == "anime_openworld"
    # 武侠+arpg
    p = find_preset("wuxia", "arpg")
    assert p is not None, "wuxia+arpg 未匹配到预设"
    assert p.get("key") == "wuxia_arpg"


def test_get_recommended_systems_for_new_presets():
    """v5.0 优化4: 新增预设的推荐系统字段应包含合理系统组合"""
    from core.ceshu.ceshu_constants import HYBRID_GAMEPLAY_PRESETS
    # 暗黑+roguelike
    p = HYBRID_GAMEPLAY_PRESETS["dark_fantasy_roguelike"]
    assert "character" in p["recommended_systems"], "dark_fantasy_roguelike 应包含 character 系统"
    assert "battle" in p["recommended_systems"], "dark_fantasy_roguelike 应包含 battle 系统"
    # 二次元+open_world
    p = HYBRID_GAMEPLAY_PRESETS["anime_openworld"]
    assert "gacha" in p["recommended_systems"] or "content" in p["recommended_systems"], \
        "anime_openworld 应包含 gacha 或 content 系统"
    # 末日塔防
    p = HYBRID_GAMEPLAY_PRESETS["post_apoc_tower_defense"]
    assert "battle" in p["recommended_systems"], "post_apoc_tower_defense 应包含 battle 系统"


# ========== v5.0 优化A/D/B/C: 校验导出/预设市场/依赖图/一键修复 ==========

def test_validation_dialog_export_md():
    """v5.0 优化A: ValidationReportDialog 应能生成 Markdown 报告"""
    try:
        from PyQt6.QtWidgets import QApplication
        QApplication.instance() or QApplication([])
        from core.ceshu import CeshuModel
        from ui.ceshu.validation_dialog import ValidationReportDialog
        m = CeshuModel()
        m.meta["game_name"] = "测试项目"
        dlg = ValidationReportDialog(m)
        md = dlg._build_markdown()
        assert "工业级 GDD 校验报告" in md
        assert "测试项目" in md
        assert "完整性评分" in md
        assert "章节完成度" in md
        assert "| 章节 | 完成度 |" in md
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise


def test_preset_market_dialog():
    """v5.0 优化D: PresetMarketDialog 应加载全部 18 个预设卡片"""
    try:
        from PyQt6.QtWidgets import QApplication
        QApplication.instance() or QApplication([])
        from core.ceshu import CeshuModel
        from ui.ceshu.preset_market_dialog import PresetMarketDialog
        m = CeshuModel()
        dlg = PresetMarketDialog(m)
        assert len(dlg._cards) == 18, f"应加载 18 张卡片，实际 {len(dlg._cards)}"
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise


def test_system_dependency_graph_layers():
    """v5.0 优化B: 拓扑分层应正确划分 12 个系统"""
    try:
        from ui.ceshu.system_dependency_graph import _topological_layers
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    from core.ceshu.ceshu_constants import SYSTEM_DEPENDENCIES
    layers = _topological_layers(SYSTEM_DEPENDENCIES)
    # 至少 4 层
    assert len(layers) >= 4, f"层数不足: {len(layers)}"
    # 所有节点都被分到某层
    all_nodes = set()
    for k, v in SYSTEM_DEPENDENCIES.items():
        all_nodes.add(k)
        for d in v:
            all_nodes.add(d)
    layered_nodes = set()
    for layer in layers:
        layered_nodes.update(layer)
    assert all_nodes == layered_nodes, f"未分层节点: {all_nodes - layered_nodes}"
    # L0 应该包含 character（最基础）
    assert "character" in layers[0], f"character 应在 L0, 实际在 {layers}"


def test_system_dependency_graph_dialog():
    """v5.0 优化B: SystemDependencyGraphDialog 应可正常创建"""
    try:
        from PyQt6.QtWidgets import QApplication
        QApplication.instance() or QApplication([])
        from core.ceshu import CeshuModel
        from ui.ceshu.system_dependency_graph import SystemDependencyGraphDialog
        m = CeshuModel()
        dlg = SystemDependencyGraphDialog(m)
        assert len(dlg._node_items) >= 12, f"应至少 12 个节点, 实际 {len(dlg._node_items)}"
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise


def test_auto_fill_required():
    """v5.0 优化C: auto_fill_required 应填充空必填字段并减少校验错误"""
    from core.ceshu import CeshuModel
    m = CeshuModel()
    errors_before = len(m.validate())
    filled = m.auto_fill_required()
    errors_after = len(m.validate())
    assert filled > 0, "应填充至少 1 个字段"
    assert errors_after < errors_before, \
        f"填充后错误数应减少: before={errors_before}, after={errors_after}, filled={filled}"
    # 二次调用应该不再填充（字段已有值）
    filled_again = m.auto_fill_required()
    assert filled_again == 0, f"二次调用应不填充任何字段，实际填充 {filled_again}"


def test_editor_view_has_preset_button():
    """v5.0 优化D: CeshuEditorView 应包含 _on_preset_market 方法"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert hasattr(CeshuEditorView, "_on_preset_market"), "CeshuEditorView 缺少 _on_preset_market 方法"
    assert hasattr(CeshuEditorView, "_refresh_chapter_forms"), "CeshuEditorView 缺少 _refresh_chapter_forms 方法"


# === F1/F5/F6/F7 测试 ===

def test_apply_ai_content_to_form():
    """F1: apply_ai_content_to_form 应能正确回填不同类型 widget"""
    try:
        from PyQt6.QtWidgets import (
            QApplication,
            QCheckBox,
            QComboBox,
            QLineEdit,
            QSpinBox,
            QTextEdit,
            QVBoxLayout,
            QWidget,
        )

        from ui.ceshu.chapter_forms import apply_ai_content_to_form
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    QApplication.instance() or QApplication([])

    parent = QWidget()
    layout = QVBoxLayout(parent)
    le = QLineEdit()
    le.setProperty("ai_field_path", "meta.game_name")
    layout.addWidget(le)
    te = QTextEdit()
    te.setProperty("ai_field_path", "vision.design_vision")
    layout.addWidget(te)
    cb = QComboBox()
    cb.addItems(["RPG", "SLG", "FPS"])
    cb.setProperty("ai_field_path", "meta.game_type")
    layout.addWidget(cb)
    sb = QSpinBox()
    sb.setRange(1, 999)
    sb.setProperty("ai_field_path", "numeric.max_level")
    layout.addWidget(sb)
    ck = QCheckBox()
    ck.setProperty("ai_field_path", "systems.battle.crit_system")
    layout.addWidget(ck)

    assert apply_ai_content_to_form(parent, "meta.game_name", "我的游戏") is True
    assert le.text() == "我的游戏"
    assert apply_ai_content_to_form(parent, "vision.design_vision", "设计愿景内容") is True
    assert te.toPlainText() == "设计愿景内容"
    assert apply_ai_content_to_form(parent, "meta.game_type", "SLG") is True
    assert cb.currentText() == "SLG"
    assert apply_ai_content_to_form(parent, "numeric.max_level", "99") is True
    assert sb.value() == 99
    assert apply_ai_content_to_form(parent, "systems.battle.crit_system", "true") is True
    assert ck.isChecked() is True
    # 测试不存在的字段
    assert apply_ai_content_to_form(parent, "not.exist", "value") is False
    # 测试空参数
    assert apply_ai_content_to_form(parent, "", "value") is False
    assert apply_ai_content_to_form(None, "x", "y") is False


def test_chapter_panel_has_ai_fill_signal():
    """F1: ChapterEditPanel 应包含 ai_fill_requested 信号 + apply_ai_content 方法"""
    try:
        from ui.ceshu.chapter_panel import ChapterEditPanel
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert hasattr(ChapterEditPanel, 'ai_fill_requested'), "ChapterEditPanel 缺少 ai_fill_requested 信号"
    assert hasattr(ChapterEditPanel, 'apply_ai_content'), "ChapterEditPanel 缺少 apply_ai_content 方法"


def test_editor_view_has_ai_chapter_button():
    """F7: CeshuEditorView 应包含 _on_ai_fill_chapter 方法"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert hasattr(CeshuEditorView, "_on_ai_fill_chapter"), "CeshuEditorView 缺少 _on_ai_fill_chapter 方法"
    assert hasattr(CeshuEditorView, "_on_ai_fill_field"), "CeshuEditorView 缺少 _on_ai_fill_field 方法"
    assert hasattr(CeshuEditorView, "_on_ai_chapter_done"), "CeshuEditorView 缺少 _on_ai_chapter_done 方法"


def test_editor_view_has_word_stats():
    """F6: CeshuEditorView 应包含 _on_word_stats 方法"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert hasattr(CeshuEditorView, "_on_word_stats"), "CeshuEditorView 缺少 _on_word_stats 方法"


def test_word_stats_dialog_importable():
    """F6: WordStatsDialog 应可正常导入 + 含字数基准"""
    try:
        from ui.ceshu.word_stats_dialog import (  # noqa: F401  # WordStatsDialog 亦为导入可用性探针
            CHAPTER_WORD_BENCHMARK,
            WordStatsDialog,
            _count_words_in_chapter,
        )
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    # 18 章每章都应有字数基准
    from core.ceshu.ceshu_model import CHAPTER_KEYS
    for key in CHAPTER_KEYS:
        assert key in CHAPTER_WORD_BENCHMARK, f"字数基准缺少章节: {key}"
    # 测试字数统计
    assert _count_words_in_chapter("hello world 你好") == 4  # 2 中文 + 2 英文词
    assert _count_words_in_chapter({"a": "测试", "b": ["x", "y"]}) == 4  # 2 中文 + 2 英文词
    assert _count_words_in_chapter(None) == 0
    assert _count_words_in_chapter({}) == 0


def test_pdf_export():
    """F5: PDF 导出应成功生成 PDF 文件"""
    import os
    import tempfile
    try:
        from PyQt6.QtWidgets import QApplication
    except ImportError:
        print("  ⏭️  PyQt6 未安装，跳过 PDF 测试")
        return
    QApplication.instance() or QApplication([])

    from core.ceshu.ceshu_model import CeshuModel
    from core.ceshu.ceshu_pdf_exporter import export_ceshu_to_pdf

    model = CeshuModel()
    model.meta["game_name"] = "测试游戏"
    model.meta["game_type"] = "RPG"
    model.vision["design_vision"] = "一个测试愿景"

    with tempfile.TemporaryDirectory() as tmp:
        out_path = os.path.join(tmp, "test.pdf")
        result = export_ceshu_to_pdf(model, out_path, include_validation_report=True)
        assert os.path.exists(result), f"PDF 文件未生成: {result}"
        size = os.path.getsize(result)
        assert size > 1000, f"PDF 文件过小: {size} bytes"
        print(f"  PDF 大小: {size} bytes")


def test_ai_fill_chapter_enhanced_prompt():
    """F7: _ai_fill_chapter 应增强提示词（包含字段列表 + 上下文）"""
    try:
        from core.agent.skills.ceshu_skill import CeshuSkill
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    import inspect
    src = inspect.getsource(CeshuSkill._ai_fill_chapter)
    # 应包含字段列表
    assert "字段列表" in src or "field_list_str" in src, "_ai_fill_chapter 应使用字段列表"
    # 应包含上下文
    assert "上下文" in src or "context_str" in src, "_ai_fill_chapter 应包含上下文信息"


def test_ceshu_skill_supports_pdf_format():
    """F5: CeshuSkill 应支持 pdf 导出格式"""
    try:
        from core.agent.skills.ceshu_skill import CeshuSkill
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    schema = CeshuSkill.PARAMS_SCHEMA
    fmt_prop = schema["properties"]["format"]
    assert "pdf" in fmt_prop["enum"], "CeshuSkill format 枚举应包含 pdf"


# ========== N5: 章节模板库 ==========

def test_chapter_templates_structure():
    """N5: CHAPTER_TEMPLATES 应包含 18 章，每章至少 1 个模板"""
    try:
        from ui.ceshu.chapter_templates import (
            CHAPTER_KEYS,
            CHAPTER_TEMPLATES,
            list_templates,
            template_summary,
        )
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    # 应覆盖所有 18 章
    for key in CHAPTER_KEYS:
        assert key in CHAPTER_TEMPLATES, f"章节 {key} 缺少模板"
        templates = CHAPTER_TEMPLATES[key]
        assert len(templates) >= 1, f"章节 {key} 模板数 < 1"
        # 每个模板结构完整
        for t in templates:
            assert "name" in t, f"{key} 模板缺少 name"
            assert "description" in t, f"{key} 模板缺少 description"
            assert "tags" in t, f"{key} 模板缺少 tags"
            assert "data" in t, f"{key} 模板缺少 data"
    # list_templates 函数
    meta_templates = list_templates("meta")
    assert len(meta_templates) >= 1
    # template_summary
    summary = template_summary()
    assert sum(summary.values()) >= 18


def test_chapter_templates_search():
    """N5: search_templates 跨章节搜索"""
    try:
        from ui.ceshu.chapter_templates import search_templates
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    # 关键词搜索
    results = search_templates("仙侠")
    assert len(results) > 0, "搜索'仙侠'应返回结果"
    # 空关键词返回全部
    all_results = search_templates("")
    assert len(all_results) >= 18


def test_chapter_templates_merge():
    """N5: merge_template_to_chapter 合并逻辑"""
    try:
        from ui.ceshu.chapter_templates import merge_template_to_chapter
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    existing = {"game_name": "已有名称", "tags": ["a"]}
    template = {"game_name": "模板名称", "game_type": "RPG", "tags": ["b"]}
    # fill_empty 模式：不覆盖已有字段
    merged = merge_template_to_chapter(existing, template, overwrite=False)
    assert merged["game_name"] == "已有名称"
    assert merged["game_type"] == "RPG"  # 新增字段
    # overwrite 模式：覆盖已有字段
    merged_ov = merge_template_to_chapter(existing, template, overwrite=True)
    assert merged_ov["game_name"] == "模板名称"


def test_template_picker_dialog_importable():
    """N5: TemplatePickerDialog 可导入"""
    try:
        from ui.ceshu.template_picker_dialog import TemplatePickerDialog
        assert TemplatePickerDialog is not None
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise


def test_chapter_panel_has_apply_template():
    """N5: ChapterEditPanel 应有 apply_template 方法"""
    try:
        from ui.ceshu.chapter_panel import ChapterEditPanel
        assert hasattr(ChapterEditPanel, 'apply_template'), \
            "ChapterEditPanel 应有 apply_template 方法"
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise


def test_editor_view_has_template_button():
    """N5: CeshuEditorView 应有 _on_template_picker 方法"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
        assert hasattr(CeshuEditorView, '_on_template_picker')
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise


# ========== N4: 评分系统 ==========

def test_ceshu_scorer_score_empty_model():
    """N4: 空策划书评分应为 D 级"""
    from core.ceshu.ceshu_model import CeshuModel
    from core.ceshu.ceshu_scorer import grade_label, score_ceshu
    m = CeshuModel()
    report = score_ceshu(m)
    assert report.total_score < 60, f"空策划书总分应 < 60, 实际 {report.total_score}"
    assert report.grade == "D", f"空策划书应为 D 级, 实际 {report.grade}"
    # 三维度评分
    assert 0 <= report.structure_score <= 30
    assert 0 <= report.content_quality_score <= 40
    assert 0 <= report.market_potential_score <= 30
    # 章节评分应有 18 项
    assert len(report.chapter_scores) == 18
    # 改进建议应非空
    assert len(report.suggestions) > 0
    # 等级文字
    assert "D" in grade_label("D")


def test_ceshu_scorer_score_filled_model():
    """N4: 填充内容的策划书评分应高于空策划书"""
    from core.ceshu.ceshu_model import CeshuModel
    from core.ceshu.ceshu_scorer import score_ceshu
    m = CeshuModel()
    # 填充核心字段
    m.meta["game_name"] = "测试游戏"
    m.meta["game_type"] = "RPG"
    m.meta["positioning"] = "测试定位"
    m.meta["tags"] = ["测试"]
    m.vision["design_vision"] = "一个测试愿景" * 20
    m.vision["differentiation"] = "差异化" * 10
    m.market_analysis = {
        "target_market": "国内",
        "competitors": [{"name": "竞品A"}, {"name": "竞品B"}],
        "market_size": "100亿",
        "kpi_forecast": {"dau": "10万"},
    }
    m.monetization = {
        "payment_model": "f2p",
        "pricing_tiers": ["6", "30", "68"],
        "iap_design": [{"item": "月卡"}],
        "arpu_target": "8元",
    }
    m.mvp = {
        "mvp_scope": "MVP 范围",
        "mvp_timeline": "3 个月",
        "milestones": [{"name": "M1"}, {"name": "M2"}],
        "success_criteria": "留存 50%",
    }

    report = score_ceshu(m)
    # 总分应明显高于空策划书
    empty_report = score_ceshu(CeshuModel())
    assert report.total_score > empty_report.total_score, \
        f"填充后评分应更高: {report.total_score} vs {empty_report.total_score}"
    # market_score 应较高
    assert report.market_potential_score > 15, \
        f"市场潜力分应 > 15, 实际 {report.market_potential_score}"


def test_ceshu_scorer_industry_benchmark():
    """N4: 同行业基准对比"""
    from core.ceshu.ceshu_model import CeshuModel
    from core.ceshu.ceshu_scorer import INDUSTRY_BENCHMARKS, score_ceshu
    # RPG 基准应存在
    assert "RPG" in INDUSTRY_BENCHMARKS
    rpg_bench = INDUSTRY_BENCHMARKS["RPG"]
    assert "total_avg" in rpg_bench
    assert "top_games" in rpg_bench

    m = CeshuModel()
    m.meta["game_type"] = "RPG"
    report = score_ceshu(m)
    bench = report.industry_benchmark
    assert bench["game_type"] == "RPG"
    assert "vs_total" in bench


def test_score_report_dialog_importable():
    """N4: ScoreReportDialog 可导入"""
    try:
        from ui.ceshu.score_report_dialog import ScoreReportDialog
        assert ScoreReportDialog is not None
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise


def test_editor_view_has_score_button():
    """N4: CeshuEditorView 应有 _on_score_report 方法"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
        assert hasattr(CeshuEditorView, '_on_score_report')
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise


# ========== N1: 版本对比工具 ==========

def test_version_diff_compute():
    """N1: compute_version_diff 应正确计算两个版本的 Diff"""
    try:
        from core.ceshu.ceshu_model import CeshuModel
        from ui.ceshu.version_diff_dialog import compute_version_diff
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise

    old = CeshuModel()
    old.meta["game_name"] = "旧版本"
    old.meta["game_type"] = "RPG"
    old.vision["design_vision"] = "旧愿景"

    new = CeshuModel()
    new.meta["game_name"] = "新版本"  # 修改
    new.meta["game_type"] = "RPG"  # 未变
    # design_vision 删除（变为空）
    new.combat = {"combat_mode": "turn_based"}  # 新增

    diff = compute_version_diff(old, new)
    assert diff.total_modified >= 1, f"应检测到修改, 实际 {diff.total_modified}"
    assert diff.total_added >= 1, f"应检测到新增, 实际 {diff.total_added}"
    assert len(diff.chapter_diffs) == 18


def test_version_diff_dialog_importable():
    """N1: VersionDiffDialog 可导入"""
    try:
        from ui.ceshu.version_diff_dialog import VersionDiffDialog
        assert VersionDiffDialog is not None
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise


def test_editor_view_has_diff_button():
    """N1: CeshuEditorView 应有 _on_version_diff 方法"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
        assert hasattr(CeshuEditorView, '_on_version_diff')
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise


# ========== N3: PPT 导出 ==========

def test_pptx_export():
    """N3: PPT 导出应生成有效 PowerPoint 文件"""
    try:
        from pptx import Presentation  # type: ignore
    except ImportError:
        print("  ⏭️  python-pptx 未安装，跳过 PPT 导出测试")
        return

    from core.ceshu.ceshu_model import CeshuModel
    from core.ceshu.ceshu_pptx_exporter import export_ceshu_to_pptx

    m = CeshuModel()
    m.meta["game_name"] = "PPT 测试"
    m.meta["game_type"] = "RPG"
    m.vision["design_vision"] = "测试愿景"

    tmp = tempfile.mkdtemp()
    try:
        out_path = os.path.join(tmp, "test.pptx")
        result = export_ceshu_to_pptx(m, out_path, include_validation_report=True)
        assert os.path.exists(result), f"PPT 文件未生成: {result}"
        size = os.path.getsize(result)
        assert size > 5000, f"PPT 文件过小: {size} bytes"
        # 验证 pptx 可被 python-pptx 读取
        prs = Presentation(result)
        # 应该有封面 + 目录 + 进度 + 18 章 + 校验 + 结尾 = 至少 22 张
        assert len(prs.slides) >= 22, f"幻灯片数应 >= 22, 实际 {len(prs.slides)}"
        print(f"  PPT 大小: {size} bytes, 幻灯片数: {len(prs.slides)}")
    finally:
        shutil.rmtree(tmp)


def test_ceshu_manager_has_pptx_export():
    """N3: CeshuManager 应有 export_ceshu_pptx 方法"""
    from core.ceshu.ceshu_manager import CeshuManager
    assert hasattr(CeshuManager, 'export_ceshu_pptx'), \
        "CeshuManager 应有 export_ceshu_pptx 方法"


# ========== N6: AI 智能审阅 ==========

def test_ai_review_dialog_importable():
    """N6: AIReviewDialog 应可正常导入"""
    try:
        from ui.ceshu.ai_review_dialog import AIReviewDialog
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert AIReviewDialog is not None
    assert hasattr(AIReviewDialog, "__init__")
    # 应包含 _AIReviewWorker 后台线程类
    from ui.ceshu.ai_review_dialog import _AIReviewWorker
    assert _AIReviewWorker is not None


def test_editor_view_has_ai_review_button():
    """N6: CeshuEditorView 应包含 _on_ai_review 方法"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert hasattr(CeshuEditorView, "_on_ai_review"), \
        "CeshuEditorView 缺少 _on_ai_review 方法"


def test_ceshu_skill_supports_ai_review_action():
    """N6: CeshuSkill 应支持 ai_review action"""
    try:
        from core.agent.skills.ceshu_skill import CeshuSkill
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    schema = CeshuSkill.PARAMS_SCHEMA
    assert "ai_review" in schema["properties"]["action"]["enum"], \
        "CeshuSkill action 枚举应包含 ai_review"
    assert hasattr(CeshuSkill, "_ai_review"), \
        "CeshuSkill 应有 _ai_review 方法"


# ========== N7: 版本时间线 ==========

def test_version_timeline_dialog_importable():
    """N7: VersionTimelineDialog 应可正常导入"""
    try:
        from ui.ceshu.version_timeline_dialog import VersionTimelineDialog
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert VersionTimelineDialog is not None
    assert hasattr(VersionTimelineDialog, "__init__")
    # 应包含 version_selected 信号
    assert hasattr(VersionTimelineDialog, "version_selected"), \
        "VersionTimelineDialog 应有 version_selected 信号"


def test_editor_view_has_timeline_button():
    """N7: CeshuEditorView 应包含 _on_version_timeline 方法"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert hasattr(CeshuEditorView, "_on_version_timeline"), \
        "CeshuEditorView 缺少 _on_version_timeline 方法"


# ========== N8: 章节笔记 ==========

def test_chapter_notes_manager():
    """N8: ChapterNotesManager 笔记 CRUD（ChapterNotesManager 本身不依赖 PyQt6，
    但导入路径会触发 ui/__init__.py 加载 MainWindow，无 PyQt6 时跳过）。"""
    try:
        from ui.ceshu.chapter_notes import ChapterNotesManager
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise

    tmp = tempfile.mkdtemp()
    try:
        mgr = ChapterNotesManager(tmp, "test_lib", "ceshu_001", author="tester")

        # 初始无笔记
        assert mgr.count_all() == 0
        assert mgr.list_notes() == []

        # add_note
        note1 = mgr.add_note("meta", "第一条笔记")
        assert note1["chapter_key"] == "meta"
        assert note1["content"] == "第一条笔记"
        assert note1["author"] == "tester"
        assert "id" in note1 and "created_at" in note1 and "updated_at" in note1
        assert mgr.count_all() == 1

        # list_notes（按章节过滤）
        note2 = mgr.add_note("vision", "第二条笔记")
        assert len(mgr.list_notes()) == 2
        assert len(mgr.list_notes("meta")) == 1
        assert len(mgr.list_notes("vision")) == 1

        # get_notes_by_chapter
        meta_notes = mgr.get_notes_by_chapter("meta")
        assert len(meta_notes) == 1
        assert meta_notes[0]["id"] == note1["id"]

        # update_note
        updated = mgr.update_note(note1["id"], "更新后的内容", author="editor")
        assert updated is not None
        assert updated["content"] == "更新后的内容"
        assert updated["author"] == "editor"
        assert updated["updated_at"] != note1["updated_at"] or updated["content"] != note1["content"]

        # update 不存在的 ID
        assert mgr.update_note("nonexistent_id", "x") is None

        # count_by_chapter
        counts = mgr.count_by_chapter()
        assert counts.get("meta") == 1
        assert counts.get("vision") == 1

        # delete_note
        assert mgr.delete_note(note1["id"]) is True
        assert mgr.count_all() == 1
        assert mgr.delete_note(note1["id"]) is False  # 已删除

        # 持久化：重新加载应保留 note2
        mgr2 = ChapterNotesManager(tmp, "test_lib", "ceshu_001")
        assert mgr2.count_all() == 1
        assert mgr2.list_notes()[0]["id"] == note2["id"]

        # notes_path 属性
        assert mgr.notes_path.name == "ceshu_001.json"
        assert "ceshu_notes" in str(mgr.notes_path)
    finally:
        shutil.rmtree(tmp)


def test_chapter_notes_dialog_importable():
    """N8: ChapterNotesDialog 应可正常导入"""
    try:
        from ui.ceshu.chapter_notes import ChapterNotesDialog
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert ChapterNotesDialog is not None


def test_editor_view_has_notes_button():
    """N8: CeshuEditorView 应包含 _on_chapter_notes 方法"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert hasattr(CeshuEditorView, "_on_chapter_notes"), \
        "CeshuEditorView 缺少 _on_chapter_notes 方法"


# ========== UX 优化：快捷键 + 工具提示 ==========

def test_editor_view_has_shortcuts():
    """UX: CeshuEditorView 应支持快捷键"""
    try:
        from PyQt6.QtGui import QShortcut
        from PyQt6.QtWidgets import QApplication

        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    QApplication.instance() or QApplication([])
    view = CeshuEditorView()
    # 应有 _setup_shortcuts 方法
    assert hasattr(CeshuEditorView, "_setup_shortcuts"), \
        "CeshuEditorView 应有 _setup_shortcuts 方法"
    # 实例化后应创建快捷键属性
    assert hasattr(view, "_shortcut_save"), "应创建 _shortcut_save"
    assert hasattr(view, "_shortcut_validate"), "应创建 _shortcut_validate"
    assert hasattr(view, "_shortcut_template"), "应创建 _shortcut_template"
    assert hasattr(view, "_shortcut_score"), "应创建 _shortcut_score"
    assert hasattr(view, "_shortcut_diff"), "应创建 _shortcut_diff"
    assert hasattr(view, "_shortcut_ai_review"), "应创建 _shortcut_ai_review"
    assert hasattr(view, "_shortcut_notes"), "应创建 _shortcut_notes"
    # 每个快捷键都应是 QShortcut 实例
    for attr in ["_shortcut_save", "_shortcut_validate", "_shortcut_template",
                 "_shortcut_score", "_shortcut_diff", "_shortcut_ai_review",
                 "_shortcut_notes"]:
        sc = getattr(view, attr)
        assert isinstance(sc, QShortcut), f"{attr} 应为 QShortcut 实例"


def test_editor_view_has_tooltips():
    """UX: CeshuEditorView 工具栏按钮应有工具提示

    d2 复杂度收敛后，预设/模板编辑/评分/分析/版本/笔记等高级功能收进「更多」菜单，
    仅保留常用按钮在工具栏；菜单项与工具栏按钮均需非空提示/文案。
    """
    try:
        from PyQt6.QtWidgets import QApplication

        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    QApplication.instance() or QApplication([])
    view = CeshuEditorView()
    # 常用按钮应有非空 tooltip（模板/AI审阅/AI补空/派生等已收进「更多」菜单）
    buttons_to_check = [
        "_btn_save", "_btn_validate",
        "_btn_ai_full", "_btn_ai_chapter", "_btn_ai_data", "_btn_export",
    ]
    for attr in buttons_to_check:
        btn = getattr(view, attr, None)
        assert btn is not None, f"按钮 {attr} 不存在"
        tip = btn.toolTip()
        assert tip, f"按钮 {attr} 缺少工具提示"

    # 「更多」菜单应包含所有高级功能项（d2 收敛）
    QApplication.instance() or QApplication([])
    more_menu = getattr(view, "_more_menu", None)
    assert more_menu is not None, "「更多」菜单不存在"
    menu_texts = [a.text() for a in more_menu.actions() if a.text()]
    assert menu_texts, "「更多」菜单不应为空"
    for keyword in ("派生新版本", "章节模板库", "AI 审阅", "AI 补全", "预设", "模板编辑",
                    "评分", "字数", "对比", "时间线", "清单", "日志", "字段", "笔记", "档位"):
        assert any(keyword in t for t in menu_texts), f"「更多」菜单缺少 {keyword} 项"


# ========== N9/N12: Markdown & HTML 导出 ==========

def test_markdown_export():
    """N9: Markdown 导出应生成有效 .md 文件，包含游戏名和全部 18 章"""
    from core.ceshu.ceshu_markdown_exporter import export_ceshu_to_markdown
    from core.ceshu.ceshu_model import CHAPTER_LABELS, CeshuModel

    m = CeshuModel()
    m.meta["game_name"] = "Markdown测试"
    m.meta["game_type"] = "RPG"
    m.vision["design_vision"] = "测试愿景"

    tmp = tempfile.mkdtemp()
    try:
        out_path = os.path.join(tmp, "test.md")
        result = export_ceshu_to_markdown(m, out_path, include_validation_report=True)
        assert os.path.exists(result), f"MD 文件未生成: {result}"
        content = Path(result).read_text(encoding="utf-8")
        assert "Markdown测试" in content, "MD 内容应包含游戏名"
        # 包含所有 18 章标题
        for _key, label in CHAPTER_LABELS.items():
            assert label in content, f"章节 '{label}' 未出现在 MD 中"
        # 包含目录
        assert "## 目录" in content
        # 包含分隔符
        assert "---" in content
        # 包含校验报告
        assert "校验报告" in content
    finally:
        shutil.rmtree(tmp)


def test_html_export():
    """N12: HTML 导出应生成有效 .html 文件，包含游戏名、CSS 和全部 18 章"""
    from core.ceshu.ceshu_html_exporter import export_ceshu_to_html
    from core.ceshu.ceshu_model import CHAPTER_LABELS, CeshuModel

    m = CeshuModel()
    m.meta["game_name"] = "HTML测试"
    m.meta["game_type"] = "RPG"
    m.vision["design_vision"] = "测试愿景"

    tmp = tempfile.mkdtemp()
    try:
        out_path = os.path.join(tmp, "test.html")
        result = export_ceshu_to_html(m, out_path, include_validation_report=True)
        assert os.path.exists(result), f"HTML 文件未生成: {result}"
        content = Path(result).read_text(encoding="utf-8")
        assert "HTML测试" in content, "HTML 内容应包含游戏名"
        # 包含内联 CSS
        assert "<style>" in content, "HTML 应包含内联 CSS"
        # 包含主题切换 JS
        assert "toggleTheme" in content, "HTML 应包含主题切换 JS"
        # 包含目录导航
        assert 'class="toc"' in content, "HTML 应包含目录导航"
        # 包含所有 18 章标题
        for _key, label in CHAPTER_LABELS.items():
            assert label in content, f"章节 '{label}' 未出现在 HTML 中"
        # 包含校验报告
        assert "校验报告" in content
    finally:
        shutil.rmtree(tmp)


def test_ceshu_manager_has_markdown_export():
    """N9: CeshuManager 应有 export_ceshu_markdown 方法"""
    from core.ceshu.ceshu_manager import CeshuManager
    assert hasattr(CeshuManager, 'export_ceshu_markdown'), \
        "CeshuManager 应有 export_ceshu_markdown 方法"


def test_ceshu_manager_has_html_export():
    """N12: CeshuManager 应有 export_ceshu_html 方法"""
    from core.ceshu.ceshu_manager import CeshuManager
    assert hasattr(CeshuManager, 'export_ceshu_html'), \
        "CeshuManager 应有 export_ceshu_html 方法"


def test_editor_view_has_export_menu_options():
    """N9/N12: editor_view 的导出菜单应有 MD 和 HTML 选项（PyQt6 测试需跳过）"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    import inspect
    src = inspect.getsource(CeshuEditorView._on_export)
    assert "Markdown 文档，适合 Git 版本控制" in src, \
        "导出菜单应包含 Markdown 选项"
    assert "交互式网页，带目录导航" in src, \
        "导出菜单应包含 HTML 选项"


# ========== N10: AI 一键生成完整策划书 ==========

def test_ai_full_generate_dialog_importable():
    """N10: AIFullGenerateDialog 应可正常导入"""
    try:
        from ui.ceshu.ai_full_generate_dialog import AIFullGenerateDialog
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert AIFullGenerateDialog is not None
    assert hasattr(AIFullGenerateDialog, "__init__")
    # 应包含 _AIFullGenerateWorker 后台线程类
    from ui.ceshu.ai_full_generate_dialog import _AIFullGenerateWorker
    assert _AIFullGenerateWorker is not None
    # 应包含三个核心信号
    assert hasattr(AIFullGenerateDialog, "generation_completed"), \
        "AIFullGenerateDialog 应有 generation_completed 信号"
    assert hasattr(AIFullGenerateDialog, "generation_failed"), \
        "AIFullGenerateDialog 应有 generation_failed 信号"
    assert hasattr(AIFullGenerateDialog, "chapter_progress"), \
        "AIFullGenerateDialog 应有 chapter_progress 信号"
    # Worker 应有 5 个信号
    for sig in ["chapter_started", "chapter_succeeded", "chapter_failed",
                "all_completed", "failed"]:
        assert hasattr(_AIFullGenerateWorker, sig), \
            f"_AIFullGenerateWorker 应有 {sig} 信号"


def test_editor_view_has_ai_full_button():
    """N10: CeshuEditorView 应包含 _on_ai_full_generate 方法与 _btn_ai_full 按钮"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert hasattr(CeshuEditorView, "_on_ai_full_generate"), \
        "CeshuEditorView 缺少 _on_ai_full_generate 方法"
    assert hasattr(CeshuEditorView, "_on_ai_full_generated"), \
        "CeshuEditorView 缺少 _on_ai_full_generated 回调方法"


def test_ceshu_skill_has_ai_generate_full():
    """N10: CeshuSkill 应支持 ai_generate_full action"""
    try:
        from core.agent.skills.ceshu_skill import CeshuSkill
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    schema = CeshuSkill.PARAMS_SCHEMA
    assert "ai_generate_full" in schema["properties"]["action"]["enum"], \
        "CeshuSkill action 枚举应包含 ai_generate_full"
    assert hasattr(CeshuSkill, "_ai_generate_full"), \
        "CeshuSkill 应有 _ai_generate_full 方法"
    # 不直接调用 AI，仅返回生成计划
    skill = CeshuSkill()
    result = skill.execute({
        "action": "ai_generate_full",
        "game_name": "测试游戏",
        "game_type": "RPG",
        "style": "仙侠",
        "description": "测试描述",
        "platforms": "PC,移动端",
        "business_model": "F2P",
    }, context={})
    assert result.get("success") is True, \
        f"ai_generate_full 应返回成功，实际: {result}"
    data = result.get("data") or {}
    assert "chapter_order" in data, "返回数据应包含 chapter_order"
    assert "chapter_prompts" in data, "返回数据应包含 chapter_prompts"
    assert "user_input" in data, "返回数据应包含 user_input"
    assert "meta_seed" in data, "返回数据应包含 meta_seed"
    # 默认应包含 18 章（含市场分析 + 风险评估）
    assert len(data["chapter_order"]) == 18, \
        f"默认应生成 18 章，实际 {len(data['chapter_order'])}"
    # 每章都应有提示词
    for ch in data["chapter_order"]:
        assert ch in data["chapter_prompts"], \
            f"章节 {ch} 缺少提示词"
    # meta_seed 应包含 game_name
    assert data["meta_seed"].get("game_name") == "测试游戏"
    # platforms 应被解析为列表
    assert data["user_input"]["platforms"] == ["PC", "移动端"]


# ========== N11: GDD 完备性检查清单 ==========

def test_checklist_items_count():
    """N11: 检查项数量应 >= 50"""
    from core.ceshu.ceshu_checklist import get_checklist_items
    items = get_checklist_items()
    assert len(items) >= 50, f"检查项应 >= 50, 实际 {len(items)}"


def test_checklist_categories():
    """N11: 6 大类都应存在"""
    from core.ceshu.ceshu_checklist import ALL_CATEGORIES, get_checklist_items
    items = get_checklist_items()
    cats = {it.category for it in items}
    for cat in ALL_CATEGORIES:
        assert cat in cats, f"类别 '{cat}' 缺失"
    # 每类至少有若干项
    for cat in ALL_CATEGORIES:
        count = sum(1 for it in items if it.category == cat)
        assert count > 0, f"类别 '{cat}' 检查项数为 0"


def test_checklist_required_items():
    """N11: required=True 的项应有多个"""
    from core.ceshu.ceshu_checklist import get_checklist_items
    items = get_checklist_items()
    required = [it for it in items if it.required]
    assert len(required) >= 10, f"必需项应 >= 10, 实际 {len(required)}"
    # 必需项都应有 auto_check 函数（非 manual）
    for it in required:
        assert it.auto_check is not None, \
            f"必需项 {it.id} 应有 auto_check 函数"


def test_run_checklist_empty_model():
    """N11: 空策划书检查清单应大量 fail，且未就绪"""
    from core.ceshu import CeshuModel
    from core.ceshu.ceshu_checklist import run_checklist
    m = CeshuModel()
    report = run_checklist(m)
    # 空策划书不应就绪
    assert report.is_production_ready is False, "空策划书不应就绪"
    # 应有失败项
    assert report.failed > 0, f"空策划书应有失败项, 实际 failed={report.failed}"
    # 总数应为 50
    assert report.total_items == 50, f"总检查项应为 50, 实际 {report.total_items}"
    # 就绪度应较低
    assert report.readiness_score < 50, \
        f"空策划书就绪度应 < 50, 实际 {report.readiness_score}"


def test_run_checklist_filled_model():
    """N11: 填充内容的策划书就绪度应高于空策划书"""
    from core.ceshu import CeshuModel
    from core.ceshu.ceshu_checklist import run_checklist
    # 空策划书基线
    empty_report = run_checklist(CeshuModel())

    # 填充核心字段
    m = CeshuModel()
    m.meta["game_name"] = "测试游戏"
    m.meta["game_type"] = "RPG"
    m.meta["platform"] = ["PC"]
    m.meta["positioning"] = "面向核心玩家的 RPG"
    m.meta["tags"] = ["rpg", "原创"]
    m.vision["design_vision"] = "打造一款具有差异化体验的 RPG 游戏" * 5
    m.vision["differentiation"] = "独特的战斗系统与深度剧情"
    m.gameplay["core_loop"] = "探索→战斗→获得装备→强化→挑战更强敌人"
    m.worldview["architecture"] = "奇幻世界观架构"
    m.worldview["main_plot"] = "主线剧情：勇者斗恶龙"
    m.characters["protagonist"] = "主角：年轻的冒险者"
    m.characters["main_npc_count"] = 5
    m.combat["combat_mode"] = "turn_based"
    m.combat["damage_formula"] = "atk - def"
    m.economy["currency_types"] = [{"name": "金币"}]
    m.economy["source_sink"] = "产出：任务；回收：商店"
    m.set_system("character", True)
    m.set_system("battle", True)
    m.set_system("skill", True)
    m.numeric["core_formulas"] = "伤害 = atk - def"
    m.numeric["balance_principles"] = "早期易上手，后期有深度"
    m.art["art_style"] = "二次元"
    m.art["color_system"] = "明亮色调"
    m.audio["music_style"] = "交响乐"
    m.audio["sfx_count"] = 100
    m.tech["engine"] = "Unity"
    m.tech["core_architecture"] = "客户端-服务器"
    m.tech["performance_targets"] = "60fps"
    m.mvp["mvp_scope"] = "核心玩法 + 1 章节"
    m.mvp["mvp_timeline"] = "3 个月"
    m.mvp["milestones"] = [{"name": "M1"}, {"name": "M2"}]
    m.mvp["success_criteria"] = "留存 50%"
    m.market_analysis["target_market"] = "国内 PC 市场"
    m.market_analysis["competitors"] = [{"name": "竞品A"}]
    m.market_analysis["market_size"] = "100 亿"
    m.market_analysis["kpi_forecast"] = {"dau": "10万"}
    m.monetization["payment_model"] = "f2p"
    m.monetization["pricing_tiers"] = ["6", "30", "68"]
    m.risk_handling["risk_matrix"] = [{"risk": "技术风险"}]
    m.risk_handling["contingency_plan"] = "应急预案"
    m.resources["budget"] = {"total": "100万"}

    filled_report = run_checklist(m)
    assert filled_report.passed > empty_report.passed, \
        f"填充后通过项应更多: {filled_report.passed} vs {empty_report.passed}"
    assert filled_report.readiness_score > empty_report.readiness_score, \
        f"填充后就绪度应更高: {filled_report.readiness_score} vs {empty_report.readiness_score}"


def test_checklist_report_summary():
    """N11: 报告 summary 方法应正常返回文本"""
    from core.ceshu import CeshuModel
    from core.ceshu.ceshu_checklist import run_checklist
    m = CeshuModel()
    report = run_checklist(m)
    summary = report.summary()
    assert isinstance(summary, str)
    assert "GDD 完备性检查报告" in summary
    assert "就绪度评分" in summary
    assert "总检查项" in summary
    assert "通过" in summary
    assert "失败" in summary


def test_checklist_dialog_importable():
    """N11: ChecklistDialog 应可正常导入"""
    try:
        from ui.ceshu.checklist_dialog import ChecklistDialog
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert ChecklistDialog is not None
    assert hasattr(ChecklistDialog, "__init__")


def test_editor_view_has_checklist_button():
    """N11: CeshuEditorView 应包含 _on_checklist 方法"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert hasattr(CeshuEditorView, "_on_checklist"), \
        "CeshuEditorView 缺少 _on_checklist 方法"


# ========== N13: GDD 模板编辑器 ==========

def test_custom_template_manager_crud():
    """N13: CustomTemplateManager CRUD 完整流程（核心模块不依赖 PyQt6）"""
    from core.ceshu.custom_template_manager import (
        GLOBAL_CATEGORY,
        CustomTemplateManager,
    )

    tmp = tempfile.mkdtemp()
    try:
        mgr = CustomTemplateManager(tmp)

        # 初始无模板
        assert mgr.count_all() == 0
        assert mgr.list_templates() == []

        # save_template
        t1 = mgr.save_template(
            name="测试模板1", description="描述1",
            tags=["仙侠", "RPG"], chapter_key="meta",
            data={"game_name": "测试游戏", "game_type": "RPG"},
            source_game="测试游戏",
        )
        assert t1["id"]
        assert t1["name"] == "测试模板1"
        assert t1["chapter_key"] == "meta"
        assert "created_at" in t1 and "updated_at" in t1
        assert mgr.count_all() == 1

        # save_template 空 name 应抛异常
        try:
            mgr.save_template("", "", [], "meta", {})
            raise AssertionError("空 name 应抛 ValueError")
        except ValueError:
            pass

        # list_templates（按章节过滤）
        t2 = mgr.save_template("测试模板2", "描述2", ["科幻"], "vision",
                                {"design_vision": "愿景"})
        assert len(mgr.list_templates()) == 2
        assert len(mgr.list_templates("meta")) == 1
        assert len(mgr.list_templates("vision")) == 1
        assert mgr.list_templates("meta")[0]["id"] == t1["id"]

        # global 模板（chapter_key 为空）
        t_global = mgr.save_template("全局模板", "", [], "", {"key": "value"})
        assert t_global["chapter_key"] == ""
        assert mgr.list_templates("")  # 空 chapter_key 应返回全部
        # 按全局分类获取
        assert len(mgr._load_category(GLOBAL_CATEGORY)) == 1

        # get_template
        got = mgr.get_template(t1["id"])
        assert got is not None
        assert got["name"] == "测试模板1"
        assert mgr.get_template("nonexistent_id") is None
        assert mgr.get_template("") is None

        # update_template
        ok = mgr.update_template(t1["id"], name="更新名称",
                                  description="更新描述",
                                  tags=["新标签"], data={"new": "data"})
        assert ok is True
        updated = mgr.get_template(t1["id"])
        assert updated["name"] == "更新名称"
        assert updated["description"] == "更新描述"
        assert updated["tags"] == ["新标签"]
        assert updated["data"] == {"new": "data"}
        assert updated["updated_at"] != t1["updated_at"] or updated["name"] != t1["name"]

        # update 不存在的 ID
        assert mgr.update_template("nonexistent_id", name="x") is False
        # update 空 name 应失败
        assert mgr.update_template(t1["id"], name="   ") is False

        # update 跨章节迁移
        mgr.update_template(t1["id"], chapter_key="combat")
        assert len(mgr.list_templates("meta")) == 0
        assert len(mgr.list_templates("combat")) == 1
        # 原 ID 仍可读
        assert mgr.get_template(t1["id"]) is not None

        # delete_template
        assert mgr.delete_template(t1["id"]) is True
        assert mgr.get_template(t1["id"]) is None
        assert mgr.delete_template(t1["id"]) is False  # 已删除
        assert mgr.delete_template("") is False

        # 持久化：重新加载应保留
        mgr2 = CustomTemplateManager(tmp)
        assert mgr2.count_all() == 2  # t2 + t_global
        assert mgr2.get_template(t2["id"]) is not None
        assert mgr2.get_template(t_global["id"]) is not None

        # count_by_chapter
        counts = mgr2.count_by_chapter()
        assert counts.get("vision") == 1

        # templates_dir 属性
        assert mgr.templates_dir.name == "custom_templates"
    finally:
        shutil.rmtree(tmp)


def test_custom_template_manager_search():
    """N13: CustomTemplateManager 搜索功能"""
    from core.ceshu.custom_template_manager import CustomTemplateManager

    tmp = tempfile.mkdtemp()
    try:
        mgr = CustomTemplateManager(tmp)
        mgr.save_template("仙侠RPG模板", "国产仙侠", ["仙侠", "RPG"], "meta",
                          {"game_name": "云海仙踪"})
        mgr.save_template("科幻射击模板", "近未来科幻", ["科幻", "TPS"], "meta",
                          {"game_name": "裂隙边境"})
        mgr.save_template("治愈小镇", "放置休闲", ["治愈", "放置"], "vision",
                          {"design_vision": "慢生活"}, source_game="晨光小镇")

        # 全部模板
        all_templates = mgr.search_templates("")
        assert len(all_templates) == 3

        # 按名称搜索
        results = mgr.search_templates("仙侠")
        assert len(results) == 1
        assert results[0]["name"] == "仙侠RPG模板"

        # 按描述搜索
        results = mgr.search_templates("科幻")
        assert len(results) == 1
        assert results[0]["name"] == "科幻射击模板"

        # 按标签搜索
        results = mgr.search_templates("治愈")
        assert len(results) == 1
        assert results[0]["name"] == "治愈小镇"

        # 按来源游戏搜索
        results = mgr.search_templates("晨光")
        assert len(results) == 1
        assert results[0]["name"] == "治愈小镇"

        # 大小写不敏感
        results = mgr.search_templates("rpg")
        assert len(results) == 1

        # 无匹配
        results = mgr.search_templates("不存在的关键词")
        assert len(results) == 0
    finally:
        shutil.rmtree(tmp)


def test_custom_template_manager_import_export():
    """N13: 导入导出功能"""
    from core.ceshu.custom_template_manager import CustomTemplateManager

    tmp = tempfile.mkdtemp()
    try:
        mgr = CustomTemplateManager(tmp)
        mgr.save_template("模板A", "描述A", ["标签A"], "meta",
                          {"field": "a"}, source_game="游戏A")
        mgr.save_template("模板B", "描述B", ["标签B"], "vision",
                          {"field": "b"}, source_game="游戏B")
        assert mgr.count_all() == 2

        # 导出
        export_path = os.path.join(tmp, "export", "templates.json")
        out = mgr.export_templates(export_path)
        assert os.path.exists(out)
        with open(out, encoding="utf-8") as f:
            data = json.load(f)
        assert "templates" in data
        assert len(data["templates"]) == 2
        assert data["_export_meta"]["template_count"] == 2

        # 导入到新管理器
        tmp2 = tempfile.mkdtemp()
        try:
            mgr2 = CustomTemplateManager(tmp2)
            count = mgr2.import_templates(out, overwrite=False)
            assert count == 2
            assert mgr2.count_all() == 2
            assert mgr2.get_template(data["templates"][0]["id"]) is not None
            assert mgr2.get_template(data["templates"][1]["id"]) is not None

            # 重复导入（不覆盖）应跳过已存在的 ID
            count2 = mgr2.import_templates(out, overwrite=False)
            assert count2 == 0
            assert mgr2.count_all() == 2

            # 覆盖导入
            count3 = mgr2.import_templates(out, overwrite=True)
            assert count3 == 2
            assert mgr2.count_all() == 2
        finally:
            shutil.rmtree(tmp2)

        # 导入不存在文件
        assert mgr.import_templates("nonexistent.json") == 0
    finally:
        shutil.rmtree(tmp)


def test_template_editor_dialog_importable():
    """N13: TemplateEditorDialog 应可正常导入"""
    try:
        from ui.ceshu.template_editor_dialog import TemplateEditorDialog
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert TemplateEditorDialog is not None
    assert hasattr(TemplateEditorDialog, "__init__")
    assert hasattr(TemplateEditorDialog, "template_saved")


def test_editor_view_has_template_edit_button():
    """N13: CeshuEditorView 应包含 _on_template_editor 方法"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert hasattr(CeshuEditorView, "_on_template_editor"), \
        "CeshuEditorView 缺少 _on_template_editor 方法"
    assert hasattr(CeshuEditorView, "_on_template_editor_saved"), \
        "CeshuEditorView 缺少 _on_template_editor_saved 方法"


# ========== N15: 变更日志 ==========

def test_changelog_generate():
    """N15: generate_changelog_between 应正确生成变更条目"""
    try:
        from core.ceshu.ceshu_changelog import (
            ChangelogEntry,
            generate_changelog_between,
        )
        from core.ceshu.ceshu_model import CeshuModel
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise

    old = CeshuModel()
    old.meta["game_name"] = "旧版本"
    old.meta["game_type"] = "RPG"
    old.vision["design_vision"] = "旧愿景"

    new = CeshuModel()
    new.meta["game_name"] = "新版本"  # 修改
    new.meta["game_type"] = "RPG"  # 未变
    # design_vision 删除（变为空）
    new.combat = {"combat_mode": "turn_based"}  # 新增
    # 修改 systems：启用 battle
    new.set_system("battle", True)
    new.set_system("character", True)

    # generate_changelog_between 懒加载 compute_version_diff，
    # 该函数位于 ui.ceshu.version_diff_dialog（PyQt6 依赖），缺失时跳过
    try:
        entry = generate_changelog_between(
            old_model=old, new_model=new,
            version_label="v1.1", date="2026-01-01", author="tester",
        )
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise

    assert isinstance(entry, ChangelogEntry)
    assert entry.version == "v1.1"
    assert entry.date == "2026-01-01"
    assert entry.author == "tester"
    assert entry.change_count > 0, "应至少有一处变更"
    assert "新增" in entry.summary
    assert "修改" in entry.summary

    # 检查 changes 字段结构
    for c in entry.changes:
        assert "type" in c
        assert "chapter" in c
        assert "field" in c
        assert "old" in c
        assert "new" in c
        assert "description" in c
        assert c["type"] in ("added", "removed", "modified")

    # systems 章节应有特殊描述
    sys_changes = [c for c in entry.changes if "启用系统" in c["description"]
                   or "禁用系统" in c["description"]
                   or "修改系统" in c["description"]]
    assert len(sys_changes) > 0, "systems 章节应有特殊描述"


def test_changelog_formats():
    """N15: Changelog 三种格式输出（md/text/html）"""
    try:
        from core.ceshu.ceshu_changelog import (
            Changelog,
            ChangelogEntry,  # noqa: F401  # 亦为导入可用性探针
            generate_changelog_between,
        )
        from core.ceshu.ceshu_model import CeshuModel
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise

    old = CeshuModel()
    old.meta["game_name"] = "旧版本"
    new = CeshuModel()
    new.meta["game_name"] = "新版本"
    new.combat = {"combat_mode": "turn_based"}

    # generate_changelog_between 懒加载 compute_version_diff（PyQt6 依赖）
    try:
        entry = generate_changelog_between(old, new, version_label="v1.1")
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise

    cl = Changelog(entries=[entry])

    # Markdown
    md = cl.to_markdown()
    assert isinstance(md, str)
    assert "变更日志" in md
    assert "v1.1" in md
    assert "新增" in md or "修改" in md

    # Text
    txt = cl.to_text()
    assert isinstance(txt, str)
    assert "变更日志" in txt
    assert "v1.1" in txt

    # HTML
    html = cl.to_html()
    assert isinstance(html, str)
    assert "<html" in html.lower()
    assert "变更日志" in html
    assert "v1.1" in html

    # 空日志也应正常输出
    empty_cl = Changelog(entries=[])
    assert "暂无变更记录" in empty_cl.to_markdown()
    assert "暂无变更记录" in empty_cl.to_text()
    assert "暂无变更记录" in empty_cl.to_html()

    # total_changes / is_empty 属性
    assert cl.total_changes > 0
    assert not cl.is_empty
    assert empty_cl.total_changes == 0
    assert empty_cl.is_empty


def test_changelog_dialog_importable():
    """N15: ChangelogDialog 应可正常导入"""
    try:
        from ui.ceshu.changelog_dialog import ChangelogDialog
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert ChangelogDialog is not None
    assert hasattr(ChangelogDialog, "__init__")
    assert hasattr(ChangelogDialog, "changelog_generated")


def test_editor_view_has_changelog_button():
    """N15: CeshuEditorView 应包含 _on_changelog 方法"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert hasattr(CeshuEditorView, "_on_changelog"), \
        "CeshuEditorView 缺少 _on_changelog 方法"


# ========== N14: 字段依赖关系图 ==========

def test_field_dependencies_count():
    """N14: FIELD_DEPENDENCIES 至少 15 条"""
    from core.ceshu.field_dependencies import FIELD_DEPENDENCIES
    assert len(FIELD_DEPENDENCIES) >= 15, \
        f"字段依赖至少 15 条，实际 {len(FIELD_DEPENDENCIES)}"
    # 每条依赖字段完整
    for dep in FIELD_DEPENDENCIES:
        assert dep.source_chapter, "source_chapter 不能为空"
        assert dep.source_field, "source_field 不能为空"
        assert dep.target_chapter, "target_chapter 不能为空"
        assert dep.target_field, "target_field 不能为空"
        assert dep.dependency_type in ("consistency", "derived", "reference"), \
            f"未知依赖类型: {dep.dependency_type}"
        assert dep.description, "description 不能为空"


def test_field_dependencies_for_chapter():
    """N14: 按章节查询字段依赖"""
    from core.ceshu.field_dependencies import (
        get_dependencies_for_chapter,
        get_dependencies_for_field,
    )
    # combat 章节应有依赖
    combat_deps = get_dependencies_for_chapter("combat")
    assert len(combat_deps) > 0, "combat 章节应有字段依赖"
    # systems 章节应有依赖
    systems_deps = get_dependencies_for_chapter("systems")
    assert len(systems_deps) > 0, "systems 章节应有字段依赖"
    # 按字段查询
    combat_mode_deps = get_dependencies_for_field("combat", "combat_mode")
    assert len(combat_mode_deps) > 0, "combat.combat_mode 应有依赖"
    # 验证 combat_mode 依赖包含 systems.battle.config.turn_mode
    has_battle_dep = any(
        d.target_chapter == "systems" and "turn_mode" in d.target_field
        for d in combat_mode_deps
    )
    assert has_battle_dep, "combat.combat_mode 应依赖 systems.battle.config.turn_mode"


def test_check_field_dependencies():
    """N14: 字段依赖检查函数"""
    from core.ceshu.ceshu_model import CeshuModel
    from core.ceshu.field_dependencies import check_field_dependencies

    # 空模型：两侧字段均空 → 应全部 ok 或 warning，无 violation
    m = CeshuModel()
    results = check_field_dependencies(m)
    assert len(results) > 0, "检查结果不应为空"
    statuses = {r["status"] for r in results}
    assert "violation" not in statuses, \
        f"空模型不应有违规，实际 statuses={statuses}"
    # 每项含 dependency / status / message 三个键
    for r in results:
        assert "dependency" in r
        assert "status" in r
        assert "message" in r
        assert r["status"] in ("ok", "warning", "violation")

    # 构造冲突：combat.combat_mode 与 systems.battle.config.turn_mode 不一致
    m.combat = {"combat_mode": "turn_based"}
    m.systems = {
        "battle": {"enabled": True, "config": {"turn_mode": "realtime"}},
        "economy": {"enabled": False, "config": {}},
    }
    results2 = check_field_dependencies(m)
    violations = [r for r in results2 if r["status"] == "violation"]
    assert len(violations) > 0, "不一致的字段应产生 violation"
    # 验证违规消息包含相关字段名
    has_combat_violation = any(
        "combat_mode" in v["message"] and "turn_mode" in v["message"]
        for v in violations
    )
    assert has_combat_violation, "应检测到 combat_mode 与 turn_mode 冲突"


def test_build_dependency_graph():
    """N14: 依赖图邻接表构建"""
    from core.ceshu.ceshu_model import CHAPTER_KEYS
    from core.ceshu.field_dependencies import build_dependency_graph

    graph = build_dependency_graph()
    assert isinstance(graph, dict), "图应为 dict"
    # 至少覆盖大部分章节
    assert len(graph) >= 15, f"图节点数应 >= 15, 实际 {len(graph)}"
    # 每个值是 list
    for node, deps in graph.items():
        assert isinstance(deps, list), f"{node} 的依赖列表应为 list"
    # combat 应依赖 systems
    assert "systems" in graph.get("combat", []), "combat 应依赖 systems"
    # monetization 应依赖 systems
    assert "systems" in graph.get("monetization", []), "monetization 应依赖 systems"
    # 所有图中的章节都应是合法章节 key
    for node in graph:
        assert node in CHAPTER_KEYS, f"非法章节 key: {node}"


def test_field_dependency_graph_dialog_importable():
    """N14: FieldDependencyGraphDialog 应可正常导入并实例化"""
    try:
        from PyQt6.QtWidgets import QApplication
        QApplication.instance() or QApplication([])
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    from core.ceshu.ceshu_model import CeshuModel
    from ui.ceshu.field_dependency_graph import FieldDependencyGraphDialog
    m = CeshuModel()
    dlg = FieldDependencyGraphDialog(m)
    assert dlg is not None
    # 应有 18 个章节节点
    assert len(dlg._node_items) == 18, \
        f"应有 18 个章节节点，实际 {len(dlg._node_items)}"
    # 应有检查依赖与导出图片方法
    assert hasattr(FieldDependencyGraphDialog, "_on_check")
    assert hasattr(FieldDependencyGraphDialog, "_on_export_image")


def test_editor_view_has_field_graph_button():
    """N14: CeshuEditorView 应包含 _on_field_dependency_graph 方法"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    assert hasattr(CeshuEditorView, "_on_field_dependency_graph"), \
        "CeshuEditorView 缺少 _on_field_dependency_graph 方法"


# ========== N16: Excel 导出 ==========

def test_excel_export():
    """N16: Excel 导出应生成有效 .xlsx 文件，含 8 个 Sheet"""
    try:
        from openpyxl import load_workbook  # type: ignore
    except ImportError:
        print("  ⏭️  openpyxl 未安装，跳过 Excel 导出测试")
        return

    from core.ceshu.ceshu_excel_exporter import export_ceshu_to_excel
    from core.ceshu.ceshu_model import CeshuModel

    m = CeshuModel()
    m.meta["game_name"] = "Excel测试"
    m.meta["game_type"] = "RPG"
    m.vision["design_vision"] = "测试愿景"
    m.combat = {"combat_mode": "turn_based", "damage_formula": "atk - def"}
    m.systems = {
        "battle": {"enabled": True, "name": "战斗",
                   "config": {"turn_mode": "turn_based", "team_size": 4}},
        "character": {"enabled": True, "name": "角色", "config": {"max_level": 99}},
    }
    m.characters = {"main_npc_count": 2,
                    "npc_list": [{"name": "张三", "role": "商人"}]}
    m.mvp = {"milestones": [{"name": "MVP", "date": "2026-08-01"}]}
    m.risk_handling = {"risk_matrix": [{"risk": "技术风险", "probability": "高"}]}
    m.market_analysis = {"competitors": [{"name": "竞品A", "type": "RPG"}]}

    tmp = tempfile.mkdtemp()
    try:
        out_path = os.path.join(tmp, "test.xlsx")
        result = export_ceshu_to_excel(m, out_path)
        assert os.path.exists(result), f"Excel 文件未生成: {result}"
        size = os.path.getsize(result)
        assert size > 5000, f"Excel 文件过小: {size} bytes"
        # 验证可被 openpyxl 读取，且含 8 个 Sheet
        wb = load_workbook(result)
        expected_sheets = ["概览", "系统配置", "数值表", "角色",
                           "里程碑", "风险", "竞品", "校验报告"]
        for name in expected_sheets:
            assert name in wb.sheetnames, f"缺少 Sheet: {name}"
        # 概览 Sheet 应包含游戏名
        overview_ws = wb["概览"]
        overview_text = " ".join(
            str(cell.value) for row in overview_ws.iter_rows()
            for cell in row if cell.value
        )
        assert "Excel测试" in overview_text, "概览 Sheet 应包含游戏名"
        print(f"  Excel 大小: {size} bytes, Sheet 数: {len(wb.sheetnames)}")
    finally:
        shutil.rmtree(tmp)


def test_ceshu_manager_has_excel_export():
    """N16: CeshuManager 应有 export_ceshu_excel 方法"""
    from core.ceshu.ceshu_manager import CeshuManager
    assert hasattr(CeshuManager, 'export_ceshu_excel'), \
        "CeshuManager 应有 export_ceshu_excel 方法"


def test_editor_view_has_excel_export_option():
    """N16: editor_view 的导出菜单应有 Excel 选项（PyQt6 测试需跳过）"""
    try:
        from ui.ceshu.editor_view import CeshuEditorView
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise
    import inspect
    src = inspect.getsource(CeshuEditorView._on_export)
    assert "Excel 工作簿，多 Sheet 数据分析" in src, \
        "导出菜单应包含 Excel 选项"


if __name__ == "__main__":
    # 依次运行所有测试
    tests = [
        test_chapter_keys_18,
        test_v4_to_v5_migration,
        test_v5_round_trip,
        test_system_dependencies_structure,
        test_check_system_dependencies_no_missing,
        test_check_system_dependencies_missing,
        test_get_reverse_dependencies,
        test_validate_detects_missing_dependency,
        test_hybrid_gameplay_presets_structure,
        test_find_preset_exact_match,
        test_find_preset_fallback_style,
        test_find_preset_no_match,
        test_get_preset_by_key,
        test_module_system_recommendations,
        test_get_recommended_systems,
        test_get_recommended_systems_unknown,
        test_validate_combat_systems_consistency,
        test_validate_monetization_economy_consistency,
        test_docx_export,
        test_docx_export_includes_all_chapters,
        test_data_sync_systems_to_data,
        test_data_sync_progress_to_ceshu,
        test_data_sync_anti_loop,
        test_infer_style_module,
        test_get_style_glossary,
        test_agent_router_18_chapters,
        test_validation_dialog_categorize,
        test_validation_dialog_importable,
        test_editor_view_has_validate_button,
        test_chapter_panel_has_refresh_progress,
        test_chapter_progress_calculation,
        test_hybrid_presets_expanded,
        test_hybrid_presets_structure_valid,
        test_find_preset_new_styles,
        test_get_recommended_systems_for_new_presets,
        # 优化 A/B/C/D 新增测试
        test_validation_dialog_export_md,
        test_preset_market_dialog,
        test_system_dependency_graph_layers,
        test_system_dependency_graph_dialog,
        test_auto_fill_required,
        test_editor_view_has_preset_button,
        # F1/F5/F6/F7 新增测试
        test_apply_ai_content_to_form,
        test_chapter_panel_has_ai_fill_signal,
        test_editor_view_has_ai_chapter_button,
        test_editor_view_has_word_stats,
        test_word_stats_dialog_importable,
        test_pdf_export,
        test_ai_fill_chapter_enhanced_prompt,
        test_ceshu_skill_supports_pdf_format,
        # N5: 章节模板库
        test_chapter_templates_structure,
        test_chapter_templates_search,
        test_chapter_templates_merge,
        test_template_picker_dialog_importable,
        test_chapter_panel_has_apply_template,
        test_editor_view_has_template_button,
        # N4: 评分系统
        test_ceshu_scorer_score_empty_model,
        test_ceshu_scorer_score_filled_model,
        test_ceshu_scorer_industry_benchmark,
        test_score_report_dialog_importable,
        test_editor_view_has_score_button,
        # N1: 版本对比工具
        test_version_diff_compute,
        test_version_diff_dialog_importable,
        test_editor_view_has_diff_button,
        # N3: PPT 导出
        test_pptx_export,
        test_ceshu_manager_has_pptx_export,
        # N6: AI 智能审阅
        test_ai_review_dialog_importable,
        test_editor_view_has_ai_review_button,
        test_ceshu_skill_supports_ai_review_action,
        # N7: 版本时间线
        test_version_timeline_dialog_importable,
        test_editor_view_has_timeline_button,
        # N8: 章节笔记
        test_chapter_notes_manager,
        test_chapter_notes_dialog_importable,
        test_editor_view_has_notes_button,
        # UX 优化：快捷键 + 工具提示
        test_editor_view_has_shortcuts,
        test_editor_view_has_tooltips,
        # N9/N12: Markdown & HTML 导出
        test_markdown_export,
        test_html_export,
        test_ceshu_manager_has_markdown_export,
        test_ceshu_manager_has_html_export,
        test_editor_view_has_export_menu_options,
        # N10: AI 一键生成完整策划书
        test_ai_full_generate_dialog_importable,
        test_editor_view_has_ai_full_button,
        test_ceshu_skill_has_ai_generate_full,
        # N11: GDD 完备性检查清单
        test_checklist_items_count,
        test_checklist_categories,
        test_checklist_required_items,
        test_run_checklist_empty_model,
        test_run_checklist_filled_model,
        test_checklist_report_summary,
        test_checklist_dialog_importable,
        test_editor_view_has_checklist_button,
        # N13: GDD 模板编辑器
        test_custom_template_manager_crud,
        test_custom_template_manager_search,
        test_custom_template_manager_import_export,
        test_template_editor_dialog_importable,
        test_editor_view_has_template_edit_button,
        # N15: 变更日志
        test_changelog_generate,
        test_changelog_formats,
        test_changelog_dialog_importable,
        test_editor_view_has_changelog_button,
        # N14: 字段依赖关系图
        test_field_dependencies_count,
        test_field_dependencies_for_chapter,
        test_check_field_dependencies,
        test_build_dependency_graph,
        test_field_dependency_graph_dialog_importable,
        test_editor_view_has_field_graph_button,
        # N16: Excel 导出
        test_excel_export,
        test_ceshu_manager_has_excel_export,
        test_editor_view_has_excel_export_option,
    ]
    passed = 0
    skipped = 0
    for t in tests:
        try:
            t()
            print(f"✅ {t.__name__}")
            passed += 1
        except Exception as e:
            # 处理 pytest.skip 抛出的 Skipped 异常
            if "Skipped" in type(e).__name__ or "skip" in str(e).lower():
                print(f"⏭️  {t.__name__}: SKIPPED ({e})")
                skipped += 1
            else:
                print(f"❌ {t.__name__}: {e}")
                raise
    print(f"\n结果: {passed} passed, {skipped} skipped, 共 {len(tests)} 个测试")
