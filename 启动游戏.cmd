@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 (
  node scripts\serve.mjs
) else if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\serve.mjs
) else (
  echo 没有找到 Node.js。请安装 Node.js 22 或更新版本后重试。
)
pause
