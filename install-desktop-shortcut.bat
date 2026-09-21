@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-desktop-shortcuts.ps1"
if errorlevel 1 (
  echo Failed to create shortcuts.
  pause
  exit /b 1
)
echo Desktop shortcuts created.
timeout /t 3 /nobreak >nul
