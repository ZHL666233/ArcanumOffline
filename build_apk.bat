@echo off
set "JAVA_HOME=D:\AS\jbr"
set "PATH=%JAVA_HOME%\bin;%PATH%"
pushd "%~dp0"
call gradlew.bat assembleDebug %*
popd
