# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller 打包配置 - 墨白可视化编辑器"""

import os
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

# 收集 PyQt6 所有子模块
hiddenimports = []
hiddenimports += collect_submodules('PyQt6')
hiddenimports += collect_submodules('PyQt6.QtCore')
hiddenimports += collect_submodules('PyQt6.QtGui')
hiddenimports += collect_submodules('PyQt6.QtWidgets')

# 项目内部模块
hiddenimports += collect_submodules('src')
hiddenimports += collect_submodules('src.core')
hiddenimports += collect_submodules('src.core.agent')
hiddenimports += collect_submodules('src.core.agent.skills')
hiddenimports += collect_submodules('src.core.ceshu')
hiddenimports += collect_submodules('src.ui')
hiddenimports += collect_submodules('src.common')
hiddenimports += collect_submodules('src.security')
hiddenimports += collect_submodules('src.deployment')
hiddenimports += collect_submodules('src.features')
hiddenimports += collect_submodules('src.testing')

# 第三方依赖
hiddenimports += ['json', 'pathlib', 'dataclasses', 'typing', 'enum', 'threading', 'queue', 'socket', 'subprocess', 'ast', 're', 'math', 'time', 'datetime', 'hashlib', 'base64', 'os', 'sys', 'logging', 'tempfile', 'shutil', 'glob', 'fnmatch', 'ipaddress', 'urllib.parse', 'http.client', 'ssl', 'sqlite3']

# 数据文件
datas = []
# 收集配置文件
datas += [('src/config', 'src/config')]
datas += [('src/core/ceshu/templates', 'src/core/ceshu/templates')]
datas += [('src/core/ceshu/game_styles.json', 'src/core/ceshu')]
datas += [('src/core/ceshu/game_modules.json', 'src/core/ceshu')]
datas += [('src/core/ceshu/ceshu_templates.json', 'src/core/ceshu')]
# 收集主题文件
datas += collect_data_files('src/ui/themes')
# 收集资源文件
if os.path.exists('resources'):
    datas += [('resources', 'resources')]

a = Analysis(
    ['src/app.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy', 'scipy', 'pandas'],  # 排除不需要的大库
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='MB-KSHBJQ',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # GUI 应用，不显示控制台
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='resources/icon.ico' if os.path.exists('resources/icon.ico') else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='MB-KSHBJQ',
)
