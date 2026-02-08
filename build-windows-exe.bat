@echo off
setlocal

cd /d "%~dp0"

echo [JW-Serial] Building Windows executable...
call npm run dist:win
if errorlevel 1 (
  echo.
  echo Build failed. Check the terminal output above.
  exit /b 1
)

echo.
echo Done. Artifacts are in the "release" folder.
endlocal
