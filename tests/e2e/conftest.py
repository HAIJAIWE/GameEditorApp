"""E2E 测试 fixtures

提供策划书与数据管理器的端到端测试环境。
所有测试在临时目录中运行，不污染项目文件。

注意：本 conftest 基于被测模块的真实 API：
  - CeshuManager(library_root=...) — 策划书存储在 <library_root>/<library>/ceshu/{id}.json
  - OptimizedDataManager() — 使用全局配置，不接收 root_dir 参数
"""
import os
import sys
import pytest
import tempfile
from pathlib import Path

# 确保 src/ 在 sys.path 中（与 tests/conftest.py 保持一致）
_SRC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "src")
if _SRC_DIR not in sys.path:
    sys.path.insert(0, os.path.abspath(_SRC_DIR))


@pytest.fixture
def temp_workspace():
    """创建临时工作目录，模拟 libraries 结构。

    目录布局：
      <tmp>/libraries/default/   — CeshuManager 的 library_root 指向 libraries/
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        workspace = Path(tmpdir)
        (workspace / "libraries" / "default").mkdir(parents=True)
        yield workspace


@pytest.fixture
def ceshu_manager(temp_workspace):
    """创建策划书管理器实例。

    CeshuManager 接收 library_root 参数，策划书文件存储在
    <library_root>/<library>/ceshu/{ceshu_id}.json 下。
    """
    try:
        from core.ceshu.ceshu_manager import CeshuManager
    except ImportError as e:
        pytest.skip(f"无法导入 CeshuManager: {e}")

    mgr = CeshuManager(library_root=str(temp_workspace / "libraries"))
    yield mgr


@pytest.fixture
def data_manager():
    """创建数据管理器实例。

    OptimizedDataManager 使用全局配置（get_config），不接收 root_dir。
    构造后会加载活跃库数据，这里 clear_all() 清空预加载内容，
    并将 current_file 置空以防止析构时把测试数据写回真实数据文件。
    """
    try:
        from core.data_manager import OptimizedDataManager
    except ImportError as e:
        pytest.skip(f"无法导入 OptimizedDataManager: {e}")

    mgr = OptimizedDataManager()
    mgr.clear_all()
    # 防止 close()/__del__() 将测试数据写回真实活跃库文件
    mgr.current_file = None
    yield mgr
    # 标记为已保存，避免 shutdown 时触发 save_file
    mgr._saved_version = mgr._data_version
    mgr.shutdown()
