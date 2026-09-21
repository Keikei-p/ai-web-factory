@echo off
title Stop AI Web Factory
echo Stopping AI Web Factory...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=5173,8787; $pids=Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach($pidValue in $pids){ Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue }"
echo Done.
timeout /t 2 /nobreak >nul
