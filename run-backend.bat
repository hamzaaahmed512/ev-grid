@echo off
echo 🚀 Starting EV Grid Backend...
cd /d "%~dp0backend"
if not exist "venv\Scripts\python.exe" (
    echo Backend environment missing. Run python -m venv backend\venv from the project folder first.
    exit /b 1
)
"venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
