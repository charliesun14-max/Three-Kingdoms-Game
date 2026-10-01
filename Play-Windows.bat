@echo off
title Mandate of Heaven
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Install the LTS version from https://nodejs.org ^(opening it now^),
  echo  then double-click Play-Windows.bat again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules\electron (
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
echo  Starting Mandate of Heaven...
call npm run desktop
if errorlevel 1 pause
