@echo off
title PICALE Launcher
:: ─────────────────────────────────────────────────────────────
::  PICALE — Lanzador de dashboard
:: ─────────────────────────────────────────────────────────────

set DASHBOARD=%~dp0picale_dashboard.html
echo Dashboard: %DASHBOARD%
echo.

:: ── Buscar Chrome ──
set CHROME=
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe"       set CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"         set CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe

if not "%CHROME%"=="" (
    echo Encontrado Chrome: %CHROME%
    echo Abriendo PICALE...
    start "" "%CHROME%" --allow-running-insecure-content --disable-web-security --user-data-dir="%TEMP%\picale_chrome" --no-first-run --disable-features=BlockInsecurePrivateNetworkRequests "%DASHBOARD%"
    goto END
)

:: ── Fallback: Edge con los mismos flags ──
echo Chrome no encontrado. Intentando con Edge...
set EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
if exist "%EDGE%" (
    echo Abriendo con Edge...
    start "" "%EDGE%" --allow-running-insecure-content --disable-web-security --user-data-dir="%TEMP%\picale_edge" --no-first-run "%DASHBOARD%"
    goto END
)

echo.
echo ERROR: No se encontro Chrome ni Edge.
echo Rutas revisadas:
echo   C:\Program Files\Google\Chrome\Application\chrome.exe
echo   C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
echo   %LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
echo.
echo Instala Chrome: https://www.google.com/chrome/
pause
exit /b 1

:END
echo Listo.
timeout /t 2 >nul
