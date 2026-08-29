"""应用常量定义模块 — 数据类型通过 TypeSchemaRegistry 线程安全地动态更新"""
import threading

WINDOW_TITLE: str = "MB KSHBJQ(墨白可视化编辑)"
WINDOW_SIZE: tuple[int, int] = (1200, 800)
MIN_WINDOW_SIZE: tuple[int, int] = (800, 600)


class _TypeSchemaRegistry:
    """线程安全的类型模式注册表，替代全局可变列表/字典"""

    def __init__(self):
        self._lock = threading.Lock()
        self._types: list[str] = ['job', 'role', 'monster', 'equip', 'skill', 'talent', 'item', 'achievement', 'buff', 'title', 'story', 'task', 'dialog']
        self._names: dict[str, str] = {
            'job': '职业', 'role': '角色', 'monster': '怪物', 'equip': '装备',
            'skill': '技能', 'talent': '天赋', 'item': '道具', 'achievement': '成就',
            'buff': 'Buff', 'title': '称号', 'story': '剧情', 'task': '任务', 'dialog': '对话',
        }
        self._plurals: dict[str, str] = {
            'job': 'jobs', 'role': 'roles', 'monster': 'monsters', 'equip': 'equips',
            'skill': 'skills', 'talent': 'talents', 'item': 'items', 'achievement': 'achievements',
            'buff': 'buffs', 'title': 'titles', 'story': 'stories', 'task': 'tasks', 'dialog': 'dialogs',
        }
        self._colors: dict[str, str] = {
            'job': '#9C27B0', 'role': '#2196F3', 'monster': '#FF9800', 'equip': '#9C27B0',
            'skill': '#4CAF50', 'talent': '#E91E63', 'item': '#F44336', 'achievement': '#FFD700',
            'buff': '#2196F3', 'title': '#795548', 'story': '#00BCD4', 'task': '#FF5722',
            'dialog': '#607D8B',
        }

    @property
    def types(self) -> list[str]:
        with self._lock:
            return list(self._types)

    @property
    def names(self) -> dict[str, str]:
        with self._lock:
            return dict(self._names)

    @property
    def plurals(self) -> dict[str, str]:
        with self._lock:
            return dict(self._plurals)

    @property
    def colors(self) -> dict[str, str]:
        with self._lock:
            return dict(self._colors)

    def reload(self, type_ids: list[str], type_names: dict[str, str],
               type_plurals: dict[str, str], type_colors: dict[str, str] = None):
        """线程安全地重新加载类型模式（库切换时调用）"""
        with self._lock:
            self._types = list(type_ids)
            self._names = dict(type_names)
            self._plurals = dict(type_plurals)
            if type_colors:
                self._colors = dict(type_colors)

    def get_plural(self, type_id: str) -> str:
        with self._lock:
            return self._plurals.get(type_id, type_id + "s")

    def get_name(self, type_id: str) -> str:
        with self._lock:
            return self._names.get(type_id, type_id)

    def get_color(self, type_id: str) -> str:
        with self._lock:
            return self._colors.get(type_id, '#607D8B')


# 全局单例
_type_registry = _TypeSchemaRegistry()


# 兼容旧代码的模块级属性访问
def __getattr__(name: str):
    """模块级属性访问代理，使 `from config.constants import DATA_TYPES` 仍可用"""
    if name == "DATA_TYPES":
        return _type_registry.types
    if name == "DATA_TYPE_NAMES":
        return _type_registry.names
    if name == "DATA_TYPE_PLURALS":
        return _type_registry.plurals
    if name == "DATA_TYPE_COLORS":
        return _type_registry.colors
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


DATA_TYPE_PREFIXES: dict[str, str] = {
    'job': 'JOB',
    'role': 'ROLE',
    'monster': 'MON',
    'equip': 'EQUIP',
    'skill': 'SKILL',
    'talent': 'TALENT',
    'item': 'ITEM',
    'achievement': 'ACH',
    'buff': 'BUFF',
    'title': 'TITLE',
    'story': 'STORY',
    'task': 'TASK',
    'dialog': 'DIALOG',
    'planning': 'PLAN',
}


def reload_from_type_schema(type_ids: list[str], type_names: dict[str, str],
                            type_plurals: dict[str, str], type_colors: dict[str, str] = None):
    """从类型模式重新加载常量（库切换时调用）

    通过线程安全的注册表更新，确保所有后续访问获取新值。
    """
    _type_registry.reload(type_ids, type_names, type_plurals, type_colors)


AUTO_SAVE_ENABLED: bool = True
AUTO_SAVE_INTERVAL: int = 300  # 秒，5分钟自动保存间隔

CACHE_SIZE: int = 100  # 数据缓存条目上限
SEARCH_CACHE_SIZE: int = 32  # 搜索缓存条目上限
THREAD_POOL_SIZE: int = 4  # 并发线程池大小

DEFAULT_FILENAME: str = "default.json"
BACKUP_DIR_NAME: str = "backups"
RELATIONS_FILENAME: str = "relations.json"
FIELDS_CONFIG_FILENAME: str = "fields_config.json"
WORKFLOW_CONFIG_FILENAME: str = "workflow_config.json"
KEYWORD_TEMPLATES_FILENAME: str = "keyword_templates.json"
API_CONFIG_FILENAME: str = "api_config.json"
TEMPLATES_DIR_NAME: str = "templates"
SCHEMA_FILENAME: str = "type_schema.json"

THEME_NAMES: list[str] = ["默认", "暖调", "深色", "暗夜"]

# ==================== RPG 属性分类（权威数据源，公式构建器和属性面板共用） ====================
ATTR_CATEGORIES: dict[str, list[str]] = {
    "基础属性": ["力量", "智力", "敏捷", "体质"],
    "派生属性": ["HP", "MP", "物攻", "物防", "魔攻", "魔防", "速度"],
    "战斗属性": ["暴击率", "暴击伤害", "命中率", "闪避率", "回血/回合", "回蓝/回合"],
    "奖励属性": ["经验值", "金钱倍率", "掉落稀有倍率"],
}

ALL_ATTR_NAMES: list[str] = sum(ATTR_CATEGORIES.values(), [])

# ==================== 字段类型（权威数据源，所有UI从此导入） ====================
FIELD_TYPE_MAP = [
    ("entry", "文本输入"),
    ("combobox", "下拉选择"),
    ("spinbox", "整数输入"),
    ("double_spin", "小数输入"),
    ("tags", "标签输入"),
    ("template", "描述模板"),
    ("desc", "描述文本"),
    ("content", "多行内容"),
    ("achievement_desc", "成就描述"),
    ("image", "图片路径"),
    ("image_desc", "图片描述"),
    ("image_tags", "图片标签"),
    ("dialog", "关联对话"),
    ("droptable", "掉落表"),
    ("multiselect", "多选引用"),
]

FIELD_TYPES: list[str] = [t for t, _ in FIELD_TYPE_MAP]

EXPORT_ENGINES: list[str] = ['unity', 'unreal', 'godot', 'cocos2d']

# ==================== 策划书 (Ceshu) 常量 ====================
CESHU_DIR_NAME: str = "ceshu"  # 策划书存储子目录名
CESHU_TEMPLATE_FILE: str = "ceshu_templates.json"  # 模板文件名
CESHU_FILE_EXT: str = ".json"  # 策划书文件扩展名
CESHU_EXPORT_EXT: str = ".ceshu"  # 导出文件扩展名
CESHU_RECENT_FILE: str = ".ceshu_recent.json"  # 最近打开记录文件
CESHU_VERSION: str = "4.0"  # 策划书数据版本
CESHU_AUTOSAVE_INTERVAL_MS: int = 5000  # 自动保存间隔（毫秒）
CESHU_AUTOSAVE_DEBOUNCE_MS: int = 2000  # 自动保存防抖（毫秒）
CESHU_MAX_RECENT: int = 10  # 最近打开最大记录数
