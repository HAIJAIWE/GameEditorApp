"""应用异常处理模块 - 定义统一的异常类型和处理函数"""
from collections.abc import Callable
from functools import wraps
import traceback
from typing import Any, Optional

from common.logger import get_logger

logger = get_logger()


class GameEditorException(Exception):
    """游戏编辑器基础异常类

    注意: 异常不应在构造时记录日志，日志应在捕获点记录。
    使用 handle_exception 装饰器或 safe_operation 函数统一处理。
    """
    def __init__(self, message: str, details: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class DataManagerError(GameEditorException):
    """数据管理器异常"""
    pass


class FileOperationError(GameEditorException):
    """文件操作异常"""
    pass


class ValidationError(GameEditorException):
    """数据验证异常"""
    pass


class TemplateError(GameEditorException):
    """模板相关异常"""
    pass


class APIError(GameEditorException):
    """API调用异常"""
    pass


class ExportError(GameEditorException):
    """导出异常"""
    pass


class DataImportError(GameEditorException):
    """导入异常"""
    pass


class CacheError(GameEditorException):
    """缓存相关异常"""
    pass


def handle_exception(
    exception_type: type[Exception] = Exception,
    return_value: Any = None,
    reraise: bool = False
) -> Callable:
    """异常处理装饰器
    
    Args:
        exception_type: 要捕获的异常类型
        return_value: 发生异常时返回的值
        reraise: 是否重新抛出异常
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            try:
                return func(*args, **kwargs)
            except exception_type as e:
                logger.error(f"Exception in {func.__name__}: {str(e)}", exc_info=True)
                if reraise:
                    raise
                return return_value
        return wrapper
    return decorator


def safe_operation(
    func: Callable,
    *args,
    default: Any = None,
    log_error: bool = True,
    **kwargs
) -> Any:
    """安全执行函数
    
    Args:
        func: 要执行的函数
        *args: 函数参数
        default: 失败时的默认返回值
        log_error: 是否记录错误日志
        **kwargs: 函数关键字参数
        
    Returns:
        函数执行结果或默认值
    """
    try:
        return func(*args, **kwargs)
    except Exception as e:
        if log_error:
            logger.error(f"Operation failed in {func.__name__}: {str(e)}", exc_info=True)
        return default


def format_exception(e: Exception) -> str:
    """格式化异常信息
    
    Args:
        e: 异常对象
        
    Returns:
        格式化后的异常信息
    """
    return f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"


def get_error_details(e: Exception) -> dict:
    """获取异常详情
    
    Args:
        e: 异常对象
        
    Returns:
        包含详情的字典
    """
    result = {
        'type': type(e).__name__,
        'message': str(e),
        'traceback': traceback.format_exc()
    }

    if hasattr(e, 'details'):
        result['details'] = e.details

    return result


_ERROR_FRIENDLY_MAP = {
    "ModuleNotFoundError": "系统组件缺失，请确认安装完整",
    "ImportError": "系统组件缺失，请确认安装完整",
    "FileNotFoundError": "文件未找到，请检查路径是否正确",
    "PermissionError": "没有操作权限，请检查文件权限设置",
    "TimeoutError": "操作超时，请稍后重试",
    "ConnectionError": "网络连接失败，请检查网络状态",
    "json.JSONDecodeError": "数据格式解析失败",
    "KeyError": "缺少必要的数据字段",
    "ValueError": "参数值无效，请检查输入",
    "TypeError": "操作类型不匹配",
    "AttributeError": "对象属性访问失败，可能是初始化不完全",
    "IndexError": "数据索引超出范围",
    "MemoryError": "内存不足，请关闭部分应用后重试",
    "OSError": "系统操作失败",
    "RuntimeError": "运行时错误",
    "APIError": "API调用失败，请检查配置",
    "RateLimitError": "请求过于频繁，请稍后再试",
}


def to_user_message(error: Exception, context: str = "") -> str:
    """将技术异常转为用户友好提示"""
    error_type = type(error).__name__
    error_msg = str(error)

    if isinstance(error, GameEditorException):
        return error.message

    if "api key" in error_msg.lower() or "apikey" in error_msg.lower():
        return "API密钥未配置或无效，请在设置中配置有效的API密钥"

    if "rate" in error_msg.lower() or "限流" in error_msg or "过于频繁" in error_msg:
        return "请求过于频繁，请稍等片刻后再试"

    if "timeout" in error_msg.lower() or "超时" in error_msg:
        return "AI响应超时，请稍后重试"

    friendly = _ERROR_FRIENDLY_MAP.get(error_type)
    if friendly:
        prefix = f"{context}：" if context else ""
        return f"{prefix}{friendly}"

    if context:
        return f"{context}时出现错误：{error_msg[:100]}"
    return f"操作时出现错误：{error_msg[:100]}"
