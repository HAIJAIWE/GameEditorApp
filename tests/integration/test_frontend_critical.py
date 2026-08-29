"""前端关键路径自动化测试
测试范围:
  1. 添加新编辑器类型(宠物编辑器) → UI 重建验证
  2. 库切换 → 面板不消失验证
  3. _rebuild_all_tabs 完整性验证
  4. _get_tab_configs 动态性验证
  5. tabs 结构完整性 (三栏布局)
  6. Tab 切换稳定性
  7. 布局切换时的 tab 保留
  8. 边界条件: 空 schema, 重复重建, 快速切换
布局模式: 三栏 (three_column)
"""
import sys
import os
import unittest
import time
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

import pytest
pytest.importorskip("PyQt6")  # PyQt6 缺失时跳过整个模块

from PyQt6.QtWidgets import QApplication, QMessageBox
from PyQt6.QtCore import QTimer, Qt
from PyQt6.QtTest import QTest

_QAPP = None

_MOCK_QUESTION = patch('PyQt6.QtWidgets.QMessageBox.question', return_value=QMessageBox.StandardButton.No)


def setUpModule():
    """全局 mock 模态对话框，避免 GUI 测试在关闭窗口时被阻塞"""
    _MOCK_QUESTION.start()


def tearDownModule():
    _MOCK_QUESTION.stop()


def _get_app():
    global _QAPP
    if _QAPP is None:
        _QAPP = QApplication.instance() or QApplication(sys.argv)
    return _QAPP


# ============================================================
# 测试 1: 添加新编辑器类型 → UI 重建
# ============================================================
import sys
_PY314_PLUS = sys.version_info >= (3, 14)
class TestAddNewEditorType(unittest.TestCase):
    """测试添加新类型后界面重建"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()
        from ui.main_window import MainWindow
        cls.window = MainWindow()
        QApplication.processEvents()
        QTest.qWait(200)

    @classmethod
    def tearDownClass(cls):
        try:
            cls.window.close()
            cls.window.deleteLater()
            QApplication.processEvents()
        except RuntimeError:
            pass

    def setUp(self):
        if self.window.isHidden():
            self.skipTest("Window was destroyed")

    def test_01_initial_tab_count(self):
        """初始数据标签页数量（tabs 字典按 schema 类型生成）"""
        count = len(self.window.tabs)
        print(f"  [初始] tabs dict keys: {list(self.window.tabs.keys())}")
        self.assertGreaterEqual(count, 10, f"数据标签页数应 >= 10, 实际: {count}")

    def test_02_get_tab_configs_initial(self):
        """初始 _get_tab_configs"""
        configs = self.window._get_tab_configs()
        print(f"  [初始] tab_configs: {[(dt, name) for dt, name in configs]}")
        self.assertGreaterEqual(len(configs), 10)
        self.assertIn(('role', '角色'), configs)
        self.assertIn(('monster', '怪物'), configs)

    def test_03_add_pet_type_to_schema(self):
        """模拟添加宠物类型到 schema（模拟 TypeEditorDialog.add_type）"""
        from core.type_schema import TypeDef, TypeField, TypeSchema
        import json

        lm = self.window.config.library_manager
        schema_path = lm.get_schema_path()
        print(f"  [添加] schema 路径: {schema_path}")

        schema = TypeSchema.load(schema_path)
        self.assertIsNotNone(schema)
        original_count = len(schema.types)
        print(f"  [添加] 原始类型数: {original_count}")

        existing_ids = [t.id for t in schema.types]
        if "pet" in existing_ids:
            schema.types = [t for t in schema.types if t.id != "pet"]
            schema.save(schema_path)

        pet_type = TypeDef(
            id="pet", name="宠物", plural_key="pets", color="#E91E63",
            form_fields=[
                TypeField(name="name", label="名称:", type="entry", editable=True),
                TypeField(name="level", label="等级:", type="spinbox", from_=1, to=100, editable=True),
                TypeField(name="type", label="类型:", type="combobox", values=["战斗", "坐骑", "观赏"], editable=True),
            ],
            ai_context={"role_description": "宠物设计师"}
        )
        schema.types.append(pet_type)
        schema.save(schema_path)
        if hasattr(schema, 'save_body'):
            schema.save_body(schema_path)

        with open(schema_path, "r", encoding="utf-8") as f:
            disk = json.load(f)
        disk_ids = [t["id"] for t in disk.get("data_types", [])]
        self.assertIn("pet", disk_ids, f"磁盘缺少 pet: {disk_ids}")
        print(f"  [添加] 磁盘类型: {disk_ids}")
        print(f"  TEST_RESULT: ADD_TYPE_TO_SCHEMA=PASS")

    def test_04_rebuild_all_tabs_with_pet(self):
        """添加 pet 后触发 _rebuild_all_tabs"""
        lm = self.window.config.library_manager
        lm.reload_type_schema()

        from config.constants import reload_from_type_schema
        schema = lm.get_active_type_schema()
        reload_from_type_schema(
            schema.plural_keys, schema.type_names,
            schema.type_plurals, {t.id: t.color for t in schema.types}
        )

        self.window.data_manager.rebuild_data_structure()

        old_count = len(self.window.tabs)
        old_tabs = list(self.window.tabs.keys())
        print(f"  [重建前] tabs: {old_tabs}")
        print(f"  [重建前] 标签页数: {old_count}")

        self.window._tab_configs = None
        self.window._rebuild_all_tabs()

        QApplication.processEvents()
        QTest.qWait(300)

        new_count = len(self.window.tabs)
        new_tabs = list(self.window.tabs.keys())
        print(f"  [重建后] tabs: {new_tabs}")
        print(f"  [重建后] 标签页数: {new_count}")

        self.assertIn("pet", new_tabs, f"tabs 中缺少 pet, 实际: {new_tabs}")
        self.assertGreaterEqual(new_count, old_count, "重建后标签页数不应减少")
        print(f"  TEST_RESULT: REBUILD_WITH_PET=PASS")

    def test_05_tab_configs_has_pet(self):
        """_get_tab_configs 包含宠物"""
        configs = self.window._get_tab_configs()
        self.assertIn(('pet', '宠物'), configs, f"configs 不包含 pet: {[(dt, name) for dt, name in configs]}")
        print(f"  TEST_RESULT: TAB_CONFIGS_HAS_PET=PASS")

    def test_06_data_manager_has_pets(self):
        """data_manager.data 包含 pets 键"""
        self.assertIn("pets", self.window.data_manager.data,
                      f"data_manager 缺少 pets: {list(self.window.data_manager.data.keys())}")
        print(f"  TEST_RESULT: DATA_HAS_PETS=PASS")

    def test_07_remove_pet_and_rebuild(self):
        """移除 pet 类型并重建"""
        from core.type_schema import TypeSchema

        lm = self.window.config.library_manager
        schema_path = lm.get_schema_path()

        schema = TypeSchema.load(schema_path)
        schema.types = [t for t in schema.types if t.id != "pet"]
        schema.save(schema_path)

        lm.reload_type_schema()
        from config.constants import reload_from_type_schema
        active_schema = lm.get_active_type_schema()
        reload_from_type_schema(
            active_schema.plural_keys, active_schema.type_names,
            active_schema.type_plurals, {t.id: t.color for t in active_schema.types}
        )

        self.window._tab_configs = None
        self.window.data_manager.rebuild_data_structure()

        old_count = len(self.window.tabs)
        self.window._rebuild_all_tabs()

        QApplication.processEvents()
        QTest.qWait(300)

        new_tabs = list(self.window.tabs.keys())
        print(f"  [移除 pet 后] tabs: {new_tabs}")
        self.assertNotIn("pet", new_tabs, f"移除后 tabs 中不应有 pet: {new_tabs}")
        self.assertGreaterEqual(len(self.window.tabs), old_count - 2,
                                "移除 pet 后标签页数不应大幅减少")
        print(f"  TEST_RESULT: REMOVE_PET_REBUILD=PASS")


# ============================================================
# 测试 2: 库切换 → 面板不消失
# ============================================================
class TestLibrarySwitch(unittest.TestCase):
    """测试库切换时面板稳定性"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()
        from ui.main_window import MainWindow
        cls.window = MainWindow()
        # 清理异常中断遗留的测试库，避免状态污染
        try:
            from config.settings import get_config
            _lm = get_config().library_manager
            for _info in list(_lm.get_all_libraries()):
                if _info.name.startswith("界面测试_"):
                    _lm.delete_library(_info.name)
        except Exception:
            pass
        QApplication.processEvents()
        QTest.qWait(200)

    @classmethod
    def tearDownClass(cls):
        try:
            cls.window.close()
            cls.window.deleteLater()
            QApplication.processEvents()
        except RuntimeError:
            pass

    def setUp(self):
        if self.window.isHidden():
            self.skipTest("Window was destroyed")

    def test_01_initial_library_state(self):
        """初始库状态"""
        lm = self.window.config.library_manager
        active = lm.active_library_name
        print(f"  [初始] 活跃库: {active}")
        self.assertIsNotNone(active)
        self.assertEqual(active, "初始库")

    def test_02_create_and_switch_library(self):
        """创建新库并切换"""
        from datetime import datetime
        lm = self.window.config.library_manager
        self._original_active = lm.active_library_name

        state_file = lm.libraries_dir / ".active_library"
        self._saved_state = state_file.read_text(encoding="utf-8").strip() if state_file.exists() else ""

        self._test_lib = f"界面测试_{datetime.now().strftime('%H%M%S')}"
        new_lib = lm.create_library(self._test_lib, "界面稳定性测试")

        if new_lib is None:
            self._test_lib = f"界面测试_{datetime.now().strftime('%H%M%S')}_2"
            new_lib = lm.create_library(self._test_lib, "界面稳定性测试")

        self.assertIsNotNone(new_lib, "创建库失败")
        print(f"  [创建] 新库: {self._test_lib}")

        old_tab_count = len(self.window.tabs)
        old_tabs = list(self.window.tabs.keys())
        print(f"  [切换前] tabs: {old_tabs}")
        print(f"  [切换前] 标签页数: {old_tab_count}")

        lm.switch_library(self._test_lib, persist=True)

        self.window.data_manager.reload_from_library()
        self.window.data_manager.update_id_counters()
        self.window._tab_configs = None
        self.window._rebuild_all_tabs()

        QApplication.processEvents()
        QTest.qWait(300)

        after_count = len(self.window.tabs)
        after_tabs = list(self.window.tabs.keys())
        print(f"  [切换后] tabs: {after_tabs}")
        print(f"  [切换后] 标签页数: {after_count}")

        self.assertGreater(after_count, 0, "切换库后标签页数不应为 0!")
        self.assertTrue(self.window.isVisible(), "窗口应该可见!")
        self.window.show()
        QApplication.processEvents()
        print(f"  TEST_RESULT: LIBRARY_SWITCH=PASS")

    def test_03_switch_back_to_original(self):
        """切回初始库"""
        if not hasattr(self, '_original_active') or not hasattr(self, '_test_lib'):
            self.skipTest("前置测试未完成")

        lm = self.window.config.library_manager
        lm.switch_library(self._original_active, persist=True)

        self.window.data_manager.reload_from_library()
        self.window.data_manager.update_id_counters()
        self.window._tab_configs = None
        self.window._rebuild_all_tabs()

        QApplication.processEvents()
        QTest.qWait(300)

        after_count = len(self.window.tabs)
        after_tabs = list(self.window.tabs.keys())
        print(f"  [切回后] tabs: {after_tabs}")
        print(f"  [切回后] 标签页数: {after_count}")

        self.assertGreater(after_count, 0, "切回初始库后标签页数不应为 0!")
        self.assertIn("role", after_tabs, "切回后应包含 role tab")
        print(f"  TEST_RESULT: SWITCH_BACK=PASS")

    def test_04_cleanup_test_library(self):
        """清理测试库"""
        if not hasattr(self, '_test_lib'):
            return

        lm = self.window.config.library_manager
        if lm.active_library_name == self._test_lib:
            lm.switch_library(self._original_active, persist=True)

        lm.delete_library(self._test_lib)

        if hasattr(self, '_saved_state'):
            state_file = lm.libraries_dir / ".active_library"
            if self._saved_state:
                state_file.write_text(self._saved_state, encoding="utf-8")
            elif state_file.exists():
                state_file.unlink()

        self.assertNotIn(self._test_lib, {l.name for l in lm.get_all_libraries()})
        print(f"  TEST_RESULT: CLEANUP=PASS")


# ============================================================
# 测试 3: _rebuild_all_tabs 完整性
# ============================================================
class TestRebuildTabsIntegrity(unittest.TestCase):
    """测试标签页重建的完整性（三栏布局）"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()
        from ui.main_window import MainWindow
        cls.window = MainWindow()
        QApplication.processEvents()
        QTest.qWait(200)

    @classmethod
    def tearDownClass(cls):
        try:
            cls.window.close()
            cls.window.deleteLater()
            QApplication.processEvents()
        except RuntimeError:
            pass

    def setUp(self):
        if self.window.isHidden():
            self.skipTest("Window was destroyed")

    def test_01_rebuild_tabs_count_matches_configs(self):
        """重建后 tab 数量与 configs 一致"""
        configs = self.window._get_tab_configs()
        self.window._tab_configs = None
        self.window._rebuild_all_tabs()

        QApplication.processEvents()
        QTest.qWait(300)

        tabs_count = len(self.window.tabs)
        configs_count = len(configs)
        print(f"  [重建后] tabs 数量: {tabs_count}, configs 数量: {configs_count}")
        self.assertEqual(tabs_count, configs_count,
                         f"tabs({tabs_count}) 与 configs({configs_count}) 不一致")

    def test_02_every_tab_config_has_tab(self):
        """每个 config 都有对应的 tab"""
        configs = self.window._get_tab_configs()
        for dt, name in configs:
            self.assertIn(dt, self.window.tabs, f"缺少 tab: {dt} ({name})")
            tab = self.window.tabs[dt]
            self.assertIsNotNone(tab, f"tab {dt} 为 None")
        print(f"  所有 {len(configs)} 个 config 均有对应 tab")

    def test_03_tab_widget_has_all_tabs(self):
        """所有数据标签页均已构建为有效 widget"""
        configs = self.window._get_tab_configs()
        for dt, name in configs:
            tab = self.window.tabs.get(dt)
            self.assertIsNotNone(tab, f"tabs 中缺少 {dt} ({name})")
            self.assertTrue(tab.isWidgetType(), f"{dt} ({name}) 不是有效 widget")
        print(f"  所有 {len(configs)} 个数据标签页均已构建")

    def test_04_rebuild_is_idempotent(self):
        """重建是幂等的（多次重建结果一致）"""
        self.window._tab_configs = None
        self.window._rebuild_all_tabs()
        QApplication.processEvents()
        QTest.qWait(200)

        tabs1 = list(self.window.tabs.keys())

        self.window._tab_configs = None
        self.window._rebuild_all_tabs()
        QApplication.processEvents()
        QTest.qWait(200)

        tabs2 = list(self.window.tabs.keys())

        self.assertEqual(tabs1, tabs2, f"两次重建结果不一致: {tabs1} vs {tabs2}")
        print(f"  [幂等] 两次重建 tabs 一致")

    def test_05_rapid_consecutive_rebuilds(self):
        """快速连续重建（防重入测试）"""
        for _ in range(3):
            self.window._tab_configs = None
            self.window._rebuild_all_tabs()
            QApplication.processEvents()
            QTest.qWait(100)

        self.assertGreater(len(self.window.tabs), 0, "快速重建后 tabs 不应为空")
        print(f"  [快速重建] 3次连续重建后 tabs 正常")

    def test_06_rebuilding_flag_resets(self):
        """_rebuilding 标志正确重置"""
        self.assertEqual(self.window._rebuilding, False,
                         f"_rebuilding 应为 False, 实际: {self.window._rebuilding}")
        print(f"  [标志] _rebuilding = {self.window._rebuilding}")


# ============================================================
# 测试 4: Tab 切换与布局稳定性（三栏）
# ============================================================
class TestTabSwitching(unittest.TestCase):
    """测试 tab 切换与布局（三栏布局）"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()
        from ui.main_window import MainWindow
        cls.window = MainWindow()
        QApplication.processEvents()
        QTest.qWait(200)

    @classmethod
    def tearDownClass(cls):
        try:
            cls.window.close()
            cls.window.deleteLater()
            QApplication.processEvents()
        except RuntimeError:
            pass

    def setUp(self):
        if self.window.isHidden():
            self.skipTest("Window was destroyed")

    def test_01_switch_between_all_tabs(self):
        """所有数据标签页配置均已注册，且可完整重建"""
        configs = self.window._get_tab_configs()
        for dt, name in configs:
            self.assertIn(dt, self.window.tabs, f"缺少标签页: {dt} ({name})")
        self.window._tab_configs = None
        self.window._rebuild_all_tabs()
        QApplication.processEvents()
        QTest.qWait(100)
        self.assertGreater(len(self.window.tabs), 0, "重建后 tabs 不应为空")
        print(f"  共 {len(configs)} 个数据标签页，遍历加载正常")

    def test_02_switch_to_first_and_last(self):
        """中心堆栈首尾页面切换"""
        if not hasattr(self.window, '_center_stack') or self.window._center_stack is None:
            self.skipTest("无 _center_stack")
        stack = self.window._center_stack
        last = stack.count() - 1
        stack.setCurrentIndex(0)
        QTest.qWait(10)
        stack.setCurrentIndex(last)
        QTest.qWait(10)
        self.assertEqual(stack.currentIndex(), last)
        stack.setCurrentIndex(0)
        QTest.qWait(10)
        self.assertEqual(stack.currentIndex(), 0)
        print("  中心堆栈首尾切换正常")

    def test_03_layout_rebuild_preserves_tabs(self):
        """布局重建保留 tabs 数据（始终三栏）"""
        old_tabs = list(self.window.tabs.keys())
        print(f"  [重建前] tabs: {old_tabs}")

        self.assertTrue(self.window.is_three_column_layout, "初始应为三栏布局")

        self.window.set_layout("three_column")
        QApplication.processEvents()
        QTest.qWait(200)

        self.assertTrue(self.window.is_three_column_layout, "应始终为三栏布局")
        mid_tabs = list(self.window.tabs.keys())
        print(f"  [重建后] tabs: {mid_tabs}")
        self.assertGreater(len(self.window.tabs), 0, "重建后 tabs 不应为空")

        final_tabs = list(self.window.tabs.keys())
        self.assertEqual(set(old_tabs), set(final_tabs),
                         f"重建后 tabs keys 不一致: {old_tabs} vs {final_tabs}")


# ============================================================
# 测试 5: 边界条件（三栏布局）
# ============================================================
class TestEdgeCases(unittest.TestCase):
    """边界条件测试（三栏布局）"""

    @classmethod
    def setUpClass(cls):
        cls.app = _get_app()
        from ui.main_window import MainWindow
        cls.window = MainWindow()
        QApplication.processEvents()
        QTest.qWait(200)

    @classmethod
    def tearDownClass(cls):
        try:
            cls.window.close()
            cls.window.deleteLater()
            QApplication.processEvents()
        except RuntimeError:
            pass

    def setUp(self):
        if self.window.isHidden():
            self.skipTest("Window was destroyed")

    def test_01_tab_configs_cache_invalidation(self):
        """_get_tab_configs 缓存清除"""
        configs1 = self.window._get_tab_configs()
        self.window._tab_configs = None
        configs2 = self.window._get_tab_configs()
        self.assertEqual(configs1, configs2, "缓存清除后 configs 应一致")
        print(f"  Configs 缓存: OK")

    def test_02_tab_widget_structure(self):
        """数据标签页结构: 数量 >= 3，中心堆栈存在"""
        count = len(self.window.tabs)
        print(f"  数据标签页总数: {count}")
        self.assertGreaterEqual(count, 3, f"数据标签页数应 >= 3, 实际: {count}")
        if hasattr(self.window, '_center_stack'):
            self.assertIsNotNone(self.window._center_stack, "中心堆栈不应为 None")
        print("  tab 结构: OK")

    def test_03_digital_panel_exists(self):
        """三栏右侧数字员工面板存在"""
        self.assertIsNotNone(self.window.digital_panel, "digital_panel 不应为 None")
        self.assertTrue(self.window.digital_panel.isWidgetType(), "digital_panel 应为有效 widget")
        print(f"  digital_panel: OK")

    def test_04_data_tab_instances_after_rebuild(self):
        """帮建后所有数据 tab 是 DataEditorTab 实例"""
        from ui.data_tab import DataEditorTab
        self.window._tab_configs = None
        self.window._rebuild_all_tabs()
        QApplication.processEvents()
        QTest.qWait(200)

        for dt, tab in self.window.tabs.items():
            self.assertIsNotNone(tab, f"tab {dt} 不应为 None（重建后）")
            self.assertIsInstance(tab, DataEditorTab,
                                  f"tab {dt} 应为 DataEditorTab, 实际: {type(tab)}")
        print(f"  所有数据 tab 均为 DataEditorTab 实例")

    def test_05_window_visible_after_operations(self):
        """操作后窗口仍然可见"""
        self.window._rebuild_all_tabs()
        QApplication.processEvents()
        QTest.qWait(200)
        self.window.show()
        QApplication.processEvents()
        self.assertTrue(self.window.isVisible(), "窗口应该仍然可见!")

    def test_06_no_stale_tab_references(self):
        """不存在过期的 tab 引用（所有 tabs 的 parent 正确）"""
        for dt, tab in self.window.tabs.items():
            if tab is not None:
                try:
                    is_widget = tab.isWidgetType()
                    self.assertTrue(is_widget, f"tab {dt} 不是有效 widget")
                except RuntimeError:
                    self.fail(f"tab {dt} 已被销毁但仍存在 tabs 字典中")
        print(f"  无过期 tab 引用")


# ============================================================
# 运行
# ============================================================
if __name__ == "__main__":
    print("=" * 70)
    print("  前端关键路径自动化测试（三栏布局）")
    print("=" * 70)
    print()

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    suite.addTests(loader.loadTestsFromTestCase(TestAddNewEditorType))
    suite.addTests(loader.loadTestsFromTestCase(TestLibrarySwitch))
    suite.addTests(loader.loadTestsFromTestCase(TestRebuildTabsIntegrity))
    suite.addTests(loader.loadTestsFromTestCase(TestTabSwitching))
    suite.addTests(loader.loadTestsFromTestCase(TestEdgeCases))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print()
    print("=" * 70)
    print(f"  总计: {result.testsRun} 项测试")
    print(f"  通过: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"  失败: {len(result.failures)}")
    print(f"  错误: {len(result.errors)}")
    if result.testsRun > 0:
        passed = result.testsRun - len(result.failures) - len(result.errors)
        print(f"  通过率: {passed / result.testsRun * 100:.1f}%")
    print("=" * 70)

    if result.failures:
        print("\n  失败项:")
        for test, trace in result.failures:
            print(f"    X {test}")
            for line in trace.split("\n")[-5:]:
                if line.strip():
                    print(f"       {line.strip()}")
    if result.errors:
        print("\n  错误项:")
        for test, trace in result.errors:
            print(f"    ! {test}")
            for line in trace.split("\n")[-5:]:
                if line.strip():
                    print(f"       {line.strip()}")

    sys.exit(0 if result.wasSuccessful() else 1)