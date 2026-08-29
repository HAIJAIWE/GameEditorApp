"""工具模块"""
from .ai_client import generate_image, generate_text, test_api_connection
from .async_runner import AsyncRunner, TaskResult, TaskStatus, get_async_runner, run_async
from .auto_backup import AutoBackup, BackupEntry, get_auto_backup
from .cache import (
    DATA_CACHE,
    SEARCH_CACHE,
    LRUCache,
    TimedCache,
    cache_result,
    invalidate_cache,
    lru_cache,
    timed_cache,
)
from .common import (
    clamp,
    dict_to_list,
    flatten_dict,
    format_datetime,
    generate_unique_id,
    get_timestamp,
    is_number,
    list_to_dict,
    md5_hash,
    merge_dicts,
    parse_datetime,
    safe_float,
    safe_int,
    safe_str,
)
from .config_schema import CONFIG_SCHEMA, SchemaValidator, validate_config
from .data_diff import DataDiff, DiffEntry, DiffType
from .data_importer import DataImporter, ImportResult
from .exceptions import (
    APIError,
    CacheError,
    DataImportError,
    DataManagerError,
    ExportError,
    FileOperationError,
    GameEditorException,
    TemplateError,
    ValidationError,
    format_exception,
    get_error_details,
    handle_exception,
    safe_operation,
)
from .graph import CircularDependencyError as GraphCircularDependencyError
from .graph import topological_sort
from .i18n import SUPPORTED_LOCALES, I18nManager, get_i18n
from .lazy_loader import BulkLazyLoader, LazyImport, ModuleProxy, get_lazy_loader, lazy
from .logger import AppLogger, get_logger
from .metrics import MetricEntry, MetricsCollector, get_metrics
from .path_utils import (
    copy_file,
    delete_dir,
    delete_file,
    ensure_dir,
    format_file_size,
    get_file_extension,
    get_file_size,
    get_filename_without_extension,
    get_normalized_path,
    get_unique_filename,
    is_image_file,
    is_json_file,
    is_safe_filename,
    list_files,
    move_file,
    safe_path,
    sanitize_filename,
)
from .shortcuts import DEFAULT_SHORTCUTS, Shortcut, ShortcutManager, get_shortcut_manager
from .text import (
    clean_text,
    contains_chinese,
    count_words,
    escape_html,
    extract_keywords,
    extract_tags,
    find_replace,
    format_template,
    highlight_text,
    join_tags,
    slugify,
    truncate_text,
    unescape_html,
)
from .text_game_export import TextGameExporter
from .validator import (
    DataValidator,
    validate_json_file,
)

__all__ = [
    # logger
    'AppLogger',
    'get_logger',
    # common
    'generate_unique_id',
    'format_datetime',
    'parse_datetime',
    'get_timestamp',
    'md5_hash',
    'clamp',
    'safe_int',
    'safe_float',
    'safe_str',
    'is_number',
    'list_to_dict',
    'dict_to_list',
    'merge_dicts',
    'flatten_dict',
    # text
    'clean_text',
    'extract_tags',
    'join_tags',
    'escape_html',
    'unescape_html',
    'truncate_text',
    'contains_chinese',
    'slugify',
    'extract_keywords',
    'format_template',
    'count_words',
    'find_replace',
    'highlight_text',
    # path_utils
    'ensure_dir',
    'safe_path',
    'get_file_extension',
    'get_filename_without_extension',
    'is_image_file',
    'is_json_file',
    'get_file_size',
    'format_file_size',
    'list_files',
    'copy_file',
    'move_file',
    'delete_file',
    'delete_dir',
    'get_unique_filename',
    'get_normalized_path',
    'is_safe_filename',
    'sanitize_filename',
    # validator
    'DataValidator',
    'validate_json_file',
    # exceptions
    'GameEditorException',
    'DataManagerError',
    'FileOperationError',
    'ValidationError',
    'TemplateError',
    'APIError',
    'ExportError',
    'DataImportError',
    'CacheError',
    'handle_exception',
    'safe_operation',
    'format_exception',
    'get_error_details',
    # cache
    'LRUCache',
    'TimedCache',
    'lru_cache',
    'timed_cache',
    'SEARCH_CACHE',
    'DATA_CACHE',
    'cache_result',
    'invalidate_cache',
    # text game export
    'TextGameExporter',
    # ai client
    'test_api_connection',
    'generate_text',
    'generate_image',
    # graph
    'topological_sort',
    'GraphCircularDependencyError',
    # data diff
    'DataDiff',
    'DiffType',
    'DiffEntry',
    # auto backup
    'AutoBackup',
    'BackupEntry',
    'get_auto_backup',
    # shortcuts
    'ShortcutManager',
    'Shortcut',
    'DEFAULT_SHORTCUTS',
    'get_shortcut_manager',
    # data importer
    'DataImporter',
    'ImportResult',
    # i18n
    'I18nManager',
    'get_i18n',
    'SUPPORTED_LOCALES',
    # async runner
    'AsyncRunner',
    'TaskResult',
    'TaskStatus',
    'get_async_runner',
    'run_async',
    # lazy loader
    'LazyImport',
    'BulkLazyLoader',
    'ModuleProxy',
    'get_lazy_loader',
    'lazy',
    # metrics
    'MetricsCollector',
    'MetricEntry',
    'get_metrics',
    # config schema
    'SchemaValidator',
    'CONFIG_SCHEMA',
    'validate_config',
]
