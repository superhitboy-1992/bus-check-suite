@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
set "PORT=5173"
set "FOUND="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
  if "%%P" neq "0" (
    taskkill /PID %%P /F >nul 2>&1
    if not errorlevel 1 set "FOUND=1"
  )
)

if defined FOUND (
  echo 已停止本地预览服务。
) else (
  echo 当前没有在运行的服务。
)
exit /b 0
