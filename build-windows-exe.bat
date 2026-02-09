@echo off
setlocal EnableExtensions

REM Relaunch in persistent console so output never closes on double click
if /I not "%~1"=="--inner" (
  cmd /k ""%~f0" --inner"
  exit /b
)
shift /1

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
  goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm no esta disponible en PATH.
  echo Reinstala Node.js LTS.
  echo.
  goto :fail
)

where npx >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npx no esta disponible en PATH.
  echo Reinstala Node.js LTS ^(npx viene incluido^).
  echo.
  goto :fail
)

if not exist node_modules (
  echo [INFO] Dependencias no encontradas. Ejecutando npm install...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install fallo. Revisa conectividad/permisos.
    echo.
    goto :fail
  )
)

echo [INFO] Ejecutando: npm run dist:win
call npm run dist:win
set "BUILD_EXIT=%ERRORLEVEL%"

echo.
if not "%BUILD_EXIT%"=="0" (
  echo [ERROR] Build fallo con codigo %BUILD_EXIT%.
  echo Causas comunes:
  echo   - Falta electron-builder ^(npm install incompleto^)
  echo   - Bloqueo de antivirus/permisos
  echo   - Dependencias nativas pendientes
  echo.
  echo Recomendado:
  echo   1^) npm install --include=dev
  echo   2^) npm i -D electron-builder
  echo   3^) npm run dist:win
  echo.
  goto :fail_with_code
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
goto :end

:fail_with_code
echo [FAIL] El proceso termino con error.
exit /b %BUILD_EXIT%

:fail
echo [FAIL] El proceso termino con error.
exit /b 1

:end
exit /b 0
