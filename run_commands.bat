@echo off
cd /d D:\Ngoding\expr\baniakhzab

echo ===== Running npm run test =====
npm run test
set TEST_EXIT=%errorlevel%
echo Test exit code: %TEST_EXIT%

echo.
echo ===== Running npm run build =====
npm run build
set BUILD_EXIT=%errorlevel%
echo Build exit code: %BUILD_EXIT%

exit /b 0
