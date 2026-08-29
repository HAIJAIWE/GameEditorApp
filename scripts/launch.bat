@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
echo [Starting Mobai Editor...]

set VENV_PYTHON=.venv\Scripts\python.exe
if exist "%VENV_PYTHON%" (
    "%VENV_PYTHON%" src/app.py
) else (
    python src/app.py
)

if errorlevel 1 (
    echo [ERROR: App exited with code %errorlevel%]
    pause
)
