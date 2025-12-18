@echo off
echo Starting Django + React...

:: Run frontend in a new terminal window
pushd "%~dp0"
start "TechnoMart Frontend" cmd /k "npm run dev"

:: Move to backend directory
cd /d "%~dp0backend"

:: Activate virtual environment
call .venv\Scripts\activate

:: Run backend in a new terminal window
start "TechnoMart Backend" cmd /k "python manage.py runserver 0.0.0.0:8000"

echo All services started!
popd
