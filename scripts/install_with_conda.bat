@echo off
echo ========================================
echo Zappos Semantic Explorer - Installation
echo ========================================
echo.

echo Activating conda environment: semantic_explorer
echo.

:: Activate conda environment
call conda activate semantic_explorer

if errorlevel 1 (
    echo.
    echo ERROR: Failed to activate conda environment 'semantic_explorer'
    echo.
    echo Please create it first with:
    echo   conda create -n semantic_explorer python=3.10
    echo.
    pause
    exit /b 1
)

echo ✅ Conda environment activated
echo.

echo Step 1/2: Installing Backend Dependencies
echo ------------------------------------------
echo Installing FastAPI, Uvicorn, WebSockets...
echo.

cd backend
pip install fastapi==0.109.0 uvicorn[standard]==0.27.0 python-multipart==0.0.6 websockets==12.0

if errorlevel 1 (
    echo.
    echo ERROR: Backend installation failed!
    echo Please check your conda environment and try again.
    pause
    exit /b 1
)

echo.
echo ✅ Backend dependencies installed successfully!
echo.

cd ..

echo Step 2/2: Installing Frontend Dependencies
echo ------------------------------------------
echo.
echo Checking Node.js installation...

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo ERROR: Node.js not found!
    echo.
    echo Please install Node.js from https://nodejs.org/
    echo Download the LTS version (18.x or newer)
    echo.
    pause
    exit /b 1
)

echo Node.js found:
node --version
npm --version
echo.

echo Installing React, D3.js, and other frontend packages...
echo This may take 2-3 minutes on first install...
echo.

cd frontend
call npm install

if errorlevel 1 (
    echo.
    echo ERROR: Frontend installation failed!
    echo.
    echo Try manually:
    echo   cd frontend
    echo   npm cache clean --force
    echo   npm install
    echo.
    pause
    exit /b 1
)

cd ..

echo.
echo ========================================
echo ✅ Installation Complete!
echo ========================================
echo.
echo Installed:
echo   Backend: FastAPI, Uvicorn, WebSockets
echo   Frontend: React, D3.js, Zustand, TypeScript
echo.
echo Environment: semantic_explorer (conda)
echo.
echo Next steps:
echo   1. Run: start_backend.bat  (in one terminal)
echo   2. Run: start_frontend.bat (in another terminal)
echo   3. Open: http://localhost:3000
echo.
echo See QUICK_START.md for usage guide.
echo.

pause
