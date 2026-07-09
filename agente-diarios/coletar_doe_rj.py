"""
Coleta publicações do Diário Oficial do Estado do RJ (IOERJ).
Fonte: https://www.ioerj.com.br — somente Poder Executivo (Parte I)
Fluxo:
  1. GET do_seleciona_edicao.php?data={base64(YYYYMMDD)} → pega cookie PHP + link Parte I
  2. GET mostra_edicao.php?session={token} → servidor gera tmp.pdf
  3. GET include/pdfjs/web/tmp.pdf → baixa o PDF
  4. Extrai texto via pdfminer e filtra palavras fiscais/trabalhistas
"""
import base64
import io
import json
import re
import sys
import time
from datetime import date, timedelta

try:
    from curl_cffi import requests as curl_requests
    _USE_CURL_CFFI = True
except Exception:
    import requests as curl_requests
    _USE_CURL_CFFI = False
from bs4 import BeautifulSoup

try:
    from pdfminer.high_level import extract_text_to_fp
    from pdfminer.layout import LAParams
    PDFMINER_OK = True
except Exception:
    PDFMINER_OK = False

try:
    import pypdf
    PYPDF_OK = True
except Exception:
    PYPDF_OK = False

try:
    import pdfplumber
    PDFPLUMBER_OK = True
except Exception:
    PDFPLUMBER_OK = False

try:
    import fitz  # pymupdf
    PYMUPDF_OK = True
except Exception:
    PYMUPDF_OK = False

try:
    from termos_clientes import carregar_termos, cliente_mencionado
    TERMOS_CLIENTES = carregar_termos()
except Exception:
    TERMOS_CLIENTES = []
    def cliente_mencionado(texto, termos): return ""

BASE = "https://www.ioerj.com.br/portal/modules/conteudoonline"

# Palavras que devem ser encontradas como substrings (suficiente para identificar o tema)
PALAVRAS_FISCAIS_SUBSTR = [
    "tribut", "fiscal", "imposto", "alíquota", "isenção",
    "substituição tributária", "crédito tributário", "auto de infração", "multa fiscal",
    "simples nacional", "microempresa", "empresa de pequeno",
    "trabalhist", "previdênci", "salário mínimo", "rescisão", "demissão",
    "sefaz", "secretaria de fazenda", "receita estadual",
    "base de cálculo",
    # Obrigações acessórias e benefícios (novas — mais meticuloso)
    "sped", "efd", "cbenef", "código de benefício", "benefício fiscal",
    "benefícios fiscais", "crédito presumido", "diferimento", "regime especial",
    "confaz", "convênio icms", "protocolo icms",
    # Pauta / valores de referência / fundos e leis RJ
    "pauta", "pmpf", "preço médio ponderado", "valor de referência",
    "fundo orçamentário temporário", "feef",
    "9.025", "9025", "6.979", "6979",
]

# Palavras curtas que exigem word boundary (para evitar "MEI" em "Meira", "ISS" em "Assessor")
PALAVRAS_FISCAIS_WORD = [
    r"\bicms\b", r"\biss\b", r"\bissqn\b", r"\bipva\b", r"\biof\b", r"\birpj\b",
    r"\bcsll\b", r"\bpis\b", r"\bcofins\b", r"\bipi\b", r"\bmei\b", r"\binss\b",
    r"\bfgts\b", r"\bclt\b", r"\bfot\b",
]

PALAVRAS_EXCLUIR = [
    "nomeação", "nomeado", "nomear", "exoneração", "exonerado", "exonerar",
    "designação", "designado", "designar", "concurso público",
    "abertura de crédito", "crédito suplementar",
    "pensão por morte", "licença para tratar",
    "cedido", "cessão de servidor",
]

# Marcadores de início de novo ato no DOE-RJ
# N\xba = Nº (ordinal masculino U+00BA como pdfminer extrai do PDF)
_N = r"N[O\xba\xb0o]"
MARCADORES_ATO = re.compile(
    r"(?m)^\*?(DECRETO\s+" + _N + r"|"
    r"RESOLU[C\xc7][A\xc3]O\s+(?:SEFAZ|SER|CONJUNTA)?\s*" + _N + r"|"
    r"PORTARIA\s+(?:SEFAZ|SUT[RI]*|SUPTRIB|SUPDIEF|SUCIEF|SAF|SER|CONJUNTA)?\s*" + _N + r"|"
    r"LEI\s+" + _N + r"|INSTRU[C\xc7][A\xc3]O\s+NORMATIVA\s+" + _N + r"|"
    r"DELIBERA[C\xc7][A\xc3]O\s+" + _N + r"|DESPACHO\s+" + _N + r"|"
    # Jurisprudência: Conselho de Contribuintes (acórdãos e recursos de ICMS)
    r"AC[\xd3\xf3Oo]RD[\xc3\xe3Aa]O\s+" + _N + r"|RECURSO\s+" + _N + r")\s*\d",
    re.IGNORECASE
)

# Palavras que indicam ata/reunião de comissão fiscal (ex.: CPPDE da SEFAZ/CODIN,
# enquadramento em tratamento tributário especial) OU jurisprudência (Conselho de
# Contribuintes). Passam direto pelo filtro fiscal.
MARCADORES_COMISSAO = [
    "cppde", "reunião ordinária", "reuniao ordinaria",
    "reunião extraordinária", "reuniao extraordinaria",
    "tratamento tributário especial", "tratamento tributario especial",
    "enquadramento", "codin",
    # Jurisprudência
    "conselho de contribuintes", "conselho pleno", "acórdão", "acordao",
    "câmara julgadora", "camara julgadora", "recorrente", "recorrida",
    "ementa:", "resposta à consulta", "resposta a consulta",
]

if _USE_CURL_CFFI:
    session = curl_requests.Session(impersonate="chrome124")
else:
    session = curl_requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
    })


def data_para_base64(data_str: str) -> str:
    """Converte '2026-06-18' → base64('20260618')."""
    data_sem_hifen = data_str.replace("-", "")
    return base64.b64encode(data_sem_hifen.encode()).decode()


def _abs_href(href: str) -> str:
    if href.startswith("http"):
        return href
    return f"https://www.ioerj.com.br{href}" if href.startswith("/") else f"{BASE}/{href}"


def obter_links_parte_i(data_str: str) -> list[str]:
    """Retorna TODOS os links da Parte I (Poder Executivo) do dia, incluindo
    suplementos / 2ª edição. Atas da CPPDE (SEFAZ/CODIN) costumam sair em edição
    suplementar publicada mais tarde — por isso baixamos todas as edições listadas."""
    data_b64 = data_para_base64(data_str)
    url = f"{BASE}/do_seleciona_edicao.php?data={data_b64}"
    try:
        r = session.get(url, timeout=20)
        r.raise_for_status()
    except Exception as e:
        print(f"  IOERJ: erro ao acessar seleção: {e}", file=sys.stderr)
        return []

    html_text = r.text
    if "não foi publicado" in html_text.lower() or "não encontrado" in html_text.lower():
        print(f"  IOERJ: edição não publicada para {data_str}", file=sys.stderr)
        return []

    soup = BeautifulSoup(html_text, "html.parser")

    links: list[str] = []
    for a in soup.find_all("a", href=True):
        texto = a.get_text(strip=True).lower()
        href = a["href"]
        if "mostra_edicao" not in href:
            continue
        # Aceita Parte I e suas variações (suplemento, 2ª edição, extra), mas
        # exclui Parte IB (Tribunal de Contas), Parte II, IV e V.
        eh_parte_i = ("poder executivo" in texto) or (
            texto.startswith("parte i") and "parte ib" not in texto and "parte ii" not in texto
            and "parte iv" not in texto and "parte v" not in texto
        )
        if eh_parte_i:
            u = _abs_href(href)
            if u not in links:
                links.append(u)
                print(f"  IOERJ: edição Parte I encontrada -> {texto[:50]!r}", file=sys.stderr)

    if not links:
        print(f"  IOERJ: nenhum link Parte I encontrado em {data_str}", file=sys.stderr)
    return links


def obter_link_parte_i(data_str: str) -> str | None:
    """Compatibilidade: retorna o primeiro link da Parte I (ou None)."""
    links = obter_links_parte_i(data_str)
    return links[0] if links else None


def gerar_pdf(url_mostra: str) -> bytes | None:
    """Baixa o PDF real da edição via navegador headless (Playwright).

    IMPORTANTE: o IOERJ NÃO serve o PDF por requisição HTTP simples. O caminho
    antigo `include/pdfjs/web/tmp.pdf` é um arquivo ESTÁTICO de 2016 (bug antigo),
    e o endpoint `mostra_edicao.php?k=<pd>` responde vazio fora do visualizador.
    Só o visualizador real (pdf.js no navegador) obtém o PDF. Por isso abrimos a
    página no Chromium headless e interceptamos a resposta do `?k=` (o PDF real).
    """
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        print(f"  IOERJ: Playwright indisponível ({e}) — RJ não pode ser coletado.", file=sys.stderr)
        return None

    capturado = {}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            def on_resp(resp):
                if "mostra_edicao.php?k=" in resp.url and "bytes" not in capturado:
                    try:
                        b = resp.body()
                        if b[:4] == b"%PDF":
                            capturado["bytes"] = b
                    except Exception:
                        pass

            page.on("response", on_resp)
            try:
                page.goto(url_mostra, wait_until="networkidle", timeout=60000)
            except Exception:
                pass  # networkidle pode estourar em edições grandes; o PDF já pode ter vindo
            # dá tempo do pdf.js requisitar o PDF
            for _ in range(20):
                if "bytes" in capturado:
                    break
                page.wait_for_timeout(1000)
            browser.close()
    except Exception as e:
        print(f"  IOERJ: erro no Playwright: {e}", file=sys.stderr)
        return None

    if "bytes" not in capturado:
        print("  IOERJ: não capturou PDF real pelo visualizador.", file=sys.stderr)
        return None
    return capturado["bytes"]


def extrair_texto_pdf(pdf_bytes: bytes) -> str:
    """Extrai texto do PDF — tenta pymupdf primeiro (melhor encoding para PDFs brasileiros), depois pdfplumber, pdfminer, pypdf."""
    if PYMUPDF_OK:
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            paginas = []
            for page in doc:
                paginas.append(page.get_text("text"))
            texto = "\n".join(paginas)
            if texto.strip():
                return texto
        except Exception as e:
            print(f"  pymupdf: {e}", file=sys.stderr)

    if PDFPLUMBER_OK:
        try:
            paginas = []
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for page in pdf.pages:
                    t = page.extract_text(x_tolerance=2, y_tolerance=3) or ""
                    paginas.append(t)
            texto = "\n".join(paginas)
            if texto.strip():
                return texto
        except Exception as e:
            print(f"  pdfplumber: {e}", file=sys.stderr)

    if PDFMINER_OK:
        try:
            buf = io.StringIO()
            extract_text_to_fp(io.BytesIO(pdf_bytes), buf, laparams=LAParams())
            return buf.getvalue()
        except Exception as e:
            print(f"  pdfminer: {e}", file=sys.stderr)

    if PYPDF_OK:
        try:
            reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            pages = []
            for page in reader.pages:
                pages.append(page.extract_text() or "")
            return "\n".join(pages)
        except Exception as e:
            print(f"  pypdf: {e}", file=sys.stderr)

    print("  IOERJ: nenhuma biblioteca PDF disponível (instale pdfminer.six ou pypdf)", file=sys.stderr)
    return ""


_RE_WORD = [re.compile(p, re.IGNORECASE) for p in PALAVRAS_FISCAIS_WORD]

# Extrai cada acórdão do Conselho de Contribuintes: "Acórdão nº X - EMENTA: ..."
_RE_ACORDAO = re.compile(
    r"Ac[\xf3o]rd[\xe3a]o\s+n[\xba\xb0o]\s*([\d.]+)\s*[-–]?\s*EMENTA:?\s*"
    r"([\s\S]{20,1800}?)(?=Ac[\xf3o]rd[\xe3a]o\s+n[\xba\xb0o]|Recurso\s+n[\xba\xb0o]|\n\s*Id:\s*\d|\Z)",
    re.IGNORECASE,
)


def _eh_fiscal(texto_lower: str) -> bool:
    """Verifica se o bloco tem conteúdo fiscal/trabalhista relevante."""
    if any(p in texto_lower for p in PALAVRAS_FISCAIS_SUBSTR):
        return True
    return any(r.search(texto_lower) for r in _RE_WORD)


def filtrar_texto(texto: str) -> list[dict]:
    """Divide o texto por marcadores de ato e filtra os relevantes."""
    resultados = []

    # Divide o texto nos pontos onde inicia um novo ato numerado
    posicoes = [m.start() for m in MARCADORES_ATO.finditer(texto)]

    if not posicoes:
        # Fallback: divide por parágrafo
        posicoes = [m.start() for m in re.finditer(r"\n{3,}", texto)]

    # Cria blocos: do marcador atual até o próximo
    blocos = []
    for i, pos in enumerate(posicoes):
        fim = posicoes[i + 1] if i + 1 < len(posicoes) else len(texto)
        blocos.append(texto[pos:fim])

    for bloco in blocos:
        bloco = bloco.strip()
        if len(bloco) < 80:
            continue

        bloco_lower = bloco.lower()

        _cliente_rj = cliente_mencionado(bloco, TERMOS_CLIENTES)
        _eh_lei = bloco_lower.lstrip("*").startswith("lei ")
        _eh_comissao = any(m in bloco_lower for m in MARCADORES_COMISSAO)

        # Exclui atos claramente administrativos — MAS nunca descarta lei,
        # cliente citado ou jurisprudência/comissão (evita matar bloco fiscal
        # grande só porque uma palavra administrativa apareceu no meio).
        if any(p in bloco_lower for p in PALAVRAS_EXCLUIR) and not (_eh_lei or _cliente_rj or _eh_comissao):
            continue

        if not _eh_fiscal(bloco_lower) and not _cliente_rj and not _eh_lei and not _eh_comissao:
            continue

        linhas = [l.strip() for l in bloco.split("\n") if l.strip()]
        numero_ato = linhas[0][:150] if linhas else bloco[:80]

        # Identifica tributo/matéria principal
        tributos_map = [
            ("icms", "ICMS"), ("iss", "ISS"), ("ipva", "IPVA"), ("iof", "IOF"),
            ("irpj", "IRPJ"), ("csll", "CSLL"), ("pis", "PIS/COFINS"),
            ("inss", "INSS"), ("fgts", "FGTS"), ("simples nacional", "Simples Nacional"),
            ("mei", "MEI"), ("trabalhist", "Trabalhista"),
        ]
        tributo = ""
        for termo, label in tributos_map:
            if re.search(r"\b" + termo + r"\b", bloco_lower):
                tributo = label
                break
        if not tributo:
            for termo in PALAVRAS_FISCAIS_SUBSTR:
                if termo in bloco_lower:
                    tributo = termo.capitalize()
                    break

        resumo = re.sub(r"\s+", " ", bloco)[:2000]

        # Órgão: primeira linha que mencione secretaria ou órgão
        orgao = "IOERJ-RJ"
        for linha in linhas[:8]:
            if any(k in linha.upper() for k in ["SECRETARIA", "SUBSECRETARIA", "SEFAZ", "SUPERINTENDÊNCIA"]):
                orgao = linha[:80]
                break

        resultados.append({
            "_aba": "DOERJ",
            "_empresa": "",
            "_termo_busca": tributo or numero_ato[:40],
            "data": "",
            "numero_ato": numero_ato,
            "ato_alterado": "",
            "resumo": resumo,
            "orgao": orgao,
            "prazo": "",
            "tributo_materia": tributo,
            "numero_doc": "",
            "link": "",
        })

    # ── Jurisprudência: extrai cada acórdão do Conselho de Contribuintes ──
    # (os acórdãos ficam em blocos gigantes e o "Acórdão nº" aparece no meio da
    #  linha, então são extraídos à parte, um registro por acórdão.)
    numeros_existentes = {r["numero_ato"] for r in resultados}
    for m in _RE_ACORDAO.finditer(texto):
        num = re.sub(r"\s+", "", m.group(1))
        ementa = re.sub(r"\s+", " ", m.group(2)).strip()
        if len(ementa) < 20:
            continue
        numero_ato = f"Acórdão nº {num} (Conselho de Contribuintes RJ)"
        if numero_ato in numeros_existentes:
            continue
        numeros_existentes.add(numero_ato)
        # tributo pela ementa
        el = ementa.lower()
        tributo = "ICMS" if "icms" in el else ("ITD/ITCMD" if ("itd" in el or "itcmd" in el) else "Tributário")
        resultados.append({
            "_aba": "DOERJ",
            "_empresa": cliente_mencionado(ementa, TERMOS_CLIENTES),
            "_termo_busca": f"Acórdão {num}",
            "data": "",
            "numero_ato": numero_ato,
            "ato_alterado": "",
            "resumo": f"EMENTA: {ementa[:1800]}",
            "orgao": "Conselho de Contribuintes - SEFAZ-RJ",
            "prazo": "",
            "tributo_materia": tributo,
            "numero_doc": "",
            "link": "",
        })

    return resultados


def coletar_doe_rj(data_str: str = None) -> list:
    if not data_str:
        data_str = (date.today() - timedelta(days=1)).isoformat()

    print(f"Coletando DOE-RJ {data_str}...", file=sys.stderr)

    if not PDFMINER_OK and not PYPDF_OK:
        print("  IOERJ: instale pdfminer.six ou pypdf para extrair texto do PDF", file=sys.stderr)
        return []

    # 1. Obter TODOS os links da Parte I (edição principal + suplementos)
    urls = obter_links_parte_i(data_str)
    if not urls:
        return []
    print(f"  {len(urls)} edição(ões) Parte I para baixar", file=sys.stderr)

    resultados = []
    for idx, url_mostra in enumerate(urls, 1):
        print(f"  [{idx}/{len(urls)}] {url_mostra[:80]}...", file=sys.stderr)

        pdf_bytes = gerar_pdf(url_mostra)
        if not pdf_bytes:
            continue
        print(f"    PDF baixado: {len(pdf_bytes):,} bytes", file=sys.stderr)

        texto = extrair_texto_pdf(pdf_bytes)
        texto = texto.replace("\f", "\n").replace("\r\n", "\n").replace("\r", "\n")
        if not texto.strip():
            print("    IOERJ: texto vazio após extração", file=sys.stderr)
            continue
        print(f"    Texto extraído: {len(texto):,} caracteres", file=sys.stderr)

        atos = filtrar_texto(texto)
        for reg in atos:
            reg["data"] = data_str
            reg["link"] = url_mostra
        resultados.extend(atos)

    # Deduplica por número do ato + início do resumo (edições podem repetir)
    vistos = set()
    unicos = []
    for r in resultados:
        chave = (r["numero_ato"][:100], r["resumo"][:120])
        if chave not in vistos:
            vistos.add(chave)
            unicos.append(r)

    print(f"  DOE-RJ filtrado: {len(unicos)} atos relevantes", file=sys.stderr)
    return unicos


def main():
    data_str = sys.argv[1] if len(sys.argv) > 1 else None
    saida = sys.argv[2] if len(sys.argv) > 2 else "dados_doe_rj.json"

    resultados = coletar_doe_rj(data_str)

    with open(saida, "w", encoding="utf-8") as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2)

    print(f"Salvo em {saida} ({len(resultados)} registros)", file=sys.stderr)


if __name__ == "__main__":
    main()

