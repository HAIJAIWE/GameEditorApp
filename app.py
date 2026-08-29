#!/usr/bin/env python3
"""MB KSHBJQ(墨白可视化编辑) — 游戏数据编辑器入口（启动器，代码在 src/ 下）"""
import sys
import os
from pathlib import Path

# 将 src/ 加入模块搜索路径
_src = str(Path(__file__).resolve().parent / "src")
if _src not in sys.path:
    sys.path.insert(0, _src)
    os.chdir(Path(__file__).parent)

if __name__ == "__main__":
    from app import main
    main()
