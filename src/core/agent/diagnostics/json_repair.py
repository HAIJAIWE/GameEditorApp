from common.logger import get_logger

logger = get_logger()

import json as _json
import re
from typing import Optional


def parse_agent_output(raw: str) -> Optional[dict]:
    text = raw.strip()
    text = re.sub(r'```\w*\n?', '', text)
    text = text.replace('```', '')
    text = re.sub(r'^【[^】]+】\s*输出\s*JSON\s*[：:]\s*', '', text)
    text = re.sub(r'^【[^】]+】\s*', '', text)
    start = text.find('{')
    end = text.rfind('}')
    if start < 0 or end <= start:
        return None

    js = text[start:end + 1]
    close_idx = js.find('}\n{')
    if close_idx > 0:
        js = js[:close_idx + 1]

    try:
        return _json.loads(js)
    except _json.JSONDecodeError as e:
        logger.debug(f"操作失败: {e}")

    try:
        fixed = repair_json(js)
        if fixed:
            return _json.loads(fixed)
    except Exception as e:
        logger.warning(f"操作失败: {e}")

    return None


def repair_json(text: str) -> Optional[str]:
    fixed = text

    fixed = re.sub(r',\s*}', '}', fixed)
    fixed = re.sub(r',\s*\]', ']', fixed)

    fixed = fixed.replace('\u201c', '"').replace('\u201d', '"')
    fixed = fixed.replace('\u2018', "'").replace('\u2019', "'")

    fixed = re.sub(r'([{,])\s*(\w+)\s*:', r'\1"\2":', fixed)

    fixed = re.sub(r"(?<=[{,])\s*'(\w+)'\s*:", r'"\1":', fixed)
    fixed = re.sub(r":\s*'([^']*)'", r': "\1"', fixed)

    if fixed == text:
        return None
    return fixed
