@echo off
title Mandate of Heaven - export to Unreal Engine
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Install the LTS version from https://nodejs.org ^(opening it now^),
  echo  then double-click Export-Unreal-Windows.bat again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules\playwright (
  echo.
  echo  First run: downloading the game's tools. This takes a few minutes...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  Installing failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo.
echo  Making sure the hidden browser used for exporting is installed...
call npx playwright install chromium
echo.
echo  Exporting every region for Unreal Engine. This can take 10-20 minutes; leave this window open.
echo.
call node tools\unreal\export-world.mjs
if errorlevel 1 (
  echo.
  echo  The export stopped with an error. Copy the text above and send it to Claude.
  pause
  exit /b 1
)
start "" "%~dp0unreal-export"
pause
