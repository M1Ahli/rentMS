@echo off
set PORT=8080
echo Starting local server on http://localhost:%PORT%/
py -3 -m http.server %PORT%
