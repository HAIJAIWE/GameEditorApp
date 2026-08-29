@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo   墨白可视化编辑 - 打包工具（PyArmor 加密版）
echo ============================================
echo.

cd /d "%~dp0.."

REM ──────────────────────────────────────────────
REM 检查 Python
REM ──────────────────────────────────────────────
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Python，请确保 Python 3.14 已安装并添加到 PATH
    pause
    exit /b 1
)

REM ──────────────────────────────────────────────
REM 检查 PyInstaller
REM ──────────────────────────────────────────────
python -c "import PyInstaller" >nul 2>&1
if %errorlevel% neq 0 (
    echo [信息] 正在安装 PyInstaller...
    pip install pyinstaller
    if !errorlevel! neq 0 (
        echo [错误] PyInstaller 安装失败
        pause
        exit /b 1
    )
)

REM ──────────────────────────────────────────────
REM 检查/安装 PyArmor
REM ──────────────────────────────────────────────
python -c "import pyarmor" >nul 2>&1
if %errorlevel% neq 0 (
    echo [信息] 正在安装 PyArmor（代码加密工具）...
    pip install pyarmor
    if !errorlevel! neq 0 (
        echo [错误] PyArmor 安装失败
        pause
        exit /b 1
    )
)

REM ──────────────────────────────────────────────
REM 检查 UPX（可选，用于压缩）
REM ──────────────────────────────────────────────
where upx >nul 2>&1
if %errorlevel% equ 0 (
    echo [信息] 已检测到 UPX，将启用压缩
) else (
    echo [信息] 未检测到 UPX，跳过压缩（不影响功能）
)

echo.
echo ====== 第 1 步：PyArmor 代码加密 ======
echo.

REM 清理旧混淆输出
if exist "scripts\.pyarmor_obf" (
    rmdir /s /q "scripts\.pyarmor_obf"
)

REM PyArmor v8+ 加密源码（排除模板数据和非 Python 文件）
pyarmor gen -O "scripts\.pyarmor_obf" -r src --exclude "src/data" --exclude "*.pyc" --exclude "__pycache__"

if %errorlevel% neq 0 (
    echo [错误] PyArmor 加密失败，可尝试直接打包（不加密）
    choice /c YN /m "是否继续用普通 PyInstaller 打包？"
    if !errorlevel! equ 2 exit /b 1
    goto build_normal
)

echo.
echo ====== 第 2 步：PyInstaller 打包加密代码 ======
echo.
echo [信息] 入口: scripts\.pyarmor_obf\src\app.py
echo [信息] 输出: dist\墨白可视化编辑\
echo.

REM 清理旧的打包
if exist "dist\墨白可视化编辑" (
    rmdir /s /q "dist\墨白可视化编辑"
)
if exist "build" (
    rmdir /s /q "build"
)

REM 设置环境变量让 spec 读取混淆目录（不会修改原始源码）
set "PYARMOR_SRC=%CD%\scripts\.pyarmor_obf\src"

REM 用修改后的 spec 打包（入口指向混淆后的文件）
pyinstaller scripts\build.spec

set BUILD_RESULT=!errorlevel!

REM 清除环境变量
set PYARMOR_SRC=

REM 清理临时文件
echo [信息] 清理临时文件...
if exist "scripts\.pyarmor_obf" (
    rmdir /s /q "scripts\.pyarmor_obf"
)
if exist "build" (
    rmdir /s /q "build"
)

goto build_done

:build_normal

echo.
echo ====== 备选：普通 PyInstaller 打包（无加密） ======
echo.

pyinstaller scripts\build.spec
set BUILD_RESULT=!errorlevel!

:build_done

if %BUILD_RESULT% equ 0 (
    echo.
    echo ============================================
    echo   打包成功!
    echo   输出目录: dist\墨白可视化编辑\
    echo ============================================
    echo.
    echo 运行方式:
    echo   dist\墨白可视化编辑\墨白可视化编辑.exe
    echo.
    echo 注意：PyArmor 加密后的 exe 启动时会检测 pyarmor_runtime，
    echo 如果有人用 pyinstxtractor 拆包得到的 .py 是混淆后的不可读代码。
    echo.
) else (
    echo.
    echo [错误] 打包失败，请检查上方错误信息
    echo. 常见问题：
    echo   1. 缺少依赖 - 用 pip install -r requirements.txt 安装
    echo   2. 路径问题 - 确保在项目根目录运行
    echo   3. PyArmor 许可证 - pip install --upgrade pyarmor
    echo.
)

pause
