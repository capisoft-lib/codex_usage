@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 ou plus recent est requis.
  echo https://nodejs.org/
  pause
  exit /b 1
)

node -e "if (Number(process.versions.node.split('.')[0]) < 20) process.exit(1)"
if errorlevel 1 (
  echo Cette version de Node.js est trop ancienne. Installez Node.js 20 ou plus recent.
  pause
  exit /b 1
)

if defined PORT (set "DASHBOARD_PORT=%PORT%") else (set "DASHBOARD_PORT=4317")
echo Ouverture du dashboard local sur http://127.0.0.1:%DASHBOARD_PORT%
echo Fermez cette fenetre ou appuyez sur Ctrl+C pour l'arreter.
node server.mjs

if errorlevel 1 pause
