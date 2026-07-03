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
]

# Palavras curtas que exigem word boundary (para evitar "MEI" em "Meira", "ISS" em "Assessor")
PALAVRAS_FISCAIS_WORD = [
    r"\bicms\b", r"\biss\b", r"\bipva\b", r"\biof\b", r"\birpj\b",
    r"\bcsll\b", r"\bpis\b", r"\bcofins\b", r"\bmei\b", r"\binss\b",
    r"\bfgts\b", r"\bclt\b",
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
    r"PORTARIA\s+(?:SEFAZ|SUT[RI]*|SUPTRIB|CONJUNTA)?\s*" + _N + r"|"
    r"LEI\s+" + _N + r"|INSTRU[C\xc7][A\xc3]O\s+NORMATIVA\s+" + _N + r"|"
    r"DELIBERA[C\xc7][A\xc3]O\s+" + _N + r"|DESPACHO\s+" + _N + r")\s*\d",
    re.IGNORECASE
)

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


def obter_link_parte_i(data_str: str) -> str | None:
    """Acessa página de seleção e retorna o link de sessão da Parte I (Poder Executivo)."""
    data_b64 = data_para_base64(data_str)
    url = f"{BASE}/do_seleciona_edicao.php?data={data_b64}"
    try:
        r = session.get(url, timeout=20)
        r.raise_for_status()
    except Exception as e:
        print(f"  IOERJ: erro ao acessar seleção: {e}", file=sys.stderr)
        return None

    html_text = r.text
    if "não foi publicado" in html_text.lower() or "não encontrado" in html_text.lower():
        print(f"  IOERJ: edição não publicada para {data_str}", file=sys.stderr)
        return None

    soup = BeautifulSoup(html_text, "html.parser")

    # Busca link que contenha "Parte I" ou "Poder Executivo"
    for a in soup.find_all("a", href=True):
        texto = a.get_text(strip=True).lower()
        href = a["href"]
        if ("parte i" in texto or "poder executivo" in texto) and "mostra_edicao" in href:
            # href pode ser relativo ou absoluto
            if href.startswith("http"):
                return href
            return f"https://www.ioerj.com.br{href}" if href.startswith("/") else f"{BASE}/{href}"

    # Fallback: pega primeiro link mostra_edicao
    for a in soup.find_all("a", href=True):
        if "mostra_edicao" in a["href"]:
            href = a["href"]
            if href.startswith("http"):
                return href
            return f"https://www.ioerj.com.br{href}" if href.startswith("/") else f"{BASE}/{href}"

    print(f"  IOERJ: link Parte I não encontrado na página de {data_str}", file=sys.stderr)
    return None


def gerar_pdf(url_mostra: str) -> bytes | None:
    """Acessa mostra_edicao.php para gerar tmp.pdf no servidor, depois baixa o PDF."""
    try:
        r = session.get(url_mostra, timeout=30)
        r.raise_for_status()
    except Exception as e:
        print(f"  IOERJ: erro ao carregar mostra_edicao: {e}", file=sys.stderr)
        return None

    # Aguarda geração do PDF no servidor
    time.sleep(2)

    pdf_url = f"{BASE}/include/pdfjs/web/tmp.pdf"
    try:
        r_pdf = session.get(pdf_url, timeout=60)
        r_pdf.raise_for_status()
        if r_pdf.headers.get("Content-Type", "").startswith("application/pdf") or r_pdf.content[:4] == b"%PDF":
            return r_pdf.content
        print(f"  IOERJ: tmp.pdf não é PDF válido (Content-Type: {r_pdf.headers.get('Content-Type')})", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  IOERJ: erro ao baixar tmp.pdf: {e}", file=sys.stderr)
        return None


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

        # Exclui atos claramente administrativos
        if any(p in bloco_lower for p in PALAVRAS_EXCLUIR):
            continue

        _cliente_rj = cliente_mencionado(bloco, TERMOS_CLIENTES)
        _eh_lei = bloco_lower.lstrip("*").startswith("lei ")
        if not _eh_fiscal(bloco_lower) and not _cliente_rj and not _eh_lei:
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

    return resultados


def coletar_doe_rj(data_str: str = None) -> list:
    if not data_str:
        data_str = (date.today() - timedelta(days=1)).isoformat()

    print(f"Coletando DOE-RJ {data_str}...", file=sys.stderr)

    if not PDFMINER_OK and not PYPDF_OK:
        print("  IOERJ: instale pdfminer.six ou pypdf para extrair texto do PDF", file=sys.stderr)
        return []

    # 1. Obter link da Parte I
    url_mostra = obter_link_parte_i(data_str)
    if not url_mostra:
        return []
    print(f"  Link Parte I: {url_mostra[:80]}...", file=sys.stderr)

    # 2. Gerar e baixar PDF
    pdf_bytes = gerar_pdf(url_mostra)
    if not pdf_bytes:
        return []
    print(f"  PDF baixado: {len(pdf_bytes):,} bytes", file=sys.stderr)

    # 3. Extrair texto
    texto = extrair_texto_pdf(pdf_bytes)
    # Normaliza separadores de página e retornos de carro
    texto = texto.replace("\f", "\n").replace("\r\n", "\n").replace("\r", "\n")
    if not texto.strip():
        print("  IOERJ: texto vazio após extração do PDF", file=sys.stderr)
        return []
    print(f"  Texto extraído: {len(texto):,} caracteres", file=sys.stderr)

    # 4. Filtrar atos relevantes
    resultados = filtrar_texto(texto)
    for reg in resultados:
        reg["data"] = data_str
        reg["link"] = url_mostra

    print(f"  DOE-RJ filtrado: {len(resultados)} atos relevantes", file=sys.stderr)
    return resultados


def main():
    data_str = sys.argv[1] if len(sys.argv) > 1 else None
    saida = sys.argv[2] if len(sys.argv) > 2 else "dados_doe_rj.json"

    resultados = coletar_doe_rj(data_str)

    with open(saida, "w", encoding="utf-8") as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2)

    print(f"Salvo em {saida} ({len(resultados)} registros)", file=sys.stderr)


if __name__ == "__main__":
    main()

