"""
Coleta publicações do Diário Oficial do ES via API IOES.
API: https://ioes.dio.es.gov.br/apifront/portal/edicoes/
"""
import html
import json
import re
import sys
import time
from datetime import date, timedelta
import requests
from bs4 import BeautifulSoup

try:
    from termos_clientes import TERMOS_CLIENTES, cliente_mencionado
except Exception:
    TERMOS_CLIENTES = []
    def cliente_mencionado(t, ts): return ""

BASE_API = "https://ioes.dio.es.gov.br/apifront/portal/edicoes"
BASE_PORTAL = "https://ioes.dio.es.gov.br"

PALAVRAS_FISCAIS = [
    "icms", "iss", "ipva", "iof", "irpj", "csll", "pis", "cofins",
    "tribut", "fiscal", "receita", "fisco", "imposto", "taxa", "contribuição",
    "isenção", "alíquota", "base de cálculo", "substituição tributária",
    "crédito tributário", "auto de infração", "multa fiscal",
    "simples nacional", "mei", "microempresa",
    "trabalhist", "clt", "previdênci", "inss", "fgts", "salário",
    "rescisão", "demissão", "admissão", "empregado",
    "sefaz", "receita estadual", "secretaria de fazenda",
    # Obrigações acessórias e benefícios (novas — mais meticuloso)
    "ipi", "sped", "efd", "cbenef", "código de benefício", "benefício fiscal",
    "benefícios fiscais", "crédito presumido", "diferimento", "regime especial",
    "confaz", "convênio icms", "protocolo icms",
    # Pauta / valores de referência / fundos e leis
    "pauta", "pmpf", "preço médio ponderado", "valor de referência",
    "fundo orçamentário temporário", "feef", "9.025", "6.979",
]

PALAVRAS_EXCLUIR = [
    "nomeação", "nomear", "exoneração", "exonerar", "designação", "designar",
    "concurso público", "licitação", "abertura de crédito", "crédito suplementar",
    "transferência de cargo", "vacância", "pensão por morte",
    "licença para tratar", "cedido", "cessão", "requisição",
]

EMPRESAS = ["LRG", "HIDROMINERAL", "MUZACO", "WIKI SUPRIMENTOS"]

session = requests.Session()
session.headers.update({"User-Agent": "Mozilla/5.0", "Accept": "application/json"})


def obter_edicoes(data_str: str) -> list[dict]:
    """Retorna TODAS as edições da data (normal + extras). O ES pode publicar
    mais de uma edição no mesmo dia — atos urgentes saem em edição extra."""
    url = f"{BASE_API}/edicoes_from_data/{data_str}.json"
    r = session.get(url, params={"subtheme": "false"}, timeout=20)
    if r.status_code == 404:
        return []
    r.raise_for_status()
    data = r.json()
    return data.get("itens", [])  # [{"id":11217,"data":"17/06/2026","numero":26747,"paginas":152}, ...]


def obter_edicao(data_str: str) -> dict | None:
    """Compatibilidade: retorna a primeira edição da data (ou None)."""
    edicoes = obter_edicoes(data_str)
    return edicoes[0] if edicoes else None


def obter_sumario_html(edicao_id: int) -> str:
    """Retorna HTML do sumário com todos os atos e seus identificadores."""
    url = f"{BASE_PORTAL}/portal/visualizacoes/view_html_diario/{edicao_id}"
    r = session.get(url, timeout=30)
    r.raise_for_status()
    return r.text


def extrair_publicacoes_sumario(html_sumario: str) -> list[dict]:
    """Extrai publicações do HTML do sumário com id, título e seção."""
    # HTML: <a class="linkMateria" identificador="1958125" pagina="1" data-id="..." ...> #PROTO - TITULO</a>
    items = []
    pattern = re.compile(
        r'<a[^>]+identificador="(\d+)"[^>]*data-protocolo="(\d+)"[^>]*>\s*([^<]+)</a>',
        re.S
    )
    # Também captura a seção pai (folder span antes)
    for m in pattern.finditer(html_sumario):
        identificador = int(m.group(1))
        protocolo = m.group(2)
        titulo_raw = m.group(3).strip()
        # Remove o "#PROTO - " do início
        titulo = re.sub(r'^#\d+\s*-\s*', '', titulo_raw).strip()
        items.append({"id": identificador, "protocolo": protocolo, "titulo": titulo})
    return items


def obter_info_publicacao(pub_id: int, edicao_id: int) -> dict | None:
    """Retorna metadados de uma publicação."""
    url = f"{BASE_API}/publicacoes_ver_info/{pub_id}/{edicao_id}.json"
    try:
        r = session.get(url, timeout=15)
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


def obter_conteudo_publicacao(pub_id: int, edicao_id: int) -> str:
    """Retorna texto da publicação."""
    url = f"{BASE_API}/publicacoes_ver_conteudo/{pub_id}/{edicao_id}"
    try:
        r = session.get(url, timeout=15)
        if r.status_code != 200:
            return ""
        # Remove HTML tags
        soup = BeautifulSoup(r.text, "html.parser")
        texto = soup.get_text(separator=" ")
        texto = re.sub(r"\s+", " ", texto).strip()
        return texto
    except Exception:
        return ""


def filtro_basico(texto: str) -> bool:
    t = texto.lower()
    if any(p in t for p in PALAVRAS_EXCLUIR):
        return False
    return any(p in t for p in PALAVRAS_FISCAIS)


def _coletar_edicao_es(edicao: dict, data_str: str) -> list:
    """Processa uma única edição do ES e retorna os atos relevantes."""
    edicao_id = edicao["id"]
    numero_edicao = edicao.get("numero", "")
    print(f"  Edição {numero_edicao} (ID {edicao_id}), {edicao.get('paginas',0)} páginas", file=sys.stderr)

    html_sumario = obter_sumario_html(edicao_id)
    pubs_sumario = extrair_publicacoes_sumario(html_sumario)
    print(f"  {len(pubs_sumario)} publicações no sumário", file=sys.stderr)

    # Pré-filtro pelo título já no sumário
    candidatos = []
    for pub in pubs_sumario:
        titulo_lower = pub["titulo"].lower()
        if any(p in titulo_lower for p in PALAVRAS_FISCAIS):
            candidatos.append(pub)
        # Também inclui Portarias, Decretos, Leis, Resoluções (podem ser tributários)
        elif any(k in titulo_lower for k in ["portaria", "decreto", "lei n", "resolução", "instrução"]):
            candidatos.append(pub)

    print(f"  {len(candidatos)} candidatos após pré-filtro", file=sys.stderr)

    resultados = []

    for pub in candidatos:
        pub_id = pub["id"]
        titulo_sumario = pub["titulo"]

        time.sleep(0.1)
        conteudo = obter_conteudo_publicacao(pub_id, edicao_id)
        if not conteudo:
            conteudo = titulo_sumario

        texto_completo = f"{titulo_sumario} {conteudo}"
        if not filtro_basico(texto_completo):
            continue

        empresa = ""
        texto_lower = texto_completo.lower()
        for emp in EMPRESAS:
            if emp.lower() in texto_lower:
                empresa = emp
                break

        # Órgão: tenta extrair do conteúdo (primeira linha geralmente)
        orgao = ""
        linhas = [l.strip() for l in conteudo.split("\n") if l.strip()]
        if linhas:
            orgao = linhas[0][:80]

        resumo = conteudo[:2000]

        resultados.append({
            "_aba": "DOE-ES",
            "_empresa": empresa,
            "_termo_busca": titulo_sumario[:60],
            "data": data_str,
            "numero_ato": titulo_sumario[:150],
            "ato_alterado": "",
            "resumo": resumo[:2000],
            "orgao": orgao or "IOES-ES",
            "prazo": "",
            "tributo_materia": titulo_sumario[:100],
            "numero_doc": pub["protocolo"],
            "link": f"{BASE_PORTAL}/portal/visualizacoes/diario_oficial#{pub_id}",
        })

    return resultados


def coletar_doe_es(data_str: str = None) -> list:
    if not data_str:
        data_str = (date.today() - timedelta(days=1)).isoformat()

    print(f"Coletando DOE-ES {data_str}...", file=sys.stderr)

    edicoes = obter_edicoes(data_str)
    if not edicoes:
        print(f"  DOE-ES: edição não encontrada para {data_str}", file=sys.stderr)
        return []

    print(f"  {len(edicoes)} edição(ões) para processar", file=sys.stderr)

    resultados = []
    for edicao in edicoes:
        try:
            resultados.extend(_coletar_edicao_es(edicao, data_str))
        except Exception as e:
            print(f"  DOE-ES: erro ao processar edição {edicao.get('numero')}: {e}", file=sys.stderr)

    # Deduplica por protocolo
    vistos, unicos = set(), []
    for r in resultados:
        chave = r.get("numero_doc") or (r["numero_ato"][:100], r["resumo"][:120])
        if chave not in vistos:
            vistos.add(chave)
            unicos.append(r)

    print(f"  DOE-ES filtrado: {len(unicos)} atos relevantes", file=sys.stderr)
    return unicos


def main():
    data_str = sys.argv[1] if len(sys.argv) > 1 else None
    saida = sys.argv[2] if len(sys.argv) > 2 else "dados_doe_es.json"

    resultados = coletar_doe_es(data_str)

    with open(saida, "w", encoding="utf-8") as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2)

    print(f"Salvo em {saida} ({len(resultados)} registros)", file=sys.stderr)


if __name__ == "__main__":
    main()
