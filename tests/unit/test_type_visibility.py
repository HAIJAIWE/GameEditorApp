"""测试「显示类型」控制机制

覆盖:
  - TabManager.is_type_allowed 优先级（策划书上下文 > visible_types 配置 > 全部）
  - TypeVisibilityDialog.result_types 三种情况（全勾=None / 部分勾=list / 全不勾=[]）
  - HomeWidget 数据概览卡片按 visible_types 过滤（91 类型 → 只显示勾选的）
"""
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "src"))

os_environ = None  # noqa: F841 (占位，见下方 conftest 约定)

from ui.tab_manager import TabManager  # noqa: E402


class _FakeConfig:
    visible_types = None


class _FakeMW:
    def __init__(self):
        self.config = _FakeConfig()


@pytest.fixture
def tab_mgr():
    return TabManager(_FakeMW())


# ── TabManager.is_type_allowed ──

def test_no_filter_shows_all(tab_mgr):
    """默认无任何配置 → 全部类型可显示"""
    assert tab_mgr.is_type_allowed("role") is True
    assert tab_mgr.is_type_allowed("moba_hero") is True


def test_visible_types_config_filters(tab_mgr):
    """配置 visible_types 后只显示勾选的类型"""
    tab_mgr._mw.config.visible_types = ["role", "skill"]
    assert tab_mgr.is_type_allowed("role") is True
    assert tab_mgr.is_type_allowed("skill") is True
    assert tab_mgr.is_type_allowed("monster") is False
    assert tab_mgr.is_type_allowed("moba_hero") is False


def test_ceshu_context_takes_priority(tab_mgr):
    """策划书上下文过滤优先于 visible_types 配置"""
    tab_mgr._mw.config.visible_types = ["role"]
    tab_mgr.set_ceshu_context({"monster", "equip"})
    assert tab_mgr.is_type_allowed("monster") is True
    assert tab_mgr.is_type_allowed("equip") is True
    assert tab_mgr.is_type_allowed("role") is False  # 配置被策划书覆盖
    # 清除策划书上下文 → 恢复配置过滤
    tab_mgr.clear_ceshu_context()
    assert tab_mgr.is_type_allowed("role") is True
    assert tab_mgr.is_type_allowed("monster") is False


def test_empty_ceshu_context_hides_all(tab_mgr):
    """策划书上下文为空集合 → 所有类型隐藏"""
    tab_mgr.set_ceshu_context(set())
    assert tab_mgr.is_type_allowed("role") is False
    tab_mgr.clear_ceshu_context()


# ── TypeVisibilityDialog.result_types ──

@pytest.fixture(scope="module")
def qapp():
    import os
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    from PyQt6.QtWidgets import QApplication
    app = QApplication.instance() or QApplication([])
    yield app


class _TypeDef:
    def __init__(self, tid, name):
        self.id = tid
        self.name = name
        self.plural_key = tid + "s"
        self.color = "#4CAF50"


class _Schema:
    def __init__(self, types):
        self.types = types


def _make_dialog(current_types=None, n=3):
    from ui.dialogs.type_visibility_dialog import TypeVisibilityDialog
    schema = _Schema([_TypeDef(f"t{i}", f"类型{i}") for i in range(n)])
    return TypeVisibilityDialog(schema, current_types)


def test_dialog_all_checked_returns_none(qapp):
    """全部勾选 → result_types() 返回 None（=显示全部）"""
    dlg = _make_dialog(current_types=None, n=3)  # None → 默认全勾
    assert dlg.result_types() is None


def test_dialog_partial_checked_returns_list(qapp):
    """部分勾选 → 返回勾选列表"""
    dlg = _make_dialog(current_types=["t0", "t2"], n=3)
    assert dlg.result_types() == ["t0", "t2"]


def test_dialog_none_checked_returns_empty(qapp):
    """全不勾 → 返回 []（概览区隐藏全部）"""
    dlg = _make_dialog(current_types=["t0", "t1", "t2"], n=3)
    dlg._clear_all()
    assert dlg.result_types() == []


# ── HomeWidget 统计卡片过滤 ──

class _FakeDMConfig(_FakeConfig):
    def __init__(self, types):
        self.visible_types = None
        self._schema = _Schema(types)
        import tempfile
        self.config_dir = Path(tempfile.mkdtemp(prefix="type_vis_test_"))

    def get_type_schema(self):
        return self._schema


class _FakeDM:
    def __init__(self, types):
        self.config = _FakeDMConfig(types)
        self.data = {t.plural_key: [] for t in types}


def _build_home_widget(types, visible_types):

    from ui.widgets.home_widget import HomeWidget
    dm = _FakeDM(types)
    dm.config.visible_types = visible_types
    hw = HomeWidget(dm, parent=None)
    return hw, dm


def _count_stat_cards(hw):
    from PyQt6.QtWidgets import QFrame
    return len([w for w in hw.findChildren(QFrame) if w.objectName() == "statCard"])


def test_home_stats_all_types_shown(qapp):
    """未配置 → 全部类型都有统计卡片"""
    types = [_TypeDef(f"t{i}", f"类型{i}") for i in range(5)]
    hw, _ = _build_home_widget(types, None)
    assert _count_stat_cards(hw) == 5


def test_home_stats_filtered_by_visible_types(qapp):
    """配置 visible_types 后 → 只渲染勾选类型的卡片"""
    types = [_TypeDef(f"t{i}", f"类型{i}") for i in range(5)]
    hw, _ = _build_home_widget(types, ["t1", "t3"])
    assert _count_stat_cards(hw) == 2


def test_home_stats_hidden_all(qapp):
    """visible_types=[] → 概览区无卡片"""
    types = [_TypeDef(f"t{i}", f"类型{i}") for i in range(3)]
    hw, _ = _build_home_widget(types, [])
    assert _count_stat_cards(hw) == 0
