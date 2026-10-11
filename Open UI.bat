@echo off
setlocal EnableExtensions
set PORT=8765
set "UI_DIR=%~dp0ui"
set "URL=http://127.0.0.1:%PORT%/"

if not exist "%UI_DIR%\index.html" (
  echo Could not find ui\index.html next to this script:
  echo   %UI_DIR%\index.html
  pause
  exit /b 1
)

REM Probe: only treat the port as ready if OUR UI answers (artifacts.json present).
powershell -NoProfile -Command ^
  "try { $r = Invoke-WebRequest -Uri '%URL%data/artifacts.json' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200 -and $r.Content.StartsWith('[')) { exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 (
  start "" "%URL%"
  exit /b 0
)

REM Wrong or dead process on the port — free it so we can start the UI server.
powershell -NoProfile -Command ^
  "$conns = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; foreach ($c in $conns) { if ($c.OwningProcess -gt 0) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } }" >nul 2>&1

where python >nul 2>&1
if errorlevel 1 (
  echo Python was not found on PATH.
  echo Install Python from https://www.python.org/ or add it to PATH, then try again.
  pause
  exit /b 1
)

start "DomiNations Artifacts UI" /D "%UI_DIR%" cmd /k python -m http.server %PORT% --bind 127.0.0.1

REM Wait until OUR UI is actually serving.
powershell -NoProfile -Command ^
  "for ($i=0; $i -lt 40; $i++) { try { $r = Invoke-WebRequest -Uri '%URL%data/artifacts.json' -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -eq 200 -and $r.Content.StartsWith('[')) { exit 0 } } catch {}; Start-Sleep -Milliseconds 250 }; exit 1" >nul 2>&1
if errorlevel 1 (
  echo Server did not start correctly on port %PORT%.
  echo Check the "DomiNations Artifacts UI" window for errors.
  pause
  exit /b 1
)

start "" "%URL%"
