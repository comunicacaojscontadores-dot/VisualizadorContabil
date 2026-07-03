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

:: Verifica se JSON tem dados de HOJE — retorna 1 se sim, 0 se precisa coletar
set CHK=python -c "import json,os,sys; f=sys.argv[1]; t=sys.argv[2]; d=json.load(open(f,encoding='utf-8')) if os.path.exists(f) else []; print(1 if any(str(r.get('data','')).startswith(t) for r in d) else 0)"

:: ETAPA 2 — Coletar diários (pula os que já têm dados de hoje)
set ALGO_NOVO=0

for /f "tokens=*" %%r in ('%CHK% dados_dou.json %HOJE%') do set DOU_OK=%%r
if "%DOU_OK%"=="0" (
    echo [%date% %time%] Coletando DOU... >> logs\agente.log
    python coletar_dou.py %HOJE% dados_dou.json >> logs\agente.log 2>&1
    set ALGO_NOVO=1
) else (
    echo [%date% %time%] DOU ja coletado hoje. >> logs\agente.log
)

for /f "tokens=*" %%r in ('%CHK% dados_doe_rj.json %HOJE%') do set RJ_OK=%%r
if "%RJ_OK%"=="0" (
    echo [%date% %time%] Coletando DOE-RJ... >> logs\agente.log
    python coletar_doe_rj.py %HOJE% dados_doe_rj.json >> logs\agente.log 2>&1
    set ALGO_NOVO=1
) else (
    echo [%date% %time%] DOE-RJ ja coletado hoje. >> logs\agente.log
)

for /f "tokens=*" %%r in ('%CHK% dados_doe_es.json %HOJE%') do set ES_OK=%%r
if "%ES_OK%"=="0" (
    echo [%date% %time%] Coletando DOE-ES... >> logs\agente.log
    python coletar_doe_es.py %HOJE% dados_doe_es.json >> logs\agente.log 2>&1
    set ALGO_NOVO=1
) else (
    echo [%date% %time%] DOE-ES ja coletado hoje. >> logs\agente.log
)

for /f "tokens=*" %%r in ('%CHK% dados_doe_mg.json %HOJE%') do set MG_OK=%%r
if "%MG_OK%"=="0" (
    echo [%date% %time%] Coletando DOE-MG... >> logs\agente.log
    python coletar_doe_mg.py %HOJE% dados_doe_mg.json >> logs\agente.log 2>&1
    set ALGO_NOVO=1
) else (
    echo [%date% %time%] DOE-MG ja coletado hoje. >> logs\agente.log
)

for /f "tokens=*" %%r in ('%CHK% dados_doe_sp.json %HOJE%') do set SP_OK=%%r
if "%SP_OK%"=="0" (
    echo [%date% %time%] Coletando DOE-SP... >> logs\agente.log
    python coletar_doe_sp.py %HOJE% dados_doe_sp.json >> logs\agente.log 2>&1
    set ALGO_NOVO=1
) else (
    echo [%date% %time%] DOE-SP ja coletado hoje. >> logs\agente.log
)

:: Se nenhum diário novo foi coletado, encerra sem refazer o Excel
if "%ALGO_NOVO%"=="0" (
    echo [%date% %time%] Todos os diarios ja foram coletados hoje — nada a atualizar. >> logs\agente.log
    exit /b 0
)

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
python -c "
import json, os
from supabase import create_client
from dotenv import load_dotenv
load_dotenv()
sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'])
with open('registros_filtrados.json', encoding='utf-8') as f:
    registros = json.load(f)
for reg in registros:
    try:
        sb.table('diarios_oficiais').upsert({
            'data_publicacao': reg.get('data'),
            'aba': reg.get('_aba'),
            'numero_ato': reg.get('numero_ato'),
            'resumo': reg.get('resumo'),
            'orgao': reg.get('orgao'),
            'tributo_materia': reg.get('tributo_materia'),
            'prazo': reg.get('prazo'),
            'ato_alterado': reg.get('ato_alterado'),
            'numero_doc': reg.get('numero_doc'),
            'link': reg.get('link'),
            'empresa_cliente': reg.get('_empresa', ''),
        }, on_conflict='numero_ato,data_publicacao').execute()
    except Exception as e:
        print(f'Erro Supabase: {e}')
print(f'{len(registros)} registros salvos no Supabase.')
" >> logs\agente.log 2>&1

echo [%date% %time%] Agente finalizado. Executando verificacao... >> logs\agente.log

:: ETAPA 7 — Verificar execução e notificar
python verificar_execucao.py >> logs\agente.log 2>&1

:: ETAPA 8 — Importar resumo do dia para o JS Notícias
echo [%date% %time%] Importando para JS Noticias... >> logs\agente.log
python "C:\Users\01-comunicação\Documents\Programas em Desenvolvimento\js-noticias\importar_diarios.py" >> logs\agente.log 2>&1
echo [%date% %time%] Importacao concluida. >> logs\agente.log
