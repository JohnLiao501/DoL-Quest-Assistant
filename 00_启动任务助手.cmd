@echo off
rem DoL Quest Assistant launcher
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required.
  echo Download it from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

node.exe launcher.mjs
set "launcher_code=%errorlevel%"

if not "%launcher_code%"=="0" (
  echo.
  echo Unable to start the helper.
  echo See logs\startup.log for details.
  pause
  endlocal & exit /b %launcher_code%
)

endlocal & exit /b 0
