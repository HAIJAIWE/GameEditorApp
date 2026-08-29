"""PluginSystem 插件系统模块单元测试

覆盖 discover/load/unload/load_all 生命周期、install_from_json、generate_template、
trigger_hook 机制以及 list_plugins/to_dict 统计信息。

若 plugin_system 模块因缺少 PyQt6 等依赖无法导入，整个模块自动跳过。
"""
import sys
import os
import json
from pathlib import Path

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest

# ── 安全导入：依赖缺失时跳过整个模块 ──
try:
    from core.agent.plugin_system import PluginSystem, Plugin
    _DEP_AVAILABLE = True
except Exception as _import_err:  # pragma: no cover - 依赖缺失分支
    _DEP_AVAILABLE = False
    _IMPORT_ERR = _import_err
    PluginSystem = None  # type: ignore
    Plugin = None  # type: ignore

pytestmark = pytest.mark.skipif(
    not _DEP_AVAILABLE,
    reason="core.agent.plugin_system 模块不可用（可能缺少 PyQt6 等依赖）",
)


# ── 辅助：在 plugin_dir 下创建一个插件目录 ──

def _make_plugin(plugin_dir: Path, name: str, manifest: dict) -> Path:
    """在 plugin_dir 下创建一个名为 name 的插件，写入 plugin.json，返回插件目录"""
    pdir = plugin_dir / name
    pdir.mkdir(parents=True, exist_ok=True)
    (pdir / "plugin.json").write_text(
        json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
    )
    return pdir


# ── 初始化与目录 ──

class TestPluginSystemInit:
    """PluginSystem 初始化与 plugin_dir 测试"""

    def test_init_creates_plugin_dir(self, tmp_path):
        """初始化时自动创建 plugin_dir（含多级父目录）"""
        target = tmp_path / "nested" / "plugins"
        assert not target.exists()
        ps = PluginSystem(str(target))
        assert target.exists()
        assert target.is_dir()
        assert ps.plugin_dir == str(target)

    def test_default_plugin_dir_when_empty(self, tmp_path, monkeypatch):
        """未传 plugin_dir 时使用 APPDATA/GameEditorApp/plugins"""
        monkeypatch.setenv("APPDATA", str(tmp_path))
        ps = PluginSystem("")
        expected = tmp_path / "GameEditorApp" / "plugins"
        assert ps.plugin_dir == str(expected)
        assert expected.exists()

    def test_plugin_dir_property_is_string(self, tmp_path):
        """plugin_dir 属性返回字符串"""
        ps = PluginSystem(str(tmp_path))
        assert isinstance(ps.plugin_dir, str)


# ── discover 发现 ──

class TestDiscover:
    """discover() 自动发现测试"""

    def test_discover_empty_returns_zero(self, tmp_path):
        """空目录返回 0"""
        ps = PluginSystem(str(tmp_path))
        assert ps.discover() == 0

    def test_discover_finds_plugin(self, tmp_path):
        """发现有效 plugin.json 的插件"""
        ps = PluginSystem(str(tmp_path))
        _make_plugin(tmp_path, "myplugin", {
            "name": "myplugin", "version": "1.0.0", "description": "d",
        })
        assert ps.discover() == 1
        plugin = ps.get_plugin("myplugin")
        assert plugin is not None
        assert plugin.version == "1.0.0"
        assert plugin.description == "d"

    def test_discover_invalid_json_skipped(self, tmp_path):
        """损坏的 plugin.json 被跳过，不影响整体发现"""
        ps = PluginSystem(str(tmp_path))
        pdir = tmp_path / "bad"
        pdir.mkdir()
        (pdir / "plugin.json").write_text("{invalid json", encoding="utf-8")
        assert ps.discover() == 0
        assert ps.get_plugin("bad") is None

    def test_discover_ignores_dir_without_manifest(self, tmp_path):
        """没有 plugin.json 的目录被忽略"""
        ps = PluginSystem(str(tmp_path))
        (tmp_path / "no_manifest").mkdir()
        (tmp_path / "no_manifest" / "main.py").write_text("# noop", encoding="utf-8")
        assert ps.discover() == 0

    def test_discover_uses_dir_name_when_name_missing(self, tmp_path):
        """manifest 缺少 name 时使用目录名"""
        ps = PluginSystem(str(tmp_path))
        _make_plugin(tmp_path, "fallbackname", {"version": "0.1.0"})
        assert ps.discover() == 1
        assert ps.get_plugin("fallbackname") is not None


# ── load / unload 生命周期 ──

class TestLoadUnload:
    """load / unload / load_all 生命周期测试"""

    def test_load_nonexistent_returns_false(self, tmp_path):
        """加载未发现的插件返回 False"""
        ps = PluginSystem(str(tmp_path))
        assert ps.load("nonexistent") is False

    def test_load_already_loaded_returns_true(self, tmp_path):
        """重复加载已加载插件返回 True（幂等）"""
        ps = PluginSystem(str(tmp_path))
        _make_plugin(tmp_path, "x", {"name": "x", "version": "1.0.0"})
        ps.discover()
        assert ps.load("x") is True
        assert ps.load("x") is True  # 幂等

    def test_load_marks_loaded(self, tmp_path):
        """加载后 loaded 标记为 True"""
        ps = PluginSystem(str(tmp_path))
        _make_plugin(tmp_path, "x", {"name": "x", "version": "1.0.0"})
        ps.discover()
        plugin = ps.get_plugin("x")
        assert plugin.loaded is False
        assert ps.load("x") is True
        assert plugin.loaded is True

    def test_load_with_entry_registers_hooks(self, tmp_path):
        """加载带 entry 的插件 — register() 返回的钩子被注册"""
        ps = PluginSystem(str(tmp_path))
        name = "hookplugin"
        entry = "hookplugin_entry_unique_for_test"
        _make_plugin(tmp_path, name, {"name": name, "version": "1.0.0", "entry": entry})
        (tmp_path / name / f"{entry}.py").write_text(
            "def register():\n"
            "    return {'on_start': lambda: 'started', 'on_finish': lambda: 'done'}\n",
            encoding="utf-8",
        )
        ps.discover()
        added_path = str(tmp_path / name)
        try:
            assert ps.load(name) is True
            assert "on_start" in ps._hooks
            assert "on_finish" in ps._hooks
        finally:
            sys.modules.pop(entry, None)
            if added_path in sys.path:
                sys.path.remove(added_path)

    def test_load_entry_module_failure_returns_false(self, tmp_path):
        """entry 模块导入失败时返回 False"""
        ps = PluginSystem(str(tmp_path))
        _make_plugin(tmp_path, "badentry", {
            "name": "badentry", "version": "1.0.0", "entry": "totally_missing_module_xyz",
        })
        ps.discover()
        assert ps.load("badentry") is False
        assert ps.get_plugin("badentry").loaded is False

    def test_unload_loaded_plugin(self, tmp_path):
        """卸载已加载插件 — loaded 变 False"""
        ps = PluginSystem(str(tmp_path))
        _make_plugin(tmp_path, "x", {"name": "x", "version": "1.0.0"})
        ps.discover()
        ps.load("x")
        assert ps.unload("x") is True
        assert ps.get_plugin("x").loaded is False

    def test_unload_not_loaded_returns_false(self, tmp_path):
        """卸载未加载的插件返回 False"""
        ps = PluginSystem(str(tmp_path))
        _make_plugin(tmp_path, "x", {"name": "x", "version": "1.0.0"})
        ps.discover()
        assert ps.unload("x") is False

    def test_load_all(self, tmp_path):
        """load_all 加载全部已发现插件"""
        ps = PluginSystem(str(tmp_path))
        for n in ["p1", "p2", "p3"]:
            _make_plugin(tmp_path, n, {"name": n, "version": "1.0.0"})
        ps.discover()
        assert ps.load_all() == 3
        for n in ["p1", "p2", "p3"]:
            assert ps.get_plugin(n).loaded is True


# ── trigger_hook 机制 ──

class TestTriggerHook:
    """trigger_hook 钩子机制测试"""

    def test_trigger_hook_calls_callbacks(self, tmp_path):
        """trigger_hook 按顺序调用全部回调并传递参数"""
        ps = PluginSystem(str(tmp_path))
        calls = []
        ps._hooks["on_x"] = [lambda *a, **kw: calls.append((a, kw))]
        ps.trigger_hook("on_x", 1, 2, key="v")
        assert calls == [((1, 2), {"key": "v"})]

    def test_trigger_hook_exception_isolated(self, tmp_path):
        """一个回调抛异常不影响其他回调执行"""
        ps = PluginSystem(str(tmp_path))
        order = []

        def good1(*a, **kw):
            order.append(1)

        def bad(*a, **kw):
            raise RuntimeError("boom")

        def good2(*a, **kw):
            order.append(2)

        ps._hooks["on_y"] = [good1, bad, good2]
        ps.trigger_hook("on_y")  # 不应抛异常
        assert order == [1, 2]

    def test_trigger_hook_nonexistent_no_crash(self, tmp_path):
        """触发未注册的钩子不抛异常"""
        ps = PluginSystem(str(tmp_path))
        ps.trigger_hook("nonexistent_hook")

    def test_trigger_hook_multiple_callbacks(self, tmp_path):
        """同一钩子的多个回调都被调用"""
        ps = PluginSystem(str(tmp_path))
        counter = {"n": 0}
        ps._hooks["on_z"] = [
            lambda *a, **kw: counter.__setitem__("n", counter["n"] + 1),
            lambda *a, **kw: counter.__setitem__("n", counter["n"] + 1),
        ]
        ps.trigger_hook("on_z")
        assert counter["n"] == 2


# ── install_from_json ──

class TestInstallFromJson:
    """install_from_json 测试"""

    def test_install_success_registers_and_copies(self, tmp_path):
        """成功安装 — 插件注册且 plugin.json 复制到 plugin_dir"""
        ps = PluginSystem(str(tmp_path / "plugins"))
        src = tmp_path / "src.json"
        src.write_text(json.dumps({
            "name": "installed", "version": "1.2.0", "description": "d", "author": "a",
            "skills": ["s"], "agents": [], "commands": [],
        }), encoding="utf-8")
        assert ps.install_from_json(str(src)) is True
        assert ps.get_plugin("installed") is not None
        assert ps.get_plugin("installed").version == "1.2.0"
        assert (tmp_path / "plugins" / "installed" / "plugin.json").exists()

    def test_install_no_name_returns_false(self, tmp_path):
        """缺少 name 字段返回 False"""
        ps = PluginSystem(str(tmp_path / "plugins"))
        src = tmp_path / "src.json"
        src.write_text(json.dumps({"version": "1.0.0"}), encoding="utf-8")
        assert ps.install_from_json(str(src)) is False

    def test_install_invalid_json_returns_false(self, tmp_path):
        """损坏 JSON 返回 False"""
        ps = PluginSystem(str(tmp_path / "plugins"))
        src = tmp_path / "src.json"
        src.write_text("{bad json", encoding="utf-8")
        assert ps.install_from_json(str(src)) is False

    def test_install_nonexistent_file_returns_false(self, tmp_path):
        """不存在的文件返回 False"""
        ps = PluginSystem(str(tmp_path / "plugins"))
        assert ps.install_from_json(str(tmp_path / "nope.json")) is False


# ── generate_template ──

class TestGenerateTemplate:
    """generate_template 测试"""

    def test_generate_template_creates_file(self, tmp_path):
        """生成模板文件并写入默认 plugin_dir"""
        ps = PluginSystem(str(tmp_path))
        path = ps.generate_template("mytpl")
        assert os.path.exists(path)
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        assert data["name"] == "mytpl"
        assert data["entry"] == "main"
        assert "hooks" in data
        assert data["version"] == "0.1.0"

    def test_generate_template_custom_dest(self, tmp_path):
        """指定 dest_dir 时模板写入该目录"""
        ps = PluginSystem(str(tmp_path / "default"))
        dest = tmp_path / "customdest"
        path = ps.generate_template("custom", str(dest))
        assert os.path.exists(path)
        assert str(dest) in path
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        assert data["name"] == "custom"

    def test_generate_template_creates_nested_dirs(self, tmp_path):
        """生成模板时自动创建多级父目录"""
        ps = PluginSystem(str(tmp_path / "default"))
        path = ps.generate_template("nested", str(tmp_path / "a" / "b" / "c"))
        assert os.path.exists(path)


# ── 统计信息（list_plugins / to_dict） ──

class TestPluginStats:
    """list_plugins / to_dict 统计信息测试"""

    def test_list_plugins_returns_dicts(self, tmp_path):
        """list_plugins 返回 dict 列表，含 name/version/loaded"""
        ps = PluginSystem(str(tmp_path))
        _make_plugin(tmp_path, "p", {
            "name": "p", "version": "2.0.0", "description": "desc", "author": "me",
        })
        ps.discover()
        lst = ps.list_plugins()
        assert isinstance(lst, list)
        assert len(lst) == 1
        info = lst[0]
        assert info["name"] == "p"
        assert info["version"] == "2.0.0"
        assert info["loaded"] is False

    def test_list_plugins_reflects_loaded_state(self, tmp_path):
        """load 后 list_plugins 的 loaded 字段为 True"""
        ps = PluginSystem(str(tmp_path))
        _make_plugin(tmp_path, "p", {"name": "p", "version": "1.0.0"})
        ps.discover()
        ps.load("p")
        info = ps.list_plugins()[0]
        assert info["loaded"] is True

    def test_to_dict_counts_skills_agents_commands(self):
        """Plugin.to_dict 将 skills/agents/commands 转为计数"""
        p = Plugin(
            name="x", version="1.0.0",
            skills=["s1", "s2"], agents=["a1"], commands=["c1", "c2", "c3"],
        )
        d = p.to_dict()
        assert d["skills"] == 2
        assert d["agents"] == 1
        assert d["commands"] == 3
        assert d["loaded"] is False
        assert d["name"] == "x"

    def test_to_dict_empty_lists(self):
        """空 skills/agents/commands 计数为 0"""
        p = Plugin(name="x", version="1.0.0")
        d = p.to_dict()
        assert d["skills"] == 0
        assert d["agents"] == 0
        assert d["commands"] == 0

    def test_get_plugin_nonexistent_returns_none(self, tmp_path):
        """get_plugin 查询不存在插件返回 None"""
        ps = PluginSystem(str(tmp_path))
        assert ps.get_plugin("nope") is None
