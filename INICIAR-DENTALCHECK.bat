@echo off
title DENTALCHECK
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org e tente de novo. & pause & exit /b)
start "" http://localhost:5173
node server\servidor.mjs
pause
