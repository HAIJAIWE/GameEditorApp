from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from common.logger import get_logger


class ModelType(Enum):
    TEXT = "text"
    VISION = "vision"
    IMAGE = "image"


DEFAULT_MODEL_CONFIGS: dict[ModelType, dict] = {
    ModelType.TEXT: {
        "provider": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
    },
    ModelType.VISION: {
        "provider": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o",
    },
    ModelType.IMAGE: {
        "provider": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "model": "dall-e-3",
    },
}

RECOMMENDED_MODELS: dict[ModelType, list[dict]] = {
    ModelType.TEXT: [
        {"name": "gpt-4o-mini", "provider": "OpenAI", "desc": "轻量文本，性价比高"},
        {"name": "gpt-4o", "provider": "OpenAI", "desc": "强文本推理"},
        {"name": "claude-3.5-sonnet", "provider": "Anthropic", "desc": "长文本编程"},
        {"name": "deepseek-chat", "provider": "DeepSeek", "desc": "中文优秀"},
        {"name": "qwen-max", "provider": "阿里", "desc": "中文顶级"},
        {"name": "doubao-1.5-pro", "provider": "字节", "desc": "高速中文"},
    ],
    ModelType.VISION: [
        {"name": "gpt-4o", "provider": "OpenAI", "desc": "最强视觉理解"},
        {"name": "gpt-4o-mini", "provider": "OpenAI", "desc": "轻量视觉"},
        {"name": "claude-3.5-sonnet", "provider": "Anthropic", "desc": "屏幕截图分析"},
        {"name": "qwen-vl-max", "provider": "阿里", "desc": "中文视觉"},
        {"name": "doubao-1.5-vision-pro", "provider": "字节", "desc": "高速视觉"},
        {"name": "glm-4v", "provider": "智谱", "desc": "国产视觉"},
    ],
    ModelType.IMAGE: [
        {"name": "dall-e-3", "provider": "OpenAI", "desc": "高质量"},
        {"name": "stable-diffusion-xl", "provider": "开源自部署", "desc": "开源可控"},
        {"name": "flux-dev", "provider": "Black Forest", "desc": "最新开源"},
        {"name": "midjourney", "provider": "MidJourney", "desc": "艺术风格"},
        {"name": "cogview-3", "provider": "智谱", "desc": "中文生图"},
    ],
}


class ModelRegistry:
    _instance: Optional[ModelRegistry] = None

    def __init__(self):
        self._logger = get_logger()
        self._configs: dict[ModelType, dict] = {k: dict(v) for k, v in DEFAULT_MODEL_CONFIGS.items()}
        self._enabled: dict[ModelType, bool] = {k: False for k in ModelType}
        self._api_keys: dict[ModelType, str] = {k: "" for k in ModelType}
        self._temperatures: dict[ModelType, float] = {k: 0.7 for k in ModelType}
        self._max_tokens: dict[ModelType, int] = {k: 2048 for k in ModelType}
        self._config_obj = None

    @classmethod
    def get_instance(cls) -> ModelRegistry:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def bind_config(self, config_obj: Any):
        self._config_obj = config_obj

    def sync_from_app_config(self, config_obj: Any):
        if not config_obj:
            return

        self._config_obj = config_obj
        self._api_keys[ModelType.TEXT] = getattr(config_obj, "api_key", "")
        self._enabled[ModelType.TEXT] = getattr(config_obj, "enabled", False)
        self._configs[ModelType.TEXT]["provider"] = getattr(config_obj, "provider", "OpenAI")
        self._configs[ModelType.TEXT]["base_url"] = getattr(config_obj, "base_url", "https://api.openai.com/v1")
        self._configs[ModelType.TEXT]["model"] = getattr(config_obj, "model", "gpt-4o-mini")
        self._temperatures[ModelType.TEXT] = getattr(config_obj, "temperature", 0.7)
        self._max_tokens[ModelType.TEXT] = getattr(config_obj, "max_tokens", 2048)

        vk = getattr(config_obj, "vision_api_key", "")
        self._api_keys[ModelType.VISION] = vk or self._api_keys[ModelType.TEXT]
        self._enabled[ModelType.VISION] = getattr(config_obj, "vision_enabled",
                                                   self._enabled[ModelType.TEXT])
        self._configs[ModelType.VISION]["provider"] = getattr(config_obj, "vision_provider",
                                                               self._configs[ModelType.TEXT]["provider"])
        self._configs[ModelType.VISION]["base_url"] = getattr(config_obj, "vision_base_url",
                                                               self._configs[ModelType.TEXT]["base_url"])
        self._configs[ModelType.VISION]["model"] = getattr(config_obj, "vision_model",
                                                            DEFAULT_MODEL_CONFIGS[ModelType.VISION]["model"])
        self._temperatures[ModelType.VISION] = getattr(config_obj, "vision_temperature", 0.7)
        self._max_tokens[ModelType.VISION] = getattr(config_obj, "vision_max_tokens", 2048)

        ik = getattr(config_obj, "image_api_key", "")
        self._api_keys[ModelType.IMAGE] = ik or self._api_keys[ModelType.TEXT]
        self._enabled[ModelType.IMAGE] = getattr(config_obj, "image_enabled",
                                                  self._enabled[ModelType.TEXT])
        self._configs[ModelType.IMAGE]["provider"] = getattr(config_obj, "image_provider",
                                                              self._configs[ModelType.TEXT]["provider"])
        self._configs[ModelType.IMAGE]["base_url"] = getattr(config_obj, "image_base_url",
                                                              self._configs[ModelType.TEXT]["base_url"])
        self._configs[ModelType.IMAGE]["model"] = getattr(config_obj, "image_model",
                                                           DEFAULT_MODEL_CONFIGS[ModelType.IMAGE]["model"])
        self._temperatures[ModelType.IMAGE] = getattr(config_obj, "image_temperature", 0.7)
        self._max_tokens[ModelType.IMAGE] = getattr(config_obj, "image_max_tokens", 2048)

        self._logger.info(f"[ModelRegistry] 已同步: text={self.get_model_name(ModelType.TEXT)}, "
                          f"vision={self.get_model_name(ModelType.VISION)}, "
                          f"image={self.get_model_name(ModelType.IMAGE)}")

    def get_config(self, model_type: ModelType) -> dict:
        return {
            "enabled": self._enabled.get(model_type, False),
            "api_key": self._api_keys.get(model_type, ""),
            "provider": self._configs[model_type]["provider"],
            "base_url": self._configs[model_type]["base_url"],
            "model": self._configs[model_type]["model"],
            "temperature": self._temperatures.get(model_type, 0.7),
            "max_tokens": self._max_tokens.get(model_type, 2048),
        }

    def get_model_name(self, model_type: ModelType) -> str:
        return self._configs[model_type]["model"]

    def set_model(self, model_type: ModelType, model_name: str):
        self._configs[model_type]["model"] = model_name
        self._logger.info(f"[ModelRegistry] {model_type.value} 模型 → {model_name}")

    def set_api_key(self, model_type: ModelType, api_key: str):
        self._api_keys[model_type] = api_key
        if api_key:
            self._enabled[model_type] = True

    def set_base_url(self, model_type: ModelType, base_url: str):
        self._configs[model_type]["base_url"] = base_url

    def set_provider(self, model_type: ModelType, provider: str):
        self._configs[model_type]["provider"] = provider

    def set_enabled(self, model_type: ModelType, enabled: bool):
        self._enabled[model_type] = enabled

    def list_models(self) -> list[dict]:
        result = []
        for mt in ModelType:
            cfg = self.get_config(mt)
            result.append({
                "type": mt.value,
                "model": cfg["model"],
                "provider": cfg["provider"],
                "enabled": cfg["enabled"],
                "temperature": cfg["temperature"],
            })
        return result

    def list_recommended(self, model_type: Optional[ModelType] = None) -> list[dict]:
        if model_type:
            return RECOMMENDED_MODELS.get(model_type, [])
        result = []
        for mt in ModelType:
            for m in RECOMMENDED_MODELS.get(mt, []):
                m["type"] = mt.value
                result.append(m)
        return result

    def get_text_config(self) -> dict:
        return self.get_config(ModelType.TEXT)

    def get_vision_config(self) -> dict:
        return self.get_config(ModelType.VISION)

    def get_image_config(self) -> dict:
        return self.get_config(ModelType.IMAGE)
