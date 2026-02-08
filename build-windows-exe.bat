@echo off
setlocal

cd /d "%~dp0"
title JW-Serial - Build EXE

echo ==================================================
echo   JW-Serial ^| Build Windows executable
 echo ==================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado o no esta en PATH.
  echo Instala Node LTS desde: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm no esta disponible en PATH.
  echo Reinstala Node.js LTS.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [INFO] Dependencias no encontradas. Ejecutando npm install...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install fallo. Revisa conectividad/permisos.
    echo.
    pause
    exit /b 1
  )
)

echo [INFO] Ejecutando: npm run dist:win
call npm run dist:win
set "BUILD_EXIT=%ERRORLEVEL%"

echo.
if not "%BUILD_EXIT%"=="0" (
  echo [ERROR] Build fallo con codigo %BUILD_EXIT%.
  echo Causas comunes:
  echo   - Falta electron-builder (npm install incompleto)
  echo   - Bloqueo de antivirus/permisos
  echo   - Dependencias nativas pendientes
  echo.
  echo Recomendado:
  echo   1) npm install
  echo   2) npm run dist:win
  echo.
  pause
  exit /b %BUILD_EXIT%
)

echo [OK] Build completado.
echo Artefactos en carpeta: release
if exist release (
  start "" explorer "%cd%\release"
)

echo.
echo Este script construye el EXE/instalador. No inicia automaticamente la app.
echo Ejecuta el archivo generado dentro de release.
echo.
pause
exit /b 0
