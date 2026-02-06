@echo off
echo ========================================
echo Starting Zappos Semantic Explorer
echo ========================================
echo.

REM Ensure we're in project root (works when double-clicked or run from any dir)
cd /d "%~dp0"
set "PROJECT_ROOT=%~dp0"

REM Start backend in new window (activate conda so uvicorn is available)
echo Starting backend server...
start "Backend Server" cmd /k "call conda activate semantic_explorer && cd /d "%PROJECT_ROOT%backend" && python -m uvicorn api:app --reload"

REM Wait a bit for backend to start
timeout /t 3 /nobreak > nul

REM Start frontend in new window
echo Starting frontend...
start "Frontend Dev Server" cmd /k "cd /d "%PROJECT_ROOT%frontend" && npm run dev"

echo.
echo ========================================
echo Both servers started!
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo ========================================
echo.
echo Press any key to exit this window...
pause > nul
