@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Instalar Skill ContabilConnect

set "ORIGEM=%~dp0contabilconnect"
set "DESTINO=%USERPROFILE%\.claude\skills\contabilconnect"

echo.
echo ========================================================
echo   Skill ContabilConnect - JS Contadores
echo ========================================================
echo.

if not exist "%ORIGEM%\SKILL.md" (
    echo [ERRO] Nao encontrei a pasta "contabilconnect" aqui do lado.
    echo.
    echo Extraia o ZIP inteiro antes de rodar este instalador.
    echo Rodar de dentro do ZIP compactado nao funciona.
    echo.
    pause
    exit /b 1
)

if exist "%DESTINO%\SKILL.md" (
    echo A skill ja esta instalada em:
    echo   %DESTINO%
    echo.
    set /p RESPOSTA="Substituir pela versao nova? (S/N): "
    if /i not "!RESPOSTA!"=="S" (
        echo.
        echo Cancelado. Nada foi alterado.
        pause
        exit /b 0
    )
    echo.
)

echo Instalando em: %DESTINO%
echo.

if not exist "%USERPROFILE%\.claude\skills" mkdir "%USERPROFILE%\.claude\skills"
xcopy "%ORIGEM%" "%DESTINO%\" /E /I /Y /Q >nul

if errorlevel 1 (
    echo [ERRO] Nao consegui copiar os arquivos.
    echo Verifique se o Claude Code esta fechado e tente de novo.
    echo.
    pause
    exit /b 1
)

if not exist "%DESTINO%\SKILL.md" (
    echo [ERRO] A copia terminou mas o SKILL.md nao chegou ao destino.
    echo Chame o Welliton: adm.welliton@jscontadores.com.br
    echo.
    pause
    exit /b 1
)

echo [OK] Skill instalada.
echo.

where python >nul 2>&1
if errorlevel 1 (
    where py >nul 2>&1
    if errorlevel 1 (
        echo [AVISO] Python nao encontrado nesta maquina.
        echo         A skill vai funcionar com PDF, mas nao le planilha .xlsx.
        echo         Instale o Python, ou salve o balancete em PDF antes de usar.
        echo.
    )
)

echo ========================================================
echo   PROXIMO PASSO
echo ========================================================
echo.
echo   1. Feche o Claude Code, se estiver aberto
echo   2. Abra de novo
echo   3. Digite:  /contabilconnect
echo.
echo   Se aparecer na lista, esta pronto para usar.
echo.
echo   Leia o COMO-INSTALAR.md para ver como gerar
echo   o arquivo .json e subir no painel.
echo.
pause
