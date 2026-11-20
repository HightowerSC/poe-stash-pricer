@echo off
chcp 65001 >nul
cd /d "%~dp0"
title PoE Stash Pricer

where node >nul 2>nul
if errorlevel 1 (
  echo Brak Node.js. Zainstaluj wersje LTS ze strony https://nodejs.org/ i uruchom ten plik ponownie.
  start "" https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  echo Pierwsze uruchomienie - instaluje biblioteki, to potrwa minute...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( pause & exit /b 1 )
)

call npm start
pause
