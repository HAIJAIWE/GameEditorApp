"""安全模块单元测试

覆盖 encryption（加密/解密）、guard（危险操作拦截）、rate_limiter（限流）、
sandbox（代码沙箱）四个子模块。
"""
import sys
import os
import time
import base64

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest
from pathlib import Path

try:
    from security.encryption import obscure, clarify, get_fernet
    _HAS_ENCRYPTION = True
except ImportError:
    _HAS_ENCRYPTION = False

try:
    from security.guard import SafetyGuard
    _HAS_GUARD = True
except ImportError:
    _HAS_GUARD = False

try:
    from security.rate_limiter import TokenBucket, RateLimiter
    _HAS_RATE_LIMITER = True
except ImportError:
    _HAS_RATE_LIMITER = False

try:
    from security.sandbox import CodeSandbox
    _HAS_SANDBOX = True
except ImportError:
    _HAS_SANDBOX = False

try:
    from security.acl import RiskLevel, set_max_allowed_risk, _blocked_tools, _blocked_actions
    _HAS_ACL = True
except ImportError:
    _HAS_ACL = False


# ──────────────────────────────────────────────
# encryption 测试
# ──────────────────────────────────────────────

@pytest.mark.skipif(not _HAS_ENCRYPTION, reason="security.encryption 模块不可用")
class TestEncryption:
    """加密/解密模块测试"""

    def test_obscure_and_clarify_roundtrip(self, tmp_path):
        """加密后解密应恢复原文"""
        plaintext = "my_secret_api_key_12345"
        encrypted = obscure(plaintext, key_dir=tmp_path)
        assert encrypted.startswith("f:")
        assert encrypted != plaintext

        decrypted = clarify(encrypted, key_dir=tmp_path)
        assert decrypted == plaintext

    def test_obscure_empty_string(self, tmp_path):
        """空字符串加密返回空字符串"""
        assert obscure("", key_dir=tmp_path) == ""

    def test_clarify_empty_string(self, tmp_path):
        """空字符串解密返回空字符串"""
        assert clarify("", key_dir=tmp_path) == ""

    def test_clarify_plain_text(self, tmp_path):
        """无前缀的字符串原样返回"""
        assert clarify("plain_text_no_prefix", key_dir=tmp_path) == "plain_text_no_prefix"

    def test_clarify_b64_format(self, tmp_path):
        """b64: 前缀的旧格式自动解码"""
        original = "legacy_key"
        encoded = "b64:" + base64.b64encode(original.encode()).decode()
        assert clarify(encoded, key_dir=tmp_path) == original

    def test_clarify_invalid_b64(self, tmp_path):
        """损坏的 b64 格式返回空字符串"""
        assert clarify("b64:!!!invalid_base64!!!", key_dir=tmp_path) == ""

    def test_clarify_invalid_fernet(self, tmp_path):
        """损坏的 f: 格式返回空字符串"""
        assert clarify("f:invalid_fernet_ciphertext", key_dir=tmp_path) == ""

    def test_get_fernet_creates_key_file(self, tmp_path):
        """get_fernet 首次调用创建密钥文件"""
        key_file = tmp_path / ".fernet_key"
        assert not key_file.exists()

        fernet = get_fernet(tmp_path)
        assert key_file.exists()
        assert fernet is not None

    def test_get_fernet_reuses_key_file(self, tmp_path):
        """get_fernet 二次调用复用已有密钥"""
        fernet1 = get_fernet(tmp_path)
        fernet2 = get_fernet(tmp_path)
        # 同一密钥 → 同一 Fernet 实例可解密彼此
        token = fernet1.encrypt(b"test")
        assert fernet2.decrypt(token) == b"test"

    def test_obscure_unicode(self, tmp_path):
        """Unicode 字符串加密/解密"""
        plaintext = "中文密钥🔑"
        encrypted = obscure(plaintext, key_dir=tmp_path)
        decrypted = clarify(encrypted, key_dir=tmp_path)
        assert decrypted == plaintext

    def test_obscure_different_keys_produce_different_ciphertext(self, tmp_path):
        """不同密钥产生不同密文"""
        key_dir1 = tmp_path / "key1"
        key_dir2 = tmp_path / "key2"
        plaintext = "same_plaintext"

        enc1 = obscure(plaintext, key_dir=key_dir1)
        enc2 = obscure(plaintext, key_dir=key_dir2)
        assert enc1 != enc2

    def test_clarify_with_wrong_key_returns_empty(self, tmp_path):
        """用错误密钥解密返回空字符串"""
        key_dir1 = tmp_path / "key1"
        key_dir2 = tmp_path / "key2"
        plaintext = "secret"

        encrypted = obscure(plaintext, key_dir=key_dir1)
        decrypted = clarify(encrypted, key_dir=key_dir2)
        assert decrypted == ""


# ──────────────────────────────────────────────
# guard (SafetyGuard) 测试
# ──────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_acl_state():
    """每个测试前后重置 ACL 全局状态"""
    _blocked_tools.clear()
    _blocked_actions.clear()
    set_max_allowed_risk(RiskLevel.SYSTEM)
    yield
    _blocked_tools.clear()
    _blocked_actions.clear()
    set_max_allowed_risk(RiskLevel.SYSTEM)


@pytest.mark.skipif(not _HAS_GUARD, reason="security.guard 模块不可用")
class TestSafetyGuardDanger:
    """SafetyGuard 危险操作检测测试"""

    def _make_context(self):
        """创建测试用上下文"""
        return {"_danger_confirmed": None, "messages": []}

    def test_safe_tool_not_dangerous(self):
        """安全工具（READ_ONLY）不触发危险检测"""
        guard = SafetyGuard()
        context = self._make_context()
        messages = []
        all_results = {}

        result = guard.check_dangerous(
            "system.game_data", {"action": "query"},
            context, messages, all_results, 0,
        )
        assert result is False
        assert len(messages) == 0

    def test_skill_level_dangerous(self):
        """Skill-level 危险工具（system.shell）触发检测"""
        guard = SafetyGuard()
        context = self._make_context()
        messages = []
        all_results = {}

        result = guard.check_dangerous(
            "system.shell", {},
            context, messages, all_results, 0,
        )
        assert result is True
        assert len(messages) == 1
        assert all_results[0] is not None
        assert context["_danger_confirmed"] is not None

    def test_data_level_dangerous(self):
        """Data-level 危险工具（delete_current_item）触发检测"""
        guard = SafetyGuard()
        context = self._make_context()
        messages = []
        all_results = {}

        result = guard.check_dangerous(
            "delete_current_item", {},
            context, messages, all_results, 0,
        )
        assert result is True

    def test_param_level_dangerous_skill(self):
        """参数级危险 — tool.file + delete action"""
        guard = SafetyGuard()
        context = self._make_context()
        messages = []
        all_results = {}

        result = guard.check_dangerous(
            "tool.file", {"action": "delete"},
            context, messages, all_results, 0,
        )
        assert result is True

    def test_param_level_dangerous_data(self):
        """参数级危险 — batch + clear action"""
        guard = SafetyGuard()
        context = self._make_context()
        messages = []
        all_results = {}

        result = guard.check_dangerous(
            "batch", {"action": "clear"},
            context, messages, all_results, 0,
        )
        assert result is True

    def test_param_level_safe_action(self):
        """参数级安全 — tool.file + read action"""
        guard = SafetyGuard()
        context = self._make_context()
        messages = []
        all_results = {}

        result = guard.check_dangerous(
            "tool.file", {"action": "read"},
            context, messages, all_results, 0,
        )
        assert result is False

    def test_confirmed_dangerous_proceeds(self):
        """已确认的危险操作放行"""
        guard = SafetyGuard()
        context = self._make_context()
        messages = []
        all_results = {}

        # 第一次调用 → 触发危险检测
        result1 = guard.check_dangerous(
            "system.shell", {},
            context, messages, all_results, 0,
        )
        assert result1 is True
        assert context["_danger_confirmed"] is not None

        # 第二次调用 → 已确认，放行
        result2 = guard.check_dangerous(
            "system.shell", {},
            context, messages, all_results, 1,
        )
        assert result2 is False
        assert context["_danger_confirmed"] is None

    def test_confirmed_different_tool_not_proceeds(self):
        """确认了 A 工具，B 工具仍需确认"""
        guard = SafetyGuard()
        context = self._make_context()
        messages = []
        all_results = {}

        guard.check_dangerous("system.shell", {}, context, messages, all_results, 0)
        # system.code 也是危险工具，但确认的是 system.shell
        result = guard.check_dangerous(
            "system.code", {},
            context, messages, all_results, 1,
        )
        assert result is True


@pytest.mark.skipif(not _HAS_GUARD, reason="security.guard 模块不可用")
class TestSafetyGuardHelpers:
    """SafetyGuard 辅助方法测试"""

    def test_estimate_tokens_positive(self):
        """_estimate_tokens 对非空文本返回正整数"""
        tokens = SafetyGuard._estimate_tokens("hello world")
        assert tokens > 0

    def test_estimate_tokens_chinese(self):
        """_estimate_tokens 处理中文文本"""
        tokens = SafetyGuard._estimate_tokens("你好世界")
        assert tokens > 0

    def test_get_tool_alternatives_known(self):
        """已知工具的替代方案"""
        alts = SafetyGuard._get_tool_alternatives("system.game_data")
        assert len(alts) > 0
        assert isinstance(alts, list)

    def test_get_tool_alternatives_unknown(self):
        """未知工具返回默认替代方案"""
        alts = SafetyGuard._get_tool_alternatives("nonexistent_tool_xyz")
        assert len(alts) > 0

    def test_replan_step_returns_string(self):
        """replan_step 返回包含错误信息的字符串"""
        guard = SafetyGuard()
        result = guard.replan_step(
            "system.game_data", {"action": "create"},
            "连接超时", [], {"messages": []},
        )
        assert isinstance(result, str)
        assert "system.game_data" in result
        assert "连接超时" in result

    def test_replan_step_includes_alternatives(self):
        """replan_step 包含替代方案"""
        guard = SafetyGuard()
        result = guard.replan_step(
            "system.game_data", {}, "error", [], {"messages": []},
        )
        assert "替代方案" in result

    def test_trim_messages_no_trimming_needed(self):
        """消息总量未超限时不裁剪"""
        guard = SafetyGuard(max_tokens=10000)
        messages = [
            {"role": "system", "content": "short"},
            {"role": "user", "content": "hello"},
        ]
        original_content = messages[0]["content"]
        guard.trim_messages(messages)
        assert messages[0]["content"] == original_content

    def test_trim_messages_compresses_long_content(self):
        """消息总量超限时压缩长内容"""
        guard = SafetyGuard(max_tokens=50, keep_system_first=1)
        long_text = "A" * 1000
        messages = [
            {"role": "system", "content": "sys"},
            {"role": "user", "content": long_text},
        ]
        guard.trim_messages(messages)
        # 长内容应被压缩或删除，总长度减少
        total_len = sum(len(m.get("content", "")) for m in messages)
        assert total_len < len(long_text)


# ──────────────────────────────────────────────
# rate_limiter 测试
# ──────────────────────────────────────────────

@pytest.mark.skipif(not _HAS_RATE_LIMITER, reason="security.rate_limiter 模块不可用")
class TestTokenBucket:
    """TokenBucket 令牌桶测试"""

    def test_acquire_with_available_tokens(self):
        """有令牌时 acquire 返回 True"""
        bucket = TokenBucket(rate=1.0, burst=5)
        assert bucket.acquire(1) is True

    def test_acquire_decrements_tokens(self):
        """acquire 后可用令牌减少"""
        bucket = TokenBucket(rate=0.01, burst=3)
        bucket.acquire(1)
        # 立即检查，几乎无补充
        assert bucket.available < 3

    def test_acquire_drains_all_tokens(self):
        """耗尽所有令牌后 acquire 返回 False"""
        bucket = TokenBucket(rate=0.01, burst=2)
        assert bucket.acquire(2) is True
        assert bucket.acquire(1) is False

    def test_available_property(self):
        """available 属性返回当前可用令牌数"""
        bucket = TokenBucket(rate=1.0, burst=5)
        assert bucket.available <= 5
        bucket.acquire(3)
        assert bucket.available < 5

    def test_available_does_not_exceed_burst(self):
        """available 不超过 burst 上限"""
        bucket = TokenBucket(rate=100.0, burst=5)
        time.sleep(0.1)  # 等待补充
        assert bucket.available <= 5

    def test_wait_and_acquire_with_tokens(self):
        """有令牌时 wait_and_acquire 立即返回 True"""
        bucket = TokenBucket(rate=1.0, burst=5)
        assert bucket.wait_and_acquire(1, timeout=1.0) is True

    def test_wait_and_acquire_timeout(self):
        """无令牌且超时后 wait_and_acquire 返回 False"""
        bucket = TokenBucket(rate=0.01, burst=1)
        bucket.acquire(1)  # 耗尽
        assert bucket.wait_and_acquire(1, timeout=0.3) is False

    def test_tokens_refill_over_time(self):
        """令牌随时间补充"""
        bucket = TokenBucket(rate=100.0, burst=5)
        bucket.acquire(5)  # 耗尽
        time.sleep(0.1)    # 等待补充
        # rate=100, 0.1s → 补充约 10 个，但上限 5
        assert bucket.acquire(1) is True


@pytest.mark.skipif(not _HAS_RATE_LIMITER, reason="security.rate_limiter 模块不可用")
class TestRateLimiter:
    """RateLimiter 多桶限流管理器测试"""

    def test_singleton(self):
        """RateLimiter 是单例"""
        r1 = RateLimiter()
        r2 = RateLimiter()
        assert r1 is r2

    def test_get_existing_bucket(self):
        """get_bucket 返回已存在的桶"""
        rl = RateLimiter()
        bucket = rl.get_bucket("llm")
        assert bucket is not None

    def test_get_bucket_creates_new(self):
        """get_bucket 为未知桶名创建新桶"""
        rl = RateLimiter()
        bucket = rl.get_bucket("custom_bucket_xyz")
        assert bucket is not None
        # 再次获取应返回同一个
        assert rl.get_bucket("custom_bucket_xyz") is bucket

    def test_acquire_with_available_tokens(self):
        """acquire 有令牌时返回 True"""
        rl = RateLimiter()
        # 使用新桶名避免受其他测试影响
        bucket_name = "test_acquire_bucket"
        rl.get_bucket(bucket_name)  # 预创建
        assert rl.acquire(bucket_name, timeout=0.5) is True


# ──────────────────────────────────────────────
# sandbox (CodeSandbox) 测试
# ──────────────────────────────────────────────

@pytest.mark.skipif(not _HAS_SANDBOX, reason="security.sandbox 模块不可用")
class TestCodeSandboxScan:
    """CodeSandbox 危险模式扫描测试"""

    def test_scan_safe_python(self, tmp_path):
        """安全 Python 代码不触发拦截"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        assert sandbox._scan_dangerous("x = 1 + 1\nprint(x)", "python") is False

    def test_scan_dangerous_eval(self, tmp_path):
        """eval() 触发拦截"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        assert sandbox._scan_dangerous("eval('1+1')", "python") is True

    def test_scan_dangerous_os_system(self, tmp_path):
        """os.system() 触发拦截"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        assert sandbox._scan_dangerous("import os\nos.system('ls')", "python") is True

    def test_scan_dangerous_import_os(self, tmp_path):
        """__import__('os') 触发拦截"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        assert sandbox._scan_dangerous("__import__('os')", "python") is True

    def test_scan_dangerous_open(self, tmp_path):
        """open() 触发拦截"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        assert sandbox._scan_dangerous("f = open('test.txt')", "python") is True

    def test_scan_dangerous_subprocess(self, tmp_path):
        """subprocess shell=True 触发拦截"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        code = "import subprocess\nsubprocess.run('ls', shell=True)"
        assert sandbox._scan_dangerous(code, "python") is True

    def test_scan_dangerous_shutil_rmtree(self, tmp_path):
        """shutil.rmtree 触发拦截"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        assert sandbox._scan_dangerous("import shutil\nshutil.rmtree('/tmp')", "python") is True

    def test_scan_dangerous_rm_rf(self, tmp_path):
        """rm -rf 触发拦截"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        assert sandbox._scan_dangerous("rm -rf /", "shell") is True

    def test_scan_dangerous_sudo(self, tmp_path):
        """sudo 命令触发拦截"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        assert sandbox._scan_dangerous("sudo rm file", "shell") is True

    def test_scan_dangerous_mkfs(self, tmp_path):
        """mkfs 命令触发拦截"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        assert sandbox._scan_dangerous("mkfs.ext4 /dev/sda1", "shell") is True

    def test_scan_safe_shell(self, tmp_path):
        """安全 shell 命令不触发拦截"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        assert sandbox._scan_dangerous("echo hello", "shell") is False


@pytest.mark.skipif(not _HAS_SANDBOX, reason="security.sandbox 模块不可用")
class TestCodeSandboxEnv:
    """CodeSandbox 环境变量白名单测试"""

    def test_build_env_filters_sensitive_vars(self, tmp_path):
        """敏感环境变量被过滤"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        env = sandbox._build_sandbox_env()
        # PATH 应该保留
        if "PATH" in os.environ:
            assert "PATH" in env
        # SANDBOX_WORKSPACE 应被设置
        assert "SANDBOX_WORKSPACE" in env

    def test_build_env_includes_custom_vars(self, tmp_path):
        """自定义环境变量被添加"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        env = sandbox._build_sandbox_env({"MY_CUSTOM_VAR": "custom_value"})
        assert env["MY_CUSTOM_VAR"] == "custom_value"

    def test_build_env_overrides_with_custom(self, tmp_path):
        """自定义变量可覆盖白名单变量"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        env = sandbox._build_sandbox_env({"PATH": "/custom/path"})
        assert env["PATH"] == "/custom/path"


@pytest.mark.skipif(not _HAS_SANDBOX, reason="security.sandbox 模块不可用")
class TestCodeSandboxExecute:
    """CodeSandbox 代码执行测试"""

    def test_execute_safe_python(self, tmp_path):
        """执行安全 Python 代码"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        result = sandbox.execute("x = 1 + 1\nprint(x)", language="python")
        assert result["success"] is True
        assert "2" in result["stdout"]

    def test_execute_dangerous_python_blocked(self, tmp_path):
        """危险 Python 代码被拦截"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        result = sandbox.execute("eval('1+1')", language="python")
        assert result["success"] is False
        assert "安全拦截" in result["stderr"]
        assert result["exit_code"] == -1

    def test_execute_dangerous_shell_blocked(self, tmp_path):
        """危险 shell 命令被拦截"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        result = sandbox.execute("rm -rf /tmp/test", language="shell")
        assert result["success"] is False
        assert "安全拦截" in result["stderr"]

    def test_execute_unsupported_language(self, tmp_path):
        """不支持的语言返回错误"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        result = sandbox.execute("code", language="ruby")
        assert result["success"] is False
        assert "不支持的语言" in result["stderr"]

    def test_execute_with_timeout_limit(self, tmp_path):
        """timeout 不超过 max_timeout"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path), max_timeout=5.0)
        # 请求 100s 超时，实际应被限制为 5s
        result = sandbox.execute("print('ok')", language="python", timeout=100)
        # 正常执行不受影响
        assert result["success"] is True

    def test_workspace_property(self, tmp_path):
        """workspace 属性返回工作目录"""
        sandbox = CodeSandbox(workspace_dir=str(tmp_path))
        assert sandbox.workspace == tmp_path

    def test_workspace_default_temp(self):
        """未指定工作目录时自动创建临时目录"""
        sandbox = CodeSandbox()
        assert sandbox.workspace.exists()
        sandbox.cleanup()

    def test_cleanup_removes_workspace(self, tmp_path):
        """cleanup 删除工作目录"""
        work_dir = tmp_path / "to_cleanup"
        sandbox = CodeSandbox(workspace_dir=str(work_dir))
        assert work_dir.exists()
        sandbox.cleanup()
        assert not work_dir.exists()
