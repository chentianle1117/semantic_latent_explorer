@echo off
echo ========================================
echo Zappos Semantic Explorer - Installation
echo ========================================
echo.

echo Step 1/2: Installing Backend Dependencies
echo ------------------------------------------
echo Installing FastAPI, Uvicorn, WebSockets...
echo.

cd backend
pip install fastapi uvicorn[standard] python-multipart websockets

if errorlevel 1 (
    echo.
    echo ERROR: Backend installation failed!
    echo Please check your Python installation and try again.
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
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js found:
node --version
echo.

echo Installing React, D3.js, and other frontend packages...
echo This may take a few minutes...
echo.

cd frontend
call npm install

if errorlevel 1 (
    echo.
    echo ERROR: Frontend installation failed!
    echo Please check your npm installation and try again.
    pause
    exit /b 1
)

cd ..

echo.
echo ========================================
echo ✅ Installation Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Run start_backend.bat  (in one terminal)
echo 2. Run start_frontend.bat (in another terminal)
echo 3. Open http://localhost:3000 in your browser
echo.
echo See INSTALLATION.md and REACT_README.md for more details.
echo.

pause
