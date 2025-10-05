@echo off
echo ========================================
echo Starting Zappos Semantic Explorer
echo ========================================
echo.
echo Opening backend and frontend in separate windows...
echo.

:: Start backend in new window
start "Zappos Backend (Port 8000)" cmd /k "conda activate semantic_explorer && cd backend && python api.py"

:: Wait 3 seconds for backend to start
echo Waiting for backend to initialize...
timeout /t 3 /nobreak >nul

:: Start frontend in new window
start "Zappos Frontend (Port 3000)" cmd /k "conda activate semantic_explorer && cd frontend && npm run dev"

echo.
echo ========================================
echo Both servers starting!
echo ========================================
echo.
echo Backend: http://localhost:8000 (check backend window)
echo Frontend: http://localhost:3000 (check frontend window)
echo.
echo Wait ~10 seconds, then open: http://localhost:3000
echo.
echo To stop: Close both terminal windows or press Ctrl+C in each
echo.

pause
