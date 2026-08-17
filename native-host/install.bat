@echo off
REM Agentao in Chrome — Windows installer (double-click to run)
REM Runs the native host executable with --install. The extension ID is
REM fixed via manifest.json's key field, so no --extension-id is needed.

setlocal
cd /d "%~dp0"

echo ============================================
echo   Agentao in Chrome — Native Host Installer
echo ============================================
echo.

REM Check the executable exists
if not exist "agentao-chrome-host.exe" (
    echo [ERROR] agentao-chrome-host.exe not found.
    echo Make sure you extracted the full archive and did not move this file
    echo out of its folder.
    echo.
    pause
    exit /b 1
)

echo Installing native messaging host...
echo.
"agentao-chrome-host.exe" --install
set RC=%ERRORLEVEL%

echo.
if %RC% equ 0 (
    echo ============================================
    echo   Installation successful!
    echo ============================================
    echo.
    echo Next steps:
    echo   1. Load the extension in chrome://extensions/
    echo      ^(Developer mode -^> Load unpacked^)
    echo   2. Open the Agentao sidebar
    echo   3. Configure your API key in the options page
    echo.
) else (
    echo ============================================
    echo   Installation FAILED (exit code %RC%)
    echo ============================================
    echo.
    echo If Chrome is running, close and reopen it after installing.
    echo.
)

pause
endlocal
