"""
Coleta atos tributários do SEFAZ-SP via SharePoint REST API.
Fonte: legislacao.fazenda.sp.gov.br
"""
import json
import re
import sys
import time
from datetime import date, timedelta
import requests

try:
    from termos_clientes import TERMOS_CLIENTES, cliente_mencionado
except Exception:
    TERMOS_CLIENTES = []
    def cliente_mencionado(t, ts): return ""

SP_BASE = "https://legislacao.fazenda.sp.gov.br"
SP_API  = f"{SP_BASE}/_api/web/lists/getbytitle('P%C3%A1ginas')/items"

# Tipos de ato relevantes (SEFAZ-SP)
TIPOS_OK = [
    "Portaria CAT", "Portaria SRE", "Portaria SFP",
    "Resolução SFP", "Comunicado CAT", "Comunicado DICAR",
    "Decisão Normativa CAT", "Decreto", "Lei", "Instrução Normativa",
    "IN SRE", "Portaria DICAR", "Portaria DIATP",
]

# Palavras-chave fiscais que garantem inclusão mesmo se o tipo não casar
PALAVRAS_FISCAIS = [
    "icms", "ipi", "iss", "issqn", "pis", "cofins", "irpj", "csll", "iof", "ipva",
    "itcmd", "tribut", "fiscal", "imposto", "alíquota", "isenção", "diferimento",
    "substituição tributária", "crédito presumido", "benefício fiscal", "cbenef",
    "código de benefício", "sped", "efd", "nota fiscal", "regime especial",
    "convênio icms", "confaz", "simples nacional", "base de cálculo",
    "pauta", "pmpf", "preço médio ponderado", "valor de referência", "9.025", "6.979",
]

PALAVRAS_EXCLUIR = [
    "nomeação", "exoneração", "designação", "concurso",
    "licitação", "contrato", "diária", "ajuda de custo",
    "abertura de crédito", "crédito suplementar",
]

EMPRESAS = ["LRG", "EMPRESA HIDROMINERAL", "MUZACO", "WIKI SUPRIMENTOS"]

session = requests.Session()
session.headers.update({
    "Accept": "application/json;odata=verbose",
    "User-Agent": "Mozilla/5.0",
})


def eh_relevante(titulo: str) -> bool:
    titulo_lower = titulo.lower()
    if any(p in titulo_lower for p in PALAVRAS_EXCLUIR):
        return False
    # Aceita se o título começa com tipo de ato tributário...
    if any(t.lower() in titulo_lower for t in TIPOS_OK):
        return True
    # ...ou se contém palavra-chave fiscal (pega Leis/atos com outro rótulo)
    return any(p in titulo_lower for p in PALAVRAS_FISCAIS)


def extrair_texto_sp(link: str) -> str:
    """Busca o texto do ato na página ASPX do SEFAZ-SP."""
    try:
        r = session.get(link, timeout=45)
        r.raise_for_status()
        body = r.text
        m = re.search(r'ms-rtestate-field[^>]*>(.*?)</div>', body, re.DOTALL | re.IGNORECASE)
        if m:
            texto = re.sub(r'<[^>]+>', ' ', m.group(1))
            texto = re.sub(r'\s+', ' ', texto).strip()
            return texto[:1500]
    except Exception as e:
        print(f"  Aviso fetch SP: {e}", file=sys.stderr)
    return ""


def buscar_pagina(data_str: str, skip_token: str = None) -> tuple[list, str | None]:
    """Retorna (items, next_skiptoken)."""
    params = {
        "$filter": f"Modified ge datetime'{data_str}T00:00:00' and Modified lt datetime'{data_str}T23:59:59'",
        "$orderby": "Modified desc",
        "$top": "50",
        "$select": "Title,Modified,FileRef",
        "$format": "json",
    }
    url = SP_API
    if skip_token:
        url = skip_token  # next page URL completa

    # O servidor do SEFAZ-SP costuma ser lento — timeout maior + retry com backoff
    for tentativa in range(4):
        try:
            r = session.get(url if skip_token else SP_API,
                            params=None if skip_token else params, timeout=60)
            r.raise_for_status()
            data = r.json()
            items = data.get("d", {}).get("results", [])
            next_url = data.get("d", {}).get("__next")
            return items, next_url
        except Exception as e:
            if tentativa < 3:
                espera = 10 * (tentativa + 1)
                print(f"  SP API tentativa {tentativa+1}/4 falhou ({e}) — aguardando {espera}s...", file=sys.stderr)
                time.sleep(espera)
            else:
                print(f"  Erro SP API (esgotadas 4 tentativas): {e}", file=sys.stderr)
                return [], None
    return [], None


def coletar_doe_sp(data_str: str = None) -> list:
    if not data_str:
        data_str = (date.today() - timedelta(days=1)).isoformat()

    print(f"Coletando DOE-SP {data_str}...", file=sys.stderr)

    todos_items = []
    next_url = None
    pagina = 0

    while pagina == 0 or next_url:
        items, next_url = buscar_pagina(data_str, next_url if pagina > 0 else None)
        todos_items.extend(items)
        pagina += 1
        if next_url:
            time.sleep(0.3)
        if pagina >= 40:  # teto de segurança (40 x 50 = 2000 itens/dia)
            if next_url:
                print(f"  *** AVISO DOE-SP: atingiu teto de {pagina} páginas e AINDA HÁ MAIS "
                      f"itens — pode ter truncado! Aumentar o teto.", file=sys.stderr)
            break

    print(f"  {len(todos_items)} atos encontrados para {data_str}", file=sys.stderr)

    resultados = []
    for item in todos_items:
        titulo = item.get("Title", "") or ""
        file_ref = item.get("FileRef", "") or ""
        modified = item.get("Modified", "") or ""

        _cliente_sp = cliente_mencionado(titulo, TERMOS_CLIENTES)
        if not eh_relevante(titulo) and not _cliente_sp:
            continue

        titulo_lower = titulo.lower()
        empresa = ""
        for emp in EMPRESAS:
            if emp.lower() in titulo_lower:
                empresa = emp
                break

        link = SP_BASE + file_ref if file_ref.startswith("/") else file_ref

        texto = extrair_texto_sp(link)
        time.sleep(0.2)  # cortesia ao servidor

        resultados.append({
            "_aba": "DOE-SP",
            "_empresa": empresa,
            "_termo_busca": titulo[:50],
            "data": data_str,
            "numero_ato": titulo[:120],
            "ato_alterado": "",
            "resumo": texto,
            "orgao": "SEFAZ-SP",
            "prazo": "",
            "tributo_materia": _tipo_ato(titulo),
            "numero_doc": "",
            "link": link,
        })

    print(f"  DOE-SP filtrado: {len(resultados)} atos relevantes", file=sys.stderr)
    return resultados


def _tipo_ato(titulo: str) -> str:
    for t in TIPOS_OK:
        if t.lower() in titulo.lower():
            return t
    return titulo.split()[0] if titulo else ""


def main():
    data_str = sys.argv[1] if len(sys.argv) > 1 else None
    saida = sys.argv[2] if len(sys.argv) > 2 else "dados_doe_sp.json"

    resultados = coletar_doe_sp(data_str)

    with open(saida, "w", encoding="utf-8") as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2)

    print(f"Salvo em {saida} ({len(resultados)} registros)", file=sys.stderr)


if __name__ == "__main__":
    main()
