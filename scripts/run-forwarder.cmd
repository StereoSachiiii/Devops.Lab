@echo off
rem Run port-forward watchdog silently in background
start /B powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0port-forward.ps1"
