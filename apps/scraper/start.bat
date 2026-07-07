@echo off
title CRM Web Scraper (port 8001)
echo.
echo  ======================================
echo   CRM Web Scraper — Python Microservice
echo   Port: 8001   Mode: hot-reload
echo  ======================================
echo.

cd /d "%~dp0"

:: Find python — try PATH first, then common Windows Store location
set PYTHON=python
where python >nul 2>&1
if errorlevel 1 (
    set PYTHON=C:\Users\%USERNAME%\AppData\Local\Python\pythoncore-3.14-64\python.exe
)

echo [1/3] Installing packages (--prefer-binary, skips compilation)...
%PYTHON% -m pip install --prefer-binary -q fastapi uvicorn httpx beautifulsoup4 playwright selenium webdriver-manager scrapy
if errorlevel 1 (
    echo ERROR: pip install failed.
    pause & exit /b 1
)

echo [2/3] Installing Playwright Chromium browser...
%PYTHON% -m playwright install chromium --quiet

echo.
echo [3/3] Starting scraper on http://localhost:8001
echo       Supports: static (BS4+HTTPX) / dynamic (Playwright) / selenium / spider (Scrapy)
echo.
%PYTHON% -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload

pause
