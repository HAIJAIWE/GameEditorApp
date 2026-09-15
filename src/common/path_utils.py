"""路径处理工具模块"""
from pathlib import Path
import shutil


def ensure_dir(dir_path: Path) -> bool:
    """
    确保目录存在，不存在则创建

    Args:
        dir_path: 目录路径

    Returns:
        是否成功
    """
    try:
        dir_path.mkdir(parents=True, exist_ok=True)
        return True
    except Exception:
        return False


def safe_path(path: str) -> Path:
    """
    创建安全的Path对象

    Args:
        path: 路径字符串

    Returns:
        Path对象
    """
    return Path(path).resolve()


def get_file_extension(file_path: Path) -> str:
    """
    获取文件扩展名（小写）

    Args:
        file_path: 文件路径

    Returns:
        扩展名（带点）
    """
    return file_path.suffix.lower()


def get_filename_without_extension(file_path: Path) -> str:
    """
    获取不带扩展名的文件名

    Args:
        file_path: 文件路径

    Returns:
        文件名
    """
    return file_path.stem


def is_image_file(file_path: Path) -> bool:
    """
    判断是否为图片文件

    Args:
        file_path: 文件路径

    Returns:
        是否为图片
    """
    image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico'}
    return file_path.suffix.lower() in image_extensions


def is_json_file(file_path: Path) -> bool:
    """
    判断是否为JSON文件

    Args:
        file_path: 文件路径

    Returns:
        是否为JSON
    """
    return file_path.suffix.lower() == '.json'


def get_file_size(file_path: Path) -> int:
    """
    获取文件大小（字节）

    Args:
        file_path: 文件路径

    Returns:
        文件大小
    """
    try:
        return file_path.stat().st_size
    except Exception:
        return 0


def format_file_size(size_bytes: int) -> str:
    """
    格式化文件大小

    Args:
        size_bytes: 字节数

    Returns:
        格式化的大小字符串
    """
    size: float = size_bytes
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024:
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{size:.2f} TB"


def list_files(dir_path: Path, pattern: str = "*", recursive: bool = False) -> list[Path]:
    """
    列出目录中的文件

    Args:
        dir_path: 目录路径
        pattern: 文件名匹配模式
        recursive: 是否递归查找

    Returns:
        文件路径列表
    """
    if not dir_path.exists():
        return []

    if recursive:
        return list(dir_path.rglob(pattern))
    else:
        return list(dir_path.glob(pattern))


def copy_file(src: Path, dst: Path, overwrite: bool = False) -> bool:
    """
    复制文件

    Args:
        src: 源文件路径
        dst: 目标文件路径
        overwrite: 是否覆盖

    Returns:
        是否成功
    """
    try:
        if not src.exists():
            return False

        if dst.exists() and not overwrite:
            return False

        ensure_dir(dst.parent)
        shutil.copy2(src, dst)
        return True
    except Exception:
        return False


def move_file(src: Path, dst: Path, overwrite: bool = False) -> bool:
    """
    移动文件

    Args:
        src: 源文件路径
        dst: 目标文件路径
        overwrite: 是否覆盖

    Returns:
        是否成功
    """
    try:
        if not src.exists():
            return False

        if dst.exists() and not overwrite:
            return False

        ensure_dir(dst.parent)
        shutil.move(str(src), str(dst))
        return True
    except Exception:
        return False


def delete_file(file_path: Path) -> bool:
    """
    删除文件

    Args:
        file_path: 文件路径

    Returns:
        是否成功
    """
    try:
        if file_path.exists():
            file_path.unlink()
        return True
    except Exception:
        return False


def delete_dir(dir_path: Path, force: bool = False) -> bool:
    """
    删除目录

    Args:
        dir_path: 目录路径
        force: 是否强制删除

    Returns:
        是否成功
    """
    try:
        if dir_path.exists():
            if force:
                shutil.rmtree(dir_path)
            else:
                dir_path.rmdir()
        return True
    except Exception:
        return False


def get_unique_filename(dir_path: Path, base_name: str, extension: str = "") -> Path:
    """
    获取唯一的文件名

    Args:
        dir_path: 目录路径
        base_name: 基础名称
        extension: 扩展名（带点）

    Returns:
        唯一文件路径
    """
    counter = 1
    while True:
        if counter == 1:
            name = f"{base_name}{extension}"
        else:
            name = f"{base_name}_{counter}{extension}"

        file_path = dir_path / name
        if not file_path.exists():
            return file_path

        counter += 1


def get_normalized_path(path: Path) -> str:
    """
    获取规范化的路径字符串（跨平台）

    Args:
        path: 路径

    Returns:
        规范化的路径字符串
    """
    return str(path).replace('\\', '/')


def is_safe_filename(filename: str) -> bool:
    """
    检查文件名是否安全（不包含非法字符）

    Args:
        filename: 文件名

    Returns:
        是否安全
    """
    if not filename:
        return False

    # Windows 非法字符
    illegal_chars = '<>:"/\\|?*'
    for char in illegal_chars:
        if char in filename:
            return False

    # 检查控制字符
    for char in filename:
        if ord(char) < 32:
            return False

    return True


def sanitize_filename(filename: str, replacement: str = "_") -> str:
    """
    清理文件名，移除非法字符

    Args:
        filename: 文件名
        replacement: 替换字符

    Returns:
        清理后的文件名
    """
    if not filename:
        return ""

    result = filename

    # Windows 非法字符
    illegal_chars = '<>:"/\\|?*'
    for char in illegal_chars:
        result = result.replace(char, replacement)

    # 移除控制字符
    result = ''.join(char for char in result if ord(char) >= 32)

    # 去除首尾空白
    result = result.strip()

    # 确保不为空
    if not result:
        result = f"file{replacement}name"

    return result
