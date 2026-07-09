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
    # Obrigações acessórias e benefícios (novas — mais meticuloso)
    "sped", "efd", "cbenef", "código de benefício", "benefício fiscal",
    "benefícios fiscais", "crédito presumido", "diferimento", "regime especial",
    "confaz", "convênio icms", "protocolo icms",
    # Pauta / valores de referência / fundos e leis
    "pauta", "pmpf", "preço médio ponderado", "valor de referência",
    "fundo orçamentário temporário", "feef",
    "9.025", "9025", "6.979", "6979",
]

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


def obter_ids_cadernos(data_str: str) -> list[tuple[int, str]]:
    """Retorna [(id, descrição)] dos cadernos relevantes: Diário do Executivo
    E qualquer Edição Extra (atos fiscais urgentes saem em edição extra)."""
    r = session.get(
        f"{BASE_API}/Jornal/ObterEdicaoPorDataPublicacao",
        params={"dataPublicacao": data_str},
        timeout=20,
    )
    r.raise_for_status()
    data = r.json()
    dados = data.get("dados")
    if not dados:
        return []

    cadernos = dados.get("cadernos", [])
    selecionados = []
    for cad in cadernos:
        desc = cad.get("descricao", "")
        desc_low = desc.lower()
        # Executivo (atos do governo) + Edição Extra (urgências fiscais)
        if "executivo" in desc_low or "extra" in desc_low:
            secoes_txt = " ".join(s.get("descricao", "") for s in cad.get("secoes", []))
            selecionados.append((cad["id"], desc, secoes_txt))
    # fallback: se nada casou, pega o primeiro caderno
    if not selecionados and cadernos:
        c0 = cadernos[0]
        secoes_txt = " ".join(s.get("descricao", "") for s in c0.get("secoes", []))
        selecionados.append((c0["id"], c0.get("descricao", ""), secoes_txt))
    return selecionados


def obter_id_caderno_executivo(data_str: str) -> int | None:
    """Compatibilidade: retorna o id do primeiro caderno relevante."""
    ids = obter_ids_cadernos(data_str)
    return ids[0][0] if ids else None


# Termos que indicam conteúdo fiscal numa seção (para avisar sobre edição extra não baixável)
_SECOES_FISCAIS = ["fazenda", "sefaz", "tribut", "fiscal", "receita", "economia"]


def baixar_pdf(caderno_id: int, tentativas: int = 5) -> bytes | None:
    """Baixa o PDF do caderno pelo ID; desempacota envelope CMS se necessário.
    O servidor do MG retorna 401 intermitente (rate-limiting) — reidenta com
    backoff. Retorna None (sem lançar) só depois de esgotar as tentativas."""
    import time as _time
    data = None
    for t in range(tentativas):
        try:
            r = session.get(
                f"{BASE_API}/Jornal/ObterEdicaoPorId/{caderno_id}",
                timeout=60,
            )
            # 401/403/5xx do MG costumam ser transitórios — tenta de novo
            if r.status_code in (401, 403, 429, 500, 502, 503):
                espera = 3 * (t + 1)
                print(f"  DOE-MG: caderno {caderno_id} HTTP {r.status_code}, "
                      f"tentativa {t+1}/{tentativas}, aguardando {espera}s...", file=sys.stderr)
                _time.sleep(espera)
                continue
            r.raise_for_status()
            data = r.json()
            break
        except Exception as e:
            print(f"  DOE-MG: erro ao baixar caderno {caderno_id} "
                  f"(tentativa {t+1}/{tentativas}): {e}", file=sys.stderr)
            _time.sleep(3 * (t + 1))
    if data is None:
        return None
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

    cadernos = obter_ids_cadernos(data_str)
    if not cadernos:
        print(f"  DOE-MG: edição de {data_str} não publicada ainda.", file=sys.stderr)
        return []

    print(f"  {len(cadernos)} caderno(s): {', '.join(d for _, d, _ in cadernos)}", file=sys.stderr)

    link = "https://www.jornalminasgerais.mg.gov.br/edicao-do-dia"
    resultados = []
    import time as _time
    for i, (caderno_id, desc, secoes_txt) in enumerate(cadernos):
        if i > 0:
            _time.sleep(3)  # evita rate-limiting entre cadernos
        pdf_bytes = baixar_pdf(caderno_id)
        if not pdf_bytes:
            # Se uma edição extra não pôde ser baixada MAS tem seção fiscal, avisa em alto relevo
            if any(t in secoes_txt.lower() for t in _SECOES_FISCAIS):
                print(f"  *** AVISO DOE-MG: caderno '{desc}' NÃO baixado e contém seção fiscal "
                      f"({secoes_txt[:120]}) — VERIFICAR MANUALMENTE em {link} ***", file=sys.stderr)
            else:
                print(f"  DOE-MG [{desc}]: não baixado (sem conteúdo fiscal aparente).", file=sys.stderr)
            continue

        texto = extrair_texto_pdf(pdf_bytes)
        texto = texto.replace("\f", "\n").replace("\r\n", "\n").replace("\r", "\n")
        if not texto.strip():
            print(f"  DOE-MG [{desc}]: texto vazio após extração.", file=sys.stderr)
            continue

        print(f"  DOE-MG [{desc}]: PDF {len(pdf_bytes):,} bytes, {len(texto):,} chars", file=sys.stderr)
        resultados.extend(filtrar_texto(texto, data_str, link))

    # Deduplica atos repetidos entre cadernos
    vistos, unicos = set(), []
    for r in resultados:
        chave = (r["numero_ato"][:100], r["resumo"][:120])
        if chave not in vistos:
            vistos.add(chave)
            unicos.append(r)

    print(f"  DOE-MG filtrado: {len(unicos)} atos relevantes", file=sys.stderr)
    return unicos


def main():
    data_str = sys.argv[1] if len(sys.argv) > 1 else None
    saida = sys.argv[2] if len(sys.argv) > 2 else "dados_doe_mg.json"

    resultados = coletar_doe_mg(data_str)

    with open(saida, "w", encoding="utf-8") as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2)

    print(f"Salvo em {saida} ({len(resultados)} registros)", file=sys.stderr)


if __name__ == "__main__":
    main()

