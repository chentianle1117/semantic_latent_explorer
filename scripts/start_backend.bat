@echo off
echo ========================================
echo Starting Backend Server
echo ========================================
echo.

echo Activating conda environment: semantic_explorer
call conda activate semantic_explorer

if errorlevel 1 (
    echo.
    echo WARNING: Could not activate conda environment
    echo Trying to run with current Python environment...
    echo.
)

echo.
echo Starting FastAPI server on http://localhost:8000
echo.
echo Loading models (this may take 30-60 seconds)...
echo - CLIP embedder
echo - Stable Diffusion generator
echo.
echo Press Ctrl+C to stop the server
echo.

cd backend
python api.py

pause
