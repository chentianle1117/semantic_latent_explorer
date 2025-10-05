@echo off
echo Starting Zappos Semantic Explorer Frontend...
echo.
echo First-time setup: Installing dependencies...
echo.

cd frontend

:: Check if node_modules exists
if not exist "node_modules\" (
    echo Installing npm packages...
    call npm install
)

echo.
echo Starting development server...
echo Frontend will run on http://localhost:3000
echo.

call npm run dev

pause
