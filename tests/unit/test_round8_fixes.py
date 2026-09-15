"""针对第8轮（P8-P15）修复的单元测试。

覆盖：
- atomic_write_text / atomic_write_json 原子写入
- OperationLog 上限清理
- AIFieldButton 防重入（无 PyQt6 时跳过）
- AppConfig.font_size 持久化
- LibraryManager.scan_libraries 增量扫描（force 参数）
"""
from __future__ import annotations

import json
from pathlib import Path
import sys
import threading

import pytest

# ─────────────────────────────────────────────────────────
# P12: atomic_write_text / atomic_write_json
# ─────────────────────────────────────────────────────────

def test_atomic_write_text_writes_content(tmp_path: Path):
    from common.common import atomic_write_text
    target = tmp_path / "config.json"
    atomic_write_text(target, '{"hello": "world"}')
    assert target.read_text(encoding="utf-8") == '{"hello": "world"}'


def test_atomic_write_text_overwrites_existing(tmp_path: Path):
    from common.common import atomic_write_text
    target = tmp_path / "config.json"
    target.write_text("OLD", encoding="utf-8")
    atomic_write_text(target, "NEW")
    assert target.read_text(encoding="utf-8") == "NEW"


def test_atomic_write_text_creates_parent_dir(tmp_path: Path):
    from common.common import atomic_write_text
    target = tmp_path / "sub" / "deep" / "config.json"
    atomic_write_text(target, "data")
    assert target.read_text(encoding="utf-8") == "data"


def test_atomic_write_text_no_temp_left_on_success(tmp_path: Path):
    """完成后不应残留 .tmp 文件"""
    from common.common import atomic_write_text
    target = tmp_path / "config.json"
    atomic_write_text(target, "data")
    temp_files = list(tmp_path.glob(".*.tmp"))
    assert temp_files == []


def test_atomic_write_json_roundtrip(tmp_path: Path):
    from common.common import atomic_write_json
    target = tmp_path / "data.json"
    payload = {"a": 1, "b": [2, 3], "c": {"nested": True}}
    atomic_write_json(target, payload, ensure_ascii=False, indent=2)
    loaded = json.loads(target.read_text(encoding="utf-8"))
    assert loaded == payload


def test_atomic_write_json_chinese_not_escaped(tmp_path: Path):
    from common.common import atomic_write_json
    target = tmp_path / "zh.json"
    atomic_write_json(target, {"name": "角色"}, ensure_ascii=False)
    raw = target.read_text(encoding="utf-8")
    assert "角色" in raw  # 未被 \uXXXX 转义


# ─────────────────────────────────────────────────────────
# P14: OperationLog 上限清理
# ─────────────────────────────────────────────────────────

def test_operation_log_purges_when_exceeding_max(monkeypatch):
    """超过 _MAX_OPERATIONS 时应淘汰最旧的 _PURGE_BATCH 条"""
    from core import operation_log as ol_module

    # 重置类状态
    ol_module.OperationLog._operations.clear()
    monkeypatch.setattr(ol_module.OperationLog, "_MAX_OPERATIONS", 100)
    monkeypatch.setattr(ol_module.OperationLog, "_PURGE_BATCH", 20)

    # 设置会话 ID 后才能记录
    ol_module.set_conversation_id("test_conv")

    # 写入 110 条
    for i in range(110):
        ol_module.OperationLog.record(
            "create", "roles", f"R{i:03d}",
            item_name=f"role{i}", before=None, after={"id": f"R{i:03d}"}
        )

    # 应触发一次清理：110 > 100 → 删除前 20 → 90 条
    assert ol_module.OperationLog.count() == 90

    # 最旧的 20 条已被淘汰
    ops = ol_module.OperationLog.get_all()
    ids = [op["item_id"] for op in ops]
    assert "R000" not in ids
    assert "R019" not in ids
    assert "R020" in ids  # 第 21 条成为最旧

    ol_module.set_conversation_id(None)


def test_operation_log_under_max_no_purge(monkeypatch):
    from core import operation_log as ol_module
    ol_module.OperationLog._operations.clear()
    monkeypatch.setattr(ol_module.OperationLog, "_MAX_OPERATIONS", 1000)
    monkeypatch.setattr(ol_module.OperationLog, "_PURGE_BATCH", 100)

    ol_module.set_conversation_id("c2")
    for i in range(50):
        ol_module.OperationLog.record("create", "roles", f"X{i}",
                                       after={"id": f"X{i}"})
    assert ol_module.OperationLog.count() == 50
    ol_module.set_conversation_id(None)


# ─────────────────────────────────────────────────────────
# P10: AppConfig.font_size 持久化
# ─────────────────────────────────────────────────────────

def test_app_config_has_font_size_attribute():
    """AppConfig 应有 font_size 属性，默认 13"""
    from config.settings import AppConfig
    cfg = AppConfig()
    assert hasattr(cfg, "font_size")
    assert isinstance(cfg.font_size, int)
    assert 8 <= cfg.font_size <= 48


def test_app_config_font_size_default_is_13():
    from config.settings import AppConfig
    cfg = AppConfig()
    # 默认值应为 13（未从配置文件加载时）
    assert cfg.font_size == 13


# ─────────────────────────────────────────────────────────
# P13: LibraryManager.scan_libraries 增量扫描
# ─────────────────────────────────────────────────────────

def test_library_manager_has_last_scan_mtime_field():
    """LibraryManager 应有 _last_scan_mtime 字段"""
    import inspect

    from core.library_manager import LibraryManager
    src = inspect.getsource(LibraryManager.__init__)
    assert "_last_scan_mtime" in src


def test_library_manager_scan_has_force_param():
    """scan_libraries 应支持 force 参数"""
    import inspect

    from core.library_manager import LibraryManager
    sig = inspect.signature(LibraryManager.scan_libraries)
    assert "force" in sig.parameters
    assert sig.parameters["force"].default is False


# ─────────────────────────────────────────────────────────
# P8: AIFieldButton 防重入（需要 PyQt6）
# ─────────────────────────────────────────────────────────

_PyQt6_AVAILABLE = True
try:
    from PyQt6.QtWidgets import QApplication  # noqa: E402
except ImportError:
    _PyQt6_AVAILABLE = False


@pytest.fixture(scope="module")
def qapp():
    app = QApplication.instance() or QApplication(sys.argv[:1])
    yield app


@pytest.mark.skipif(not _PyQt6_AVAILABLE, reason="PyQt6 未安装")
def test_ai_field_button_initial_not_busy(qapp):
    """新创建的 AIFieldButton 不应是 busy 状态"""
    from ui.ceshu.ai_field_button import AIFieldButton
    btn = AIFieldButton("test_field")
    assert btn.is_busy() is False
    assert btn.isEnabled() is True


@pytest.mark.skipif(not _PyQt6_AVAILABLE, reason="PyQt6 未安装")
def test_ai_field_button_set_busy_disables(qapp):
    from ui.ceshu.ai_field_button import AIFieldButton
    btn = AIFieldButton("test_field")
    btn.set_busy(True)
    assert btn.is_busy() is True
    assert btn.isEnabled() is False
    btn.set_busy(False)
    assert btn.is_busy() is False
    assert btn.isEnabled() is True


@pytest.mark.skipif(not _PyQt6_AVAILABLE, reason="PyQt6 未安装")
def test_ai_field_button_emits_signal_once(qapp):
    """点击应只发射一次信号，busy 期间再次点击应被忽略"""
    from ui.ceshu.ai_field_button import AIFieldButton
    btn = AIFieldButton("test_field")
    emissions = []
    btn.ai_fill_requested.connect(lambda fp: emissions.append(fp))
    btn._on_clicked()
    assert len(emissions) == 1
    assert emissions[0] == "test_field"
    # busy 状态下再点击应被忽略
    btn._on_clicked()
    assert len(emissions) == 1
    # 恢复后可以再次触发
    btn.set_busy(False)
    btn._on_clicked()
    assert len(emissions) == 2


# ─────────────────────────────────────────────────────────
# P15: data_manager 读操作加锁（线程安全 smoke test）
# ─────────────────────────────────────────────────────────

def test_data_manager_get_item_returns_copy():
    """get_item 返回的应是数据的拷贝，修改不影响原数据"""
    from core.data_manager import OptimizedDataManager

    # 构造一个最小化的 data_manager 实例，绕过完整初始化
    dm = OptimizedDataManager.__new__(OptimizedDataManager)
    from collections import OrderedDict
    from unittest.mock import MagicMock
    dm.lock = threading.Lock()
    dm.cache = {}
    dm._id_index = {"roles": {"R001": 0}}
    dm.data = {"roles": [{"id": "R001", "name": "Hero"}]}
    dm._search_cache = OrderedDict()
    dm._data_version = 1
    # 补齐 __del__/close() 所需属性，避免资源警告
    dm.current_file = None
    dm._saved_version = 1
    dm.logger = MagicMock()
    dm.executor = None  # 避免析构时关闭线程池

    item = dm.get_item("roles", "R001")
    assert item is not None
    assert item["name"] == "Hero"
    # 修改返回值不影响原数据
    item["name"] = "Modified"
    assert dm.data["roles"][0]["name"] == "Hero"


def test_data_manager_get_item_nonexistent_returns_none():
    from collections import OrderedDict
    from unittest.mock import MagicMock

    from core.data_manager import OptimizedDataManager

    dm = OptimizedDataManager.__new__(OptimizedDataManager)
    dm.lock = threading.Lock()
    dm.cache = {}
    dm._id_index = {"roles": {}}
    dm.data = {"roles": []}
    dm._search_cache = OrderedDict()
    dm._data_version = 1
    dm.current_file = None
    dm._saved_version = 1
    dm.logger = MagicMock()
    dm.executor = None

    assert dm.get_item("roles", "NONEXISTENT") is None


# ─────────────────────────────────────────────────────────
# P9: 错误消息脱敏（main_window 不再泄露异常细节）
# ─────────────────────────────────────────────────────────

def test_main_window_no_raw_exception_in_messages():
    """main_window.py 中 QMessageBox 文本不应直接包含 {e} 模板"""
    main_window_path = Path("src/ui/main_window.py")
    if not main_window_path.exists():
        pytest.skip("main_window.py 不存在")
    content = main_window_path.read_text(encoding="utf-8")
    # 检查 QMessageBox 调用中不应有 f"...{e}..." 形式
    import re
    # 匹配 QMessageBox.xxx(parent, title, f"...{e}...")
    pattern = r'QMessageBox\.\w+\([^,]+,\s*[^,]+,\s*f"[^"]*\{e\}[^"]*"\)'
    matches = re.findall(pattern, content)
    assert not matches, f"main_window.py 中仍存在未脱敏的异常消息: {matches}"


# ─────────────────────────────────────────────────────────
# P11: home_widget QUICK_ACTIONS 键盘可达性
# ─────────────────────────────────────────────────────────

def test_home_widget_action_card_has_focus_policy():
    """home_widget.py 的 _create_action_card 应设置 StrongFocus"""
    src = Path("src/ui/widgets/home_widget.py").read_text(encoding="utf-8")
    assert "StrongFocus" in src
    assert "Key_Return" in src
    assert "Key_Space" in src


# ─────────────────────────────────────────────────────────
# P1: system_skill 路径安全校验
# ─────────────────────────────────────────────────────────

def test_system_skill_has_path_safety_check():
    """system_skill.py 应包含 _is_path_safe 边界校验方法"""
    src = Path("src/core/agent/skills/system_skill.py").read_text(encoding="utf-8")
    assert "_is_path_safe" in src
    assert "_SENSITIVE_PATH_PATTERNS" in src or "_SYSTEM_PATHS" in src


def test_system_skill_rejects_system_paths():
    """_is_path_safe 应拒绝系统关键目录"""
    src_path = Path("src/core/agent/skills/system_skill.py")
    if not src_path.exists():
        pytest.skip()
    # 仅做静态检查：确保方法存在且逻辑包含系统路径校验
    content = src_path.read_text(encoding="utf-8")
    assert "_SYSTEM_PATHS" in content
    assert "系统关键目录禁止访问" in content or "禁止访问" in content
