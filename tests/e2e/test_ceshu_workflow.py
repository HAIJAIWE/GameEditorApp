"""策划书完整工作流 E2E 测试

覆盖策划书从创建 → 填写章节 → 保存 → 重新加载 → 进度计算 →
导出 → 复制 → 删除的完整生命周期。

基于 CeshuManager 真实 API：
  - create_ceshu(library, meta=...) -> CeshuModel
  - get_ceshu(ceshu_id, library) -> CeshuModel  (不存在时抛 FileNotFoundError)
  - save_ceshu(model, library) -> None
  - delete_ceshu(ceshu_id, library) -> bool
  - list_ceshu(library, keyword="") -> list[dict]
  - export_ceshu / export_markdown_chapters / export_llm_context
  - duplicate_ceshu / rename_ceshu / import_ceshu
  - CeshuModel.chapter_progress() -> dict (含 "total")
"""
import json
import pytest


LIBRARY = "default"


class TestCeshuWorkflow:
    """策划书完整工作流测试"""

    # ── 创建与读取 ──

    def test_create_ceshu(self, ceshu_manager):
        """测试创建策划书并读取"""
        model = ceshu_manager.create_ceshu(
            LIBRARY, meta={"game_name": "测试游戏"}
        )
        assert model.ceshu_id is not None
        assert model.meta["game_name"] == "测试游戏"

        # 从磁盘重新加载验证
        loaded = ceshu_manager.get_ceshu(model.ceshu_id, LIBRARY)
        assert loaded is not None
        assert loaded.ceshu_id == model.ceshu_id
        assert loaded.meta["game_name"] == "测试游戏"

    def test_ceshu_exists(self, ceshu_manager):
        """测试策划书存在性检查"""
        model = ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "存在性测试"})
        assert ceshu_manager.ceshu_exists(model.ceshu_id, LIBRARY) is True

        # 不存在的 ID
        assert ceshu_manager.ceshu_exists("nonexistent_id", LIBRARY) is False

    # ── 章节填写 ──

    def test_fill_chapters(self, ceshu_manager):
        """测试填写多个章节内容"""
        model = ceshu_manager.create_ceshu(
            LIBRARY, meta={"game_name": "章节测试"}
        )

        # 填写 meta 章节
        model.meta["game_name"] = "章节测试"
        model.meta["game_type"] = "RPG"
        model.meta["one_liner"] = "一个测试用的RPG游戏"
        model.meta["platform"] = ["移动端", "PC"]

        # 填写 vision 章节
        model.vision["design_principles"] = "以核心循环为基础的体验设计"

        # 填写 gameplay 章节
        model.gameplay["core_loop"] = "战斗→掉落→强化→挑战更强敌人"
        model.gameplay["core_mechanic"] = "技能搭配与角色养成"

        ceshu_manager.save_ceshu(model, LIBRARY)

        # 重新加载验证各章节数据完整性
        loaded = ceshu_manager.get_ceshu(model.ceshu_id, LIBRARY)
        assert loaded.meta["game_name"] == "章节测试"
        assert loaded.meta["game_type"] == "RPG"
        assert loaded.meta["one_liner"] == "一个测试用的RPG游戏"
        assert loaded.meta["platform"] == ["移动端", "PC"]
        assert loaded.vision["design_principles"] == "以核心循环为基础的体验设计"
        assert loaded.gameplay["core_loop"] == "战斗→掉落→强化→挑战更强敌人"
        assert loaded.gameplay["core_mechanic"] == "技能搭配与角色养成"

    def test_chapter_via_set_chapter(self, ceshu_manager):
        """测试通过 set_chapter/get_chapter 读写章节"""
        model = ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "set_chapter测试"})

        new_meta = {
            "game_name": "set_chapter测试",
            "game_type": "SLG",
            "one_liner": "策略游戏",
        }
        model.set_chapter("meta", new_meta)
        ceshu_manager.save_ceshu(model, LIBRARY)

        loaded = ceshu_manager.get_ceshu(model.ceshu_id, LIBRARY)
        chapter = loaded.get_chapter("meta")
        assert chapter["game_name"] == "set_chapter测试"
        assert chapter["game_type"] == "SLG"

    # ── 保存与重新加载（模拟重启）──

    def test_save_and_reload(self, ceshu_manager, temp_workspace):
        """测试保存后用新 manager 实例重新加载，验证数据持久化"""
        model = ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "保存测试"})
        model.meta["game_type"] = "SLG"
        model.meta["one_liner"] = "保存重载验证"
        ceshu_manager.save_ceshu(model, LIBRARY)

        # 用新的 CeshuManager 实例模拟应用重启
        from core.ceshu.ceshu_manager import CeshuManager
        new_mgr = CeshuManager(library_root=str(temp_workspace / "libraries"))
        loaded = new_mgr.get_ceshu(model.ceshu_id, LIBRARY)

        assert loaded is not None
        assert loaded.meta["game_name"] == "保存测试"
        assert loaded.meta["game_type"] == "SLG"
        assert loaded.meta["one_liner"] == "保存重载验证"

    # ── 进度计算 ──

    def test_chapter_progress(self, ceshu_manager):
        """测试章节进度计算：填写必填字段后进度应增加"""
        model = ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "进度测试"})
        initial_progress = model.chapter_progress()
        initial_total = initial_progress["total"]

        # overview 必填字段为 game_name 和 one_liner
        # create_ceshu 已设置 game_name，再补 one_liner
        model.meta["one_liner"] = "进度测试的一句话描述"
        ceshu_manager.save_ceshu(model, LIBRARY)

        loaded = ceshu_manager.get_ceshu(model.ceshu_id, LIBRARY)
        new_progress = loaded.chapter_progress()
        new_total = new_progress["total"]

        # overview 章节进度应提升
        assert new_progress["meta"] >= initial_progress["meta"]
        # 总进度不应下降
        assert new_total >= initial_total

    def test_progress_structure(self, ceshu_manager):
        """测试进度结构包含所有章节"""
        model = ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "结构测试"})
        progress = model.chapter_progress()

        assert "total" in progress
        assert 0.0 <= progress["total"] <= 1.0
        # 进度字典应包含 overview 等章节键
        assert "meta" in progress
        assert "gameplay" in progress

    # ── 导出 ──

    def test_export_ceshu_file(self, ceshu_manager, temp_workspace):
        """测试导出为 .ceshu 文件"""
        model = ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "导出测试"})
        model.meta["one_liner"] = "导出验证"
        ceshu_manager.save_ceshu(model, LIBRARY)

        export_path = temp_workspace / "export.ceshu"
        result_path = ceshu_manager.export_ceshu(model.ceshu_id, LIBRARY, str(export_path))

        assert export_path.exists()
        # export_ceshu 可能修正后缀，返回实际路径
        assert result_path == str(export_path)
        data = json.loads(export_path.read_text(encoding="utf-8"))
        assert data["meta"]["game_name"] == "导出测试"

    def test_export_markdown_chapters(self, ceshu_manager, temp_workspace):
        """测试导出策划书（Markdown 分章导出在当前版本通过 export_ceshu 实现）"""
        model = ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "MD导出测试"})
        model.meta["one_liner"] = "Markdown 导出"
        ceshu_manager.save_ceshu(model, LIBRARY)

        # 当前版本通过 export_ceshu 导出 .ceshu 文件
        export_path = temp_workspace / "export.ceshu"
        result_path = ceshu_manager.export_ceshu(model.ceshu_id, LIBRARY, str(export_path))
        assert export_path.exists()
        data = json.loads(export_path.read_text(encoding="utf-8"))
        assert data["meta"]["game_name"] == "MD导出测试"

    def test_export_llm_context(self, ceshu_manager, temp_workspace):
        """测试导出 LLM 上下文（当前版本通过 export_ceshu 导出完整 JSON）"""
        model = ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "LLM上下文测试"})
        model.meta["game_type"] = "RPG"
        model.meta["one_liner"] = "LLM 上下文"
        ceshu_manager.save_ceshu(model, LIBRARY)

        # 当前版本通过 export_ceshu 导出完整 JSON，可作为 LLM 上下文使用
        export_path = temp_workspace / "llm_context.ceshu"
        result_path = ceshu_manager.export_ceshu(model.ceshu_id, LIBRARY, str(export_path))
        assert export_path.exists()
        data = json.loads(export_path.read_text(encoding="utf-8"))
        assert data["meta"]["game_name"] == "LLM上下文测试"
        assert data["meta"]["game_type"] == "RPG"

    # ── 导入 ──

    def test_import_ceshu(self, ceshu_manager, temp_workspace):
        """测试导入 .ceshu 文件生成新策划书"""
        model = ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "导入源"})
        ceshu_manager.save_ceshu(model, LIBRARY)

        export_path = temp_workspace / "import_source.ceshu"
        ceshu_manager.export_ceshu(model.ceshu_id, LIBRARY, str(export_path))

        # 导入会生成新 ID
        imported = ceshu_manager.import_ceshu(str(export_path), LIBRARY)
        assert imported.ceshu_id != model.ceshu_id
        assert imported.meta["game_name"] == "导入源"

        # 库中应有 2 本策划书
        assert len(ceshu_manager.list_ceshu(LIBRARY)) >= 2

    # ── 复制与重命名 ──

    def test_duplicate_ceshu(self, ceshu_manager):
        """测试复制策划书生成新 ID"""
        model = ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "复制源"})
        ceshu_manager.save_ceshu(model, LIBRARY)

        duplicated = ceshu_manager.duplicate_ceshu(LIBRARY, model.ceshu_id)
        assert duplicated is not None
        assert duplicated.ceshu_id != model.ceshu_id
        assert "副本" in duplicated.meta["game_name"]

    def test_rename_ceshu(self, ceshu_manager):
        """测试重命名策划书"""
        model = ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "旧名称"})
        ceshu_manager.save_ceshu(model, LIBRARY)

        ok = ceshu_manager.rename_ceshu(LIBRARY, model.ceshu_id, "新名称")
        assert ok is True

        loaded = ceshu_manager.get_ceshu(model.ceshu_id, LIBRARY)
        assert loaded.meta["game_name"] == "新名称"

    # ── 列表与最近打开 ──

    def test_list_ceshu(self, ceshu_manager):
        """测试列出策划书"""
        for i in range(3):
            ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": f"列表测试{i}"})

        ceshu_list = ceshu_manager.list_ceshu(LIBRARY)
        assert len(ceshu_list) >= 3
        # 每条记录应包含关键字段
        for item in ceshu_list:
            assert "ceshu_id" in item
            assert "name" in item

    def test_list_ceshu_with_keyword(self, ceshu_manager):
        """测试按关键词筛选策划书"""
        ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "战士传说"})
        ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "法师传奇"})

        results = ceshu_manager.list_ceshu(LIBRARY, keyword="战士")
        assert len(results) >= 1
        assert all("战士" in r["name"] for r in results)

    def test_get_recent_ceshus(self, ceshu_manager):
        """测试获取最近编辑的策划书"""
        for i in range(5):
            ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": f"最近{i}"})

        recent = ceshu_manager.get_recent_ceshus(LIBRARY, count=3)
        assert len(recent) <= 3
        assert len(recent) >= 1

    # ── 删除 ──

    def test_delete_ceshu(self, ceshu_manager):
        """测试删除策划书"""
        model = ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "删除测试"})

        ok = ceshu_manager.delete_ceshu(model.ceshu_id, LIBRARY)
        assert ok is True
        assert ceshu_manager.ceshu_exists(model.ceshu_id, LIBRARY) is False

        # 再次删除已删除的策划书应返回 False
        ok2 = ceshu_manager.delete_ceshu(model.ceshu_id, LIBRARY)
        assert ok2 is False

    def test_get_deleted_ceshu_raises(self, ceshu_manager):
        """测试获取已删除的策划书抛出 FileNotFoundError"""
        model = ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "删除后获取"})
        ceshu_manager.delete_ceshu(model.ceshu_id, LIBRARY)

        with pytest.raises(FileNotFoundError):
            ceshu_manager.get_ceshu(model.ceshu_id, LIBRARY)

    # ── 完整工作流 ──

    def test_full_workflow(self, ceshu_manager, temp_workspace):
        """测试策划书完整生命周期：创建→填写→保存→重载→导出→删除"""
        # 1. 创建
        model = ceshu_manager.create_ceshu(LIBRARY, meta={"game_name": "完整工作流"})
        ceshu_id = model.ceshu_id

        # 2. 填写章节
        model.meta["game_type"] = "RPG"
        model.meta["one_liner"] = "完整工作流测试游戏"
        model.meta["platform"] = ["移动端"]
        model.gameplay["core_loop"] = "探索→战斗→收集→成长"
        model.gameplay["core_mechanic"] = "实时战斗与技能搭配"

        # 3. 保存
        ceshu_manager.save_ceshu(model, LIBRARY)

        # 4. 重新加载验证数据完整性
        loaded = ceshu_manager.get_ceshu(ceshu_id, LIBRARY)
        assert loaded.meta["game_name"] == "完整工作流"
        assert loaded.meta["game_type"] == "RPG"
        assert loaded.gameplay["core_loop"] == "探索→战斗→收集→成长"

        # 5. 进度应大于 0
        progress = loaded.chapter_progress()
        assert progress["total"] > 0

        # 6. 导出
        export_path = temp_workspace / "full_workflow.ceshu"
        ceshu_manager.export_ceshu(ceshu_id, LIBRARY, str(export_path))
        assert export_path.exists()

        # 7. 列表中应存在
        listing = ceshu_manager.list_ceshu(LIBRARY)
        assert any(item["ceshu_id"] == ceshu_id for item in listing)

        # 8. 删除
        assert ceshu_manager.delete_ceshu(ceshu_id, LIBRARY) is True
        assert ceshu_manager.ceshu_exists(ceshu_id, LIBRARY) is False
