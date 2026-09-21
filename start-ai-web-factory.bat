@echo off
setlocal
cd /d "%~dp0"
title AI Web Factory Launcher

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5173' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
  start "" "http://127.0.0.1:5173"
  exit /b 0
)

echo.
echo ==========================================
echo   AI Web Factory
echo ==========================================
echo.

echo [1/3] GitHub updates...
git diff --quiet
if errorlevel 1 (
  echo Local changes detected. Auto update skipped for safety.
) else (
  git pull --ff-only
  if errorlevel 1 echo Update failed or unavailable. Starting current version.
)

echo.
echo [2/3] Dependencies...
call npm install
if errorlevel 1 (
  echo.
  echo npm install failed.
  pause
  exit /b 1
)

echo.
echo [3/3] Starting AI Web Factory...
start "AI Web Factory Server" /min cmd /k "cd /d ""%~dp0"" && npm run dev"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; 1..40 | ForEach-Object { try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5173' -TimeoutSec 1 | Out-Null; $ok=$true; break } catch {}; Start-Sleep -Seconds 1 }; if($ok){ Start-Process 'http://127.0.0.1:5173'; exit 0 } else { exit 1 }"

if errorlevel 1 (
  echo.
  echo AI Web Factory could not be confirmed running.
  echo Check the minimized server window for errors.
  pause
  exit /b 1
)

exit /b 0
