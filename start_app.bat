@echo off
echo ========================================
echo Starting Zappos Semantic Explorer
echo ========================================
echo.

REM Start backend in new window
echo Starting backend server...
start "Backend Server" cmd /k "cd backend && python -m uvicorn api:app --reload"

REM Wait a bit for backend to start
timeout /t 3 /nobreak > nul

REM Start frontend in new window
echo Starting frontend...
start "Frontend Dev Server" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo Both servers started!
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo ========================================
echo.
echo Press any key to exit this window...
pause > nul
