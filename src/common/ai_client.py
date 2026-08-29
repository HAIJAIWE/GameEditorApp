"""AI客户端 - 负责与LLM API交互"""
import time
from typing import Any, Optional

import requests

from common.logger import get_logger
from common.rate_limiter import RateLimiter


def _acquire_rate_limit(bucket: str = "llm", timeout: float = 30.0) -> bool:
    acquired = RateLimiter().acquire(bucket, timeout=timeout)
    if not acquired:
        get_logger().warning(f"[RateLimiter] {bucket} 限流触发，请求被拒绝")
    return acquired


# 模型 max_tokens 安全上限（防止 API 400 错误）
_MODEL_MAX_TOKENS: dict[str, int] = {
    "doubao-1.5-pro": 3072,
    "doubao-1.5-lite": 3072,
    "doubao-pro-32k": 3072,
    "doubao-lite-32k": 3072,
    "deepseek-chat": 4096,
    "deepseek-coder": 4096,
    "gpt-3.5-turbo": 4096,
    "gpt-4": 8192,
    "gpt-4o": 16384,
    "gpt-4o-mini": 16384,
    "qwen-turbo": 6144,
    "qwen-plus": 6144,
    "qwen-max": 6144,
    "claude-3-haiku": 4096,
    "claude-3-sonnet": 4096,
    "claude-3-opus": 4096,
}

_SAFE_MAX_TOKENS = 2048  # 未知模型的保守上限


def _safe_max_tokens(config: Any) -> int:
    """根据模型返回安全的 max_tokens 值"""
    model = config.model
    requested = config.max_tokens
    limit = _SAFE_MAX_TOKENS
    for key, value in _MODEL_MAX_TOKENS.items():
        if key in model.lower():
            limit = value
            break
    return min(requested, limit)


def _sanitize_request_data(data: dict[str, Any]) -> dict[str, Any]:
    """脱敏请求数据中的敏感信息，防止日志泄露"""
    sanitized = dict(data)
    # 消息内容可能包含用户无意输入的敏感信息
    if "messages" in sanitized and isinstance(sanitized["messages"], list):
        sanitized["messages"] = [
            {k: (v[:100] + "...[截断]" if isinstance(v, str) and len(v) > 100 else v)
             for k, v in msg.items()}
            for msg in sanitized["messages"]
        ]
    return sanitized


def _request_with_retry(
    url: str,
    headers: dict[str, str],
    data: dict[str, Any],
    max_retries: int = 3,
    initial_delay: int = 1,
):
    """
    带重试的HTTP请求
    
    Args:
        url: 请求URL
        headers: 请求头
        data: 请求数据
        max_retries: 最大重试次数
        initial_delay: 初始延迟（秒）
    
    Returns:
        响应对象
    """
    logger = get_logger()
    last_exception = None

    for retry in range(max_retries):
        try:
            response = requests.post(url, headers=headers, json=data, timeout=120)
            if response.status_code == 200:
                return response
            elif response.status_code in [429, 500, 502, 503, 504]:
                # 可重试的错误
                wait_time = initial_delay * (2 ** retry)
                logger.warning(f"请求失败 (状态码: {response.status_code})，{wait_time}秒后重试 ({retry + 1}/{max_retries})")
                time.sleep(wait_time)
                last_exception = Exception(f"HTTP {response.status_code}")
            else:
                # 不可重试的错误
                return response
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            wait_time = initial_delay * (2 ** retry)
            logger.warning(f"请求异常: {e}，{wait_time}秒后重试 ({retry + 1}/{max_retries})")
            time.sleep(wait_time)
            last_exception = e
        except Exception:
            # 其他异常直接抛出
            logger.error("请求异常，已记录脱敏上下文")
            raise

    # 重试次数用完
    if last_exception:
        raise last_exception
    raise Exception("请求失败，重试次数已用完")


def test_api_connection(config: Any) -> tuple[bool, str]:
    """测试API连接
    
    Args:
        config: AppConfig实例
        
    Returns:
        (success: bool, message: str)
    """
    try:
        if config.provider != "Ollama" and not config.api_key:
            return False, "未设置API Key"

        # 构造OpenAI兼容的测试请求
        base_url = config.base_url.rstrip('/')
        url = f"{base_url}/chat/completions"

        headers = {
            "Content-Type": "application/json",
        }
        if config.api_key:
            headers["Authorization"] = f"Bearer {config.api_key}"

        # 对于Qwen特殊处理
        if config.provider == "Qwen" and "dashscope" in base_url:
            headers["Authorization"] = f"Bearer {config.api_key}"

        data = {
            "model": config.model,
            "messages": [
                {"role": "user", "content": "Hello"}
            ],
            "max_tokens": 5,
            "temperature": 0.7
        }

        response = requests.post(url, headers=headers, json=data, timeout=30)

        if response.status_code == 200:
            return True, "连接成功！API配置正确。"
        else:
            try:
                error_info = response.json()
                error_msg = error_info.get('error', {}).get('message', str(response.text))
            except (ValueError, KeyError):
                error_msg = response.text
            return False, f"HTTP {response.status_code}: {error_msg}"

    except requests.exceptions.Timeout:
        return False, "连接超时，请检查网络。"
    except requests.exceptions.ConnectionError:
        return False, "无法连接服务器，请检查网络或Base URL。"
    except Exception as e:
        return False, f"连接测试出错: {str(e)}"


def generate_text(
    config: Any,
    prompt: str,
    system_prompt: Optional[str] = None,
    messages_list: Optional[list] = None,
) -> tuple[bool, str]:
    """生成文本
    
    Args:
        config: AppConfig实例
        prompt: 用户提示词（如果使用messages_list则可以为None）
        system_prompt: 系统提示词(可选)
        messages_list: 完整的消息列表(可选，如果提供则使用这个而不是从prompt构建)
        
    Returns:
        (success: bool, result: str) - 成功标记和结果文本(或错误信息)
    """
    if not _acquire_rate_limit("llm", timeout=30.0):
        return False, "请求过于频繁，请稍后再试"
    try:
        logger = get_logger()

        if not config.enabled:
            return False, "API未启用"

        if config.provider != "Ollama" and not config.api_key:
            return False, "未设置API Key"

        base_url = config.base_url.rstrip('/')
        url = f"{base_url}/chat/completions"

        headers = {
            "Content-Type": "application/json",
        }
        if config.api_key:
            headers["Authorization"] = f"Bearer {config.api_key}"

        messages = _build_messages(messages_list, system_prompt, prompt)

        logger.info(f"=== 发送给API的model ===: {config.model}")
        logger.info(f"=== 发送给API的消息数量 ===: {len(messages)}")

        data = {
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": _safe_max_tokens(config)
        }

        try:
            response = _request_with_retry(url, headers, data)

            if response.status_code == 200:
                result = response.json()
                content = result['choices'][0]['message']['content']
                logger.info(f"=== API返回成功，内容长度 ===: {len(content)}")
                return True, content
            else:
                try:
                    error_info = response.json()
                    error_msg = error_info.get('error', {}).get('message', str(response.text))
                except (ValueError, KeyError):
                    error_msg = response.text
                return False, f"API错误 {response.status_code}: {error_msg}"
        except Exception as e:
            return False, f"请求失败: {str(e)}"

    except Exception as e:
        return False, f"生成失败: {str(e)}"


def generate_text_stream(
    config: Any,
    prompt: str = "",
    system_prompt: Optional[str] = None,
    messages_list: Optional[list] = None,
    on_chunk: Optional[callable] = None,
) -> tuple[bool, str]:
    if not _acquire_rate_limit("stream", timeout=30.0):
        return False, "流式请求过于频繁，请稍后再试"
    try:
        logger = get_logger()

        if not config.enabled:
            return False, "API未启用"

        if config.provider != "Ollama" and not config.api_key:
            return False, "未设置API Key"

        base_url = config.base_url.rstrip('/')
        url = f"{base_url}/chat/completions"

        headers = {
            "Content-Type": "application/json",
        }
        if config.api_key:
            headers["Authorization"] = f"Bearer {config.api_key}"

        messages = _build_messages(messages_list, system_prompt, prompt)

        logger.info(f"=== 流式请求 model={config.model} msgs={len(messages)} ===")

        data = {
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": _safe_max_tokens(config),
            "stream": True,
        }

        try:
            response = requests.post(
                url, headers=headers, json=data, timeout=120, stream=True
            )
            if response.status_code != 200:
                try:
                    error_info = response.json()
                    error_msg = error_info.get('error', {}).get('message', str(response.text))
                except (ValueError, KeyError):
                    error_msg = response.text
                return False, f"API错误 {response.status_code}: {error_msg}"

            full_text = []
            for line in response.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str.strip() == "[DONE]":
                    break
                try:
                    import json
                    chunk = json.loads(data_str)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        full_text.append(content)
                        if on_chunk:
                            on_chunk(content)
                except (ValueError, KeyError, TypeError, AttributeError):
                    continue

            result = "".join(full_text)
            logger.info(f"=== 流式完成，长度: {len(result)} ===")
            return (True, result) if result else (False, "流式响应为空")

        except requests.exceptions.Timeout:
            return False, "流式请求超时"
        except Exception as e:
            return False, f"流式请求失败: {str(e)}"

    except Exception as e:
        return False, f"流式生成失败: {str(e)}"


def _build_messages(
    messages_list: Optional[list],
    system_prompt: Optional[str],
    prompt: str,
) -> list:
    if messages_list:
        messages = messages_list.copy()
        if system_prompt and (not messages or messages[0].get("role") != "system"):
            messages.insert(0, {"role": "system", "content": system_prompt})
        return messages

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    if prompt:
        messages.append({"role": "user", "content": prompt})
    return messages


def generate_text_with_tools(
    config: Any,
    prompt: str = "",
    system_prompt: Optional[str] = None,
    messages_list: Optional[list] = None,
    tools: Optional[list] = None,
) -> tuple[bool, dict]:
    if not _acquire_rate_limit("llm", timeout=30.0):
        return False, {"content": "请求过于频繁，请稍后再试"}
    try:
        logger = get_logger()

        if not config.enabled:
            return False, {"content": "API未启用"}

        if config.provider != "Ollama" and not config.api_key:
            return False, {"content": "未设置API Key"}

        base_url = config.base_url.rstrip('/')
        url = f"{base_url}/chat/completions"

        headers = {"Content-Type": "application/json"}
        if config.api_key:
            headers["Authorization"] = f"Bearer {config.api_key}"

        messages = _build_messages(messages_list, system_prompt, prompt)

        data = {
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": _safe_max_tokens(config),
        }

        if tools:
            data["tools"] = tools

        logger.info(f"=== [tools] model={config.model} msgs={len(messages)} tools={len(tools or [])} ===")

        response = _request_with_retry(url, headers, data)

        if response.status_code != 200:
            try:
                error_info = response.json()
                error_msg = error_info.get('error', {}).get('message', str(response.text))
            except (ValueError, KeyError):
                error_msg = response.text
            return False, {"content": f"API错误 {response.status_code}: {error_msg}"}

        result = response.json()
        choice = result['choices'][0]
        msg = choice.get('message', {})
        content = msg.get('content') or ""
        finish = choice.get('finish_reason', 'stop')

        tool_calls_raw = msg.get('tool_calls')
        tool_calls = []
        if tool_calls_raw:
            for tc in tool_calls_raw:
                fn = tc.get('function', {})
                tool_calls.append({
                    "id": tc.get('id', ''),
                    "name": fn.get('name', ''),
                    "arguments": fn.get('arguments', '{}'),
                })

        logger.info(f"=== [tools] finish={finish} content_len={len(content)} tool_calls={len(tool_calls)} ===")
        return True, {
            "content": content,
            "tool_calls": tool_calls if tool_calls else None,
            "finish_reason": finish,
        }

    except Exception as e:
        return False, {"content": f"生成失败: {str(e)}"}


def generate_text_stream_with_tools(
    config: Any,
    prompt: str = "",
    system_prompt: Optional[str] = None,
    messages_list: Optional[list] = None,
    on_chunk: Optional[callable] = None,
    tools: Optional[list] = None,
) -> tuple[bool, dict]:
    if not _acquire_rate_limit("stream", timeout=30.0):
        return False, {"content": "流式请求过于频繁，请稍后再试"}
    try:
        logger = get_logger()

        if not config.enabled:
            return False, {"content": "API未启用"}

        if config.provider != "Ollama" and not config.api_key:
            return False, {"content": "未设置API Key"}

        base_url = config.base_url.rstrip('/')
        url = f"{base_url}/chat/completions"

        headers = {"Content-Type": "application/json"}
        if config.api_key:
            headers["Authorization"] = f"Bearer {config.api_key}"

        messages = _build_messages(messages_list, system_prompt, prompt)

        data = {
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": _safe_max_tokens(config),
            "stream": True,
        }

        if tools:
            data["tools"] = tools

        logger.info(f"=== [tools-stream] model={config.model} msgs={len(messages)} tools={len(tools or [])} ===")

        response = requests.post(url, headers=headers, json=data, timeout=120, stream=True)
        if response.status_code != 200:
            try:
                error_info = response.json()
                error_msg = error_info.get('error', {}).get('message', str(response.text))
            except (ValueError, KeyError):
                error_msg = response.text
            return False, {"content": f"API错误 {response.status_code}: {error_msg}"}

        full_text = []
        tool_calls_acc: dict[int, dict] = {}
        finish_reason = "stop"

        for line in response.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            data_str = line[6:]
            if data_str.strip() == "[DONE]":
                break
            try:
                import json
                chunk = json.loads(data_str)
                choice = chunk.get("choices", [{}])[0]
                delta = choice.get("delta", {})
                fr = choice.get("finish_reason")
                if fr:
                    finish_reason = fr

                content = delta.get("content", "")
                if content:
                    full_text.append(content)
                    if on_chunk:
                        on_chunk(content)

                tc_list = delta.get("tool_calls") or []
                for tc in tc_list:
                    idx = tc.get("index", 0)
                    if idx not in tool_calls_acc:
                        tool_calls_acc[idx] = {
                            "id": tc.get("id", ""),
                            "name": "",
                            "arguments": "",
                        }
                    acc = tool_calls_acc[idx]
                    if tc.get("id"):
                        acc["id"] = tc["id"]
                    fn = tc.get("function", {})
                    if fn.get("name"):
                        acc["name"] = fn["name"]
                    if fn.get("arguments"):
                        acc["arguments"] += fn["arguments"]
            except (ValueError, KeyError, TypeError, AttributeError):
                continue

        text = "".join(full_text)
        tool_calls = [
            tool_calls_acc[i] for i in sorted(tool_calls_acc.keys())
        ] if tool_calls_acc else None

        logger.info(f"=== [tools-stream] finish={finish_reason} text_len={len(text)} tool_calls={len(tool_calls or [])} ===")
        return True, {
            "content": text,
            "tool_calls": tool_calls,
            "finish_reason": finish_reason,
        }

    except requests.exceptions.Timeout:
        return False, {"content": "流式请求超时"}
    except Exception as e:
        return False, {"content": f"流式请求失败: {str(e)}"}


def _resolve_model_overrides(config: Any, model_type: str = "text") -> dict:
    overrides = {}
    prefix_map = {"text": "", "vision": "vision_", "image": "image_"}
    prefix = prefix_map.get(model_type, "")

    if prefix:
        vmodel = getattr(config, f"{prefix}model", "")
        if vmodel:
            overrides["model"] = vmodel
        vurl = getattr(config, f"{prefix}base_url", "")
        if vurl:
            overrides["base_url"] = vurl
        vkey = getattr(config, f"{prefix}api_key", "")
        if vkey:
            overrides["api_key"] = vkey
        vprovider = getattr(config, f"{prefix}provider", "")
        if vprovider:
            overrides["provider"] = vprovider
        vtemp = getattr(config, f"{prefix}temperature", None)
        if vtemp is not None:
            overrides["temperature"] = float(vtemp)
        vmax = getattr(config, f"{prefix}max_tokens", None)
        if vmax is not None:
            overrides["max_tokens"] = int(vmax)
        venabled = getattr(config, f"{prefix}enabled", None)
        if venabled is not None:
            overrides["enabled"] = venabled

    return overrides


def generate_vision(
    config: Any,
    prompt: str,
    image_base64: str,
    mime_type: str = "image/png",
    system_prompt: str = "你是一个视觉分析助手，请仔细观察图片内容并回答用户的问题。",
) -> tuple[bool, str]:
    if not _acquire_rate_limit("llm", timeout=30.0):
        return False, "视觉请求过于频繁，请稍后再试"
    try:
        logger = get_logger()

        ov = _resolve_model_overrides(config, "vision")
        model = ov.get("model", config.model)
        base_url = ov.get("base_url", config.base_url).rstrip("/")
        api_key = ov.get("api_key", config.api_key)
        enabled = ov.get("enabled", config.enabled)
        temperature = ov.get("temperature", config.temperature)
        max_tokens = ov.get("max_tokens", config.max_tokens)

        if not enabled:
            return False, "API未启用"

        vision_provider = ov.get("provider") or config.provider
        if vision_provider != "Ollama" and not api_key:
            return False, "未设置API Key"

        url = f"{base_url}/chat/completions"

        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {
                        "url": f"data:{mime_type};base64,{image_base64}",
                        "detail": "auto"
                    }}
                ]
            }
        ]

        data = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": min(max_tokens, 16384),
        }

        logger.info(f"=== [vision] model={model} prompt_len={len(prompt)} ===")

        response = _request_with_retry(url, headers, data)

        if response.status_code != 200:
            try:
                error_info = response.json()
                error_msg = error_info.get("error", {}).get("message", str(response.text))
            except (ValueError, KeyError):
                error_msg = response.text
            return False, f"API错误 {response.status_code}: {error_msg}"

        result = response.json()
        content = result["choices"][0]["message"].get("content", "")
        logger.info(f"=== [vision] content_len={len(content)} ===")
        return True, content

    except Exception as e:
        return False, f"Vision分析失败: {str(e)}"


def generate_image(config: Any, prompt: str) -> tuple[bool, str]:
    if not _acquire_rate_limit("image_gen", timeout=60.0):
        return False, "图片生成请求过于频繁，请稍后再试"
    try:
        logger = get_logger()

        ov = _resolve_model_overrides(config, "image")
        image_model = ov.get("model", "")
        image_key = ov.get("api_key", config.api_key)
        image_url_override = ov.get("base_url", "")

        if not config.enabled:
            return False, "API未启用"

        if not config.api_key:
            return False, "未设置API Key"

        if config.provider == "OpenAI":
            url = "https://api.openai.com/v1/images/generations"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {image_key}"
            }
            data = {
                "model": image_model or "dall-e-3",
                "prompt": prompt,
                "n": 1,
                "size": "1024x1024"
            }
        elif config.provider == "Qwen":
            url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {image_key}"
            }
            data = {
                "model": image_model or "qwen-vl",
                "input": {"prompt": prompt},
                "parameters": {"size": "1024x1024"}
            }
        elif config.provider == "豆包":
            url = "https://ark.cn-beijing.volces.com/api/v1/images/generations"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {image_key}"
            }
            data = {
                "model": image_model or config.model,
                "prompt": prompt,
                "n": 1,
                "size": "1024x1024"
            }
        elif image_model and image_url_override:
            url = f"{image_url_override.rstrip('/')}/images/generations"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {image_key}"
            }
            data = {
                "model": image_model,
                "prompt": prompt,
                "n": 1,
                "size": "1024x1024"
            }
        else:
            return False, f"不支持的provider: {config.provider}"

        logger.info(f"=== 发送图片生成请求: provider={config.provider} model={data.get('model')} ===")
        logger.info(f"=== 图片描述长度: {len(prompt)} ===")

        try:
            response = _request_with_retry(url, headers, data, max_retries=2)

            if response.status_code == 200:
                result = response.json()

                # 根据不同provider解析响应
                if config.provider == "OpenAI":
                    image_url = result['data'][0]['url']
                elif config.provider == "Qwen":
                    # Qwen返回格式可能不同，需要根据实际API调整
                    image_url = result.get('output', {}).get('url', '')
                    if not image_url:
                        image_url = result.get('data', [{}])[0].get('url', '')
                elif config.provider == "豆包":
                    image_url = result.get('data', [{}])[0].get('url', '')
                else:
                    image_url = ""

                if image_url:
                    logger.info(f"=== 图片生成成功，URL长度: {len(image_url)} ===")
                    return True, image_url
                else:
                    return False, "API返回中未找到图片URL"
            else:
                try:
                    error_info = response.json()
                    error_msg = error_info.get('error', {}).get('message', str(response.text))
                except (ValueError, KeyError):
                    error_msg = response.text
                return False, f"API错误 {response.status_code}: {error_msg}"
        except Exception as e:
            return False, f"请求失败: {str(e)}"

    except Exception as e:
        return False, f"生成失败: {str(e)}"

