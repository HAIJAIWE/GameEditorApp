"""Agent OS §前沿3 — 隐私优先本地智能体适配器"""
from typing import Optional


class LocalModelAdapter:
    """本地模型适配器：Ollama / llama.cpp / LocalAI"""

    LOCAL_PROVIDERS = {
        "ollama": {"base_url": "http://localhost:11434/v1", "default_model": "qwen2.5:7b"},
        "llamacpp": {"base_url": "http://localhost:8080/v1", "default_model": "local-model"},
        "localai": {"base_url": "http://localhost:8080/v1", "default_model": "gpt-3.5-turbo"},
    }

    def __init__(self, provider: str = "ollama", model: str = None):
        self.provider = provider
        cfg = self.LOCAL_PROVIDERS.get(provider, self.LOCAL_PROVIDERS["ollama"])
        self.base_url = cfg["base_url"]
        self.model = model or cfg["default_model"]

    def test_connection(self) -> bool:
        """测试本地模型连接"""
        try:
            import requests
            r = requests.get(f"{self.base_url}/models", timeout=5)
            return r.status_code == 200
        except Exception:
            return False

    def generate(self, prompt: str, system_prompt: str = None) -> tuple[bool, str]:
        """本地模型推理（所有数据留在本地）"""
        try:
            import requests
            data = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt or ""},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.7,
                "max_tokens": 2000,
            }
            r = requests.post(f"{self.base_url}/chat/completions", json=data, timeout=120)
            if r.status_code == 200:
                return True, r.json()["choices"][0]["message"]["content"]
            return False, f"本地模型错误: {r.status_code}"
        except Exception as e:
            return False, f"本地模型不可用: {e}"


# 全局本地适配器实例（懒加载）
_local_adapter: Optional[LocalModelAdapter] = None

def get_local_adapter() -> LocalModelAdapter:
    global _local_adapter
    if _local_adapter is None:
        _local_adapter = LocalModelAdapter()
    return _local_adapter
