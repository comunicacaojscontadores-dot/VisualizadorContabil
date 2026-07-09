"""
Gera o Excel formatado de resumo diário dos diários oficiais.
Uso: python gerar_excel.py registros_filtrados.json [saida.xlsx]
"""
import json
import os
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

try:
    from openpyxl.cell.rich_text import CellRichText, TextBlock
    from openpyxl.cell.text import InlineFont
    RICH_TEXT_OK = True
except ImportError:
    RICH_TEXT_OK = False

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

PASTA_SAIDA_PADRAO = os.getenv(
    "PASTA_SAIDA",
    r"Z:\001 JS CONTADORES LTDA\PROCEDIMENTOS MARCOS PAULO\MARCOS PAULO\DOUGLAS COMUNICAÇÃO\Úteis\Resumo do Dia 1.2"
)

# Ordem das abas
ABAS = ["DOU", "DOERJ", "DOE-MG", "DOE-ES", "DOE-SP"]

NOMES_DIARIOS = {
    "DOU":    "Diário Oficial da União (DOU)",
    "DOERJ":  "Diário Oficial do Estado do RJ",
    "DOE-ES": "Diário Oficial do Estado do ES",
    "DOE-MG": "Diário Oficial do Estado de MG",
    "DOE-SP": "Diário Oficial do Estado de SP",
}

SIGLAS_DIARIOS = {
    "DOU":    "DOU",
    "DOERJ":  "DOERJ",
    "DOE-ES": "DOE-ES",
    "DOE-MG": "DOE-MG",
    "DOE-SP": "DOE-SP",
}

# 8 colunas dos diários — larguras exatas do modelo de referência
COLUNAS = [
    ("DATA",              12),
    ("Nº DO ATO",         18),
    ("ATO ALTERADO",      22),
    ("RESUMO",            55),
    ("ÓRGÃO",             18),
    ("PRAZO",             18),
    ("TRIBUTO / MATÉRIA", 18),
    ("Nº DOC (Id)",       18),
]

# 9 colunas da aba Jurisprudência — larguras do modelo de referência
COLUNAS_JURIS = [
    ("FONTE",                 12),
    ("SESSÃO",                12),
    ("RECURSO/CONSULTA Nº",   20),
    ("PROCESSO",              20),
    ("RECORRENTE/CONSULENTE", 24),
    ("ACÓRDÃO/Nº",            16),
    ("TEMA-EMENTA",           50),
    ("RESULTADO",             18),
    ("RELEVÂNCIA",            14),
]

COR_HEADER = "1F3864"  # azul escuro
FONTE_LINK = Font(name="Arial", size=10, color="0563C1", underline="single")


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def normalizar(texto: str) -> str:
    return unicodedata.normalize("NFD", texto.upper()).encode("ascii", "ignore").decode()


def formatar_numero_doc(reg: dict) -> str:
    """Formata coluna Nº DOC (Id) como 'SIGLA DATA [- Id XXX]'."""
    aba   = reg.get("_aba", "")
    data  = reg.get("data", "")
    ndoc  = str(reg.get("numero_doc", "") or "").strip()
    sigla = SIGLAS_DIARIOS.get(aba, aba)

    # Converte data YYYY-MM-DD → DD/MM/YYYY
    if data and len(data) == 10 and data[4] == "-":
        d, m, y = data[5:7], data[8:10], data[:4]
        data_fmt = f"{d}/{m}/{y}"
    else:
        data_fmt = data

    base = f"{sigla} {data_fmt}".strip()
    if ndoc and ndoc not in ("0", ""):
        return f"{base} - Id {ndoc}"
    return base


def eh_jurisprudencia(reg: dict) -> bool:
    """Detecta se o registro é acórdão / recurso / resposta à consulta."""
    texto = " ".join([
        reg.get("numero_ato", ""),
        reg.get("resumo", ""),
        reg.get("tributo_materia", ""),
    ]).upper()
    palavras = ["ACÓRDÃO", "ACORDAO", "RECURSO Nº", "RECURSO N.", "CONSELHO DE CONTRIBUINTES",
                "CÂMARA JULGADORA", "CAMARA JULGADORA", "RESPOSTA À CONSULTA", "RESPOSTA A CONSULTA",
                "TRIBUNAL ADMINISTRATIVO", "JULGAMENTO", "CCERJ", "CCJF", "CJCE", "TJAM-ADM"]
    return any(p in texto for p in palavras)


def extrair_campos_juris(reg: dict) -> dict:
    """Extrai campos estruturados de um registro de jurisprudência."""
    resumo = reg.get("resumo", "")
    numero_ato = reg.get("numero_ato", "")

    # Processo: busca padrões como E-04/035/265/2015 ou SEI-E-04/...
    processo = "—"
    m = re.search(r"(?:Processo[:\s]+|SEI[-\s]?)([\w/\-\.]+)", resumo, re.IGNORECASE)
    if m:
        processo = m.group(1).strip()

    # Recorrente/Consulente
    recorrente = "—"
    m2 = re.search(r"(?:Recorrente|Consulente|Contribuinte)[:\s]+([^\n\.]+)", resumo, re.IGNORECASE)
    if m2:
        recorrente = m2.group(1).strip()[:80]
    else:
        # Tenta pegar nome de empresa no resumo
        m3 = re.search(r"([A-Z][A-Z\s]{5,}(?:LTDA|S\.?A\.?|ME|EPP))", resumo)
        if m3:
            recorrente = m3.group(1).strip()[:80]

    # Acórdão nº
    acordao = "—"
    m4 = re.search(r"Ac[oó]rd[aã]o\s+n[ºo°]?\s*([\d\.]+)", resumo + " " + numero_ato, re.IGNORECASE)
    if m4:
        acordao = f"Acórdão nº {m4.group(1)}"

    # Resultado (última parte do resumo)
    resultado = "—"
    for keyword in ["negado provimento", "dado provimento", "parcial provimento",
                    "não conhecido", "acolhida", "anulado", "mantido", "provido"]:
        if keyword.lower() in resumo.lower():
            resultado = keyword.capitalize()
            break

    # Relevância
    relevancia = "Média"
    texto_upper = (resumo + " " + numero_ato).upper()
    if any(k in texto_upper for k in ["ICMS", "IPVA", "ISS", "FGTS", "ESOCIAL", "REFIS"]):
        relevancia = "Alta"

    return {
        "fonte":      reg.get("_aba", ""),
        "sessao":     reg.get("data", ""),
        "recurso":    numero_ato,
        "processo":   processo,
        "recorrente": recorrente,
        "acordao":    acordao,
        "ementa":     resumo[:500],
        "resultado":  resultado,
        "relevancia": relevancia,
    }


# ──────────────────────────────────────────────
# Estilo
# ──────────────────────────────────────────────

def estilo_header(ws, cor_hex: str, colunas: list):
    fill  = PatternFill("solid", fgColor=cor_hex)
    fonte = Font(name="Arial", bold=True, color="FFFFFF", size=10)
    alin  = Alignment(horizontal="center", vertical="center", wrap_text=False)
    borda_thin = Side(style="thin", color="FFFFFF")
    borda = Border(left=borda_thin, right=borda_thin, bottom=borda_thin)

    for col_idx, (nome, largura) in enumerate(colunas, 1):
        cell = ws.cell(row=1, column=col_idx, value=nome)
        cell.font  = fonte
        cell.fill  = fill
        cell.alignment = alin
        cell.border = borda
        ws.column_dimensions[get_column_letter(col_idx)].width = largura

    ws.row_dimensions[1].height = 22
    ws.freeze_panes = "A2"


def escrever_linha(ws, row: int, reg: dict):
    alin_wrap = Alignment(vertical="top", wrap_text=True)
    alin_top  = Alignment(vertical="top", wrap_text=False)
    fonte = Font(name="Arial", size=10)

    # Formata data DD/MM/AAAA
    data = reg.get("data", "")
    if data and len(data) == 10 and data[4] == "-":
        data = f"{data[8:10]}/{data[5:7]}/{data[:4]}"

    valores = [
        data,
        reg.get("numero_ato", ""),
        reg.get("ato_alterado", "") or "—",
        reg.get("resumo", ""),
        reg.get("orgao", ""),
        reg.get("prazo", "") or "—",
        reg.get("tributo_materia", ""),
        formatar_numero_doc(reg),
    ]

    link = reg.get("link", "")
    for col_idx, valor in enumerate(valores, 1):
        cell = ws.cell(row=row, column=col_idx, value=valor)
        # Colunas de texto longo: wrap. Demais: top sem wrap
        cell.alignment = alin_wrap if col_idx in (3, 4, 5, 7) else alin_top
        if col_idx == 2 and link:
            cell.hyperlink = link
            cell.font = FONTE_LINK
        else:
            cell.font = fonte

    ws.row_dimensions[row].height = None


def escrever_linha_juris(ws, row: int, campos: dict):
    alin_wrap = Alignment(vertical="top", wrap_text=True)
    alin_top  = Alignment(vertical="top", wrap_text=False)
    fonte = Font(name="Arial", size=10)

    # Formata sessão DD/MM/AAAA
    sessao = campos.get("sessao", "")
    if sessao and len(sessao) == 10 and sessao[4] == "-":
        sessao = f"{sessao[8:10]}/{sessao[5:7]}/{sessao[:4]}"

    valores = [
        campos.get("fonte", ""),
        sessao,
        campos.get("recurso", ""),
        campos.get("processo", ""),
        campos.get("recorrente", ""),
        campos.get("acordao", ""),
        campos.get("ementa", ""),
        campos.get("resultado", ""),
        campos.get("relevancia", ""),
    ]

    for col_idx, valor in enumerate(valores, 1):
        cell = ws.cell(row=row, column=col_idx, value=valor)
        cell.font = fonte
        cell.alignment = alin_wrap if col_idx in (3, 5, 7) else alin_top

    ws.row_dimensions[row].height = None


def escrever_linha_vazia(ws, data_str: str, aba: str, n_coletados: int):
    """Linha única com — nos campos e mensagem explicativa no RESUMO."""
    alin_wrap = Alignment(vertical="top", wrap_text=True)
    alin_top  = Alignment(vertical="top", wrap_text=False)
    fonte = Font(name="Arial", size=10, italic=True, color="555555")
    nome_diario = NOMES_DIARIOS.get(aba, aba)
    sigla = SIGLAS_DIARIOS.get(aba, aba)

    # Formata data
    data_fmt = data_str
    if data_str and len(data_str) == 10 and data_str[4] == "-":
        data_fmt = f"{data_str[8:10]}/{data_str[5:7]}/{data_str[:4]}"

    if n_coletados == 0:
        msg = f"Ainda não publicado hoje — {nome_diario} não saiu até o momento desta geração."
    else:
        msg = (f"Publicado hoje — {nome_diario} teve {n_coletados} ato(s) publicado(s), "
               f"porém nenhum é de natureza fiscal, tributária ou trabalhista.")

    valores = [
        data_fmt,     # DATA
        "—",          # Nº DO ATO
        "—",          # ATO ALTERADO
        msg,          # RESUMO
        sigla,        # ÓRGÃO
        "—",          # PRAZO
        "—",          # TRIBUTO / MATÉRIA
        f"{sigla} {data_fmt}",  # Nº DOC (Id)
    ]

    cor_fundo = "FFE082" if n_coletados == 0 else "E3F2FD"
    fill = PatternFill("solid", fgColor=cor_fundo)

    for col_idx, valor in enumerate(valores, 1):
        cell = ws.cell(row=2, column=col_idx, value=valor)
        cell.font = fonte
        cell.fill = fill
        cell.alignment = alin_wrap if col_idx == 4 else alin_top


def _rich_text_negrito(texto: str, termo: str):
    if not RICH_TEXT_OK or not termo:
        return None
    pattern = re.compile(re.escape(termo), re.IGNORECASE)
    partes = pattern.split(texto)
    ocorrencias = pattern.findall(texto)
    if not ocorrencias:
        return None
    fn = InlineFont(rFont="Arial", sz=10)
    fb = InlineFont(rFont="Arial", sz=10, b=True)
    blocos = []
    for i, parte in enumerate(partes):
        if parte:
            blocos.append(TextBlock(fn, parte))
        if i < len(ocorrencias):
            blocos.append(TextBlock(fb, ocorrencias[i]))
    return CellRichText(*blocos) if blocos else None


# ──────────────────────────────────────────────
# Clientes
# ──────────────────────────────────────────────

def carregar_clientes() -> list:
    caminho = Path(__file__).parent / "clientes.json"
    if not caminho.exists():
        return []
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def buscar_mencoes_clientes(todos_registros: list, clientes: list) -> list:
    cliente_patterns = {}
    for cliente in clientes:
        nome = cliente["nome"]
        patterns = []
        for termo in cliente["busca"]:
            nt = normalizar(termo)
            try:
                pat = re.compile("(?<![A-Z])" + re.escape(nt) + "(?![A-Z])")
            except re.error:
                pat = re.compile(re.escape(nt))
            patterns.append((termo, pat))
        cliente_patterns[nome] = patterns

    mencoes_por_cliente: dict[str, list] = {c["nome"]: [] for c in clientes}

    # Mapa nome-normalizado -> cliente, para honrar o _empresa já detectado pelo coletor
    norm_para_cliente = {normalizar(c["nome"]): c for c in clientes}

    for reg in todos_registros:
        texto_norm = normalizar(
            f"{reg.get('numero_ato','')} {reg.get('resumo','')} {reg.get('orgao','')}"
        )
        marcados = set()

        # 1) Honra o _empresa que o coletor já detectou (matching sobre o texto COMPLETO,
        #    que pode ter a menção fora do resumo). Cliente detectado nunca pode sumir.
        emp = normalizar(reg.get("_empresa", "") or "")
        if emp:
            cli = norm_para_cliente.get(emp)
            if not cli:  # tenta casamento parcial (nome do cliente contém/está contido)
                for n_norm, c in norm_para_cliente.items():
                    if emp and (emp in n_norm or n_norm in emp):
                        cli = c; break
            if cli:
                nome = cli["nome"]
                mencoes_por_cliente[nome].append({
                    "cliente": nome, "termo_usado": reg.get("_empresa", ""), "_encontrado": True,
                    "data": reg.get("data", ""), "_aba": reg.get("_aba", ""),
                    "numero_ato": reg.get("numero_ato", ""), "ato_alterado": reg.get("ato_alterado", "") or "—",
                    "resumo": reg.get("resumo", ""), "orgao": reg.get("orgao", ""),
                    "prazo": reg.get("prazo", "") or "—", "tributo_materia": reg.get("tributo_materia", ""),
                    "numero_doc": reg.get("numero_doc", ""), "link": reg.get("link", ""),
                })
                marcados.add(nome)

        # 2) Matching por palavras de busca sobre numero_ato+resumo+orgao
        for cliente in clientes:
            nome = cliente["nome"]
            if nome in marcados:
                continue
            for termo, pat in cliente_patterns[nome]:
                if pat.search(texto_norm):
                    mencoes_por_cliente[nome].append({
                        "cliente":     nome,
                        "termo_usado": termo,
                        "_encontrado": True,
                        "data":        reg.get("data", ""),
                        "_aba":        reg.get("_aba", ""),
                        "numero_ato":  reg.get("numero_ato", ""),
                        "ato_alterado": reg.get("ato_alterado", "") or "—",
                        "resumo":      reg.get("resumo", ""),
                        "orgao":       reg.get("orgao", ""),
                        "prazo":       reg.get("prazo", "") or "—",
                        "tributo_materia": reg.get("tributo_materia", ""),
                        "numero_doc":  reg.get("numero_doc", ""),
                        "link":        reg.get("link", ""),
                    })
                    marcados.add(nome)
                    break

    encontrados = []
    for cliente in clientes:
        encontrados.extend(mencoes_por_cliente[cliente["nome"]])

    return encontrados


def escrever_linha_cliente(ws, row: int, mencao: dict):
    alin_wrap = Alignment(vertical="top", wrap_text=True)
    alin_top  = Alignment(vertical="top", wrap_text=False)
    fonte = Font(name="Arial", size=10)

    data = mencao.get("data", "")
    if data and len(data) == 10 and data[4] == "-":
        data = f"{data[8:10]}/{data[5:7]}/{data[:4]}"

    # RESUMO: prepend cliente name for visibility
    cliente = mencao.get("cliente", "")
    resumo_original = mencao.get("resumo", "")
    resumo = resumo_original  # Claude já inclui o nome no resumo quando há menção

    valores = [
        data,
        mencao.get("numero_ato", ""),
        mencao.get("ato_alterado", "") or "—",
        resumo,
        mencao.get("orgao", ""),
        mencao.get("prazo", "") or "—",
        mencao.get("tributo_materia", ""),
        formatar_numero_doc(mencao),
    ]

    # Fundo levemente verde para encontrados
    fill = PatternFill("solid", fgColor="E8F5E9")
    termo = mencao.get("termo_usado", "")

    link = mencao.get("link", "")
    for col_idx, valor in enumerate(valores, 1):
        cell = ws.cell(row=row, column=col_idx, value=valor)
        cell.fill = fill
        cell.alignment = alin_wrap if col_idx in (3, 4, 5, 7) else alin_top

        # Destaca o termo do cliente em negrito no RESUMO
        if col_idx == 4 and termo and RICH_TEXT_OK:
            rich = _rich_text_negrito(str(valor), termo)
            if rich:
                cell.value = rich
                continue

        if col_idx == 2 and link:
            cell.hyperlink = link
            cell.font = FONTE_LINK
        else:
            cell.font = fonte

    ws.row_dimensions[row].height = None


# ──────────────────────────────────────────────
# Criação do workbook
# ──────────────────────────────────────────────

def criar_excel(registros: list, caminho_saida: str, todos_registros: list = None):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    # Separa registros de jurisprudência dos normais
    regs_normais = [r for r in registros if not eh_jurisprudencia(r)]
    regs_juris   = [r for r in registros if eh_jurisprudencia(r)]

    # ── Abas dos diários ──
    planilhas = {}
    for aba in ABAS:
        ws = wb.create_sheet(title=aba)
        estilo_header(ws, COR_HEADER, COLUNAS)
        planilhas[aba] = ws

    linhas = {aba: 2 for aba in planilhas}

    for reg in regs_normais:
        aba = reg.get("_aba", "DOU")
        if aba not in planilhas:
            aba = "DOU"
        escrever_linha(planilhas[aba], linhas[aba], reg)
        linhas[aba] += 1

    # Conta coletados por aba (para mensagem de vazio)
    coletados_por_aba: dict[str, int] = {}
    for reg in (todos_registros or registros):
        a = reg.get("_aba", "DOU")
        coletados_por_aba[a] = coletados_por_aba.get(a, 0) + 1

    # Data do relatório (pega a data dos registros ou hoje)
    todas_datas = [r.get("data", "") for r in (todos_registros or registros) if r.get("data")]
    data_relatorio = max(todas_datas) if todas_datas else date.today().isoformat()

    # Abas sem dados: linha explicativa
    for aba in ABAS:
        if planilhas[aba].max_row <= 1:
            n = coletados_por_aba.get(aba, 0)
            escrever_linha_vazia(planilhas[aba], data_relatorio, aba, n)

    # ── Aba Clientes ──
    clientes = carregar_clientes()
    fonte_busca = todos_registros or registros
    if clientes:
        mencoes = buscar_mencoes_clientes(fonte_busca, clientes)
        nomes_encontrados = {m["cliente"] for m in mencoes}
        ws_cli = wb.create_sheet(title="Clientes")
        estilo_header(ws_cli, COR_HEADER, COLUNAS)

        data_fmt = data_relatorio
        if data_relatorio and len(data_relatorio) == 10:
            data_fmt = f"{data_relatorio[8:10]}/{data_relatorio[5:7]}/{data_relatorio[:4]}"
        fonte_vazia = Font(name="Arial", size=10, italic=True, color="888888")
        fill_vazia = PatternFill("solid", fgColor="F5F5F5")

        row = 2

        # 1º — clientes COM menção (aparecem no topo para o diretor ver imediatamente)
        for cliente in clientes:
            nome = cliente["nome"]
            mencoes_cliente = [m for m in mencoes if m["cliente"] == nome]
            if mencoes_cliente:
                for m in mencoes_cliente:
                    escrever_linha_cliente(ws_cli, row, m)
                    row += 1

        # 2º — clientes SEM menção (cinza, abaixo dos encontrados)
        for cliente in clientes:
            nome = cliente["nome"]
            if nome not in nomes_encontrados:
                valores_vazios = [data_fmt, nome, "—", "Nada a informar nos diários de hoje.", "—", "—", "—", "—"]
                for col_idx, valor in enumerate(valores_vazios, 1):
                    cell = ws_cli.cell(row=row, column=col_idx, value=valor)
                    cell.font = fonte_vazia
                    cell.fill = fill_vazia
                    cell.alignment = Alignment(vertical="top", wrap_text=False)
                row += 1

        encontrados = len(nomes_encontrados)
        print(f"  Aba Clientes JS: {encontrados} encontrado(s) / {len(clientes) - encontrados} não citado(s)")

    # ── Aba Jurisprudência ── sempre criada, mesmo sem conteúdo, para deixar
    # explícito que a verificação foi feita (não fica "esquecida" silenciosamente).
    ws_juris = wb.create_sheet(title="Jurisprudencia")
    estilo_header(ws_juris, COR_HEADER, COLUNAS_JURIS)
    if regs_juris:
        for i, reg in enumerate(regs_juris, 2):
            campos = extrair_campos_juris(reg)
            escrever_linha_juris(ws_juris, i, campos)
    else:
        fonte_vazia_j = Font(name="Arial", size=10, italic=True, color="555555")
        valores = ["—", "—", "—",
                   "Nenhum acórdão, recurso julgado ou resposta à consulta foi "
                   "publicado nos diários de hoje.",
                   "—", "—", "—", "—", "—"]
        for col_idx, valor in enumerate(valores, 1):
            cell = ws_juris.cell(row=2, column=col_idx, value=valor)
            cell.font = fonte_vazia_j
            cell.alignment = Alignment(vertical="top", wrap_text=True)
        print("  Aba Jurisprudencia: 0 acórdão(s)/recurso(s) hoje — registrado 'nada a informar'.")

    wb.save(caminho_saida)
    print(f"Excel salvo: {caminho_saida}")


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Uso: python gerar_excel.py registros.json [saida.xlsx]")
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        registros = json.load(f)

    todos_registros = registros
    # Arg 3 (opcional): caminho do combinados; se não passado, usa dados_combinados.json
    if len(sys.argv) >= 4:
        try:
            with open(sys.argv[3], encoding="utf-8") as f:
                todos_registros = json.load(f)
        except Exception:
            pass
    else:
        combinados_path = Path(__file__).parent / "dados_combinados.json"
        if combinados_path.exists():
            try:
                with open(combinados_path, encoding="utf-8") as f:
                    todos_registros = json.load(f)
            except Exception:
                pass

    if len(sys.argv) >= 3:
        caminho = sys.argv[2]
    else:
        hoje = date.today().isoformat()
        pasta = Path(PASTA_SAIDA_PADRAO)
        try:
            pasta.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            print(f"Aviso: não foi possível criar pasta '{pasta}': {e}", file=sys.stderr)
            pasta = Path.home() / "Desktop"
            pasta.mkdir(parents=True, exist_ok=True)
        caminho = str(pasta / f"Resumo_Diarios_{hoje}.xlsx")

    criar_excel(registros, caminho, todos_registros)


if __name__ == "__main__":
    main()

