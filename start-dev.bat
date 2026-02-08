@echo off
setlocal EnableExtensions

REM Mantener consola abierta al ejecutar con doble click
if /I not "%~1"=="--inner" (
  cmd /k "\"%~f0\" --inner"
  exit /b
)
shift /1

cd /d "%~dp0"
title JW-Serial - Desarrollo

echo ==================================================
echo   JW-Serial ^| Modo desarrollo
echo ==================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado o no esta en PATH.
  echo Instala Node LTS desde: https://nodejs.org/
  goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm no esta disponible en PATH.
  echo Reinstala Node.js LTS.
  goto :fail
)

echo [INFO] Ejecutando: npm install
call npm install
if errorlevel 1 (
  echo.
  echo [ERROR] npm install fallo. Revisa conectividad/permisos.
  goto :fail
)

echo.
echo [INFO] Ejecutando: npm run dev
call npm run dev
set "DEV_EXIT=%ERRORLEVEL%"

if not "%DEV_EXIT%"=="0" (
  echo.
  echo [ERROR] npm run dev termino con codigo %DEV_EXIT%.
  goto :fail_with_code
)

goto :end

:fail_with_code
echo [FAIL] El proceso termino con error.
exit /b %DEV_EXIT%

:fail
echo [FAIL] El proceso termino con error.
exit /b 1

:end
exit /b 0
