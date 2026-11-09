@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install.ps1"
set "installExit=%errorlevel%"
echo.
pause
exit /b %installExit%
