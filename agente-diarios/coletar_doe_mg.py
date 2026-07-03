"""
Coleta publicações do Jornal Minas Gerais baixando o PDF da edição do dia.
API: GET /api/v1/Jornal/ObterEdicaoPorDataPublicacao?dataPublicacao={YYYY-MM-DD}
     → retorna cadernos com IDs
     GET /api/v1/Jornal/ObterEdicaoPorId/{id}
     → retorna PDF em base64 (envelope CMS — PDF começa no offset do marcador %PDF)
"""
import base64
import io
import json
import re
import sys
from datetime import date, timedelta

import requests

try:
    from termos_clientes import TERMOS_CLIENTES, cliente_mencionado
except Exception:
    TERMOS_CLIENTES = []
    def cliente_mencionado(t, ts): return ""

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

BASE_API = "https://www.jornalminasgerais.mg.gov.br/api/v1"

PALAVRAS_FISCAIS_SUBSTR = [
    "tribut", "fiscal", "imposto", "alíquota", "isenção",
    "substituição tributária", "crédito tributário", "auto de infração", "multa fiscal",
    "simples nacional", "microempresa", "empresa de pequeno",
    "trabalhist", "previdênci", "salário mínimo", "rescisão", "demissão",
    "sefaz", "secretaria de fazenda", "receita estadual",
    "base de cálculo",
]

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

_N = r"N[O\xba\xb0o]"
MARCADORES_ATO = re.compile(
    r"(?m)^\*?(DECRETO\s+" + _N + r"|"
    r"RESOLU[C\xc7][A\xc3]O\s+(?:SEFAZ|SEF|CONJUNTA)?\s*" + _N + r"|"
    r"PORTARIA\s+(?:SEFAZ|SEF|SUT[RI]*|SUPTRIB|CONJUNTA)?\s*" + _N + r"|"
    r"LEI\s+" + _N + r"|INSTRU[C\xc7][A\xc3]O\s+NORMATIVA\s+" + _N + r"|"
    r"DELIBERA[C\xc7][A\xc3]O\s+" + _N + r"|DESPACHO\s+" + _N + r")\s*\d",
    re.IGNORECASE
)

_RE_WORD = [re.compile(p, re.IGNORECASE) for p in PALAVRAS_FISCAIS_WORD]

session = requests.Session()
session.headers.update({"User-Agent": "Mozilla/5.0"})


def obter_id_caderno_executivo(data_str: str) -> int | None:
    """Retorna o ID do caderno Diário do Executivo para a data informada."""
    r = session.get(
        f"{BASE_API}/Jornal/ObterEdicaoPorDataPublicacao",
        params={"dataPublicacao": data_str},
        timeout=20,
    )
    r.raise_for_status()
    data = r.json()
    dados = data.get("dados")
    if not dados:
        return None

    cadernos = dados.get("cadernos", [])
    for cad in cadernos:
        desc = cad.get("descricao", "").lower()
        if "executivo" in desc:
            return cad["id"]
    # fallback: primeiro caderno
    if cadernos:
        return cadernos[0]["id"]
    return None


def baixar_pdf(caderno_id: int) -> bytes | None:
    """Baixa o PDF do caderno pelo ID; desempacota envelope CMS se necessário."""
    r = session.get(
        f"{BASE_API}/Jornal/ObterEdicaoPorId/{caderno_id}",
        timeout=60,
    )
    r.raise_for_status()
    data = r.json()
    dados = data.get("dados")
    if not dados:
        return None

    arq_info = dados.get("arquivoCadernoPrincipal", {})
    arquivo_b64 = arq_info.get("arquivo", "")
    if not arquivo_b64:
        return None

    raw = base64.b64decode(arquivo_b64)

    # O PDF pode estar envolvido em envelope CMS assinado; localiza o marcador %PDF
    pdf_start = raw.find(b"%PDF")
    if pdf_start < 0:
        return None
    return raw[pdf_start:]


def extrair_texto_pdf(pdf_bytes: bytes) -> str:
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
            return "\n".join(p.extract_text() or "" for p in reader.pages)
        except Exception as e:
            print(f"  pypdf: {e}", file=sys.stderr)

    return ""


def _eh_fiscal(texto_lower: str) -> bool:
    if any(p in texto_lower for p in PALAVRAS_FISCAIS_SUBSTR):
        return True
    return any(r.search(texto_lower) for r in _RE_WORD)


def filtrar_texto(texto: str, data_str: str, link: str) -> list[dict]:
    resultados = []

    posicoes = [m.start() for m in MARCADORES_ATO.finditer(texto)]
    if not posicoes:
        posicoes = [m.start() for m in re.finditer(r"\n{3,}", texto)]

    blocos = []
    for i, pos in enumerate(posicoes):
        fim = posicoes[i + 1] if i + 1 < len(posicoes) else len(texto)
        blocos.append(texto[pos:fim])

    for bloco in blocos:
        bloco = bloco.strip()
        if len(bloco) < 80:
            continue
        bloco_lower = bloco.lower()
        if any(p in bloco_lower for p in PALAVRAS_EXCLUIR):
            continue
        _cliente_mg = cliente_mencionado(bloco, TERMOS_CLIENTES)
        _eh_lei = bloco_lower.lstrip("*").startswith("lei ")
        if not _eh_fiscal(bloco_lower) and not _cliente_mg and not _eh_lei:
            continue

        linhas = [l.strip() for l in bloco.split("\n") if l.strip()]
        numero_ato = linhas[0][:150] if linhas else bloco[:80]

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

        orgao = "Jornal Minas Gerais"
        for linha in linhas[:8]:
            if any(k in linha.upper() for k in ["SECRETARIA", "SUBSECRETARIA", "SEFAZ", "SUPERINTENDÊNCIA"]):
                orgao = linha[:80]
                break

        resultados.append({
            "_aba": "DOE-MG",
            "_empresa": "",
            "_termo_busca": tributo or numero_ato[:40],
            "data": data_str,
            "numero_ato": numero_ato,
            "ato_alterado": "",
            "resumo": re.sub(r"\s+", " ", bloco)[:2000],
            "orgao": orgao,
            "prazo": "",
            "tributo_materia": tributo,
            "numero_doc": "",
            "link": link,
        })

    return resultados


def coletar_doe_mg(data_str: str = None) -> list:
    if not data_str:
        data_str = date.today().isoformat()

    print(f"Coletando DOE-MG {data_str}...", file=sys.stderr)

    if not PDFMINER_OK and not PYPDF_OK:
        print("  DOE-MG: instale pdfminer.six ou pypdf", file=sys.stderr)
        return []

    caderno_id = obter_id_caderno_executivo(data_str)
    if caderno_id is None:
        print(f"  DOE-MG: edição de {data_str} não publicada ainda.", file=sys.stderr)
        return []

    print(f"  Caderno Executivo ID: {caderno_id}", file=sys.stderr)

    pdf_bytes = baixar_pdf(caderno_id)
    if not pdf_bytes:
        print("  DOE-MG: falha ao baixar PDF.", file=sys.stderr)
        return []

    print(f"  PDF baixado: {len(pdf_bytes):,} bytes", file=sys.stderr)

    texto = extrair_texto_pdf(pdf_bytes)
    texto = texto.replace("\f", "\n").replace("\r\n", "\n").replace("\r", "\n")

    if not texto.strip():
        print("  DOE-MG: texto vazio após extração.", file=sys.stderr)
        return []

    print(f"  Texto extraído: {len(texto):,} chars", file=sys.stderr)

    link = f"https://www.jornalminasgerais.mg.gov.br/edicao-do-dia"
    resultados = filtrar_texto(texto, data_str, link)
    print(f"  DOE-MG filtrado: {len(resultados)} atos relevantes", file=sys.stderr)
    return resultados


def main():
    data_str = sys.argv[1] if len(sys.argv) > 1 else None
    saida = sys.argv[2] if len(sys.argv) > 2 else "dados_doe_mg.json"

    resultados = coletar_doe_mg(data_str)

    with open(saida, "w", encoding="utf-8") as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2)

    print(f"Salvo em {saida} ({len(resultados)} registros)", file=sys.stderr)


if __name__ == "__main__":
    main()

