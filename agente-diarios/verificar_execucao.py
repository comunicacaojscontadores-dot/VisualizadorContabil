"""
verificar_execucao.py
Verifica se a automação do dia rodou corretamente e exibe relatório.
Chamado pelo rodar_agente.bat ao final de cada execução.
"""
import json
import os
import sys
from datetime import date
from pathlib import Path

PASTA_Z = Path(r"Z:\001 JS CONTADORES LTDA\PROCEDIMENTOS MARCOS PAULO\MARCOS PAULO\DOUGLAS COMUNICAÇÃO\Úteis\Resumo do Dia 1.2")
DIR = Path(__file__).parent
HOJE = date.today().isoformat()
DATA_FMT = f"{HOJE[8:10]}/{HOJE[5:7]}/{HOJE[:4]}"


def carregar_json(nome):
    caminho = DIR / nome
    if not caminho.exists():
        return []
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def checar_supabase():
    """Retorna (ok: bool, detalhe: str). Detecta projeto pausado (DNS falha)."""
    import socket
    try:
        from dotenv import load_dotenv
        load_dotenv(dotenv_path=str(DIR / ".env"))
    except Exception:
        pass
    url = os.environ.get("SUPABASE_URL", "")
    if not url:
        return False, "SUPABASE_URL não configurado no .env"
    host = url.replace("https://", "").replace("http://", "").split("/")[0]
    try:
        socket.gethostbyname(host)
        return True, "acessível"
    except Exception:
        return False, f"host '{host}' não resolve (projeto possivelmente PAUSADO)"


def verificar():
    combinados = carregar_json("dados_combinados.json")
    filtrados  = carregar_json("registros_filtrados.json")

    # Filtra só os de hoje
    comb_hoje = [r for r in combinados if str(r.get("data", "")).startswith(HOJE)]
    filt_hoje = [r for r in filtrados  if str(r.get("data", "")).startswith(HOJE)]

    # Excel gerado?
    excel = PASTA_Z / f"Resumo_Diarios_{HOJE}.xlsx"
    excel_ok = excel.exists()

    # Coleta por fonte
    por_fonte = {}
    for r in comb_hoje:
        aba = r.get("_aba", "?")
        por_fonte[aba] = por_fonte.get(aba, 0) + 1

    # Registros enriquecidos (têm resumo com mais de 30 chars — não é texto fragmentado)
    enriquecidos = [r for r in filt_hoje if len(r.get("resumo", "")) > 30]

    # ── Problemas detectados ────────────────────────────────────────
    problemas = []

    if not comb_hoje:
        problemas.append("NENHUM registro coletado hoje (possível falha nos coletores).")

    if comb_hoje and not filt_hoje:
        problemas.append("Registros coletados mas NENHUM sobreviveu ao filtro.")

    if filt_hoje and not enriquecidos:
        problemas.append("Registros filtrados mas NENHUM foi enriquecido pelo Claude.")

    if not excel_ok:
        problemas.append(f"Excel NÃO encontrado em Z: ({excel.name}).")

    sem_resumo = [r.get("numero_ato", "?") for r in filt_hoje if not r.get("resumo")]
    if sem_resumo:
        problemas.append(f"{len(sem_resumo)} registro(s) sem resumo: {', '.join(sem_resumo[:3])}")

    # Conectividade do Supabase (base da versão online)
    sb_ok, sb_detalhe = checar_supabase()
    if not sb_ok:
        problemas.append(f"Supabase inacessível: {sb_detalhe}")

    # ── Relatório texto ─────────────────────────────────────────────
    linhas = [
        f"{'='*55}",
        f"  VERIFICAÇÃO — {DATA_FMT}",
        f"{'='*55}",
        f"  Coleta por fonte:",
    ]
    if por_fonte:
        for aba, n in sorted(por_fonte.items()):
            linhas.append(f"    {aba}: {n} registro(s)")
    else:
        linhas.append("    (nenhum)")

    linhas += [
        f"",
        f"  Total coletado hoje : {len(comb_hoje)}",
        f"  Após filtro         : {len(filt_hoje)}",
        f"  Enriquecidos        : {len(enriquecidos)}",
        f"  Excel gerado        : {'SIM OK' if excel_ok else 'NAO GERADO'}",
        f"  Supabase            : {'OK' if sb_ok else 'FALHOU - ' + sb_detalhe}",
    ]

    if filt_hoje:
        linhas += ["", "  Registros do dia:"]
        for r in filt_hoje:
            resumo = r.get("resumo", "")[:90]
            linhas.append(f"    [{r.get('_aba','?')}] {r.get('numero_ato','?')}")
            if resumo:
                linhas.append(f"      {resumo}{'...' if len(r.get('resumo','')) > 90 else ''}")

    if problemas:
        linhas += ["", "  PROBLEMAS DETECTADOS:"]
        for p in problemas:
            linhas += [f"    • {p}"]
    else:
        linhas += ["", "  Execução concluída sem erros."]

    linhas.append(f"{'='*55}")

    relatorio = "\n".join(linhas)
    print(relatorio, flush=True)

    # ── Notificação Windows ─────────────────────────────────────────
    if problemas:
        titulo = "Agente Diarios - ATENCAO"
        corpo  = f"{len(problemas)} problema(s) detectado(s). Verifique o log."
    else:
        titulo = "Agente Diarios - OK"
        corpo  = (
            f"{DATA_FMT}: {len(filt_hoje)} ato(s) relevante(s) | "
            f"Excel gerado às {__import__('datetime').datetime.now().strftime('%H:%M')}"
        )

    ps_cmd = (
        f'$xml=[xml]\'<toast><visual><binding template="ToastGeneric">'
        f'<text>{titulo}</text><text>{corpo}</text>'
        f'</binding></visual></toast>\'; '
        f'[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]|Out-Null; '
        f'$n=[Windows.UI.Notifications.ToastNotification]::new($xml); '
        f'[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(\'Agente Diarios\').Show($n)'
    )
    os.system(f'powershell -WindowStyle Hidden -Command "{ps_cmd}" 2>nul')

    return len(problemas) == 0


if __name__ == "__main__":
    ok = verificar()
    sys.exit(0 if ok else 1)
