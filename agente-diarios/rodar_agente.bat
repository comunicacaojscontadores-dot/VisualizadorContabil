@echo off
:: Agente Diários Oficiais — executado pelo Agendador de Tarefas (10:00 e 12:00, seg-sex)
:: - 10:00: coleta todos os diários do zero
:: - 12:00: coleta apenas os que ainda não publicaram; se todos ok, encerra sem refazer nada

cd /d "C:\Users\01-comunicação\Documents\Programas em Desenvolvimento\visualizadorcontbil-main\agente-diarios"

:: Cria pasta de logs se não existir
if not exist "logs" mkdir logs

:: Pula sábado (5) e domingo (6)
for /f "tokens=*" %%w in ('python -c "import datetime; print(datetime.date.today().weekday())"') do set WEEKDAY=%%w
if "%WEEKDAY%"=="5" (echo [%date% %time%] Sabado — pulando. >> logs\agente.log & exit /b 0)
if "%WEEKDAY%"=="6" (echo [%date% %time%] Domingo — pulando. >> logs\agente.log & exit /b 0)

:: Data de hoje
for /f "tokens=*" %%d in ('python -c "from datetime import date; print(date.today().isoformat())"') do set HOJE=%%d

echo [%date% %time%] Iniciando agente para %HOJE%... >> logs\agente.log

:: ETAPA 1 — Instalar dependências
python -m pip install -r requirements.txt --quiet >> logs\agente.log 2>&1

:: ETAPA 2 — Coletar TODOS os diários (sempre re-coleta, inclusive 12h/16h,
:: para capturar edições complementares/suplementos publicados durante o dia).
:: O coletar_todos.py preserva dados bons se uma re-coleta vier vazia.
echo [%date% %time%] Coletando todos os diarios... >> logs\agente.log
python coletar_todos.py %HOJE% >> logs\agente.log 2>&1

:: ETAPA 3 — Combinar JSONs
echo [%date% %time%] Combinando registros... >> logs\agente.log
python combinar_jsons.py >> logs\agente.log 2>&1

:: ETAPA 4 — Filtrar e enriquecer com Claude
echo [%date% %time%] Filtrando e enriquecendo... >> logs\agente.log
python filtrar_enriquecer.py dados_combinados.json registros_filtrados.json >> logs\agente.log 2>&1

:: ETAPA 5 — Gerar Excel
echo [%date% %time%] Gerando Excel... >> logs\agente.log
python gerar_excel.py registros_filtrados.json >> logs\agente.log 2>&1

:: ETAPA 6 — Salvar no Supabase
echo [%date% %time%] Salvando no Supabase... >> logs\agente.log
python upload_supabase.py registros_filtrados.json >> logs\agente.log 2>&1

echo [%date% %time%] Agente finalizado. Executando verificacao... >> logs\agente.log

:: ETAPA 7 — Verificar execução e notificar
python verificar_execucao.py >> logs\agente.log 2>&1

:: ETAPA 8 — Importar resumo do dia para o JS Notícias
echo [%date% %time%] Importando para JS Noticias... >> logs\agente.log
python "C:\Users\01-comunicação\Documents\Programas em Desenvolvimento\js-noticias\importar_diarios.py" >> logs\agente.log 2>&1
echo [%date% %time%] Importacao concluida. >> logs\agente.log
