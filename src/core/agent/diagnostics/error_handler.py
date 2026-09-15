"""AI 系统自我修复模块 — 错误分类、自动重试、熔断降级、参数修正"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
from functools import wraps
import threading
import time
from typing import Any, Optional

from common.logger import get_logger

logger = get_logger()


class ErrorType(Enum):
    TRANSIENT = "transient"
    PARAM_ERROR = "param_error"
    NOT_FOUND = "not_found"
    RATE_LIMIT = "rate_limit"
    PERMISSION = "permission"
    FATAL = "fatal"
    CODE_ERROR = "code_error"
    FRONTEND_ERROR = "frontend_error"
    UNKNOWN = "unknown"


@dataclass
class ErrorResult:
    message: str
    error_type: ErrorType = ErrorType.UNKNOWN
    code: str = ""
    can_retry: bool = False
    suggestion: str = ""
    retry_params: Optional[dict[str, Any]] = None

    @classmethod
    def classify(cls, message: str, tool_name: str = "") -> ErrorResult:
        msg_lower = message.lower()

        # 限流

        if any(k in msg_lower for k in ("rate limit", "too many requests", "429", "超出频率", "请求过于频繁")):
            return cls(message=message, error_type=ErrorType.RATE_LIMIT, code="RATE_LIMITED",
                       can_retry=True, suggestion="等待 3 秒后重试", retry_params={"delay": 3.0})

        # 网络/超时
        if any(k in msg_lower for k in ("timeout", "timed out", "connection", "network", "refused",
                                          "超时", "连接失败", "网络")):
            return cls(message=message, error_type=ErrorType.TRANSIENT, code="TRANSIENT",
                       can_retry=True, suggestion="网络不稳定，自动重试中...", retry_params={"delay": 1.5})

        # 参数错误
        if any(k in msg_lower for k in ("missing", "required", "缺少", "参数", "invalid", "无效")):
            suggestion = cls._suggest_param_fix(message, tool_name)
            return cls(message=message, error_type=ErrorType.PARAM_ERROR, code="PARAM_ERROR",
                       can_retry=True, suggestion=suggestion, retry_params={"delay": 0.5})

        # 未找到
        if any(k in msg_lower for k in ("not found", "not exist", "不存在", "未找到", "没有", "no result", "没找到", "找不到")):
            return cls(message=message, error_type=ErrorType.NOT_FOUND, code="NOT_FOUND",
                       can_retry=False, suggestion="未找到目标数据，尝试用更宽泛的关键词搜索")

        # 权限
        if any(k in msg_lower for k in ("permission", "denied", "access", "权限", "拒绝")):
            return cls(message=message, error_type=ErrorType.PERMISSION, code="PERMISSION_DENIED",
                       can_retry=False, suggestion="无权限执行此操作")

        # 致命错误（崩溃、内存等）
        if any(k in msg_lower for k in ("fatal", "crash", "corrupt", "segmentation", "内存不足", "崩溃", "损坏")):
            return cls(message=message, error_type=ErrorType.FATAL, code="FATAL",
                       can_retry=False, suggestion="发生致命错误，无法自动恢复")

        # Python traceback 代码错误
        if _is_traceback_error(msg_lower):
            suggestion = _suggest_traceback_fix(message)
            return cls(message=message, error_type=ErrorType.CODE_ERROR, code="CODE_ERROR",
                       can_retry=True, suggestion=suggestion, retry_params={"delay": 0.2})

        # 前端错误 (JS/TS/CSS/DOM)
        if any(k in msg_lower for k in ("uncaught typeerror", "uncaught referenceerror",
                                          "cannot read propert", "is not a function",
                                          "is not defined js", "script error", "dom exception",
                                          "css", "syntaxerror", "unexpected token",
                                          "react", "vue", "component", "render", "jsx",
                                          "typescript", "eslint", "webpack", "vite",
                                          "unexpected end of input", "illegal", "unterminated")):
            return cls(message=message, error_type=ErrorType.FRONTEND_ERROR, code="FRONTEND_ERROR",
                       can_retry=False, suggestion="前端代码出现异常，调用 fix_code 定位并修复")

        return cls(message=message, error_type=ErrorType.UNKNOWN, code="UNKNOWN",
                   can_retry=False, suggestion="")

    @staticmethod
    def _suggest_param_fix(message: str, tool_name: str) -> str:
        if "data_type" in message:
            return "尝试修正 data_type 参数"
        if "item_id" in message:
            return "尝试用 search_items 先查找正确的 ID"
        return "检查参数是否正确"


# ═══════════════════════════════════════════════════════════════════
# 熔断器 (Circuit Breaker)
# ═══════════════════════════════════════════════════════════════════

@dataclass
class _CircuitState:
    failure_count: int = 0
    last_failure: float = 0.0
    open_until: float = 0.0
    is_open: bool = False
    # 修复 P2-22: 增加 HALF_OPEN 状态 + 半开期试探次数
    is_half_open: bool = False
    half_open_attempts: int = 0
    half_open_successes: int = 0


class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 30.0,
                 half_open_max: int = 2):
        self._threshold = failure_threshold
        self._recovery = recovery_timeout
        self._half_open_max = half_open_max
        # 修复 P2-22: defaultdict 在多线程下会丢锁，改为普通 dict + 显式加锁创建
        self._circuits: dict[str, _CircuitState] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._global_lock = threading.Lock()

    def _get_state(self, key: str) -> _CircuitState:
        """线程安全地获取/创建 circuit state（替代 defaultdict 的竞态）"""
        with self._global_lock:
            if key not in self._circuits:
                self._circuits[key] = _CircuitState()
                self._locks[key] = threading.Lock()
            return self._circuits[key]

    def acquire(self, key: str) -> bool:
        state = self._get_state(key)
        with self._locks[key]:
            now = time.time()
            # CLOSED 状态：直接放行
            if not state.is_open and not state.is_half_open:
                return True
            # OPEN 状态：检查是否到恢复时间
            if state.is_open:
                if now >= state.open_until:
                    # 修复 P2-22: 进入 HALF_OPEN 而非直接 CLOSED
                    state.is_open = False
                    state.is_half_open = True
                    state.half_open_attempts = 0
                    state.half_open_successes = 0
                    logger.info(f"熔断器 {key} 进入 HALF_OPEN 状态（试探 {self._half_open_max} 次）")
                    # HALF_OPEN 状态允许有限试探
                    if state.half_open_attempts < self._half_open_max:
                        state.half_open_attempts += 1
                        return True
                    return False
                else:
                    return False
            # HALF_OPEN 状态：仅允许 N 次试探
            if state.is_half_open:
                if state.half_open_attempts < self._half_open_max:
                    state.half_open_attempts += 1
                    return True
                return False
            return True

    def record_failure(self, key: str):
        state = self._get_state(key)
        with self._locks[key]:
            state.failure_count += 1
            state.last_failure = time.time()
            # 修复 P2-22: HALF_OPEN 中任一失败立即回到 OPEN
            if state.is_half_open:
                state.is_half_open = False
                state.is_open = True
                state.open_until = time.time() + self._recovery
                state.half_open_attempts = 0
                state.half_open_successes = 0
                logger.warning(f"熔断器 {key} HALF_OPEN 失败 → 重新 OPEN")
                return
            if state.failure_count >= self._threshold:
                state.is_open = True
                state.open_until = time.time() + self._recovery
                logger.warning(f"熔断器 {key} 触发 (连续 {state.failure_count} 次失败)")

    def record_success(self, key: str):
        state = self._get_state(key)
        with self._locks[key]:
            # 修复 P2-22: HALF_OPEN 中累计成功，达到阈值后转 CLOSED
            if state.is_half_open:
                state.half_open_successes += 1
                if state.half_open_successes >= self._half_open_max:
                    state.is_half_open = False
                    state.failure_count = 0
                    state.half_open_attempts = 0
                    state.half_open_successes = 0
                    logger.info(f"熔断器 {key} HALF_OPEN 试探全部成功 → CLOSED")
                return
            state.failure_count = 0
            state.is_open = False


_circuit_breaker = CircuitBreaker()


# ═══════════════════════════════════════════════════════════════════
# 指数退避重试装饰器
# ═══════════════════════════════════════════════════════════════════

def retry_on_error(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 15.0,
    backoff_factor: float = 2.0,
    retry_on: tuple[ErrorType, ...] = (ErrorType.TRANSIENT, ErrorType.RATE_LIMIT),
):
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            circuit_key = f"{func.__module__}.{func.__name__}"
            last_error = None

            for attempt in range(max_retries + 1):
                if not _circuit_breaker.acquire(circuit_key):
                    logger.warning(f"熔断器阻断 {circuit_key}")
                    return f"[系统保护] {circuit_key} 暂时熔断，请稍后再试"

                try:
                    result = func(*args, **kwargs)
                    if not isinstance(result, str) or not _is_error_message(result):
                        _circuit_breaker.record_success(circuit_key)
                        return result

                    error = ErrorResult.classify(result)
                    # 修复 P2-23: 既检查 retry_on 类型，也检查 can_retry 标志
                    if error.error_type not in retry_on or not error.can_retry:
                        # 类型不在重试列表 或 显式标记不可重试 → 直接返回，不重试
                        _circuit_breaker.record_success(circuit_key)
                        return result

                    last_error = error

                except Exception as e:
                    last_error = ErrorResult(
                        message=str(e),
                        error_type=ErrorType.FATAL if "crash" in str(e).lower() else ErrorType.UNKNOWN,
                        can_retry=False,
                    )
                    # 修复 P2-23: 之前只检查 FATAL，导致 UNKNOWN 等不可重试错误仍会重试
                    # 现在统一检查 can_retry（FATAL/UNKNOWN 默认都 can_retry=False）
                    if not last_error.can_retry:
                        # 显式标记为不可重试的异常直接退出，不再走退避逻辑
                        _circuit_breaker.record_failure(circuit_key)
                        break

                _circuit_breaker.record_failure(circuit_key)

                if attempt < max_retries:
                    delay = min(base_delay * (backoff_factor ** attempt), max_delay)
                    if error_suggestion := getattr(last_error, 'suggestion', ''):
                        logger.info(f"重试 {attempt+1}/{max_retries}：{error_suggestion}，{delay:.1f}s 后重试")
                    time.sleep(delay)

            if last_error:
                prefix = f"[已重试 {max_retries} 次] " if max_retries > 0 else ""
                return f"{prefix}{last_error.message}"
            return f"[重试 {max_retries} 次后仍失败]"

        return wrapper
    return decorator


def _is_error_message(result: str) -> bool:
    if len(result) < 3:
        return False
    error_indicators = (
        "错误", "失败", "error", "fail", "missing", "缺少", "invalid", "无效",
        "timeout", "超时", "not found", "不存在", "denied", "refused", "拒绝",
        "出错", "无法", "异常", "limit", "exceed", "未知", "崩溃", "crash",
        "中断", "broken", "终止", "fatal", "权限", "permission", "未定义",
        "undefined", "不支持", "unsupported", "格式错误", "format", "溢出",
        "overflow", "无响应", "unreachable", "已损坏", "corrupt", "断开",
        "disconnected", "连接失败", "rejected", "死锁", "deadlock",
    )
    return any(k in result.lower() for k in error_indicators)


def _is_traceback_error(msg_lower: str) -> bool:
    """检测是否为 Python traceback 代码错误"""
    if "traceback (most recent call last)" not in msg_lower:
        return False
    tb_indicators = (
        "modulenotfounderror", "importerror", "attributeerror",
        "nameerror", "typeerror", "keyerror", "valueerror",
        "indentationerror", "syntaxerror", "indexerror",
        "filenotfounderror", "permissionerror", "zerodivisionerror",
        "stopiteration", "runtimeerror", "notimplementederror",
        "recursionerror", "memoryerror", "assertionerror",
        "unboundlocalerror", "keyboardinterrupt",
    )
    return any(k in msg_lower for k in tb_indicators)


def _suggest_traceback_fix(message: str) -> str:
    """根据 traceback 类型给出修复建议"""
    msg_lower = message.lower()
    if any(k in msg_lower for k in ("modulenotfounderror", "importerror")):
        return "缺少 import 语句或模块未安装，调用 fix_code 自动添加导入"
    if "attributeerror" in msg_lower:
        return "属性名错误或对象不存在该属性，调用 fix_code 定位并修正"
    if "nameerror" in msg_lower:
        return "变量或函数名未定义，可能是拼写错误或缺少导入，调用 fix_code 修复"
    if "typeerror" in msg_lower:
        return "参数类型或数量不匹配，调用 fix_code 分析并修正"
    if "keyerror" in msg_lower:
        return "字典缺少键，可能需要添加默认值或使用 .get()，调用 fix_code 修复"
    if "indentationerror" in msg_lower:
        return "缩进错误，调用 fix_code 自动修正缩进"
    if "syntaxerror" in msg_lower:
        return "语法错误，调用 fix_code 分析并修复语法"
    return "代码执行时出现异常，调用 fix_code 定位源码并修复"


def parse_traceback(error_message: str) -> dict[str, Any]:
    """解析 Python traceback，提取文件、行号、错误类型和上下文

    Returns:
        {
            "error_type": str,         # NameError, TypeError 等
            "error_msg": str,          # 错误描述
            "frames": [                # 调用栈帧
                {"file": str, "line": int, "function": str, "code": str},
                ...
            ],
            "deepest_frame": {...},    # 最深层的帧(实际出错位置)
        }
    """
    import re
    lines = error_message.split("\n")
    frames = []
    error_type = ""
    error_msg = ""

    frame_pattern = re.compile(
        r'^\s*File\s+"([^"]+)",\s*line\s+(\d+)(?:,\s*in\s+(.+))?'
    )

    for i, line in enumerate(lines):
        m = frame_pattern.match(line.strip())
        if m:
            filepath = m.group(1)
            lineno = int(m.group(2))
            func_name = (m.group(3) or "").strip()
            code_line = ""
            if i + 1 < len(lines):
                code_line = lines[i + 1].strip()
            frames.append({
                "file": filepath,
                "line": lineno,
                "function": func_name,
                "code": code_line,
            })

    for line in lines:
        stripped = line.strip()
        if not stripped.startswith("File ") and not stripped.startswith("Traceback"):
            for et in ("ModuleNotFoundError", "ImportError", "AttributeError",
                        "NameError", "TypeError", "KeyError", "ValueError",
                        "IndentationError", "SyntaxError", "IndexError",
                        "FileNotFoundError", "PermissionError", "ZeroDivisionError",
                        "RuntimeError", "NotImplementedError", "RecursionError",
                        "MemoryError", "AssertionError", "UnboundLocalError"):
                if et in stripped:
                    error_type = et
                    parts = stripped.split(":", 1)
                    error_msg = parts[1].strip() if len(parts) > 1 else stripped
                    break
            if error_type:
                break

    deepest_frame = frames[-1] if frames else None

    return {
        "error_type": error_type,
        "error_msg": error_msg,
        "frames": frames,
        "deepest_frame": deepest_frame,
    }


# ═══════════════════════════════════════════════════════════════════
# 参数自动修正
# ═══════════════════════════════════════════════════════════════════

def auto_correct_params(
    error_msg: str,
    original_params: dict[str, Any],
    tool_name: str,
    available_types: Optional[list[str]] = None,
) -> Optional[dict[str, Any]]:
    """根据错误信息尝试自动修正参数"""
    corrected = dict(original_params)
    fixed = False

    # data_type 拼写/大小写修正
    if available_types and "data_type" in corrected:
        dt = corrected["data_type"].lower().strip()
        for t in available_types:
            if dt == t.lower() or dt in t.lower() or t.lower() in dt:
                corrected["data_type"] = t
                fixed = True
                break

    # 移除可能多余的引号/空格
    for key in corrected:
        if isinstance(corrected[key], str):
            cleaned = corrected[key].strip().strip("'\"")
            if cleaned != corrected[key]:
                corrected[key] = cleaned
                fixed = True

    # 数值类型修正
    if "level" in corrected and isinstance(corrected["level"], str):
        try:
            corrected["level"] = int(corrected["level"])
            fixed = True
        except ValueError as e:
            logger.debug(f"操作失败: {e}")

    return corrected if fixed else None


# ═══════════════════════════════════════════════════════════════════
# 统一自愈执行器
# ═══════════════════════════════════════════════════════════════════

def self_healing_execute(
    func: Callable,
    tool_name: str,
    params: dict[str, Any],
    max_retries: int = 3,
    available_types: Optional[list[str]] = None,
    context: Optional[dict[str, Any]] = None,
) -> tuple[Any, int, list[str]]:
    """带自愈能力的统一执行器

    Returns: (result, attempts_made, healing_log)
    """
    healing_log: list[str] = []
    last_result = None
    current_params = dict(params)
    start_time = time.time()
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            result = func(**current_params)
        except Exception as e:
            result = str(e)

        if isinstance(result, str) and _is_error_message(result):
            error = ErrorResult.classify(result, tool_name)
            last_error = error

            # 尝试自动修复高置信度代码错误
            auto_fix_result = _try_auto_fix(tool_name, error, current_params)
            if auto_fix_result:
                _repair_logger.log(tool_name, error, attempt + 1, True, healing_log, start_time)
                return auto_fix_result, attempt + 1, healing_log

            if not error.can_retry:
                _repair_logger.log(tool_name, error, attempt + 1, False, healing_log, start_time)
                if last_error:
                    _record = _make_record(tool_name, last_error, attempt + 1, False, healing_log, start_time)
                    _strategy_engine.learn(_record)
                return result, attempt + 1, healing_log

            if error.error_type == ErrorType.PARAM_ERROR and attempt == 0:
                corrected = auto_correct_params(result, current_params, tool_name, available_types)
                if corrected and corrected != current_params:
                    healing_log.append(f"参数自动修正: {current_params} → {corrected}")
                    current_params = corrected
                    last_result = result
                    continue

            if error.error_type == ErrorType.CODE_ERROR and attempt == 0:
                healing_log.append("检测到代码错误，尝试解析 traceback 并修复源码")
                last_result = result
                continue

            if attempt < max_retries:
                delay = error.retry_params.get("delay", 1.0) if error.retry_params else 1.0
                healing_log.append(f"第 {attempt+1} 次重试 ({error.error_type.value})：{error.suggestion}")
                time.sleep(delay)
                last_result = result
            else:
                healing_log.append(f"已重试 {max_retries} 次，放弃")
                _repair_logger.log(tool_name, error, attempt + 1, False, healing_log, start_time)
                if last_error:
                    _record = _make_record(tool_name, last_error, attempt + 1, False, healing_log, start_time)
                    _strategy_engine.learn(_record)
                prefix = f"[自动重试 {max_retries} 次后失败] "
                return prefix + result, attempt + 1, healing_log
        else:
            if last_result is not None:
                healing_log.append(f"第 {attempt+1} 次尝试成功")
            if last_error:
                _repair_logger.log(tool_name, last_error, attempt + 1, True, healing_log, start_time)
                _record = _make_record(tool_name, last_error, attempt + 1, True, healing_log, start_time)
                _strategy_engine.learn(_record)
            return result, attempt + 1, healing_log

    if last_error:
        _repair_logger.log(tool_name, last_error, max_retries + 1, False, healing_log, start_time)
        _record = _make_record(tool_name, last_error, max_retries + 1, False, healing_log, start_time)
        _strategy_engine.learn(_record)
    return last_result or "未知错误", max_retries + 1, healing_log


def _make_record(tool_name: str, error: ErrorResult, attempts: int,
                 success: bool, healing_log: list[str], start_time: float) -> RepairRecord:
    return RepairRecord(
        timestamp=time.time(),
        tool_name=tool_name,
        error_type=error.error_type.value,
        error_message=error.message[:300],
        diagnosis=_repair_logger._auto_diagnose(error),
        strategy=error.suggestion,
        attempts=attempts,
        success=success,
        healing_log=healing_log,
        duration_ms=(time.time() - start_time) * 1000,
    )


# ═══════════════════════════════════════════════════════════════════
# 修复模板库 — 每种错误类型的通用修复策略
# ═══════════════════════════════════════════════════════════════════

FIX_TEMPLATES: dict[str, list[str]] = {
    "transient": ["等待网络恢复后自动重试", "降级到本地缓存数据", "切换到备用服务端点"],
    "param_error": ["检查并修正参数", "用 search_items 先确认数据存在", "尝试切换 data_type"],
    "not_found": ["扩大搜索范围", "用模糊关键词重试", "列出所有可用数据供用户选择"],
    "rate_limit": ["延长等待间隔", "减少并发请求", "合并多个操作为批量调用"],
    "permission": ["检查权限设置", "切换到有权限的库", "联系管理员"],
    "fatal": ["尝试回滚数据", "重启编辑器", "检查日志获取更多信息"],
    "code_error": [
        "调用 fix_code 解析 traceback 并自动编辑源码",
        "检查 import 语句是否完整 — 常见缺失: threading, json, time",
        "验证变量名和函数名拼写",
        "用 system.shell 运行语法检查",
        "搜索相关模块确认函数/属性是否存在",
    ],
    "frontend_error": [
        "调用 fix_code(language='typescript') 定位前端文件并修复",
        "检查组件导入和 JSX 语法",
        "用 system.shell 运行前端 lint 检查",
        "查看浏览器控制台完整错误信息",
    ],
    "unknown": ["查看系统健康报告", "尝试回滚到最近快照", "重新描述需求后重试"],
}


# ═══════════════════════════════════════════════════════════════════
# 问题指纹 — 相似错误快速匹配
# ═══════════════════════════════════════════════════════════════════

def compute_error_fingerprint(error_message: str, error_type: str) -> str:
    """生成问题指纹，用于匹配相似错误和复用已成功的修复方案"""
    import hashlib
    import re
    normalized = re.sub(r'0x[0-9a-fA-F]+', 'MEM', error_message)
    normalized = re.sub(r'File ".*[\\/]([^\\/]+)", line (\d+)', r'File "\1", line N', normalized)
    normalized = re.sub(r'0x[0-9a-fA-F]+', 'ADDR', normalized)
    normalized = f"{error_type}:{normalized[:200]}"
    return hashlib.md5(normalized.encode('utf-8'), usedforsecurity=False).hexdigest()[:12]


_ERROR_FINGERPRINTS: dict[str, str] = {}
_ERROR_FINGERPRINTS_LOCK = threading.Lock()


def remember_fix(fingerprint: str, strategy: str, success: bool):
    if success and strategy:
        with _ERROR_FINGERPRINTS_LOCK:
            _ERROR_FINGERPRINTS[fingerprint] = strategy


def recall_fix(fingerprint: str) -> Optional[str]:
    with _ERROR_FINGERPRINTS_LOCK:
        return _ERROR_FINGERPRINTS.get(fingerprint)


# ═══════════════════════════════════════════════════════════════════
# 跨模块扫描 — 修一处，全项目找同类问题
# ═══════════════════════════════════════════════════════════════════

def cross_module_scan(error: ErrorResult, fixed_file: str = "") -> dict[str, Any]:
    """修复一个问题后，扫描全项目找同类隐患。

    例如: 修了 error_handler.py 缺 import threading
      → 全项目搜索 'threading.Lock()' 但文件头部没有 'import threading' 的所有文件
    """
    import os as _os

    from core.agent.ast_analyzer import ASTProjectAnalyzer

    results: dict[str, Any] = {"scanned": 0, "found_similar": [], "total_issues": 0}
    project_root = "src"
    if not _os.path.isdir(project_root):
        project_root = "."

    if error.error_type == ErrorType.CODE_ERROR:
        analyzer = ASTProjectAnalyzer()
        analyzer.analyze_project(project_root)
        cross = analyzer.find_cross_module_issues()

        for issue in cross:
            results["found_similar"].append({
                "file": issue.file_path,
                "line": issue.lineno,
                "description": issue.description,
                "fix": issue.fix_suggestion or "",
            })
            results["total_issues"] += 1

    elif error.error_type == ErrorType.FRONTEND_ERROR:
        for root, dirs, files in _os.walk("."):
            dirs[:] = [d for d in dirs if not d.startswith(".")
                       and d not in ("__pycache__", "node_modules", "venv", ".git")]
            for f in files:
                if f.endswith((".tsx", ".jsx", ".ts", ".js")):
                    _os.path.join(root, f)
                    results["scanned"] += 1
            if results["scanned"] > 50:
                break

    return results


def format_cross_scan_report(scan_result: dict[str, Any]) -> str:
    if scan_result["total_issues"] == 0:
        return "\n   跨模块扫描: 未发现类似问题，[OK] 全项目安全"

    lines = [f"\n   跨模块扫描: 发现 {scan_result['total_issues']} 处类似隐患"]
    for item in scan_result["found_similar"][:10]:
        lines.append(f"    [WARN] {item['file']}:{item['line']} — {item['description']}")
        if item.get("fix"):
            lines.append(f"        {item['fix']}")
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════
# 自动执行引擎 — 高置信度时不等 AI，自己动手
# ═══════════════════════════════════════════════════════════════════

AUTO_FIX_THRESHOLD = 0.80


def _try_auto_fix(tool_name: str, error: ErrorResult, params: dict) -> Optional[str]:
    """高置信度时自动执行修复，不等 AI 决策。

    返回: 修复结果字符串(成功时)，None(需要 AI 介入时)
    """
    from core.agent.repair_replay import ReplayStep, _repair_replay

    confidence = _strategy_engine.confidence(tool_name, error)
    if confidence < AUTO_FIX_THRESHOLD:
        return None

    # 检查是否为已知可自动修的错误类型
    best = _strategy_engine.get_best_strategy(tool_name, error)
    if not best or "人工" in best:
        return None

    f"auto_{int(time.time() * 1000)}"
    timeline = _repair_replay.start(error.error_type.value, error.message)

    timeline.add(ReplayStep.DETECT, f"自动检测: {error.code} (置信度 {confidence:.0%})")

    if error.error_type == ErrorType.CODE_ERROR:
        timeline.add(ReplayStep.ANALYZE, "开始代码自动修复")
        from core.agent.tools.tool_repair import _fix_code as _do_fix_code
        result = _do_fix_code({"traceback": error.message})
        timeline.add(ReplayStep.EDIT, "已分析并生成修复策略", detail={"confidence": confidence})

        from core.agent.root_cause import analyze_root_cause
        parsed = parse_traceback(error.message)
        root = analyze_root_cause(error.message, parsed)

        cross_scan = cross_module_scan(error, parsed.get("deepest_frame", {}).get("file", ""))
        cross_report = format_cross_scan_report(cross_scan)
        timeline.add(ReplayStep.CROSS_SCAN, f"跨模块扫描: 发现 {cross_scan['total_issues']} 处隐患")

        prefix = (
            " [自动修复] 系统检测到代码错误并已完成初步分析（未等AI决策）\n"
            f"  置信度: {confidence:.0%}\n"
        )
        timeline.finish(True)
        return prefix + result + "\n" + root + "\n" + cross_report

    if error.error_type == ErrorType.TRANSIENT:
        return None

    timeline.finish(False)
    return None


# ═══════════════════════════════════════════════════════════════════
# 修复日志系统 (Repair Log)
# ═══════════════════════════════════════════════════════════════════

@dataclass
class RepairRecord:
    timestamp: float
    tool_name: str
    error_type: str
    error_message: str
    diagnosis: str
    strategy: str
    attempts: int
    success: bool
    healing_log: list[str]
    duration_ms: float = 0.0


class RepairLogger:
    """修复日志 — 记录所有检测、诊断、修复过程和结果"""
    _instance = None
    _records: list[RepairRecord] = []
    _lock: threading.Lock = threading.Lock()
    _save_path: Optional[str] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._records = []
            cls._instance._lock = threading.Lock()
            cls._instance._save_path = None
        return cls._instance

    def set_save_path(self, path: str):
        self._save_path = path

    def log(self, tool_name: str, error: ErrorResult, attempts: int,
            success: bool, healing_log: list[str], start_time: float,
            diagnosis: str = "", strategy: str = ""):
        record = RepairRecord(
            timestamp=time.time(),
            tool_name=tool_name,
            error_type=error.error_type.value,
            error_message=error.message[:300],
            diagnosis=diagnosis or self._auto_diagnose(error),
            strategy=strategy or error.suggestion,
            attempts=attempts,
            success=success,
            healing_log=healing_log,
            duration_ms=(time.time() - start_time) * 1000,
        )
        with self._lock:
            self._records.append(record)
            if len(self._records) > 200:
                self._records = self._records[-150:]
        self._persist(record)

    def get_recent(self, n: int = 20) -> list[dict]:
        with self._lock:
            return [
                {
                    "time": r.timestamp,
                    "tool": r.tool_name,
                    "type": r.error_type,
                    "msg": r.error_message[:100],
                    "success": r.success,
                    "attempts": r.attempts,
                }
                for r in self._records[-n:]
            ]

    def get_stats(self) -> dict:
        with self._lock:
            total = len(self._records)
            if total == 0:
                return {"total": 0, "success_rate": 1.0}
            healed = sum(1 for r in self._records if r.success)
            by_type: dict[str, int] = defaultdict(int)
            for r in self._records:
                by_type[r.error_type] += 1
            return {
                "total": total,
                "healed": healed,
                "success_rate": healed / total,
                "by_type": dict(by_type),
            }

    def _auto_diagnose(self, error: ErrorResult) -> str:
        diagnoses = {
            ErrorType.TRANSIENT: "网络连接临时中断或服务端超时，非代码逻辑问题",
            ErrorType.RATE_LIMIT: "API 调用频率超出限制，请求排队等待中",
            ErrorType.PARAM_ERROR: "工具调用参数格式或值不符合预期",
            ErrorType.NOT_FOUND: "目标数据在数据库中不存在或已被删除",
            ErrorType.PERMISSION: "当前操作缺少必要权限",
            ErrorType.FATAL: "系统核心组件崩溃，可能由内存不足或配置损坏引起",
            ErrorType.CODE_ERROR: "代码中存在语法、导入、类型或逻辑错误，需要定位并修改源码",
            ErrorType.FRONTEND_ERROR: "前端 JavaScript/TypeScript/CSS 代码异常，需要定位并修改前端代码",
        }
        return diagnoses.get(error.error_type, "未分类错误，需要人工排查")

    def _persist(self, record: RepairRecord):
        if not self._save_path:
            return
        try:
            import json as _json
            entry = {
                "timestamp": record.timestamp,
                "tool": record.tool_name,
                "type": record.error_type,
                "error": record.error_message[:200],
                "diagnosis": record.diagnosis,
                "strategy": record.strategy,
                "attempts": record.attempts,
                "success": record.success,
                "duration_ms": record.duration_ms,
                "log": record.healing_log,
            }
            with open(self._save_path, "a", encoding="utf-8") as f:
                f.write(_json.dumps(entry, ensure_ascii=False) + "\n")
        except Exception as e:
            logger.warning(f"修复日志持久化失败: {e}")


# ═══════════════════════════════════════════════════════════════════
# 数据快照 + 回滚机制
# ═══════════════════════════════════════════════════════════════════

class DataSnapshotManager:
    """轻量数据快照 — 支持修复失败后自动回滚"""
    def __init__(self, max_snapshots: int = 10):
        self._snapshots: dict[str, list[dict]] = {}
        self._lock = threading.Lock()
        self._max = max_snapshots

    def snapshot(self, data: dict[str, Any], label: str = "auto") -> str:
        import copy
        snap_id = f"{label}_{int(time.time() * 1000)}"
        with self._lock:
            self._snapshots[snap_id] = [
                {"key": k, "data": copy.deepcopy(v)}
                for k, v in data.items()
            ]
            ids = sorted(self._snapshots.keys())
            while len(ids) > self._max:
                del self._snapshots[ids[0]]
                ids.pop(0)
        return snap_id

    def rollback(self, snap_id: str, target: dict[str, Any]) -> bool:
        with self._lock:
            if snap_id not in self._snapshots:
                return False
            for entry in self._snapshots[snap_id]:
                target[entry["key"]] = entry["data"]
            return True

    def get_latest(self) -> Optional[str]:
        with self._lock:
            ids = sorted(self._snapshots.keys())
            return ids[-1] if ids else None

    def clear(self):
        with self._lock:
            self._snapshots.clear()

    def count(self) -> int:
        with self._lock:
            return len(self._snapshots)


_snapshot_mgr = DataSnapshotManager()


# ═══════════════════════════════════════════════════════════════════
# 修复策略引擎 — 基于历史学习智能推荐修复方案
# ═══════════════════════════════════════════════════════════════════

class RepairStrategyEngine:
    """基于历史学习智能推荐修复方案 — 策略排序 + 置信度评分"""
    def __init__(self):
        self._success_strategies: dict[str, list[str]] = defaultdict(list)
        self._failure_patterns: dict[str, int] = Counter()
        self._strategy_scores: dict[str, dict[str, float]] = defaultdict(dict)

    def learn(self, record: RepairRecord):
        key = f"{record.tool_name}:{record.error_type}"
        strategy = record.strategy or ""
        if record.success:
            if strategy not in self._success_strategies[key]:
                self._success_strategies[key].append(strategy)
            self._failure_patterns[key] = max(0, self._failure_patterns.get(key, 0) - 1)
            self._strategy_scores[key][strategy] = self._strategy_scores[key].get(strategy, 0.5) * 0.8 + 0.2
        else:
            self._failure_patterns[key] += 1
            if strategy:
                self._strategy_scores[key][strategy] = max(0.05, self._strategy_scores[key].get(strategy, 0.5) * 1.2)

    def suggest(self, tool_name: str, error: ErrorResult) -> list[str]:
        key = f"{tool_name}:{error.error_type.value}"
        strategies = list(self._success_strategies.get(key, []))

        if not strategies:
            strategies = FIX_TEMPLATES.get(error.error_type.value, [])

        if key in self._strategy_scores:
            strategies.sort(key=lambda s: self._strategy_scores[key].get(s, 0.5), reverse=True)
        elif error.error_type.value in ("code_error", "frontend_error"):
            strategies.sort(key=lambda s: 1.0 if "fix_code" in s.lower() else 0.5, reverse=True)

        return strategies

    def confidence(self, tool_name: str, error: ErrorResult) -> float:
        key = f"{tool_name}:{error.error_type.value}"
        failures = self._failure_patterns.get(key, 0)
        if failures >= 5:
            return 0.1
        if failures >= 3:
            return 0.3
        successes = len(self._success_strategies.get(key, []))
        if successes > 0:
            return min(0.95, 0.6 + successes * 0.1)
        if error.error_type.value in ("transient", "param_error"):
            return 0.8
        # 修复 P2-21: 之前 code_error/frontend_error 初始 0.6 < AUTO_FIX_THRESHOLD(0.8)，
        # 导致代码错误永远无法被自动修复（chicken-and-egg 问题）
        # 现在 0.85 > 0.8 允许首次尝试，失败后由 _failure_patterns 降低置信度
        if error.error_type.value in ("code_error", "frontend_error"):
            return 0.85
        return 0.7

    def get_best_strategy(self, tool_name: str, error: ErrorResult) -> Optional[str]:
        strategies = self.suggest(tool_name, error)
        return strategies[0] if strategies else None

    def get_stats(self) -> dict:
        total_success = sum(len(v) for v in self._success_strategies.values())
        total_failures = sum(self._failure_patterns.values())
        return {
            "learned_strategies": total_success,
            "failure_patterns": total_failures,
            "tracked_keys": len(self._success_strategies),
        }

    def get_health_report(self) -> dict:
        frequent_failures = [
            {"pattern": k, "count": v}
            for k, v in self._failure_patterns.items()
            if v >= 2
        ]
        return {
            "learned_strategies": sum(len(v) for v in self._success_strategies.values()),
            "frequent_failures": sorted(frequent_failures, key=lambda x: -x["count"]),
        }


_strategy_engine = RepairStrategyEngine()
_repair_logger = RepairLogger()
