"""通用工具函数模块"""
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
from typing import Any, Optional, Union
import uuid


def is_test_env() -> bool:
    """检测当前是否运行在测试环境（pytest）下。

    测试环境中应避免启动 MCP stdio 子进程等外部依赖，
    否则会阻塞/挂起 GUI 集成测试（并产生后台守护线程，触发 Windows COM 崩溃）。
    """
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return True
    return "pytest" in sys.modules

def atomic_write_text(file_path: Union[str, Path], content: str, encoding: str = "utf-8") -> None:
    """原子写入文本文件（先写临时文件，再 os.replace 替换）。

    避免写入过程中崩溃导致配置文件损坏。

    Args:
        file_path: 目标文件路径
        content: 文本内容
        encoding: 编码，默认 utf-8
    """
    target = Path(file_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    # 临时文件与目标同目录，确保 replace 是原子操作（同分区）
    fd, tmp_path = tempfile.mkstemp(
        prefix=f".{target.name}.", suffix=".tmp", dir=str(target.parent)
    )
    try:
        with os.fdopen(fd, 'w', encoding=encoding, newline='') as f:
            f.write(content)
            f.flush()
            try:
                os.fsync(f.fileno())
            except OSError:
                pass
        os.replace(tmp_path, target)
    except Exception:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except OSError:
            pass
        raise


def atomic_write_json(file_path: Union[str, Path], data: Any, encoding: str = "utf-8",
                      ensure_ascii: bool = False, indent: Optional[int] = 2) -> None:
    """原子写入 JSON 文件。

    Args:
        file_path: 目标文件路径
        data: 可序列化的数据
        encoding: 编码
        ensure_ascii: json.dump 参数
        indent: json.dump 参数
    """
    content = json.dumps(data, ensure_ascii=ensure_ascii, indent=indent)
    atomic_write_text(file_path, content, encoding=encoding)


def generate_unique_id(prefix: str = "ID") -> str:
    """
    生成唯一ID

    Args:
        prefix: ID前缀

    Returns:
        唯一ID字符串
    """
    uid = str(uuid.uuid4())[:8]
    return f"{prefix}_{uid}"


def format_datetime(dt: Optional[datetime] = None, fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """
    格式化日期时间

    Args:
        dt: 日期时间对象，默认当前时间
        fmt: 格式字符串

    Returns:
        格式化后的日期时间字符串
    """
    if dt is None:
        dt = datetime.now()
    return dt.strftime(fmt)


def parse_datetime(date_str: str, fmt: str = "%Y-%m-%d %H:%M:%S") -> Optional[datetime]:
    """
    解析日期时间字符串

    Args:
        date_str: 日期时间字符串
        fmt: 格式字符串

    Returns:
        日期时间对象，解析失败返回None
    """
    try:
        return datetime.strptime(date_str, fmt)
    except (ValueError, TypeError):
        return None


def get_timestamp() -> float:
    """
    获取当前时间戳

    Returns:
        时间戳（秒）
    """
    return datetime.now().timestamp()


def md5_hash(text: str) -> str:
    """
    计算字符串的MD5哈希

    Args:
        text: 要哈希的字符串

    Returns:
        MD5哈希值
    """
    return hashlib.md5(text.encode('utf-8'), usedforsecurity=False).hexdigest()


def clamp(value: int, min_val: int, max_val: int) -> int:
    """
    将数值限制在指定范围内

    Args:
        value: 要限制的数值
        min_val: 最小值
        max_val: 最大值

    Returns:
        限制后的数值
    """
    return max(min_val, min(value, max_val))


def safe_int(value: Any, default: int = 0) -> int:
    """
    安全转换为整数

    Args:
        value: 要转换的值
        default: 转换失败时的默认值

    Returns:
        转换后的整数
    """
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def safe_float(value: Any, default: float = 0.0) -> float:
    """
    安全转换为浮点数

    Args:
        value: 要转换的值
        default: 转换失败时的默认值

    Returns:
        转换后的浮点数
    """
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def safe_str(value: Any, default: str = "") -> str:
    """
    安全转换为字符串

    Args:
        value: 要转换的值
        default: 转换失败时的默认值

    Returns:
        转换后的字符串
    """
    if value is None:
        return default
    return str(value)


def is_number(value: Any) -> bool:
    """
    检查值是否为数字

    Args:
        value: 要检查的值

    Returns:
        是否为数字
    """
    try:
        float(value)
        return True
    except (ValueError, TypeError):
        return False


def list_to_dict(lst: list[dict[str, Any]], key_field: str = "id") -> dict[str, dict[str, Any]]:
    """
    将列表转换为字典

    Args:
        lst: 字典列表
        key_field: 作为键的字段名

    Returns:
        字典
    """
    return {item.get(key_field, str(i)): item for i, item in enumerate(lst)}


def dict_to_list(dct: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """
    将字典转换为列表

    Args:
        dct: 字典

    Returns:
        列表
    """
    return list(dct.values())


def merge_dicts(*dicts: dict[str, Any]) -> dict[str, Any]:
    """
    合并多个字典，后面的覆盖前面的

    Args:
        *dicts: 要合并的字典

    Returns:
        合并后的字典
    """
    result = {}
    for dct in dicts:
        if isinstance(dct, dict):
            result.update(dct)
    return result


def flatten_dict(d: dict[str, Any], parent_key: str = '', sep: str = '_') -> dict[str, Any]:
    """
    扁平化嵌套字典

    Args:
        d: 要扁平化的字典
        parent_key: 父键
        sep: 分隔符

    Returns:
        扁平化后的字典
    """
    items: list[tuple[str, Any]] = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)
