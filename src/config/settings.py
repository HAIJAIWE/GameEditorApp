"""应用配置管理模块 - 使用单例模式管理所有配置"""
import base64
from dataclasses import asdict, dataclass, field
import json
from pathlib import Path
import threading
from typing import Any, Optional

from cryptography.fernet import Fernet

from common.logger import get_logger

from .constants import (
    API_CONFIG_FILENAME,
    BACKUP_DIR_NAME,
    DEFAULT_FILENAME,
    FIELDS_CONFIG_FILENAME,
    KEYWORD_TEMPLATES_FILENAME,
    RELATIONS_FILENAME,
    TEMPLATES_DIR_NAME,
    WORKFLOW_CONFIG_FILENAME,
)

logger = get_logger()


@dataclass
class FieldConfig:
    """字段配置数据类"""
    name: str
    label: str
    type: str
    editable: bool = True
    values: Optional[list[str]] = None
    from_: Optional[int] = None
    to: Optional[int] = None

    def to_dict(self) -> dict[str, Any]:
        """转换为字典"""
        data = asdict(self)
        return {k: v for k, v in data.items() if v is not None}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> FieldConfig:
        """从字典创建

        Args:
            data: 包含字段配置的字典

        Returns:
            FieldConfig 实例

        Raises:
            ValueError: 当必填字段缺失或值无效时
        """
        # 浅拷贝避免修改原始数据
        data = dict(data)

        # 处理 from_ 字段名冲突 (Python 关键字 from)
        if 'from' in data and 'from_' not in data:
            data['from_'] = data.pop('from')

        # 必填字段验证
        required_fields = ('name', 'label', 'type')
        missing = [f for f in required_fields if f not in data or data[f] is None]
        if missing:
            raise ValueError(f"FieldConfig 缺少必填字段: {', '.join(missing)}")

        # 过滤有效字段，避免 TypeError
        valid_fields = set(cls.__dataclass_fields__.keys())
        filtered_data = {k: v for k, v in data.items() if k in valid_fields}
        return cls(**filtered_data)


@dataclass
class TemplateConfig:
    """模板配置数据类"""
    name: str
    description: str = ""
    fields: dict[str, dict[str, str]] = field(default_factory=dict)
    ai_prompts: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """转换为字典"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TemplateConfig:
        """从字典创建"""
        # 过滤未知字段，避免 TypeError
        valid_fields = {k: v for k, v in data.items() if k in cls.__dataclass_fields__}
        return cls(**valid_fields)


def _get_fernet() -> Fernet:
    key_dir = Path.home() / ".mb_kshbjq"
    key_dir.mkdir(mode=0o700, exist_ok=True)
    key_file = key_dir / ".fernet_key"

    if key_file.exists():
        key = key_file.read_bytes()
    else:
        import secrets
        key = base64.urlsafe_b64encode(secrets.token_bytes(32))
        key_file.write_bytes(key)
        key_file.chmod(0o600)
    return Fernet(key)


def _obscure(key: str) -> str:
    if not key:
        return ""
    try:
        fernet = _get_fernet()
        return "f:" + fernet.encrypt(key.encode()).decode()
    except Exception:
        return ""


def _clarify(obscured: str) -> str:
    if not obscured:
        return ""
    if obscured.startswith("b64:"):
        try:
            return base64.b64decode(obscured[4:].encode()).decode()
        except Exception:
            return ""
    if obscured.startswith("f:"):
        try:
            fernet = _get_fernet()
            return fernet.decrypt(obscured[2:].encode()).decode()
        except Exception:
            return ""
    return obscured


class AppConfig:
    """应用配置管理器 - 单例模式"""

    _instance: Optional[AppConfig] = None
    _instance_lock: threading.Lock = threading.Lock()

    def __new__(cls) -> AppConfig:
        """单例模式确保只有一个配置实例（线程安全）"""
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """初始化配置"""
        if hasattr(self, '_initialized') and self._initialized:
            return

        # 基础路径配置 — 项目根固定为 src/ 的父目录（基于代码位置，不依赖 CWD）
        # 避免从不同目录启动导致运行时数据目录不断嵌套（GameEditorApp/GameEditorApp/...）
        self.base_dir = Path(__file__).resolve().parent.parent.parent
        self.data_dir: Path = self.base_dir / "data"
        self.config_dir: Path = self.data_dir / "settings"
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.export_dir: Path = self.base_dir / "exports"
        self.assets_dir: Path = self.base_dir / "assets"
        self.templates_dir: Path = self.data_dir / TEMPLATES_DIR_NAME
        self.backup_dir: Path = self.data_dir / BACKUP_DIR_NAME

        # 确保目录存在
        self._ensure_dirs()

        # 库管理器（延迟初始化，避免循环导入）
        self._library_manager = None

        # 文件路径配置（配置文件统一在 config/ 目录）
        self.default_file: Path = self.data_dir / DEFAULT_FILENAME
        self.relations_file: Path = self.config_dir / RELATIONS_FILENAME
        self.fields_config_file: Path = self.config_dir / FIELDS_CONFIG_FILENAME
        self.workflow_config_file: Path = self.config_dir / WORKFLOW_CONFIG_FILENAME
        self.keyword_templates_file: Path = self.config_dir / KEYWORD_TEMPLATES_FILENAME
        self.api_config_file: Path = self.config_dir / API_CONFIG_FILENAME

        # 字段配置：仅存储用户自定义的 label 覆盖；字段定义由 type_schema 统一管理
        self.fields_config: dict[str, list[dict[str, Any]]] = self._load_fields_config()

        # 关键词模板
        self.keyword_templates: dict[str, str] = self._get_default_keyword_templates()

        # AI配置
        self.api_key: str = ""
        self.enabled: bool = False
        self.provider: str = "OpenAI"
        self.base_url: str = "https://api.openai.com/v1"
        self.model: str = "gpt-3.5-turbo"
        self.temperature: float = 0.7
        self.max_tokens: int = 1000
        self.custom_platform: str = ""

        self.vision_model: str = ""
        self.vision_enabled: bool = False
        self.vision_provider: str = ""
        self.vision_base_url: str = ""
        self.vision_api_key: str = ""
        self.vision_temperature: float = 0.7
        self.vision_max_tokens: int = 2048

        self.image_model: str = ""
        self.image_enabled: bool = False
        self.image_provider: str = ""
        self.image_base_url: str = ""
        self.image_api_key: str = ""
        self.image_temperature: float = 0.7
        self.image_max_tokens: int = 2048

        # UI 偏好（字体大小等，需要重启生效）
        self.font_size: int = 13

        # 模板设置
        self.template_settings: dict[str, Any] = {
            'skill_default_mode': '通用模板',
            'auto_open_template': True,
            'remember_last': True,
            'show_hint': True,
            'system_prefix': '',
        }

        # 加载API配置
        self._load_api_config()

        # 平台默认配置
        self.platform_configs: dict[str, dict[str, str]] = self._get_platform_configs()

        # 当前模板
        self.current_template_name: str = "通用模板"
        self.current_template_config: TemplateConfig = TemplateConfig(name="通用模板")

        # 智能体配置文件
        self.agents_file = self.config_dir / "agents.json"

        # 预设模板
        self.preset_templates: dict[str, dict[str, Any]] = self._get_preset_templates()

        # 智能体配置
        self.agents: dict[str, dict[str, Any]] = self._load_agents()

        # UI设置
        self.confirm_save: bool = True
        self.confirm_delete: bool = True
        self.auto_save: bool = True
        self.auto_save_interval: int = 5

        self._initialized = True

    @property
    def library_manager(self):
        """获取库管理器（懒加载，避免循环导入）"""
        if self._library_manager is None:
            from core.library_manager import LibraryManager
            self._library_manager = LibraryManager(self.data_dir)
        return self._library_manager

    def get_type_schema(self):
        """获取当前活跃库的类型模式，必要时自动迁移"""
        lm = self.library_manager
        if not lm.active_library:
            return None
        return lm.prepare_active_schema()

    def get_fields_config(self) -> dict[str, list[dict[str, Any]]]:
        """获取字段配置 — 由 type_schema 统一派生，fields_config 仅用于 label 覆盖"""
        schema = self.get_type_schema()
        if schema:
            result = {}
            for t in schema.types:
                result[t.id] = [f.to_dict() for f in t.form_fields]
            for type_id, saved_fields in self.fields_config.items():
                if type_id in result:
                    saved_by_name = {f["name"]: f for f in saved_fields}
                    for i, field in enumerate(result[type_id]):
                        if field["name"] in saved_by_name:
                            saved = saved_by_name[field["name"]]
                            if saved.get("label"):
                                result[type_id][i]["label"] = saved["label"]
            return result
        # 无活跃库时字段配置无意义，返回空 dict（字段定义统一由 type_schema 管理）
        return {}

    @property
    def active_data_file(self) -> Optional[Path]:
        """获取当前活跃库的数据文件路径"""
        lm = self.library_manager
        if lm.active_library:
            file_path = lm.get_data_path()
            if file_path and file_path.exists():
                return file_path
        return self.default_file if self.default_file.exists() else None

    @property
    def active_planning_dir(self) -> Optional[Path]:
        """获取当前活跃库的策划案目录"""
        return self.library_manager.active_planning_dir

    def _ensure_dirs(self):
        """确保所有必要的目录存在"""
        for dir_path in [self.data_dir, self.export_dir, self.assets_dir,
                        self.templates_dir, self.backup_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)

    def _get_default_keyword_templates(self) -> dict[str, str]:
        """获取默认关键词模板 - 完整优化版（10类全覆盖，变量名对齐JSON字段）"""
        return {
            'skill': """你是顶级游戏技能文案专家。请基于以下数据生成技能描述：

【技能数据】
- 名称(name): {name}
- 类型(type): {type}
- 基础数值(value): {value}
- 伤害类型(damage_type): {damage_type}
- 倍率(multiplier): {multiplier}
- 冷却(cd): {cd}秒
- 目标(target): {target}
- 消耗类型(consume): {consume}
- 效果(effect): {effect}
- 分类(category): {category}
- 标签(tags): {tags}

【输出要求】
1. 技能的详细描述（150-250字，必须包含数值和效果的具体说明）
2. 使用时的视觉特效描写（30-50字）
3. 技能在战斗中的战术定位（20-30字）
4. 不要重复输入数据中的字段值，要用自然语言融合表达
语言风格：生动、有画面感，符合游戏设定。""",

            'role': """你是顶级游戏角色设计师。请基于以下数据生成角色介绍：

【角色数据】
- 名称(name): {name}
- 职业(job): {job}
- 种族(race): {race}
- 势力(faction): {faction}
- 生命(hp): {hp}
- 法力(mp): {mp}
- 攻击(atk): {atk}
- 防御(def): {def}
- 定位(category): {category}
- 技能列表(skills): {skills}
- 标签(tags): {tags}

【输出要求】
1. 角色的背景故事（250-400字，必须有冲突或成长弧线）
2. 性格特点和行为习惯（3-5个要点）
3. 外貌特征描写（80-120字，包括标志性外貌细节）
4. 角色在团队中的定位和战术价值（50-80字）
5. 携带技能的描写和战斗风格分析（40-60字，将skills转化为自然语言描述）
6. 不要平铺属性列表，要通过故事展现角色特点
语言风格：有深度、有情感，符合角色扮演游戏设定。""",

            'monster': """你是顶级游戏怪物设计师。请基于以下数据生成怪物设定：

【怪物数据】
- 名称(name): {name}
- 等级(level): {level}
- 类型(type): {type}
- 分类(category): {category}
- 难度(difficulty): {difficulty}
- 行为(behavior): {behavior}
- 生命(hp): {hp}
- 攻击(atk): {atk}
- 防御(def): {def}
- 经验(exp): {exp}
- 装备掉落(equip_drops): {equip_drops}
- 道具掉落(item_drops): {item_drops}
- 标签(tags): {tags}

【输出要求】
1. 怪物的外观详细描写（150-200字，包括体型、颜色、关键特征）
2. 怪物的生态来源和传说背景（100-150字）
3. 怪物的核心战斗机制和特殊技能（80-120字，不要只列数值）
4. 怪物的栖息环境和出现条件（40-60字）
5. 掉落物品的描述性说明（将equip_drops和item_drops转化为自然语言，30-50字）
6. 击败怪物的战术建议（30-50字）
7. 不要直接复制属性数字，要用描述性语言体现强弱
语言风格：有冲击力、有恐怖感或史诗感，突出怪物特点。""",

            'equip': """你是顶级游戏装备设计师。请基于以下数据生成装备介绍：

【装备数据】
- 名称(name): {name}
- 部位(part): {part}
- 稀有度(rare): {rare}
- 适用职业(job): {job}
- 效果(effect): {effect}
- 分类(category): {category}
- 数值(value): {value}
- 标签(tags): {tags}

【输出要求】
1. 装备的外观详细描述（材质、造型、特殊光泽/纹路，80-120字）
2. 装备的背景故事和来源传说（100-150字）
3. 装备效果和属性的自然语言说明（60-100字，不要说"+XX点XX"）
4. 装备的稀有度表现（为什么它是这个稀有度，30-50字）
5. 装备佩戴时的视觉效果（20-30字）
6. 描述要有质感、有价值感，传说装备要有史诗感
语言风格：有质感、有价值感，根据稀有度调整措辞。""",

            'talent': """你是顶级游戏天赋设计师。请基于以下数据生成天赋描述：

【天赋数据】
- 名称(name): {name}
- 归属角色(owner): {owner}
- 类型(type): {type}
- 等级(level): {level}
- 稀有度(rarity): {rarity}
- 效果类型(effect_type): {effect_type}
- 数值(value): {value}
- 解锁条件(unlock_condition): {unlock_condition}
- 分类(category): {category}
- 标签(tags): {tags}

【输出要求】
1. 天赋的效果详细描述（80-120字，用具体百分比或数值说明影响）
2. 天赋的获得方式和背景故事（60-100字）
3. 天赋在战斗/探索中的实际表现（40-60字）
4. 与其它天赋的协同效果（30-50字，如适用）
5. 不要写成技能描述，天赋强调的是"被动特性"或"常驻效果"
语言风格：专业、有深度，突出天赋的独特性和稀有感。""",

            'item': """你是顶级游戏道具设计师。请基于以下数据生成道具介绍：

【道具数据】
- 名称(name): {name}
- 类型(type): {type}
- 稀有度(rare): {rare}
- 效果(effect): {effect}
- 分类(category): {category}
- 数值(value): {value}
- 标签(tags): {tags}

【输出要求】
1. 道具的外观描写（材质、颜色、形状，40-60字）
2. 道具的来源和背景（40-60字）
3. 道具效果的详细说明和使用方式（60-100字）
4. 使用限制和注意事项（20-40字）
5. 道具的市场价值和稀有度说明（20-30字）
6. 消耗品要强调使用时的感官体验
语言风格：简洁实用，突出道具的价值和特点。""",

            'task': """你是顶级游戏任务设计师。请基于以下数据生成任务描述：

【任务数据】
- 名称(name): {name}
- 类型(type): {type}
- 难度(difficulty): {difficulty}
- 等级(level): {level}
- 奖励(reward): {reward}
- 分类(category): {category}
- 标签(tags): {tags}

【输出要求】
1. 任务的剧情背景和触发场景（80-120字）
2. 任务目标和完成流程描述（60-100字，分步骤说明）
3. 任务中的关键NPC和互动细节（40-60字）
4. 奖励的描述性说明（不要说"奖励=XXX"，要用叙事方式）
5. 任务失败或替代方案（20-30字，如适用）
6. 突出任务的叙事驱动，让玩家有情感投入的欲望
语言风格：引导性强，让玩家有探索和完成的欲望。""",

            'dialog': """你是顶级游戏对话编剧。请基于以下数据润色对话内容：

【对话数据】
- 名称(name): {name}
- 说话者(speaker): {speaker}
- 内容(content): {content}
- 选项(options): {options}
- 触发条件(condition): {condition}
- 标签(tags): {tags}

【输出要求】
1. 根据说话者身份优化对话语气和措辞（保留原意）
2. 为对话添加语气词和动作描述（用括号标注，如（压低声音）、（握紧拳头））
3. 对话选项要有差异化后果的暗示
4. 保持对话长度适中，单条不超过100字
5. 不同说话者要有明显的语气区分
语言风格：根据角色性格定制，战士豪迈、法师文雅、商人圆滑、贵族傲慢。""",

            'story': """你是顶级游戏剧情设计师。请基于以下数据生成剧情描述：

【剧情数据】
- 名称(name): {name}
- 类型(type): {type}
- 章节顺序(order): {order}
- 场景(scene): {scene}
- 内容(content): {content}
- 前置剧情(prev_story): {prev_story}
- 后续剧情(next_story): {next_story}
- 分支(branches): {branches}
- 解锁条件(condition): {condition}
- 标签(tags): {tags}

【输出要求】
1. 剧情的完整叙事描述（200-300字，包括场景氛围、角色情绪、关键事件）
2. 剧情转折点和情感高潮的描写（60-80字）
3. 分支选项的后果暗示（每个分支20-30字）
4. 与前后章节的叙事衔接说明（30-50字）
5. 不要写游戏攻略式的流程说明，要写出文学性的叙事体验
语言风格：文学性强，有电影镜头感，能调动玩家情绪。""",

            'achievement': """你是顶级游戏成就设计师。请基于以下数据生成成就展示文案：

【成就数据】
- 名称(name): {name}
- 达成条件(condition): {condition}
- 奖励(reward): {reward}

【输出要求】
1. 成就的展示文案（20-30字，有纪念意义或幽默感）
2. 成就解锁时的弹出提示文案（10-15字）
3. 成就的背景含义（为什么这个行为值得被纪念，30-40字）
4. 不要直接重复达成条件，要转化为有成就感的口号式表达
语言风格：有仪式感、有纪念意义，让玩家觉得"这值得炫耀"。""",
        }

    def _get_platform_configs(self) -> dict[str, dict[str, str]]:
        """获取平台配置"""
        return {
            "OpenAI": {
                "text_api_endpoint": "https://api.openai.com/v1/chat/completions",
                "text_api_model": "gpt-3.5-turbo",
                "image_api_endpoint": "https://api.openai.com/v1/images/generations",
                "image_api_model": "dall-e-3"
            },
            "Qwen": {
                "text_api_endpoint": "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
                "text_api_model": "qwen-turbo",
                "image_api_endpoint": "https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation",
                "image_api_model": "qwen-vl"
            },
            "豆包": {
                "text_api_endpoint": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
                "text_api_model": "ep-20240415173540-k8j54",
                "image_api_endpoint": "https://ark.cn-beijing.volces.com/api/v1/images/generations",
                "image_api_model": "ep-20240415173540-k8j54"
            }
        }

    def _get_preset_templates(self) -> dict[str, dict[str, Any]]:
        """从 JSON 文件加载预设模板"""
        templates_file = self.config_dir / "preset_templates.json"
        if templates_file.exists():
            try:
                with open(templates_file, encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                get_logger().warning(f"加载预设模板失败: {e}", exc_info=True)
        return {}

    def _load_fields_config(self) -> dict[str, list[dict[str, Any]]]:
        """加载字段配置（仅存储用户自定义的 label 覆盖；字段定义由 type_schema 统一管理）"""
        if self.fields_config_file.exists():
            try:
                with open(self.fields_config_file, encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                get_logger().warning(f"加载字段配置失败: {e}", exc_info=True)
        return {}

    def _load_api_config(self):
        """加载API配置，自动升级 b64 密钥为 Fernet 加密"""
        if self.api_config_file.exists():
            try:
                with open(self.api_config_file, encoding='utf-8') as f:
                    config_data = json.load(f)
                raw_key = config_data.get('api_key', '')
                self.api_key = _clarify(raw_key)
                # 自动升级：b64 格式 → Fernet 格式
                if raw_key.startswith("b64:") and self.api_key:
                    try:
                        self.save_api_config()
                        get_logger().info("API密钥已自动升级为 Fernet 加密")
                    except Exception as e:
                        logger.warning(f"操作失败: {e}")
                self.enabled = config_data.get('enabled', False)
                self.provider = config_data.get('provider', 'OpenAI')
                self.base_url = config_data.get('base_url', self.base_url)
                self.model = config_data.get('model', self.model)
                # 类型验证确保数值字段类型正确
                temp = config_data.get('temperature')
                self.temperature = float(temp) if temp is not None else self.temperature
                max_t = config_data.get('max_tokens')
                self.max_tokens = int(max_t) if max_t is not None else self.max_tokens
                self.custom_platform = config_data.get('custom_platform', '')
                self.template_settings = config_data.get('template_settings', self.template_settings)

                self.vision_model = config_data.get('vision_model', '')
                self.vision_enabled = config_data.get('vision_enabled', False)
                self.vision_provider = config_data.get('vision_provider', '')
                self.vision_base_url = config_data.get('vision_base_url', '')
                self.vision_api_key = _clarify(config_data.get('vision_api_key', ''))
                vt = config_data.get('vision_temperature')
                self.vision_temperature = float(vt) if vt is not None else 0.7
                vm = config_data.get('vision_max_tokens')
                self.vision_max_tokens = int(vm) if vm is not None else 2048

                self.image_model = config_data.get('image_model', '')
                self.image_enabled = config_data.get('image_enabled', False)
                self.image_provider = config_data.get('image_provider', '')
                self.image_base_url = config_data.get('image_base_url', '')
                self.image_api_key = _clarify(config_data.get('image_api_key', ''))
                it = config_data.get('image_temperature')
                self.image_temperature = float(it) if it is not None else 0.7
                im = config_data.get('image_max_tokens')
                self.image_max_tokens = int(im) if im is not None else 2048

                # UI 偏好
                fs = config_data.get('font_size')
                if fs is not None:
                    try:
                        self.font_size = max(8, min(48, int(fs)))
                    except (ValueError, TypeError):
                        self.font_size = 13
            except Exception as e:
                get_logger().warning(f"加载API配置失败: {e}", exc_info=True)

    def save_fields_config(self):
        """保存字段配置"""
        try:
            from common.common import atomic_write_json
            atomic_write_json(self.fields_config_file, self.fields_config,
                              ensure_ascii=False, indent=2)
        except Exception as e:
            get_logger().error(f"保存字段配置失败: {e}", exc_info=True)

    def save_api_config(self):
        """保存API配置"""
        config_data = {
            'api_key': _obscure(self.api_key),
            'enabled': self.enabled,
            'provider': self.provider,
            'base_url': self.base_url,
            'model': self.model,
            'temperature': self.temperature,
            'max_tokens': self.max_tokens,
            'custom_platform': self.custom_platform,
            'template_settings': self.template_settings,
            'vision_model': self.vision_model,
            'vision_enabled': self.vision_enabled,
            'vision_provider': self.vision_provider,
            'vision_base_url': self.vision_base_url,
            'vision_api_key': _obscure(self.vision_api_key) if self.vision_api_key else '',
            'vision_temperature': self.vision_temperature,
            'vision_max_tokens': self.vision_max_tokens,
            'image_model': self.image_model,
            'image_enabled': self.image_enabled,
            'image_provider': self.image_provider,
            'image_base_url': self.image_base_url,
            'image_api_key': _obscure(self.image_api_key) if self.image_api_key else '',
            'image_temperature': self.image_temperature,
            'image_max_tokens': self.image_max_tokens,
            'font_size': self.font_size,
        }
        try:
            from common.common import atomic_write_json
            atomic_write_json(self.api_config_file, config_data, ensure_ascii=False, indent=2)
        except Exception as e:
            get_logger().error(f"保存API配置失败: {e}", exc_info=True)

    def get_template_file_path(self, template_name: str) -> Path:
        """获取模板文件路径"""
        if not template_name or not template_name.strip():
            return self.templates_dir / "default.json"
        safe_name = "".join(c for c in template_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
        if not safe_name:
            safe_name = "default"
        return self.templates_dir / f"{safe_name}.json"

    def save_template(self, template_name: str, template_data: dict[str, Any]) -> bool:
        """保存模板"""
        try:
            file_path = self.get_template_file_path(template_name)
            from common.common import atomic_write_json
            atomic_write_json(file_path, template_data, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            get_logger().error(f"保存模板失败: {e}")
            return False

    def delete_template(self, template_name: str) -> bool:
        """删除模板（仅允许删除用户自定义的模板）"""
        if template_name in self.preset_templates:
            get_logger().warning(f"不允许删除预设模板: {template_name}")
            return False
        try:
            file_path = self.get_template_file_path(template_name)
            if file_path.exists():
                file_path.unlink()
                return True
            return False
        except Exception as e:
            get_logger().error(f"删除模板失败: {e}")
            return False

    def load_template(self, template_name: str) -> Optional[dict[str, Any]]:
        """加载模板"""
        try:
            if template_name in self.preset_templates:
                return self.preset_templates[template_name]

            file_path = self.get_template_file_path(template_name)
            if file_path.exists():
                with open(file_path, encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            get_logger().error(f"加载模板失败: {e}", exc_info=True)
        return None

    def get_all_templates(self) -> list[str]:
        """获取所有可用模板列表"""
        templates = list(self.preset_templates.keys())

        if self.templates_dir.exists():
            for file_path in self.templates_dir.glob("*.json"):
                template_name = file_path.stem
                if template_name not in templates:
                    templates.append(template_name)

        return templates

    def apply_template(self, template_name: str) -> bool:
        """应用模板"""
        template_data = self.load_template(template_name)
        if not template_data:
            return False

        self.current_template_name = template_name
        if isinstance(template_data, dict):
            if 'ai_prompts' in template_data:
                ai_prompts = template_data.get('ai_prompts', {})
            else:
                ai_prompts = {}
            fields = template_data.get('fields', {})
            description = template_data.get('description', '')
            self.current_template_config = TemplateConfig(
                name=template_name,
                description=description,
                fields=fields,
                ai_prompts=ai_prompts
            )

        if 'fields' in template_data:
            for data_type, field_labels in template_data['fields'].items():
                if data_type in self.fields_config:
                    for i, field in enumerate(self.fields_config[data_type]):
                        field_name = field['name']
                        if field_name in field_labels:
                            self.fields_config[data_type][i]['label'] = field_labels[field_name]

        self.save_fields_config()
        return True

    def get_ai_prompt(self, data_type: str) -> str:
        """获取AI提示词"""
        if hasattr(self.current_template_config, 'ai_prompts'):
            if data_type in self.current_template_config.ai_prompts:
                return self.current_template_config.ai_prompts[data_type]
        return ""

    def _load_agents(self) -> dict[str, dict[str, Any]]:
        """加载智能体配置"""
        from core.agent.prompts import USER_AGENTS

        # 从统一提示词池加载默认智能体
        default_agents = {}
        for name, cfg in USER_AGENTS.items():
            agent = dict(cfg)
            agent["name"] = name
            default_agents[name] = agent

        # 尝试从文件加载
        try:
            if self.agents_file.exists():
                with open(self.agents_file, encoding='utf-8') as f:
                    agents = json.load(f)
                # 确保默认智能体存在
                for name, agent in default_agents.items():
                    if name not in agents:
                        agents[name] = agent
                return agents
        except Exception as e:
            get_logger().warning(f"加载智能体配置失败: {e}")

        return default_agents

    def add_agent(self, name: str, description: str, system_prompt: str):
        """添加智能体"""
        self.agents[name] = {
            "name": name,
            "description": description,
            "system_prompt": system_prompt
        }
        self._save_agents()

    def _save_agents(self):
        """保存智能体配置"""
        try:
            with open(self.agents_file, 'w', encoding='utf-8') as f:
                json.dump(self.agents, f, ensure_ascii=False, indent=2)
        except Exception as e:
            get_logger().warning(f"保存智能体配置失败: {e}")

    def remove_agent(self, name: str):
        """移除智能体"""
        if name in self.agents:
            del self.agents[name]
            self._save_agents()

    def get_agent(self, name: str) -> dict[str, Any]:
        """获取智能体配置"""
        return self.agents.get(name, self.agents.get("策划专家"))

    def get_agent_names(self) -> list[str]:
        """获取所有智能体名称"""
        return list(self.agents.keys())


def get_config() -> AppConfig:
    """获取配置实例的便捷函数"""
    return AppConfig()
