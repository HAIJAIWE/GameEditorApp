#!/usr/bin/env python3
"""构建脚本 - 一键打包墨白可视化编辑器

用法:
    python build.py              # 构建发布版本
    python build.py --debug      # 构建调试版本（含控制台）
    python build.py --clean      # 清理构建产物
    python build.py --version    # 显示版本信息
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent
BUILD_DIR = PROJECT_ROOT / "build"
DIST_DIR = PROJECT_ROOT / "dist"
SPEC_FILE = PROJECT_ROOT / "build.spec"


def clean_build_artifacts():
    """清理构建产物"""
    print("🧹 清理构建产物...")
    dirs_to_clean = [BUILD_DIR, DIST_DIR, PROJECT_ROOT / "__pycache__"]
    for d in dirs_to_clean:
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)
            print(f"  已删除: {d}")
    # 清理 .pyc 文件
    for pyc in PROJECT_ROOT.rglob("*.pyc"):
        pyc.unlink()
    print("✅ 清理完成")


def check_dependencies():
    """检查构建依赖"""
    print("📦 检查构建依赖...")
    try:
        import PyInstaller
        print(f"  PyInstaller: {PyInstaller.__version__}")
    except ImportError:
        print("  ❌ PyInstaller 未安装，正在安装...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
        print("  ✅ PyInstaller 安装完成")


def build_release(debug=False):
    """构建发布版本"""
    print(f"🚀 开始构建{'（调试模式）' if debug else ''}...")

    check_dependencies()

    # 清理旧产物
    if BUILD_DIR.exists() or DIST_DIR.exists():
        clean_build_artifacts()

    # 构建 PyInstaller 命令
    cmd = [
        sys.executable, "-m", "PyInstaller",
        str(SPEC_FILE),
        "--noconfirm",
        "--clean",
        "--distpath", str(DIST_DIR),
        "--workpath", str(BUILD_DIR),
    ]

    if debug:
        cmd.append("--debug")

    # 执行构建
    print(f"📋 执行: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(PROJECT_ROOT))

    if result.returncode != 0:
        print("❌ 构建失败")
        sys.exit(1)

    # 验证产物
    exe_path = DIST_DIR / "MB-KSHBJQ" / "MB-KSHBJQ.exe"
    if exe_path.exists():
        size_mb = exe_path.stat().st_size / (1024 * 1024)
        print(f"✅ 构建成功！")
        print(f"   产物路径: {exe_path}")
        print(f"   文件大小: {size_mb:.1f} MB")
    else:
        print("⚠️  未找到构建产物，请检查 build.spec 配置")


def show_version():
    """显示版本信息"""
    try:
        from src.deployment.version_manager import VersionManager
        vm = VersionManager()
        info = vm.get_version_info()
        print(f"项目: {info.get('name', 'MB-KSHBJQ')}")
        print(f"版本: {info.get('version', 'unknown')}")
        print(f"Git: {info.get('git_hash', 'unknown')}")
    except Exception as e:
        print(f"无法获取版本信息: {e}")


def main():
    parser = argparse.ArgumentParser(description="墨白可视化编辑器构建脚本")
    parser.add_argument("--debug", action="store_true", help="构建调试版本（含控制台）")
    parser.add_argument("--clean", action="store_true", help="清理构建产物")
    parser.add_argument("--version", action="store_true", help="显示版本信息")
    args = parser.parse_args()

    if args.version:
        show_version()
    elif args.clean:
        clean_build_artifacts()
    else:
        build_release(debug=args.debug)


if __name__ == "__main__":
    main()
