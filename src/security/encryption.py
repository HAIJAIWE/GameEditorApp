"""Agent OS §11 — 加密/解密：Fernet 对称加密 + 旧 b64 格式兼容

提供 obscure/clarify 两个便捷函数，用于本地敏感信息（如 API Key）的可逆加密。
密钥存储在用户目录或指定目录的 .fernet_key 文件中。

格式约定:
  - f:   Fernet 加密令牌（推荐）
  - b64: 旧版 base64 编码（仅解码，不再用于加密）
  - 无前缀: 原文，clarify 原样返回
"""
from __future__ import annotations

import base64
import os
from pathlib import Path
from typing import Optional, Union

from common.logger import get_logger

logger = get_logger()

try:
    from cryptography.fernet import Fernet
    _HAS_FERNET = True
except ImportError:
    _HAS_FERNET = False
    Fernet = None  # type: ignore

_KEY_FILENAME = ".fernet_key"


def _resolve_key_path(key_dir: Optional[Union[str, Path]]) -> Path:
    """解析密钥文件路径，默认用户主目录"""
    if key_dir is None:
        key_dir = Path.home()
    return Path(key_dir) / _KEY_FILENAME


def get_fernet(key_dir: Optional[Union[str, Path]] = None):
    """获取 Fernet 实例，自动创建或复用密钥文件

    Args:
        key_dir: 密钥文件所在目录，默认用户主目录

    Returns:
        Fernet 实例；若 cryptography 不可用或密钥损坏则返回 None
    """
    if not _HAS_FERNET:
        logger.warning("cryptography 库不可用，无法创建 Fernet 实例")
        return None

    key_path = _resolve_key_path(key_dir)
    try:
        key_path.parent.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        logger.warning(f"创建密钥目录失败: {e}")
        return None

    if key_path.exists():
        try:
            key = key_path.read_bytes().strip()
        except Exception as e:
            logger.warning(f"读取密钥文件失败: {e}")
            return None
    else:
        key = Fernet.generate_key()
        try:
            key_path.write_bytes(key)
            try:
                os.chmod(key_path, 0o600)
            except (OSError, PermissionError):
                pass  # Windows 无 chmod
        except Exception as e:
            logger.warning(f"写入密钥文件失败: {e}")
            return None

    try:
        return Fernet(key)
    except Exception as e:
        logger.warning(f"密钥格式无效: {e}")
        return None


def obscure(text: str, key_dir: Optional[Union[str, Path]] = None) -> str:
    """加密文本，返回带 f: 前缀的字符串

    Args:
        text: 待加密的明文
        key_dir: 密钥文件所在目录

    Returns:
        形如 "f:<token>" 的加密字符串；空字符串原样返回；
        若 Fernet 不可用则原样返回（降级处理）
    """
    if not text:
        return ""

    fernet = get_fernet(key_dir)
    if fernet is None:
        return text

    try:
        token = fernet.encrypt(text.encode("utf-8"))
        return "f:" + token.decode("ascii")
    except Exception as e:
        logger.warning(f"加密失败: {e}")
        return text


def clarify(text: str, key_dir: Optional[Union[str, Path]] = None) -> str:
    """解密文本，支持 f: (Fernet) 和 b64: (旧 base64) 前缀

    Args:
        text: 待解密的字符串
        key_dir: 密钥文件所在目录

    Returns:
        解密后的明文；无前缀的字符串原样返回；
        解密失败（密钥不匹配/格式损坏）返回空字符串
    """
    if not text:
        return ""

    if text.startswith("f:"):
        fernet = get_fernet(key_dir)
        if fernet is None:
            return ""
        try:
            token = text[2:].encode("ascii")
            return fernet.decrypt(token).decode("utf-8")
        except Exception:
            return ""

    if text.startswith("b64:"):
        try:
            return base64.b64decode(text[4:]).decode("utf-8")
        except Exception:
            return ""

    return text
