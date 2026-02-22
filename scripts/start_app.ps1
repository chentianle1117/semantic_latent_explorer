# PowerShell script to start both backend and frontend

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting Zappos Semantic Explorer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Kill any existing processes on ports 8000, 8001, and 3000
Write-Host "Cleaning up existing processes..." -ForegroundColor Yellow
foreach ($port in @(8000, 8001, 3000)) {
    $lines = netstat -ano | Select-String ":$port\s.*LISTENING"
    foreach ($line in $lines) {
        if ($line -match '\s(\d+)\s*$') {
            $pid = $Matches[1]
            if ($pid -and $pid -ne "0") {
                Write-Host "  Killing PID $pid on port $port" -ForegroundColor DarkYellow
                taskkill /PID $pid /F 2>$null | Out-Null
            }
        }
    }
}
Start-Sleep -Seconds 1

# Start backend in new PowerShell window
Write-Host "Starting backend server on port 8000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "conda activate semantic_explorer; cd backend; python api.py"

# Wait for backend to start
Write-Host "Waiting for backend to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Start frontend in new PowerShell window
Write-Host "Starting frontend server on port 3000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "conda activate semantic_explorer; cd frontend; npm run dev"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Both servers starting!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "Frontend: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Wait ~10 seconds, then open:" -ForegroundColor Yellow
Write-Host "  http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop: Close both PowerShell windows" -ForegroundColor Red
Write-Host ""
