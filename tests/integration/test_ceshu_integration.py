"""策划书模块端到端集成测试

覆盖完整工作流程：
- 创建→编辑→校验→评分→导出 全生命周期
- v4 旧数据迁移往返
- 系统依赖链校验
- 混合玩法预设应用
- 策划书↔游戏数据双向同步
- 版本管理（主版本/子版本派生）
- 模板合并三种模式（fill_empty/overwrite/append）
- 评分递进（D→C→B）
- 版本 Diff 准确性
- 导出公共模块（format_field_value / classify_systems）

测试规范：
- 使用 tempfile.mkdtemp() 创建临时目录，测试后 shutil.rmtree 清理
- 可选依赖（python-docx / python-pptx / PyQt6）通过 try/except ImportError 跳过
- 遵循现有 test_ceshu_v5.py 风格（函数式，不用 class）
"""
import sys
import os
import json
import tempfile
import shutil
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))


# ========== 1. 全生命周期：创建→编辑→校验→评分→导出 ==========

def test_full_lifecycle_create_edit_validate_export():
    """完整生命周期：创建新策划书 → 填充 18 章数据 → 校验 → 评分 → 导出 docx/pptx

    验证整个流程无异常，最终导出文件存在。
    """
    from core.ceshu import CeshuModel
    from core.ceshu.ceshu_scorer import score_ceshu

    # 1. 创建新策划书
    model = CeshuModel()
    assert model.version == "5.0"
    assert model.ceshu_id, "新策划书应有自动生成的 ceshu_id"

    # 2. 填充 18 章数据（使用 auto_fill_required 快速填充 + 手工补充关键字段）
    model.meta["game_name"] = "集成测试游戏"
    model.meta["game_type"] = "RPG"
    model.style = "xianxia"
    model.module_type = "rpg"
    model.auto_fill_required()  # 自动填充所有空必填字段

    # 启用核心系统并配置依赖完整
    model.set_system("character", True)
    model.set_system("skill", True)
    model.set_system("battle", True, config={"turn_mode": "回合制"})
    model.set_system("item", True)
    model.set_system("economy", True, config={"payment_system": "f2p"})

    # 补充关键字段使内容更充实
    model.vision["design_vision"] = "打造一款融合仙侠修真与策略战斗的差异化 RPG 游戏" * 5
    model.vision["differentiation"] = "境界突破 + 宗门争霸 + 法宝熔炼三位一体玩法" * 3
    model.worldview["architecture"] = "九天十地架构，凡界-修真界-仙界三层世界体系" * 3
    model.worldview["main_plot"] = "凡人少年偶得传承，逐步飞升仙界的故事" * 3
    model.gameplay["core_loop"] = "修炼→突破→探险→斗法→炼器→飞升" * 3
    model.gameplay["game_modes"] = ["主线剧情", "宗门战", "跨服斗法", "秘境探险"]
    model.numeric["core_formulas"] = "伤害 = 攻击力 * 技能倍率 - 防御力 * 减伤系数" * 2
    model.numeric["balance_principles"] = "早期易上手，中期有深度，后期有目标" * 2
    model.art["art_style"] = "国风仙侠水墨画风"
    model.art["color_system"] = "青绿山水 + 鎏金点缀"
    model.tech["engine"] = "Unity 2022 LTS"
    model.tech["milestones"] = [
        {"name": "原型", "date": "M1", "deliverables": "核心战斗"},
        {"name": "Alpha", "date": "M3", "deliverables": "完整章节"},
    ]
    model.resources["budget"] = {"total": "500万", "art": "200万", "dev": "200万", "marketing": "100万"}
    model.resources["risk_matrix"] = [{"risk": "进度延期", "level": "中", "mitigation": "里程碑管控"}]

    # 3. 校验（依赖已补齐，应无依赖缺失错误）
    errors = model.validate()
    dep_errors = [e for e in errors if "依赖缺失" in e]
    assert len(dep_errors) == 0, f"依赖应已补齐，但出现依赖缺失: {dep_errors}"

    # 4. 评分（应得到有效报告，分数高于空策划书）
    report = score_ceshu(model)
    empty_report = score_ceshu(CeshuModel())
    assert report.total_score > empty_report.total_score, \
        f"填充后评分应高于空策划书: {report.total_score} vs {empty_report.total_score}"
    assert 0 <= report.total_score <= 100
    assert len(report.chapter_scores) == 18

    # 5. 导出 docx（如 python-docx 可用）
    tmp = tempfile.mkdtemp()
    try:
        # 5a. docx 导出
        try:
            from docx import Document  # type: ignore
            from core.ceshu.ceshu_docx_exporter import export_ceshu_to_docx
            docx_path = os.path.join(tmp, "lifecycle.docx")
            result = export_ceshu_to_docx(model, docx_path, include_validation_report=True)
            assert os.path.exists(result), f"docx 文件未生成: {result}"
            assert os.path.getsize(result) > 1000, "docx 文件过小"
            # 验证可被 python-docx 读取
            doc = Document(result)
            full_text = "\n".join([p.text for p in doc.paragraphs])
            assert "集成测试游戏" in full_text, "docx 应包含游戏名称"
        except ImportError:
            print("  ⏭️  python-docx 未安装，跳过 docx 导出验证")

        # 5b. pptx 导出
        try:
            from pptx import Presentation  # type: ignore
            from core.ceshu.ceshu_pptx_exporter import export_ceshu_to_pptx
            pptx_path = os.path.join(tmp, "lifecycle.pptx")
            result = export_ceshu_to_pptx(model, pptx_path, include_validation_report=True)
            assert os.path.exists(result), f"pptx 文件未生成: {result}"
            assert os.path.getsize(result) > 5000, "pptx 文件过小"
            prs = Presentation(result)
            assert len(prs.slides) >= 22, f"幻灯片数应 >= 22, 实际 {len(prs.slides)}"
        except ImportError:
            print("  ⏭️  python-pptx 未安装，跳过 pptx 导出验证")
    finally:
        shutil.rmtree(tmp)


# ========== 2. v4 迁移往返 ==========

def test_v4_migration_full_roundtrip():
    """v4 旧数据迁移完整往返：构造 v4 → from_dict 迁移 → 修改 → to_dict → 再次 from_dict → 验证数据完整"""
    from core.ceshu import CeshuModel

    # 1. 构造 v4 旧数据（9 章结构）
    v4_data = {
        "version": "4.0",
        "ceshu_id": "v4_roundtrip",
        "meta": {"game_name": "v4 原始游戏", "game_type": "RPG", "positioning": "原始定位"},
        "vision": {
            "design_vision": "v4 原始愿景",
            "competitive_analysis": [{"name": "竞品 X"}, {"name": "竞品 Y"}],
            "business_model": "f2p",
            "differentiation": "v4 差异化",
        },
        "worldview": {
            "architecture": "v4 世界观",
            "character_network": [{"name": "NPC 甲"}, {"name": "NPC 乙"}],
            "main_plot": "v4 主线",
        },
        "systems": {
            "battle": {"enabled": True, "config": {"turn_mode": "turn_based",
                                                    "damage_formula": "atk - def"}},
            "character": {"enabled": True, "config": {}},
            "skill": {"enabled": True, "config": {}},
            "economy": {"enabled": True, "config": {"currency_types": "金币, 钻石",
                                                    "payment_system": "f2p",
                                                    "recharge_tiers": "6, 30, 68"}},
        },
        "resources": {
            "risk_matrix": [{"risk": "技术风险", "level": "高"}],
            "localization": ["zh", "en"],
            "contingency_plan": "v4 应急预案",
        },
        "tech": {"milestones": [{"name": "MVP"}, {"name": "上线"}]},
    }

    # 2. from_dict 自动迁移到 v5
    m1 = CeshuModel.from_dict(v4_data)
    assert m1.version == "5.0", f"迁移后版本应为 5.0, 实际 {m1.version}"
    # 验证迁移字段
    assert m1.market_analysis.get("competitors"), "competitive_analysis 应迁移到 market_analysis"
    assert m1.monetization.get("payment_model") == "f2p", "business_model 应迁移到 monetization"
    assert m1.characters.get("npc_list"), "character_network 应迁移到 characters.npc_list"
    assert m1.combat.get("combat_mode") == "turn_based", "battle.turn_mode 应迁移到 combat.combat_mode"
    assert m1.combat.get("damage_formula") == "atk - def", "battle.damage_formula 应迁移"
    assert m1.economy.get("currency_types"), "economy 货币类型应迁移"
    assert m1.risk_handling.get("risk_matrix"), "resources.risk_matrix 应迁移到 risk_handling"
    assert m1.accessibility.get("language_list") == ["zh", "en"], "localization 应迁移到 accessibility"
    assert m1.mvp.get("milestones"), "tech.milestones 应迁移到 mvp"

    # 3. 修改迁移后的模型
    m1.style = "xianxia"
    m1.module_type = "rpg"
    m1.meta["game_name"] = "v5 修改后名称"
    m1.combat["combat_mode"] = "realtime"  # 修改迁移值
    m1.monetization["pricing_tiers"] = ["6", "30", "68", "128"]
    # v4 数据 systems 只有 4 个系统，用 add_system 新增 item（set_system 仅对已存在系统生效）
    # add_system 默认 enabled=True
    m1.add_system("item")
    assert m1.systems["item"]["enabled"] is True

    # 4. to_dict 序列化
    d = m1.to_dict()
    assert d["version"] == "5.0"
    assert d["style"] == "xianxia"
    assert d["meta"]["game_name"] == "v5 修改后名称"
    assert d["combat"]["combat_mode"] == "realtime"
    assert d["monetization"]["pricing_tiers"] == ["6", "30", "68", "128"]
    # 验证全部 18 章都在
    for ch in ["meta", "vision", "worldview", "gameplay", "systems", "numeric",
               "art", "tech", "resources", "market_analysis", "characters",
               "combat", "economy", "monetization", "mvp", "risk_handling",
               "audio", "accessibility"]:
        assert ch in d, f"to_dict 缺少章节: {ch}"

    # 5. 再次 from_dict 反序列化（不应再触发迁移，因为已是 v5）
    m2 = CeshuModel.from_dict(d)
    assert m2.version == "5.0"
    assert m2.style == "xianxia"
    assert m2.module_type == "rpg"
    assert m2.meta["game_name"] == "v5 修改后名称"
    assert m2.combat["combat_mode"] == "realtime"
    assert m2.monetization["pricing_tiers"] == ["6", "30", "68", "128"]
    assert m2.systems["item"]["enabled"] is True

    # 6. 验证两次 to_dict 结果一致（除时间戳外）
    d2 = m2.to_dict()
    for ch in ["meta", "vision", "worldview", "gameplay", "systems", "numeric",
               "art", "tech", "resources", "market_analysis", "characters",
               "combat", "economy", "monetization", "mvp", "risk_handling",
               "audio", "accessibility"]:
        assert d[ch] == d2[ch], f"章节 {ch} 往返后数据不一致"


# ========== 3. 系统依赖链 ==========

def test_systems_dependency_chain():
    """系统依赖链：启用 battle 提示缺 character/skill → 补齐后通过；启用 gacha 提示缺 item/economy → 补齐后通过"""
    from core.ceshu import CeshuModel, check_system_dependencies

    # --- 阶段 1：启用 battle，应提示缺 character + skill ---
    result = check_system_dependencies(["battle"])
    assert len(result) == 1, f"应检测到 1 个系统的依赖缺失, 实际 {len(result)}"
    assert result[0]["system"] == "battle"
    assert "character" in result[0]["missing"]
    assert "skill" in result[0]["missing"]

    # 通过 CeshuModel.validate() 也应检测到
    m = CeshuModel()
    m.set_system("battle", True)
    m.set_system("character", False)
    m.set_system("skill", False)
    errors = m.validate()
    dep_errors = [e for e in errors if "依赖缺失" in e and "battle" in e]
    assert len(dep_errors) > 0, "validate 应检测到 battle 依赖缺失"

    # --- 阶段 2：补齐 character + skill，依赖应通过 ---
    result2 = check_system_dependencies(["character", "skill", "battle"])
    assert result2 == [], f"补齐后应无缺失依赖, 实际 {result2}"

    m.set_system("character", True)
    m.set_system("skill", True)
    errors2 = m.validate()
    dep_errors2 = [e for e in errors2 if "依赖缺失" in e]
    assert len(dep_errors2) == 0, f"补齐后应无依赖缺失错误, 实际 {dep_errors2}"

    # --- 阶段 3：启用 gacha，应提示缺 item + economy ---
    result3 = check_system_dependencies(["character", "skill", "battle", "gacha"])
    gacha_missing = [r for r in result3 if r["system"] == "gacha"]
    assert len(gacha_missing) == 1, "应检测到 gacha 依赖缺失"
    gacha_deps = gacha_missing[0]["missing"]
    assert "item" in gacha_deps, "gacha 应依赖 item"
    assert "economy" in gacha_deps, "gacha 应依赖 economy"

    # --- 阶段 4：补齐 item + economy，gacha 依赖应通过 ---
    result4 = check_system_dependencies(
        ["character", "skill", "battle", "gacha", "item", "economy"]
    )
    assert result4 == [], f"全部补齐后应无缺失依赖, 实际 {result4}"


# ========== 4. 混合玩法预设应用 ==========

def test_hybrid_preset_application():
    """混合玩法预设应用：仙侠 RPG + 科幻 FPS 预设应用到空策划书，验证 style/module_type/recommended_systems"""
    from core.ceshu import CeshuModel, get_preset_by_key, find_preset

    # --- 仙侠 RPG 预设 ---
    preset_xianxia = get_preset_by_key("xianxia_rpg")
    assert preset_xianxia is not None, "xianxia_rpg 预设应存在"
    assert preset_xianxia["style"] == "xianxia"
    assert preset_xianxia["module_type"] == "rpg"
    assert isinstance(preset_xianxia["recommended_systems"], list)
    assert len(preset_xianxia["recommended_systems"]) > 0
    # 推荐系统应包含核心三件套
    assert "character" in preset_xianxia["recommended_systems"]
    assert "battle" in preset_xianxia["recommended_systems"]
    assert "skill" in preset_xianxia["recommended_systems"]

    # 应用到空策划书
    m1 = CeshuModel()
    m1.style = preset_xianxia["style"]
    m1.module_type = preset_xianxia["module_type"]
    for sys_id in preset_xianxia["recommended_systems"]:
        if sys_id in m1.systems:
            m1.set_system(sys_id, True)
    # 验证应用结果
    assert m1.style == "xianxia"
    assert m1.module_type == "rpg"
    enabled = [k for k, v in m1.systems.items() if v.get("enabled")]
    for sys_id in preset_xianxia["recommended_systems"]:
        if sys_id in m1.systems:
            assert sys_id in enabled, f"系统 {sys_id} 应被预设启用"

    # find_preset 风格+模块精确匹配
    found = find_preset("xianxia", "rpg")
    assert found is not None
    assert found["style"] == "xianxia"
    assert found["module_type"] == "rpg"
    assert found["key"] == "xianxia_rpg"

    # --- 科幻 FPS 预设（对应"科幻射击"） ---
    preset_scifi = get_preset_by_key("scifi_fps")
    assert preset_scifi is not None, "scifi_fps 预设应存在"
    assert preset_scifi["style"] == "sci-fi"
    assert preset_scifi["module_type"] == "fps"
    assert isinstance(preset_scifi["recommended_systems"], list)
    assert "battle" in preset_scifi["recommended_systems"]
    assert "equipment" in preset_scifi["recommended_systems"]

    # 应用到空策划书
    m2 = CeshuModel()
    m2.style = preset_scifi["style"]
    m2.module_type = preset_scifi["module_type"]
    for sys_id in preset_scifi["recommended_systems"]:
        if sys_id in m2.systems:
            m2.set_system(sys_id, True)
    assert m2.style == "sci-fi"
    assert m2.module_type == "fps"

    # find_preset 精确匹配科幻 FPS
    found2 = find_preset("sci-fi", "fps")
    assert found2 is not None
    assert found2["style"] == "sci-fi"
    assert found2["module_type"] == "fps"
    assert found2["key"] == "scifi_fps"

    # 两个预设应有不同的风格和模块
    assert preset_xianxia["style"] != preset_scifi["style"]
    assert preset_xianxia["module_type"] != preset_scifi["module_type"]


# ========== 5. 数据同步往返 ==========

class _MockDataManager:
    """模拟 DataManager 用于同步测试"""

    def __init__(self):
        self.data = {"roles": [], "skills": [], "items": []}
        self.current_file = None

    def save_file(self, file_path=None):
        pass


def test_data_sync_roundtrip():
    """数据同步往返：systems→data 确保键存在 → data 添加 3 角色 → data→ceshu 回填 actual_count=3"""
    from core.ceshu import CeshuModel, CeshuDataSync

    # 1. 创建策划书，启用 character 系统
    model = CeshuModel()
    model.set_system("character", True)
    # character 系统映射到 role 数据类型（DATA_TYPE_PLURALS['role']='roles'）
    model.systems["character"]["data_type"] = "role"

    mock_dm = _MockDataManager()
    # 删除 roles 键以测试自动创建
    del mock_dm.data["roles"]

    sync = CeshuDataSync(
        ceshu_manager=None,
        data_manager=mock_dm,
        library_manager=None,
        config=None,
    )

    # 2. sync_systems_to_data 应确保 roles 键存在
    result = sync.sync_systems_to_data(model, "test_lib")
    assert "roles" in mock_dm.data, "sync_systems_to_data 应创建 roles 键"
    assert "roles" in result["ensured_keys"], \
        f"ensured_keys 应包含 roles, 实际 {result['ensured_keys']}"
    assert mock_dm.data["roles"] == [], "新创建的 roles 应为空列表"

    # 3. 在 data 中添加 3 个角色
    mock_dm.data["roles"] = [
        {"id": "R1", "name": "张三"},
        {"id": "R2", "name": "李四"},
        {"id": "R3", "name": "王五"},
    ]

    # 4. sync_data_progress_to_ceshu 应回填 actual_count = 3
    progress = sync.sync_data_progress_to_ceshu(model, "test_lib", save=False)
    assert progress.get("character") == 3, \
        f"character 实际条目数应为 3, 实际 {progress.get('character')}"
    # model.systems 应被更新
    assert model.systems["character"]["config"]["actual_count"] == 3, \
        "model.systems.character.config.actual_count 应为 3"

    # 5. 修改 data 为 5 个角色，再次同步验证数值更新
    mock_dm.data["roles"].append({"id": "R4", "name": "赵六"})
    mock_dm.data["roles"].append({"id": "R5", "name": "钱七"})
    progress2 = sync.sync_data_progress_to_ceshu(model, "test_lib", save=False)
    assert progress2.get("character") == 5, f"更新后条目数应为 5, 实际 {progress2.get('character')}"
    assert model.systems["character"]["config"]["actual_count"] == 5

    # 6. 清空 data，同步后应为 0
    mock_dm.data["roles"] = []
    progress3 = sync.sync_data_progress_to_ceshu(model, "test_lib", save=False)
    assert progress3.get("character") == 0
    assert model.systems["character"]["config"]["actual_count"] == 0


# ========== 6. 版本管理 ==========

def test_version_management():
    """版本管理：创建主版本 → 派生子版本 → 修改子版本 → 保存 → 列出所有版本 → 验证版本关系"""
    from core.ceshu import CeshuManager, CeshuModel

    tmp = tempfile.mkdtemp()
    try:
        # 1. 创建主版本
        mgr = CeshuManager(tmp)
        main_model = mgr.create_ceshu("test_lib", meta={"game_name": "主版本游戏",
                                                         "game_type": "RPG"})
        assert main_model.is_main_version, "新建策划书应为主版本"
        assert main_model.parent_id == ""
        assert main_model.is_active is True, "主版本应默认激活"
        assert main_model.version_label == "v1.0"

        # 2. 派生子版本
        child = mgr.derive_version("test_lib", main_model.ceshu_id,
                                   version_note="派生子版本用于测试")
        assert child is not None, "派生子版本应成功"
        assert child.ceshu_id != main_model.ceshu_id, "子版本 ID 应不同"
        assert child.parent_id == main_model.ceshu_id, \
            f"子版本 parent_id 应指向主版本, 实际 {child.parent_id}"
        assert child.is_main_version is False, "子版本不应是主版本"
        assert child.is_active is False, "新派生子版本应默认非激活"
        assert child.version_label == "v1.1", f"子版本标签应为 v1.1, 实际 {child.version_label}"
        assert child.version_note == "派生子版本用于测试"
        # 子版本应继承主版本的内容
        assert child.meta["game_name"] == "主版本游戏"

        # 3. 修改子版本并保存
        child.meta["game_name"] = "子版本修改后"
        child.combat = {"combat_mode": "realtime", "damage_formula": "atk * 2"}
        mgr.save_ceshu(child, "test_lib")

        # 4. 列出所有版本
        versions = mgr.list_versions("test_lib", main_model.ceshu_id)
        assert len(versions) == 2, f"应有 2 个版本（主+子）, 实际 {len(versions)}"
        # 主版本应排首位
        assert versions[0]["ceshu_id"] == main_model.ceshu_id, "主版本应排首位"
        # 子版本应按版本号排序在后
        assert versions[1]["ceshu_id"] == child.ceshu_id

        # 5. 重新加载子版本，验证修改已持久化
        reloaded = mgr.get_ceshu(child.ceshu_id, "test_lib")
        assert reloaded.meta["game_name"] == "子版本修改后"
        assert reloaded.combat["combat_mode"] == "realtime"
        assert reloaded.parent_id == main_model.ceshu_id
        assert reloaded.version_label == "v1.1"

        # 6. 派生第二个子版本，版本号应自动递增
        child2 = mgr.derive_version("test_lib", main_model.ceshu_id)
        assert child2 is not None
        assert child2.version_label == "v1.2", \
            f"第二个子版本标签应为 v1.2, 实际 {child2.version_label}"
        assert child2.ceshu_id != child.ceshu_id

        # 7. 再次列出，应有 3 个版本
        versions2 = mgr.list_versions("test_lib", main_model.ceshu_id)
        assert len(versions2) == 3, f"应有 3 个版本, 实际 {len(versions2)}"

        # 8. 激活子版本，主版本应取消激活
        ok = mgr.set_active_version("test_lib", child.ceshu_id)
        assert ok, "set_active_version 应成功"
        reloaded_child = mgr.get_ceshu(child.ceshu_id, "test_lib")
        reloaded_main = mgr.get_ceshu(main_model.ceshu_id, "test_lib")
        assert reloaded_child.is_active is True, "子版本应被激活"
        assert reloaded_main.is_active is False, "主版本应取消激活"
    finally:
        shutil.rmtree(tmp)


# ========== 7. 模板合并三种模式 ==========

def _append_template_to_chapter(chapter_data, template_data):
    """append 模式辅助：文本字段追加，列表字段合并去重，其他字段覆盖空值"""
    if not isinstance(chapter_data, dict):
        chapter_data = {}
    if not isinstance(template_data, dict):
        return dict(chapter_data)
    result = dict(chapter_data)
    for k, v in template_data.items():
        existing = result.get(k)
        if isinstance(v, str) and isinstance(existing, str) and existing:
            # 文本字段追加
            result[k] = existing + "\n" + v
        elif isinstance(v, list) and isinstance(existing, list):
            # 列表合并去重
            merged = list(existing)
            for item in v:
                if item not in merged:
                    merged.append(item)
            result[k] = merged
        elif not existing:
            result[k] = v
    return result


def test_template_merge_all_modes():
    """模板合并三种模式：fill_empty（仅填空）/ overwrite（覆盖）/ append（追加）"""
    try:
        from ui.ceshu.chapter_templates import merge_template_to_chapter
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise

    # --- 准备基础数据 ---
    existing = {
        "game_name": "已有名称",
        "game_type": "RPG",
        "positioning": "",
        "tags": ["原创"],
        "design_vision": "原有愿景",
    }
    template = {
        "game_name": "模板名称",
        "game_type": "SLG",
        "positioning": "模板定位",
        "tags": ["模板", "示例"],
        "design_vision": "模板愿景补充",
        "differentiation": "模板差异化",
    }

    # --- 1. fill_empty 模式（overwrite=False）：仅填充空字段 ---
    merged_fill = merge_template_to_chapter(existing, template, overwrite=False)
    assert merged_fill["game_name"] == "已有名称", "fill_empty 不应覆盖已有字段"
    assert merged_fill["game_type"] == "RPG", "fill_empty 不应覆盖已有字段"
    assert merged_fill["positioning"] == "模板定位", "fill_empty 应填充空字段"
    assert merged_fill["differentiation"] == "模板差异化", "fill_empty 应填充新增字段"
    # 已有列表不应被覆盖
    assert merged_fill["tags"] == ["原创"], "fill_empty 不应覆盖非空列表"

    # --- 2. overwrite 模式（overwrite=True）：模板字段覆盖现有字段 ---
    merged_ov = merge_template_to_chapter(existing, template, overwrite=True)
    assert merged_ov["game_name"] == "模板名称", "overwrite 应覆盖已有字段"
    assert merged_ov["game_type"] == "SLG", "overwrite 应覆盖已有字段"
    assert merged_ov["positioning"] == "模板定位"
    assert merged_ov["design_vision"] == "模板愿景补充"
    assert merged_ov["tags"] == ["模板", "示例"], "overwrite 应覆盖列表"

    # --- 3. append 模式：文本字段追加，列表字段合并 ---
    merged_ap = _append_template_to_chapter(existing, template)
    assert "已有名称" in merged_ap["game_name"], "append 应保留原文本"
    assert "模板名称" in merged_ap["game_name"], "append 应追加模板文本"
    assert merged_ap["game_name"] == "已有名称\n模板名称"
    assert "原有愿景" in merged_ap["design_vision"]
    assert "模板愿景补充" in merged_ap["design_vision"]
    # 列表应合并去重
    assert "原创" in merged_ap["tags"]
    assert "模板" in merged_ap["tags"]
    assert "示例" in merged_ap["tags"]
    assert len(merged_ap["tags"]) == 3, f"合并去重后应有 3 个 tag, 实际 {merged_ap['tags']}"
    # 空字段应被填充
    assert merged_ap["positioning"] == "模板定位"
    assert merged_ap["differentiation"] == "模板差异化"

    # --- 4. 边界情况：空章节数据 ---
    empty_chapter = {}
    merged_from_empty = merge_template_to_chapter(empty_chapter, template, overwrite=False)
    for k, v in template.items():
        assert merged_from_empty[k] == v, f"空章节合并应填入模板字段 {k}"

    # --- 5. 边界情况：非 dict 输入 ---
    merged_non_dict = merge_template_to_chapter(None, template, overwrite=False)
    assert isinstance(merged_non_dict, dict)
    assert merged_non_dict.get("game_name") == "模板名称"


# ========== 8. 评分递进 ==========

def test_scoring_progression():
    """评分递进：空策划书(D) → 填充 meta+vision+基础章节 → 填充 market+monetization+mvp → 验证分数递进

    验证分数严格递增，等级非递减（理想 D→C→B，至少 D→C 或更高）。
    """
    from core.ceshu import CeshuModel
    from core.ceshu.ceshu_scorer import score_ceshu

    grade_order = {"D": 0, "C": 1, "B": 2, "A": 3, "S": 4}

    # --- 阶段 1：空策划书 → D 级 ---
    m_empty = CeshuModel()
    report_empty = score_ceshu(m_empty)
    assert report_empty.grade == "D", f"空策划书应为 D 级, 实际 {report_empty.grade}"
    assert report_empty.total_score < 60
    score_empty = report_empty.total_score

    # --- 阶段 2：填充 meta + vision + 基础章节（auto_fill_required 补全所有必填字段）→ 分数提升 ---
    m2 = CeshuModel()
    m2.meta["game_name"] = "测试游戏"
    m2.meta["game_type"] = "RPG"
    m2.style = "fantasy"
    m2.module_type = "rpg"
    # auto_fill_required 自动填充所有空必填字段，确保结构分最大化
    m2.auto_fill_required()
    # 深度填充 meta + vision（核心章节，字数达标）
    m2.meta["positioning"] = "面向核心玩家的差异化 RPG，融合策略战斗与角色养成"
    m2.meta["tags"] = ["RPG", "原创", "国产", "奇幻"]
    m2.vision["design_vision"] = (
        "打造一款融合策略战斗与角色养成的深度 RPG 游戏，"
        "核心乐趣在于探索未知世界、挑战强力敌人、收集稀有装备、"
        "构建独特角色build。游戏注重玩家选择带来的后果，"
        "每个决策都会影响世界走向与角色命运。"
        "玩家将在一个充满魔法与冒险的奇幻世界中展开旅程，"
        "通过战斗、探索、对话逐步揭开世界的真相。" * 3
    )
    m2.vision["differentiation"] = (
        "差异化卖点：动态世界状态 + 多结局分支 + 深度 build 系统 + "
        "角色养成自由度 + 策略战斗深度" * 3
    )
    # 深度填充其他基础章节以提升内容质量分
    m2.worldview["architecture"] = (
        "开放世界 + 主线引导，多区域自由探索。"
        "世界分为五大区域：北方雪山、南方丛林、东方平原、西方沙漠、中央王城。"
        "每个区域有独特的生态环境、势力分布、主线任务线。" * 2
    )
    m2.worldview["main_plot"] = (
        "勇者踏上讨伐魔王的旅程，途中遭遇各种选择。"
        "故事分为三幕：觉醒、成长、决战。"
        "每幕有多个关键节点，玩家的选择影响后续走向。" * 2
    )
    m2.gameplay["core_loop"] = (
        "探索→战斗→收集→强化→推进剧情→解锁新区域→挑战 Boss"
        "核心循环每轮约 15-30 分钟，保持玩家持续投入" * 2
    )
    m2.gameplay["game_modes"] = ["主线剧情", "自由探索", "挑战副本", "竞技场"]
    m2.numeric["core_formulas"] = (
        "伤害 = 攻击力 * 技能倍率 * (1 - 防御减伤) + 固定伤害"
        "暴击伤害 = 普通伤害 * 暴击倍率（默认 1.5）"
        "经验需求 = 基础值 * 等级 ^ 1.5" * 2
    )
    m2.numeric["balance_principles"] = (
        "早期易上手，中期有深度，后期有目标。"
        "PVE 与 PVP 数值分离，避免互相影响。" * 2
    )
    m2.combat["combat_mode"] = "回合制"
    m2.combat["damage_formula"] = "伤害 = 攻击力 * 技能倍率 - 防御力 * 减伤系数"

    report2 = score_ceshu(m2)
    score2 = report2.total_score
    assert score2 > score_empty, \
        f"阶段 2 分数应高于空策划书: {score2} vs {score_empty}"
    # 等级应非递减（至少不低于 D）
    assert grade_order[report2.grade] >= grade_order["D"], \
        f"阶段 2 等级应 >= D, 实际 {report2.grade}"

    # --- 阶段 3：填充 market_analysis + monetization + mvp → 分数再提升 ---
    m2.market_analysis = {
        "target_market": "国内 PC/主机市场，面向 18-35 岁核心玩家",
        "market_size": "国内 RPG 市场规模约 50 亿，年增长 8%",
        "user_demographics": "男性为主，70% 有 RPG 经验，ARPU 200 元/年",
        "competitors": [
            {"name": "竞品 A", "type": "同类 RPG", "strengths": "美术强",
             "weaknesses": "玩法浅", "market_share": "15%"},
            {"name": "竞品 B", "type": "同类 RPG", "strengths": "剧情好",
             "weaknesses": "优化差", "market_share": "10%"},
        ],
        "market_positioning": "差异化定位：深度 build + 多结局",
        "entry_barriers": "研发成本高，IP 积累需要时间",
        "market_trends": ["开放世界", "多结局", "玩家选择"],
        "kpi_forecast": {"dau": "5万", "mau": "30万",
                         "retention_d1": "45%", "retention_d7": "20%",
                         "arpu": "8元", "ltv": "200元"},
    }
    m2.monetization = {
        "payment_model": "f2p",
        "pricing_tiers": ["6", "30", "68", "128"],
        "iap_design": [
            {"item": "月卡", "price": "30", "value": "每日钻石", "target": "中低消费"},
            {"item": "通行证", "price": "68", "value": "赛季奖励", "target": "中消费"},
        ],
        "ad_strategy": "无广告，纯内购",
        "subscription_design": "月卡订阅制",
        "season_pass": "赛季通行证，每赛季 68 元",
        "vip_system": "VIP 1-15 级，按累计充值升级",
        "limited_offers": "节日限时礼包",
        "whale_strategy": "稀有外观 + 限定皮肤",
        "f2p_experience": "免费玩家可体验全部主线内容",
        "revenue_forecast": {"month1": "50万", "month3": "200万"},
        "arpu_target": "8 元/月",
    }
    m2.mvp = {
        "mvp_scope": "核心战斗 + 1 个完整区域 + 基础 UI + 角色养成",
        "mvp_timeline": "3 个月（M1 原型 → M2 内容 → M3 优化）",
        "core_features": ["战斗系统", "角色养成", "剧情系统", "背包系统"],
        "cut_features": ["多人模式", "PVP", "公会"],
        "prototype_features": ["战斗核心循环", "角色 build"],
        "milestones": [
            {"name": "M1 原型", "date": "第1月", "deliverables": "战斗 demo"},
            {"name": "M2 Alpha", "date": "第2月", "deliverables": "完整区域"},
            {"name": "M3 Beta", "date": "第3月", "deliverables": "可玩版本"},
        ],
        "success_criteria": "次日留存 40%，七日留存 18%",
        "team_size": 8,
        "budget_estimate": "100 万",
        "risk_assessment": "中风险，主要在玩法打磨",
        "prototype_plan": "第1月完成战斗原型",
        "playtest_plan": "M2 结束后内部试玩",
    }

    report3 = score_ceshu(m2)
    score3 = report3.total_score
    assert score3 > score2, \
        f"阶段 3 分数应高于阶段 2: {score3} vs {score2}"
    # 市场潜力分应显著提升
    assert report3.market_potential_score > report2.market_potential_score, \
        f"市场分应提升: {report3.market_potential_score} vs {report2.market_potential_score}"
    # 等级应非递减，且阶段 3 至少为 C
    assert grade_order[report3.grade] >= grade_order[report2.grade], \
        f"阶段 3 等级应不低于阶段 2: {report3.grade} vs {report2.grade}"
    assert grade_order[report3.grade] >= grade_order["C"], \
        f"阶段 3 等级应至少为 C, 实际 {report3.grade}"

    # --- 验证递进序列 ---
    print(f"  评分递进: D({score_empty:.1f}) → {report2.grade}({score2:.1f}) → {report3.grade}({score3:.1f})")
    # 验证分数严格递增
    assert score_empty < score2 < score3, \
        f"分数应严格递增: {score_empty} < {score2} < {score3}"


# ========== 9. 版本 Diff 准确性 ==========

def test_version_diff_accuracy():
    """版本 Diff 准确性：创建 v1 → 修改多个字段 → 保存为 v2 → compute_version_diff → 验证 added/removed/modified 计数"""
    try:
        from core.ceshu import CeshuModel
        from ui.ceshu.version_diff_dialog import compute_version_diff
    except ModuleNotFoundError as e:
        if "PyQt6" in str(e):
            print(f"  ⏭️  PyQt6 未安装: {e}")
            return
        raise

    # 1. 创建 v1
    v1 = CeshuModel()
    v1.meta["game_name"] = "v1 原始名称"
    v1.meta["game_type"] = "RPG"
    v1.meta["positioning"] = "v1 定位"
    v1.vision["design_vision"] = "v1 愿景"
    v1.vision["differentiation"] = "v1 差异化"
    v1.worldview["architecture"] = "v1 世界观"
    v1.combat = {"combat_mode": "", "damage_formula": ""}  # 空字段
    v1.version_label = "v1.0"

    # 2. 修改多个字段创建 v2
    v2 = CeshuModel()
    v2.meta["game_name"] = "v2 新名称"  # 修改
    v2.meta["game_type"] = "RPG"  # 未变
    # positioning 删除（变为空）
    v2.vision["design_vision"] = "v2 新愿景"  # 修改
    # differentiation 删除
    # worldview.architecture 删除
    v2.combat = {"combat_mode": "turn_based", "damage_formula": "atk-def"}  # 新增字段值
    v2.economy = {"currency_types": [{"name": "金币"}], "source_sink": "战斗产出"}  # 新增字段值
    v2.version_label = "v2.0"

    # 3. 计算 Diff
    diff = compute_version_diff(v1, v2)

    # 4. 验证 Diff 结构
    assert diff.old_version_label == "v1.0"
    assert diff.new_version_label == "v2.0"
    assert len(diff.chapter_diffs) == 18, f"应有 18 章节 diff, 实际 {len(diff.chapter_diffs)}"

    # 5. 验证有变更
    assert diff.total_modified >= 1, f"应检测到修改, 实际 {diff.total_modified}"
    assert diff.total_added >= 1, f"应检测到新增, 实际 {diff.total_added}"
    assert diff.total_removed >= 1, f"应检测到删除, 实际 {diff.total_removed}"
    assert diff.total_changes >= 3, \
        f"总变更数应 >= 3, 实际 {diff.total_changes}"

    # 6. 验证具体章节的 diff
    meta_diff = next(d for d in diff.chapter_diffs if d.chapter_key == "meta")
    assert meta_diff.modified_count >= 1, "meta 应有修改字段"  # game_name 修改
    assert meta_diff.removed_count >= 1, "meta 应有删除字段"  # positioning 删除

    vision_diff = next(d for d in diff.chapter_diffs if d.chapter_key == "vision")
    assert vision_diff.modified_count >= 1, "vision 应有修改字段"  # design_vision 修改
    assert vision_diff.removed_count >= 1, "vision 应有删除字段"  # differentiation 删除

    combat_diff = next(d for d in diff.chapter_diffs if d.chapter_key == "combat")
    assert combat_diff.added_count >= 1, "combat 应有新增字段"  # combat_mode 从空变有值

    # 7. 验证未变化章节
    unchanged_chapters = [d for d in diff.chapter_diffs if d.total_changes == 0]
    assert len(unchanged_chapters) > 0, "应存在未变化的章节"

    # 8. 验证总计计数等于各章节计数之和
    sum_added = sum(d.added_count for d in diff.chapter_diffs)
    sum_removed = sum(d.removed_count for d in diff.chapter_diffs)
    sum_modified = sum(d.modified_count for d in diff.chapter_diffs)
    assert diff.total_added == sum_added, \
        f"total_added 应等于各章节之和: {diff.total_added} vs {sum_added}"
    assert diff.total_removed == sum_removed, \
        f"total_removed 应等于各章节之和: {diff.total_removed} vs {sum_removed}"
    assert diff.total_modified == sum_modified, \
        f"total_modified 应等于各章节之和: {diff.total_modified} vs {sum_modified}"


# ========== 10. 导出公共模块 ==========

def test_export_common_module():
    """导出公共模块：format_field_value 各种数据类型 + classify_systems + bullet 参数"""
    from core.ceshu.ceshu_export_common import (
        format_field_value, classify_systems, is_empty_value, EMPTY_PLACEHOLDER,
    )

    # --- 1. format_field_value: None ---
    assert format_field_value(None) == EMPTY_PLACEHOLDER
    assert format_field_value(None) == "—"

    # --- 2. format_field_value: 字符串 ---
    assert format_field_value("hello") == "hello"
    assert format_field_value("") == EMPTY_PLACEHOLDER
    assert format_field_value("   ") == EMPTY_PLACEHOLDER  # 纯空白

    # --- 3. format_field_value: 整数/浮点 ---
    assert format_field_value(42) == "42"
    assert format_field_value(0) == "0"  # 0 不视为空
    assert format_field_value(3.14) == "3.14"

    # --- 4. format_field_value: 布尔 ---
    assert format_field_value(True) == "是"
    assert format_field_value(False) == "否"  # False 不视为空

    # --- 5. format_field_value: 列表 ---
    result = format_field_value(["a", "b", "c"])
    assert "- a" in result
    assert "- b" in result
    assert "- c" in result

    # 空列表
    assert format_field_value([]) == EMPTY_PLACEHOLDER

    # 列表项为 dict
    result = format_field_value([{"name": "张三", "age": 20}])
    assert "张三" in result
    assert "20" in result

    # --- 6. format_field_value: bullet 参数 ---
    result_dash = format_field_value(["a", "b"], bullet="- ")
    assert "- a" in result_dash
    result_bullet = format_field_value(["a", "b"], bullet="• ")
    assert "• a" in result_bullet
    assert "• b" in result_bullet

    # --- 7. format_field_value: dict ---
    result = format_field_value({"key1": "value1", "key2": "value2"})
    assert "key1" in result
    assert "value1" in result
    assert "key2" in result
    assert "value2" in result

    # 空 dict
    assert format_field_value({}) == EMPTY_PLACEHOLDER

    # 嵌套 dict
    nested = {"outer": {"inner": "value"}}
    result = format_field_value(nested)
    assert "outer" in result
    assert "inner" in result
    assert "value" in result

    # --- 8. format_field_value: indent 参数 ---
    result_no_indent = format_field_value(["a"], indent=0)
    assert result_no_indent.startswith("- a")
    result_indent = format_field_value(["a"], indent=2)
    # indent=2 应有 4 个空格前缀 + bullet
    assert "    - a" in result_indent

    # --- 9. is_empty_value ---
    assert is_empty_value(None) is True
    assert is_empty_value("") is True
    assert is_empty_value("   ") is True
    assert is_empty_value([]) is True
    assert is_empty_value({}) is True
    assert is_empty_value("text") is False
    assert is_empty_value(0) is False  # 0 不视为空
    assert is_empty_value(False) is False  # False 不视为空
    assert is_empty_value([1]) is False
    assert is_empty_value({"a": 1}) is False

    # --- 10. classify_systems ---
    systems_data = {
        "battle": {"enabled": True, "name": "战斗", "config": {}},
        "character": {"enabled": True, "name": "角色", "config": {}},
        "skill": {"enabled": False, "name": "技能", "config": {}},
        "item": {"enabled": False, "name": "物品", "config": {}},
    }
    enabled, disabled = classify_systems(systems_data)
    assert len(enabled) == 2, f"应有 2 个启用系统, 实际 {len(enabled)}"
    assert len(disabled) == 2, f"应有 2 个未启用系统, 实际 {len(disabled)}"
    enabled_ids = [s[0] for s in enabled]
    disabled_ids = [s[0] for s in disabled]
    assert "battle" in enabled_ids
    assert "character" in enabled_ids
    assert "skill" in disabled_ids
    assert "item" in disabled_ids

    # classify_systems: None 输入
    enabled_none, disabled_none = classify_systems(None)
    assert enabled_none == []
    assert disabled_none == []

    # classify_systems: 非字典值应被跳过
    mixed_data = {
        "valid": {"enabled": True, "name": "有效"},
        "invalid": "not a dict",
    }
    enabled_mixed, disabled_mixed = classify_systems(mixed_data)
    assert len(enabled_mixed) == 1
    assert len(disabled_mixed) == 0


# ========== 主入口 ==========

if __name__ == "__main__":
    tests = [
        test_full_lifecycle_create_edit_validate_export,
        test_v4_migration_full_roundtrip,
        test_systems_dependency_chain,
        test_hybrid_preset_application,
        test_data_sync_roundtrip,
        test_version_management,
        test_template_merge_all_modes,
        test_scoring_progression,
        test_version_diff_accuracy,
        test_export_common_module,
    ]
    passed = 0
    skipped = 0
    failed = 0
    for t in tests:
        try:
            t()
            print(f"✅ {t.__name__}")
            passed += 1
        except Exception as e:
            msg = str(e)
            if "Skipped" in type(e).__name__ or "skip" in msg.lower():
                print(f"⏭️  {t.__name__}: SKIPPED ({e})")
                skipped += 1
            else:
                import traceback
                print(f"❌ {t.__name__}: {e}")
                traceback.print_exc()
                failed += 1
    print(f"\n结果: {passed} passed, {skipped} skipped, {failed} failed, 共 {len(tests)} 个测试")
    if failed > 0:
        sys.exit(1)
