"""Agent OS §11 — 隐私设计：敏感信息摘要化 + 按指令删除"""
import math
import re
from typing import Optional

_SENSITIVE_PATTERNS: dict[str, str] = {
    r'\b(?:api[_-]?key|apikey)\s*[:=]\s*[\w\-\.]{16,}': '[API_KEY_REDACTED]',
    r'\b(?:secret|private[_-]?key)\s*[:=]\s*[\w\-\.+/=]{16,}': '[SECRET_REDACTED]',
    r'\b(?:password|passwd|pwd)\s*[:=]\s*\S+': '[PASSWORD_REDACTED]',
    r'\b(?:token|access[_-]?token)\s*[:=]\s*[\w\-\.+/=]{16,}': '[TOKEN_REDACTED]',
    r'\b\d{15,19}\b': '[CREDIT_CARD_REDACTED]',
    r'\b1[3-9]\d{9}\b': '[PHONE_REDACTED]',
    r'\b[\w\.-]+@[\w\.-]+\.\w{2,}\b': '[EMAIL_REDACTED]',
    r'\b\d{17}[\dXx]\b': '[ID_NUMBER_REDACTED]',
    r'\b(?:ssh-rsa|ssh-ed25519|ssh-dss)\s+\S{20,}': '[SSH_KEY_REDACTED]',
    r'\bBearer\s+\S{16,}': 'Bearer [TOKEN_REDACTED]',
}

_KEYWORD_PATTERNS: set[str] = {
    "api_key", "apikey", "api-key", "api secret", "api_secret",
    "password", "passwd", "pwd", "token", "secret", "private_key",
    "private-key", "access_token", "access-token", "auth_token",
    "credit_card", "credit-card", "phone", "mobile", "email",
    "address", "身份证", "身份证号", "手机号", "密码", "密钥",
    "ssh_key", "ssh-key", "private key", "api key",
}


def _shannon_entropy(text: str) -> float:
    if not text:
        return 0.0
    freq: dict[str, int] = {}
    for c in text:
        freq[c] = freq.get(c, 0) + 1
    length = len(text)
    entropy = 0.0
    for count in freq.values():
        p = count / length
        entropy -= p * math.log2(p)
    return entropy


def _detect_high_entropy(text: str) -> list:
    tokens = re.split(r'[\s,;]+', text)
    suspicious = []
    for token in tokens:
        token = token.strip('"\'')
        if len(token) >= 20 and _shannon_entropy(token) > 4.2:
            suspicious.append(token)
    return suspicious


def summarize_sensitive(content: str) -> str:
    for pattern, replacement in _SENSITIVE_PATTERNS.items():
        content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)

    for token in _detect_high_entropy(content):
        if token in content and len(token) >= 20:
            content = content.replace(token, '[HIGH_ENTROPY_REDACTED]')

    for keyword in _KEYWORD_PATTERNS:
        pattern = re.compile(r'\b' + re.escape(keyword) + r'\s*[:=]\s*\S{8,}', re.IGNORECASE)
        if pattern.search(content):
            content = pattern.sub(f'[{keyword.upper()}_REDACTED]', content)

    if len(content) > 2000:
        content = content[:2000] + "...[截断]"
    return content


def delete_user_data(memory, user_id: str = None) -> bool:
    try:
        memory.clear_session()
        memory._short_term.clear()
        if hasattr(memory, "_long_term"):
            memory._long_term.clear()
        lf = memory._data_dir / "LEARNINGS.jsonl"
        if lf.exists():
            lf.unlink()
        return True
    except Exception:
        return False


def content_filter(content: str, allow_patterns: Optional[set[str]] = None) -> str:
    if not allow_patterns:
        allow_patterns = {"name", "description", "type", "level", "hp", "atk", "def", "skill"}
    return summarize_sensitive(content)
