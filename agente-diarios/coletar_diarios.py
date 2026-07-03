"""
Coleta gazetas do Querido Diário API e salva resultado em JSON.
Estratégia: uma chamada por estado/data, filtragem local por palavras-chave.
"""
import json
import sys
import time
from datetime import date, timedelta
import requests

BASE_URL = "https://api.queridodiario.ok.org.br/gazettes"

# IBGE territory IDs por UF (capital = proxy do diário estadual)
TERRITORIOS = {
    "DOERJ":  "3304557",  # Rio de Janeiro (capital)
    "DOE-ES": "3205309",  # Vitória
    "DOE-MG": "3106200",  # Belo Horizonte
    "DOE-SP": "3550308",  # São Paulo (capital)
}

# Palavras-chave para filtragem LOCAL dos excerpts
PALAVRAS_TRIBUTARIAS = [
    "ICMS", "ITCMD", "ITD", "IPVA", "ISS", "FECP",
    "benefício fiscal", "incentivo fiscal", "regime especial",
    "isenção", "redução de base", "base de cálculo",
    "EFD", "SPED", "NF-e", "MDF-e", "CT-e",
    "parcelamento", "REFIS", "regularização fiscal",
    "pauta fiscal", "valor de referência",
    "RICMS", "portaria CAT", "resolução SEFAZ", "portaria SUT",
    "decisão normativa", "comunicado CAT", "resolução SEF",
    "SEFAZ", "SUTRI", "SAIF", "SFP", "SER",
]

PALAVRAS_TRABALHISTAS = [
    "NR ", "Norma Regulamentadora", "eSocial",
    "FGTS", "contribuição previdenciária", "DCTFWeb",
    "salário mínimo", "salário-família", "INSS",
    "CAGED", "RAIS", "MTE", "Ministério do Trabalho",
    "portaria MTE", "instrução normativa RFB",
    "teto previdenciário", "tabela INSS",
]

PALAVRAS_EXCLUIR = [
    "nomeação", "exoneração", "designação", "concurso público",
    "licitação", "contrato administrativo", "ata de registro",
    "diária", "ajuda de custo", "crédito suplementar",
    "abertura de crédito", "auto de infração",
]

# Empresas clientes
EMPRESAS = [
    "LRG",
    "EMPRESA HIDROMINERAL",
    "MUZACO",
    "WIKI SUPRIMENTOS",
]


def get_gazettes(params: dict, tentativas=3) -> list:
    """Faz uma chamada à API com retry e pausa."""
    for i in range(tentativas):
        try:
            time.sleep(0.8)  # respeita rate limit
            r = requests.get(BASE_URL, params=params, timeout=30)
            if r.status_code == 429:
                wait = 5 * (i + 1)
                print(f"  Rate limit — aguardando {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json().get("gazettes", [])
        except Exception as e:
            print(f"  Erro: {e}", file=sys.stderr)
            time.sleep(2)
    return []


def contem_palavra(texto: str, palavras: list) -> str:
    """Retorna a primeira palavra encontrada no texto, ou ''."""
    texto_lower = texto.lower()
    for p in palavras:
        if p.lower() in texto_lower:
            return p
    return ""


def deve_excluir(texto: str) -> bool:
    texto_lower = texto.lower()
    return any(p.lower() in texto_lower for p in PALAVRAS_EXCLUIR)


def buscar_estadual(aba: str, territory_id: str, data_desde: str, data_ate: str) -> list:
    """Busca todo o diário estadual e filtra localmente."""
    print(f"  Buscando {aba}...", file=sys.stderr)

    # Busca ampla: apenas ICMS + SEFAZ como âncora principal
    termos_ancora = ["ICMS", "SEFAZ", "tributário", "fiscal"]
    resultados = []

    for termo in termos_ancora:
        gazettes = get_gazettes({
            "territory_ids": territory_id,
            "querystring": termo,
            "published_since": data_desde,
            "published_until": data_ate,
            "size": 30,
        })

        for g in gazettes:
            excerpt = g.get("excerpt", "") or ""
            if deve_excluir(excerpt):
                continue
            palavra = contem_palavra(excerpt, PALAVRAS_TRIBUTARIAS)
            if palavra:
                g["_aba"] = aba
                g["_termo_busca"] = palavra
                resultados.append(g)

    return resultados


def buscar_federal(data_desde: str, data_ate: str) -> list:
    """Busca DOU federal — trabalhistas e tributários federais."""
    print("  Buscando DOU federal...", file=sys.stderr)
    resultados = []

    termos_ancora = ["MTE", "eSocial", "FGTS", "INSS", "RFB"]
    for termo in termos_ancora:
        gazettes = get_gazettes({
            "querystring": termo,
            "published_since": data_desde,
            "published_until": data_ate,
            "size": 20,
        })
        for g in gazettes:
            excerpt = g.get("excerpt", "") or ""
            if deve_excluir(excerpt):
                continue
            palavra = contem_palavra(excerpt, PALAVRAS_TRABALHISTAS + PALAVRAS_TRIBUTARIAS[:6])
            if palavra:
                g["_aba"] = "DOU"
                g["_termo_busca"] = palavra
                resultados.append(g)

    return resultados


def buscar_empresas(data_desde: str, data_ate: str) -> list:
    """Busca por nome de empresa — uma chamada por empresa."""
    print("  Buscando empresas clientes...", file=sys.stderr)
    resultados = []

    for empresa in EMPRESAS:
        # Federal
        for g in get_gazettes({
            "querystring": empresa,
            "published_since": data_desde,
            "published_until": data_ate,
            "size": 10,
        }):
            g["_aba"] = "DOU"
            g["_empresa"] = empresa
            g["_termo_busca"] = empresa
            resultados.append(g)

        # Estaduais
        for aba, tid in TERRITORIOS.items():
            for g in get_gazettes({
                "territory_ids": tid,
                "querystring": empresa,
                "published_since": data_desde,
                "published_until": data_ate,
                "size": 10,
            }):
                g["_aba"] = aba
                g["_empresa"] = empresa
                g["_termo_busca"] = empresa
                resultados.append(g)

    return resultados


def deduplica(resultados: list) -> list:
    vistos = set()
    unicos = []
    for g in resultados:
        chave = (g.get("url", ""), g.get("excerpt", "")[:120])
        if chave not in vistos:
            vistos.add(chave)
            unicos.append(g)
    return unicos


def main():
    hoje = date.today()
    ontem = hoje - timedelta(days=1)
    data_desde = ontem.isoformat()
    data_ate = hoje.isoformat()

    saida = sys.argv[1] if len(sys.argv) > 1 else "dados_brutos.json"

    print(f"Coletando diários de {data_desde} a {data_ate}...", file=sys.stderr)

    todos = []
    todos += buscar_federal(data_desde, data_ate)

    for aba, tid in TERRITORIOS.items():
        todos += buscar_estadual(aba, tid, data_desde, data_ate)

    todos += buscar_empresas(data_desde, data_ate)
    todos = deduplica(todos)

    print(f"Total bruto coletado: {len(todos)} registros", file=sys.stderr)

    with open(saida, "w", encoding="utf-8") as f:
        json.dump(todos, f, ensure_ascii=False, indent=2)

    print(f"Salvo em: {saida}", file=sys.stderr)


if __name__ == "__main__":
    main()
