"""Lucide 图标 — 嵌入式 SVG Path 渲染（零依赖，MIT）

来源: Lucide Icons https://lucide.dev (MIT License)
所有图标 24x24 viewBox, stroke-width:2, stroke-linecap:round, stroke-linejoin:round
"""
from __future__ import annotations

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor, QIcon, QPainter, QPainterPath, QPen, QPixmap

# ── 图标 path 数据 (Lucide Icons, MIT License, 24x24 viewBox) ──
_ICON_PATHS: dict[str, list[str]] = {
    "alert-triangle":  ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
    "arrow-down":      ['M12 5v14', 'm19 12-7 7-7-7'],
    "arrow-up":        ['M12 19V5', 'm5 12 7-7 7 7'],
    "arrow-left":      ['m12 19-7-7 7-7', 'M19 12H5'],
    "arrow-right":     ['M5 12h14', 'm12 5 7 7-7 7'],
    "book-open":       ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
    "bookmark":        ['M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z'],
    "bot":             ['M12 8V4H8', 'M2 14h2', 'M20 14h2', 'M15 13v2', 'M9 13v2'],
    "brain":           ['M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z', 'M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z', 'M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4', 'M17.599 6.5a3 3 0 0 0 .399-1.375', 'M6.003 5.125A3 3 0 0 0 6.401 6.5', 'M3.477 10.896a4 4 0 0 1 .585-.396', 'M19.938 10.5a4 4 0 0 1 .585.396', 'M6 18a4 4 0 0 1-1.967-.516', 'M19.967 17.484A4 4 0 0 1 18 18'],
    "check":           ['M20 6 9 17l-5-5'],
    "chevrons":        ['m7 15 5 5 5-5', 'm7 9 5-5 5 5'],
    "clipboard":       ['M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z'],
    "clock":           ['M12 6v6l4 2', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z'],
    "cloud":           ['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'],
    "database":        ['M3 5V19A9 3 0 0 0 21 19V5', 'M3 12A9 3 0 0 0 21 12'],
    "download":        ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
    "droplet":         ['M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z'],
    "export":          ['M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6', 'm21 3-9 9', 'M15 3h6v6'],
    "file-text":       ['M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z', 'M14 2v5a1 1 0 0 0 1 1h5', 'M10 9H8', 'M16 13H8', 'M16 17H8'],
    "flame":           ['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6.5 1.724 1.897 3 3.43 3 6.5a2.5 2.5 0 0 0 5 0c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6.5 1.724 1.897 3 3.43 3 6.5a2.5 2.5 0 0 0 5 0c0-1.38-.5-2-1-3', 'M8.5 14.5A2.5 2.5 0 0 1 11 12c0-1.38.5-2 1-3', 'M8.5 14.5A2.5 2.5 0 0 1 6 12c0-1.38.5-2 1-3'],
    "folder":          ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'],
    "heart":           ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
    "house":           ['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', 'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    "lightbulb":       ['M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z', 'M9 21h6', 'M10 18h4'],
    "link":            ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
    "lock":            ['M7 11V7a5 5 0 0 1 10 0v4', 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M12 15v3'],
    "package":         ['M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z', 'M12 22V12', 'm7.5 4.27 9 5.15'],
    "pencil":          ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z', 'm15 5 4 4'],
    "plus":            ['M5 12h14', 'M12 5v14'],
    "refresh":         ['M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', 'M21 3v5h-5'],
    "search":          ['M21 21l-4.35-4.35', 'M11 6a5 5 0 1 0 0 10 5 5 0 0 0 0-10'],
    "settings":        ['M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915'],
    "shield":          ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.06 1.06 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
    "star":            ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
    "swords":          ['M14.5 17.5 3 6V3h3l11.5 11.5', 'M13 19l6-6', 'm16 16 4 4', 'm19 21 2-2', 'M14.5 6.5 3 17v3h3l11.5-11.5'],
    "target":          ['M12 12m-10 0a10 10 0 1 0 20 0 10 10 0 0 0-20 0', 'M12 12m-6 0a6 6 0 1 0 12 0 6 6 0 0 0-12 0', 'M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0'],
    "trash":           ['M10 11v6', 'M14 11v6', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M3 6h18', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
    "trophy":          ['M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M6 4h12', 'M3 6h18', 'M12 17v4', 'M8 21h8'],
    "upload":          ['M12 3v12', 'm17 8-5-5-5 5', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'],
    "wand":            ['M15 4V2', 'M15 16v-2', 'M8 9h2', 'M20 9h2', 'M17.8 11.8 19 13', 'M15 9h.01', 'M17.8 6.2 19 5', 'm3 21 9-9', 'M12.2 6.2 11 5'],
    "wrench":          ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'],
    "x":               ['M18 6 6 18', 'm6 6 12 12'],
    "zap":             ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
}

# ── 映射：友好名 → 实际 path 名 ──
_ALIASES = {
    "home": "house", "document": "file-text", "edit": "pencil",
    "save": "database", "close": "x", "warning": "alert-triangle",
    "chevron-down": "arrow-down", "chevron-right": "arrow-right",
    "chevron-left": "arrow-left", "chevron-up": "arrow-up", "sparkles": "bot", "trash": "trash",
    "clipboard": "clipboard", "book": "book-open", "ai": "bot",
    "sword": "swords", "diamond": "droplet", "gem": "droplet",
    "lightbulb": "lightbulb", "heart": "heart", "lock": "lock",
    "star": "star", "shield": "shield", "clock": "clock",
    "cloud": "cloud", "zap": "zap", "flame": "flame",
    "download": "download", "target": "target",
    "wrench": "wrench", "trophy": "trophy",
    "wand": "wand", "brain": "brain",
}

_cache: dict[str, QIcon] = {}
_FG = QColor("#666666")
_ICON_SIZE = 24


def get_icon(name: str, color: str | QColor = "#666666", size: int = 18) -> QIcon:
    """获取 Lucide 图标"""
    import sys
    real = _ALIASES.get(name, name)
    c = QColor(color) if isinstance(color, str) else color
    key = f"{real}:{c.name()}:{size}"

    if key in _cache:
        return _cache[key]

    paths = _ICON_PATHS.get(real)
    if paths is None:
        print(f"[Lucide] MISSING icon: '{name}' (real='{real}')", file=sys.stderr, flush=True)
        return QIcon()

    pix = QPixmap(size, size)
    pix.fill(Qt.GlobalColor.transparent)

    painter = QPainter(pix)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)

    pen = QPen(c, 2.5, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap, Qt.PenJoinStyle.RoundJoin)
    painter.setPen(pen)
    painter.setBrush(Qt.BrushStyle.NoBrush)

    scale = size / _ICON_SIZE
    painter.translate(1, 1)
    painter.scale(scale, scale)

    for d in paths:
        p = QPainterPath()
        _svg_path_to_qpainter(p, d)
        painter.drawPath(p)

    painter.end()

    icon = QIcon(pix)
    _cache[key] = icon
    print(f"[Lucide] ✓ {name} ({size}px, {c.name()})", file=sys.stderr, flush=True)
    return icon


def _svg_path_to_qpainter(p: QPainterPath, d: str) -> None:
    """解析 SVG path d 属性 — 处理隐式命令 + 圆弧近似"""
    import re
    tokens = re.findall(r'[A-Za-z]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?', d)
    if not tokens:
        return

    i = 0
    x, y = 0.0, 0.0       # 当前位置
    start_x, start_y = 0.0, 0.0  # 子路径起点
    last_cmd = 'M'        # 默认隐式命令
    last_rel = False      # 上一个命令是否相对

    def _val(idx: int) -> float:
        return float(tokens[idx])

    def _nx(n: int) -> list[float]:
        nonlocal i
        v = [_val(i + j) for j in range(n)]
        i += n
        return v

    while i < len(tokens):
        c = tokens[i]
        if c[0].isalpha():
            i += 1
            rel = c.islower()
            last_rel = rel
            c = c.upper()           # 标准化为大写
            last_cmd = c
        else:
            # 隐式命令：重复上一个
            c = last_cmd
            rel = last_rel

        if c == 'M':
            v = _nx(2)
            x, y = (v[0], v[1]) if not rel else (x + v[0], y + v[1])
            start_x, start_y = x, y
            p.moveTo(x, y)
            # M 后面的隐式命令变为 L
            last_cmd = 'L' if not rel else 'l'
        elif c == 'L':
            v = _nx(2)
            x, y = (v[0], v[1]) if not rel else (x + v[0], y + v[1])
            p.lineTo(x, y)
        elif c == 'H':
            v = _nx(1)
            x = v[0] if not rel else x + v[0]
            p.lineTo(x, y)
        elif c == 'V':
            v = _nx(1)
            y = v[0] if not rel else y + v[0]
            p.lineTo(x, y)
        elif c == 'C':
            v = _nx(6)
            cx1, cy1 = (v[0], v[1]) if not rel else (x+v[0], y+v[1])
            cx2, cy2 = (v[2], v[3]) if not rel else (x+v[2], y+v[3])
            ex,  ey  = (v[4], v[5]) if not rel else (x+v[4], y+v[5])
            p.cubicTo(cx1, cy1, cx2, cy2, ex, ey)
            x, y = ex, ey
        elif c == 'S':
            # Smooth cubic (反射控制点)
            v = _nx(4)
            ex = (v[2], v[3]) if not rel else (x+v[2], y+v[3])
            p.lineTo(ex[0], ex[1])  # 简化为直线
            x, y = ex[0], ex[1]
        elif c == 'Q':
            v = _nx(4)
            ex = (v[2], v[3]) if not rel else (x+v[2], y+v[3])
            p.lineTo(ex[0], ex[1])
            x, y = ex[0], ex[1]
        elif c == 'A':
            # 圆弧 → 简化为直线（足够用于 icon 渲染）
            v = _nx(7)
            ex = (v[5], v[6]) if not rel else (x+v[5], y+v[6])
            p.lineTo(ex[0], ex[1])
            x, y = ex[0], ex[1]
        elif c == 'Z':
            p.closeSubpath()
            x, y = start_x, start_y
        else:
            # 未知命令，跳过参数
            while i < len(tokens) and not tokens[i][0].isalpha():
                i += 1


def set_color(color: str) -> None:
    global _FG
    _FG = QColor(color)


def clear_cache() -> None:
    _cache.clear()
