@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
set "APPDIR=%~dp0"
set "PORT=5173"

rem ---- 1. 找到 node.exe ----
set "NODE="
for %%I in (node.exe) do if not defined NODE set "NODE=%%~$PATH:I"
if not defined NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE if exist "%LOCALAPPDATA%\OpenAI\Codex\runtimes" (
  for /r "%LOCALAPPDATA%\OpenAI\Codex\runtimes" %%F in (node.exe) do (
    if not defined NODE set "NODE=%%F"
  )
)
if not defined NODE (
  echo [错误] 找不到 node.exe，请先安装 Node.js 后重试。
  pause
  exit /b 1
)

rem ---- 2. 已经在跑就不重复启动 ----
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul
if not errorlevel 1 goto :ready

echo 正在启动本地预览服务...
powershell -NoProfile -Command "Start-Process -FilePath '%NODE%' -ArgumentList 'node_modules/vite/bin/vite.js','--host','0.0.0.0','--port','%PORT%','--strictPort' -WorkingDirectory '%APPDIR%' -WindowStyle Hidden"

rem ---- 3. 等端口就绪（最多 20 秒）----
powershell -NoProfile -Command "for($i=0;$i -lt 40;$i++){ try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',%PORT%); $c.Close(); exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
if errorlevel 1 (
  echo [错误] 服务启动失败，请确认 5173 端口没有被占用。
  pause
  exit /b 1
)

:ready
set "LANIP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "TMPIP=%%A"
  set "TMPIP=!TMPIP: =!"
  if not defined LANIP set "LANIP=!TMPIP!"
)

echo.
echo   预览已就绪：
echo     本机：http://localhost:%PORT%/
if defined LANIP echo     局域网：http://!LANIP!:%PORT%/
echo.
echo   关闭服务请运行 stop-preview.cmd

if "%~1"=="--no-open" exit /b 0
start "" "http://localhost:%PORT%/"
exit /b 0
