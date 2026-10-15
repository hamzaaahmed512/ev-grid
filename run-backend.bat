@echo off
echo 🚀 Starting EV Grid Backend...
cd backend
call venv\Scripts\activate
uvicorn app.main:app --reload