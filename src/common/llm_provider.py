"""AI Provider 抽象层 — 统一多 LLM 供应商接口

支持的 Provider:
    - OpenAI: OpenAI / Azure OpenAI / 兼容API
    - Qwen: 阿里云通义千问 (DashScope)
    - 豆包: 字节跳动火山引擎
    - DeepSeek: DeepSeek API
    - Ollama: 本地模型
    - Generic: 通用 OpenAI 兼容 API

使用方式:
    provider = LLMProviderRegistry.create(config)
    result = provider.chat(messages)
"""

from abc import ABC, abstractmethod
from collections.abc import Callable
from typing import Optional


class BaseLLMProvider(ABC):

    def __init__(self, config):
        self._config = config

    @property
    def model(self) -> str:
        return self._config.model

    @property
    def base_url(self) -> str:
        return self._config.base_url.rstrip("/")

    @property
    def api_key(self) -> str:
        return getattr(self._config, "api_key", "")

    @property
    def temperature(self) -> float:
        return getattr(self._config, "temperature", 0.7)

    @property
    def max_tokens(self) -> int:
        return getattr(self._config, "max_tokens", 4096)

    @abstractmethod
    def chat(self, messages: list[dict], tools: Optional[list[dict]] = None) -> tuple[bool, dict]:
        """发起一轮对话，返回 (success, result)。"""

    @abstractmethod
    def chat_stream(self, messages: list[dict], on_chunk: Callable = None,
                    tools: Optional[list[dict]] = None) -> tuple[bool, dict]:
        """流式对话，on_chunk 接收增量文本。"""

    @abstractmethod
    def supports_vision(self) -> bool:
        """是否支持视觉输入。"""

    @abstractmethod
    def supports_image_gen(self) -> bool:
        """是否支持图片生成。"""

    def _build_url(self, path: str = "/chat/completions") -> str:
        return f"{self.base_url}{path}"

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(model={self.model})"


class OpenAIProvider(BaseLLMProvider):

    def chat(self, messages: list[dict], tools: Optional[list[dict]] = None) -> tuple[bool, dict]:
        from common.ai_client import generate_text_with_tools
        return generate_text_with_tools(self._config, "", "", messages, tools=tools)

    def chat_stream(self, messages: list[dict], on_chunk: Callable = None,
                    tools: Optional[list[dict]] = None) -> tuple[bool, dict]:
        from common.ai_client import generate_text_stream_with_tools
        return generate_text_stream_with_tools(
            self._config, "", "", messages, on_chunk=on_chunk, tools=tools
        )

    def supports_vision(self) -> bool:
        return True

    def supports_image_gen(self) -> bool:
        return True


class QwenProvider(BaseLLMProvider):

    def chat(self, messages: list[dict], tools: Optional[list[dict]] = None) -> tuple[bool, dict]:
        from common.ai_client import generate_text_with_tools
        return generate_text_with_tools(self._config, "", "", messages, tools=tools)

    def chat_stream(self, messages: list[dict], on_chunk: Callable = None,
                    tools: Optional[list[dict]] = None) -> tuple[bool, dict]:
        from common.ai_client import generate_text_stream_with_tools
        return generate_text_stream_with_tools(
            self._config, "", "", messages, on_chunk=on_chunk, tools=tools
        )

    def supports_vision(self) -> bool:
        return True

    def supports_image_gen(self) -> bool:
        return True


class DoubaoProvider(BaseLLMProvider):

    def chat(self, messages: list[dict], tools: Optional[list[dict]] = None) -> tuple[bool, dict]:
        from common.ai_client import generate_text_with_tools
        return generate_text_with_tools(self._config, "", "", messages, tools=tools)

    def chat_stream(self, messages: list[dict], on_chunk: Callable = None,
                    tools: Optional[list[dict]] = None) -> tuple[bool, dict]:
        from common.ai_client import generate_text_stream_with_tools
        return generate_text_stream_with_tools(
            self._config, "", "", messages, on_chunk=on_chunk, tools=tools
        )

    def supports_vision(self) -> bool:
        return False

    def supports_image_gen(self) -> bool:
        return True


class DeepSeekProvider(BaseLLMProvider):

    def chat(self, messages: list[dict], tools: Optional[list[dict]] = None) -> tuple[bool, dict]:
        from common.ai_client import generate_text_with_tools
        return generate_text_with_tools(self._config, "", "", messages, tools=tools)

    def chat_stream(self, messages: list[dict], on_chunk: Callable = None,
                    tools: Optional[list[dict]] = None) -> tuple[bool, dict]:
        from common.ai_client import generate_text_stream_with_tools
        return generate_text_stream_with_tools(
            self._config, "", "", messages, on_chunk=on_chunk, tools=tools
        )

    def supports_vision(self) -> bool:
        return False

    def supports_image_gen(self) -> bool:
        return False


class OllamaProvider(BaseLLMProvider):

    def chat(self, messages: list[dict], tools: Optional[list[dict]] = None) -> tuple[bool, dict]:
        from common.ai_client import generate_text_with_tools
        return generate_text_with_tools(self._config, "", "", messages, tools=tools)

    def chat_stream(self, messages: list[dict], on_chunk: Callable = None,
                    tools: Optional[list[dict]] = None) -> tuple[bool, dict]:
        from common.ai_client import generate_text_stream_with_tools
        return generate_text_stream_with_tools(
            self._config, "", "", messages, on_chunk=on_chunk, tools=tools
        )

    def supports_vision(self) -> bool:
        return False

    def supports_image_gen(self) -> bool:
        return False


class GenericProvider(BaseLLMProvider):

    def chat(self, messages: list[dict], tools: Optional[list[dict]] = None) -> tuple[bool, dict]:
        from common.ai_client import generate_text_with_tools
        return generate_text_with_tools(self._config, "", "", messages, tools=tools)

    def chat_stream(self, messages: list[dict], on_chunk: Callable = None,
                    tools: Optional[list[dict]] = None) -> tuple[bool, dict]:
        from common.ai_client import generate_text_stream_with_tools
        return generate_text_stream_with_tools(
            self._config, "", "", messages, on_chunk=on_chunk, tools=tools
        )

    def supports_vision(self) -> bool:
        return False

    def supports_image_gen(self) -> bool:
        return False


_PROVIDER_MAP: dict[str, type] = {
    "OpenAI": OpenAIProvider,
    "Qwen": QwenProvider,
    "豆包": DoubaoProvider,
    "DeepSeek": DeepSeekProvider,
    "Ollama": OllamaProvider,
}

_PROVIDER_ALIASES: dict[str, str] = {
    "openai": "OpenAI",
    "qwen": "Qwen",
    "tongyi": "Qwen",
    "通义千问": "Qwen",
    "doubao": "豆包",
    "bytedance": "豆包",
    "volcano": "豆包",
    "deepseek": "DeepSeek",
    "ollama": "Ollama",
}


def get_provider_class(provider_name: str) -> type:
    name = _PROVIDER_ALIASES.get(provider_name.lower(), provider_name)
    return _PROVIDER_MAP.get(name, GenericProvider)


def create_provider(config) -> BaseLLMProvider:
    provider_name = getattr(config, "provider", "OpenAI")
    cls = get_provider_class(provider_name)
    return cls(config)
