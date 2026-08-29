"""文本处理工具模块"""
import html
import re
from typing import Any


def clean_text(text: str, strip: bool = True) -> str:
    """
    清理文本
    
    Args:
        text: 要清理的文本
        strip: 是否去除首尾空白
        
    Returns:
        清理后的文本
    """
    if not text:
        return ""

    # 去除多余的空白字符
    cleaned = re.sub(r'\s+', ' ', text)

    if strip:
        cleaned = cleaned.strip()

    return cleaned


def extract_tags(text: str, separator: str = ',') -> list[str]:
    """
    从文本中提取标签
    
    Args:
        text: 包含标签的文本
        separator: 分隔符
        
    Returns:
        标签列表
    """
    if not text:
        return []

    tags = [tag.strip() for tag in text.split(separator)]
    return [tag for tag in tags if tag]


def join_tags(tags: list[str], separator: str = ',') -> str:
    """
    将标签列表连接为字符串
    
    Args:
        tags: 标签列表
        separator: 分隔符
        
    Returns:
        连接后的字符串
    """
    return separator.join([tag.strip() for tag in tags if tag])


def escape_html(text: str) -> str:
    """
    转义HTML特殊字符
    
    Args:
        text: 要转义的文本
        
    Returns:
        转义后的文本
    """
    if not text:
        return ""
    return html.escape(text)


def unescape_html(text: str) -> str:
    """
    取消转义HTML特殊字符
    
    Args:
        text: 要取消转义的文本
        
    Returns:
        取消转义后的文本
    """
    if not text:
        return ""
    return html.unescape(text)


def truncate_text(text: str, max_length: int, ellipsis: str = "...") -> str:
    """
    截断文本
    
    Args:
        text: 要截断的文本
        max_length: 最大长度
        ellipsis: 省略号
        
    Returns:
        截断后的文本
    """
    if not text:
        return ""

    if len(text) <= max_length:
        return text

    return text[:max_length - len(ellipsis)] + ellipsis


def contains_chinese(text: str) -> bool:
    """
    检查文本是否包含中文字符
    
    Args:
        text: 要检查的文本
        
    Returns:
        是否包含中文
    """
    if not text:
        return False
    return bool(re.search(r'[\u4e00-\u9fff]', text))


def slugify(text: str, separator: str = '_') -> str:
    """
    将文本转换为URL友好的格式
    
    Args:
        text: 要转换的文本
        separator: 分隔符
        
    Returns:
        slug化的文本
    """
    if not text:
        return ""

    # 替换非字母数字为分隔符
    text = re.sub(r'[^\w\s-]', '', text.lower())

    # 替换空白为分隔符
    text = re.sub(r'[-\s]+', separator, text)

    # 去除首尾分隔符
    text = text.strip(separator)

    return text


def extract_keywords(text: str, min_length: int = 2, max_length: int = 20) -> list[str]:
    """
    从文本中提取关键词（简单实现）
    
    Args:
        text: 要提取的文本
        min_length: 最小词长
        max_length: 最大词长
        
    Returns:
        关键词列表
    """
    if not text:
        return []

    # 简单地提取所有单词
    words = re.findall(r'[\w\u4e00-\u9fff]+', text)
    keywords = []
    seen = set()

    for word in words:
        if min_length <= len(word) <= max_length and word not in seen:
            keywords.append(word)
            seen.add(word)

    return keywords


def format_template(template: str, context: dict[str, Any]) -> str:
    """
    使用上下文格式化模板
    
    Args:
        template: 模板字符串，使用 {key} 格式
        context: 上下文字典
        
    Returns:
        格式化后的字符串
    """
    if not template:
        return ""

    result = template
    for key, value in context.items():
        placeholder = f"{{{key}}}"
        if placeholder in result:
            result = result.replace(placeholder, str(value))

    return result


def count_words(text: str, count_chinese: bool = True) -> int:
    """
    计算文本的字数
    
    Args:
        text: 要计算的文本
        count_chinese: 是否计数字符（中文）
        
    Returns:
        字数
    """
    if not text:
        return 0

    if count_chinese:
        # 计算所有字符（除了空白）
        return len(re.sub(r'\s', '', text))
    else:
        # 只计算英文单词
        return len(re.findall(r'\b\w+\b', text))


def find_replace(text: str, find_str: str, replace_str: str, case_sensitive: bool = True) -> str:
    """
    查找替换文本
    
    Args:
        text: 要处理的文本
        find_str: 要查找的字符串
        replace_str: 替换为的字符串
        case_sensitive: 是否区分大小写
        
    Returns:
        处理后的文本
    """
    if not text or not find_str:
        return text

    if case_sensitive:
        return text.replace(find_str, replace_str)
    else:
        # 不区分大小写替换
        pattern = re.compile(re.escape(find_str), re.IGNORECASE)
        return pattern.sub(replace_str, text)


def highlight_text(text: str, keywords: list[str], tag: str = 'mark') -> str:
    """
    高亮文本中的关键词
    
    Args:
        text: 要处理的文本
        keywords: 要高亮的关键词列表
        tag: 包裹的HTML标签
        
    Returns:
        高亮后的文本
    """
    if not text or not keywords:
        return text

    result = text
    for keyword in keywords:
        if keyword:
            pattern = re.compile(re.escape(keyword), re.IGNORECASE)
            result = pattern.sub(f'<{tag}>{keyword}</{tag}>', result)

    return result
