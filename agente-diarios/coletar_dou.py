"""
Coleta DOU Seção 1 via INLabs (inlabs.in.gov.br).
Baixa DO1.zip, filtra atos trabalhistas/tributários e retorna lista estruturada.
"""
import json
import os
import sys
import zipfile
import shutil
import tempfile
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path
import re
import requests
from dotenv import load_dotenv

load_dotenv()

try:
    from termos_clientes import TERMOS_CLIENTES, cliente_mencionado
except Exception:
    TERMOS_CLIENTES = []
    def cliente_mencionado(t, ts): return ""

INLABS_EMAIL = os.getenv("INLABS_EMAIL", "comunicacao.douglas@jscontadores.com.br")
INLABS_SENHA = os.getenv("INLABS_SENHA", "Douglas0258@")
INLABS_BASE  = "https://inlabs.in.gov.br"

# Órgãos relevantes (busca substring em artCategory)
ORGAOS_INCLUIR = [
    "Ministério do Trabalho",
    "Secretaria Especial da Receita Federal",
    "Receita Federal do Brasil",
    "Ministério da Previdência",
    "Secretaria da Previdência",
    "Conselho Gestor do FGTS",
    "Conselho Curador do FGTS",
    "Comitê Gestor do eSocial",
    "Secretaria de Política Econômica",
    "Coordenação-Geral de Arrecadação",
    "CODAR",
]

# Órgãos a EXCLUIR mesmo que batam em ORGAOS_INCLUIR
ORGAOS_EXCLUIR = [
    "SUSEP", "Saúde", "Defesa", "Educação", "Cultura",
    "Infraestrutura", "Comunicações", "Turismo", "Agricultura",
    "Meio Ambiente", "Marinha", "Exército", "Aeronáutica",
]

# Tipos de ato a incluir
TIPOS_INCLUIR = [
    "Portaria", "Instrução Normativa", "Resolução", "Decreto",
    "Medida Provisória", "Lei", "Nota Técnica", "Circular",
    "Despacho Normativo",
]

# Palavras no título/ementa que garantem inclusão
PALAVRAS_INCLUIR = [
    "NR ", "Norma Regulamentadora", "eSocial", "FGTS",
    "contribuição previdenciária", "DCTFWeb", "salário mínimo",
    "salário-família", "INSS", "CAGED", "RAIS",
    "recolhimento", "tabela", "alíquota",
    "IN RFB", "IN SRF",
    # Tributos federais e obrigações (novas — mais meticuloso)
    "IPI", "PIS", "COFINS", "PIS/COFINS", "IRPJ", "CSLL", "IRRF", "IOF",
    "Simples Nacional", "Lucro Real", "Lucro Presumido",
    "SPED", "EFD", "EFD-Contribuições", "SPED Fiscal", "NF-e", "crédito presumido",
    "substituição tributária", "regime especial", "benefício fiscal",
    "ICMS", "ISS", "pauta", "PMPF", "preço médio ponderado",
]

# Palavras que excluem mesmo se órgão bater
PALAVRAS_EXCLUIR = [
    "nomeação", "exoneração", "designação", "concurso",
    "licitação", "contrato", "diária", "ajuda de custo",
    "abertura de crédito", "crédito suplementar",
]

# Empresas clientes
EMPRESAS = ["LRG", "EMPRESA HIDROMINERAL", "MUZACO", "WIKI SUPRIMENTOS"]


def logar(tentativas: int = 5) -> requests.Session:
    """Loga no INLabs com retry — o servidor às vezes retorna 502/503 transitório."""
    import time as _t
    ultimo_erro = None
    for t in range(tentativas):
        s = requests.Session()
        try:
            r = s.post(f"{INLABS_BASE}/logar.php", data={
                "email": INLABS_EMAIL,
                "password": INLABS_SENHA,
            }, timeout=30)
            if r.status_code in (500, 502, 503, 504):
                raise RuntimeError(f"HTTP {r.status_code} (servidor INLabs instável)")
            r.raise_for_status()
            if "logout" not in r.text.lower():
                raise RuntimeError("Login INLabs falhou — verifique email/senha no .env")
            print("  INLabs: login OK", file=sys.stderr)
            return s
        except Exception as e:
            ultimo_erro = e
            if t < tentativas - 1:
                espera = 10 * (t + 1)
                print(f"  INLabs login tentativa {t+1}/{tentativas} falhou ({e}) — aguardando {espera}s...", file=sys.stderr)
                _t.sleep(espera)
    raise RuntimeError(f"Login INLabs falhou após {tentativas} tentativas: {ultimo_erro}")


def baixar_secao(session: requests.Session, data_str: str, pasta_tmp: str, secao: str = "DO1") -> str:
    """Baixa DOn.zip para pasta temporária e retorna caminho."""
    url = f"{INLABS_BASE}/index.php?p={data_str}&dl={data_str}-{secao}.zip"
    r = session.get(url, timeout=60)
    if r.status_code == 404:
        print(f"  {secao} não disponível para {data_str}", file=sys.stderr)
        return None
    r.raise_for_status()
    caminho = os.path.join(pasta_tmp, f"{data_str}-{secao}.zip")
    with open(caminho, "wb") as f:
        f.write(r.content)
    tamanho = len(r.content) / 1024
    print(f"  {secao}.zip baixado: {tamanho:.0f} KB", file=sys.stderr)
    return caminho


def extrair_zip(caminho_zip: str, pasta_dest: str):
    with zipfile.ZipFile(caminho_zip, "r") as z:
        z.extractall(pasta_dest)


def eh_relevante(arttype: str, category: str, titulo: str, ementa: str) -> bool:
    texto = f"{titulo} {ementa}".lower()

    # Exclusão imediata
    if any(p.lower() in texto for p in PALAVRAS_EXCLUIR):
        return False

    # Exclusão por órgão irrelevante
    if any(o.lower() in category.lower() for o in ORGAOS_EXCLUIR):
        return False

    # Inclusão por empresa cliente
    for emp in EMPRESAS:
        if emp.lower() in texto:
            return True

    # Inclusão por órgão + tipo
    orgao_ok = any(o.lower() in category.lower() for o in ORGAOS_INCLUIR)
    tipo_ok = any(t.lower() in arttype.lower() for t in TIPOS_INCLUIR)
    if orgao_ok and tipo_ok:
        return True

    # Inclusão por palavra-chave
    if any(p.lower() in texto for p in PALAVRAS_INCLUIR):
        return True

    return False


def empresa_mencionada(titulo: str, ementa: str, texto_completo: str) -> str:
    conteudo = f"{titulo} {ementa} {texto_completo}".lower()
    for emp in EMPRESAS:
        if emp.lower() in conteudo:
            return emp
    return ""


def parse_xml(caminho_xml: str, apenas_clientes: bool = False) -> dict | None:
    try:
        tree = ET.parse(caminho_xml)
        root = tree.getroot()
        art = root.find("article")
        if art is None:
            return None

        arttype  = art.get("artType", "")
        category = art.get("artCategory", "")
        pubdate  = art.get("pubDate", "")
        pdf_url  = art.get("pdfPage", "")
        id_mat   = art.get("idMateria", "")

        body = art.find("body")
        titulo = ""
        ementa = ""
        texto  = ""

        if body is not None:
            id_el = body.find("Identifica")
            em_el = body.find("Ementa")
            tx_el = body.find("Texto")
            titulo = (id_el.text or "") if id_el is not None else ""
            ementa = (em_el.text or "") if em_el is not None else ""
            texto  = (tx_el.text or "") if tx_el is not None else ""

        titulo = titulo.strip()
        ementa = ementa.strip()

        conteudo_completo = f"{titulo} {ementa} {texto}"
        cliente_encontrado = cliente_mencionado(conteudo_completo, TERMOS_CLIENTES)

        if apenas_clientes:
            if not cliente_encontrado:
                return None
        elif not eh_relevante(arttype, category, titulo, ementa) and not cliente_encontrado:
            return None

        # Formata data AAAA-MM-DD
        partes = pubdate.split("/")
        data_iso = f"{partes[2]}-{partes[1]}-{partes[0]}" if len(partes) == 3 else pubdate

        # Órgão abreviado (último segmento da categoria)
        partes_cat = category.split("/")
        orgao = partes_cat[-1].strip() if partes_cat else category

        empresa = cliente_encontrado or empresa_mencionada(titulo, ementa, texto)

        # Remove tags HTML do resumo
        def strip_html(s):
            return re.sub(r"<[^>]+>", " ", s or "").strip()

        resumo_limpo = strip_html(ementa) or strip_html(texto[:2000])

        return {
            "_aba": "DOU",
            "_empresa": empresa,
            "_termo_busca": arttype,
            "data": data_iso,
            "numero_ato": titulo[:120],
            "ato_alterado": "",
            "resumo": resumo_limpo[:2000],
            "orgao": orgao[:60],
            "prazo": "",
            "tributo_materia": arttype,
            "numero_doc": id_mat,
            "link": pdf_url,
        }
    except Exception as e:
        print(f"  Erro parse {caminho_xml}: {e}", file=sys.stderr)
        return None


def _processar_secao(session, data_str, secao, pasta_tmp, apenas_clientes=False):
    """Baixa e processa uma seção do DOU, retorna lista de registros."""
    caminho_zip = baixar_secao(session, data_str, pasta_tmp, secao)
    if not caminho_zip:
        return []
    pasta_xml = os.path.join(pasta_tmp, f"xml_{secao}")
    os.makedirs(pasta_xml, exist_ok=True)
    extrair_zip(caminho_zip, pasta_xml)
    xmls = list(Path(pasta_xml).rglob("*.xml"))
    print(f"  {secao}: {len(xmls)} XMLs...", file=sys.stderr)
    resultados = []
    for xml_path in xmls:
        reg = parse_xml(str(xml_path), apenas_clientes=apenas_clientes)
        if reg:
            resultados.append(reg)
    return resultados


def coletar_dou(data_str: str = None) -> list:
    if not data_str:
        data_str = (date.today() - timedelta(days=1)).isoformat()

    print(f"Coletando DOU {data_str}...", file=sys.stderr)
    session = logar()

    pasta_tmp = tempfile.mkdtemp(prefix="dou_")
    resultados = []

    try:
        # Seção 1 (edição normal + extra): atos fiscais/trabalhistas + clientes.
        # DO1E = edição extra da Seção 1 (atos urgentes publicados fora do horário).
        res_do1 = _processar_secao(session, data_str, "DO1", pasta_tmp, apenas_clientes=False)
        resultados.extend(res_do1)
        res_do1e = _processar_secao(session, data_str, "DO1E", pasta_tmp, apenas_clientes=False)
        resultados.extend(res_do1e)

        # Seção 3 (normal + extra): apenas menções a clientes
        res_do3 = _processar_secao(session, data_str, "DO3", pasta_tmp, apenas_clientes=True)
        resultados.extend(res_do3)
        res_do3e = _processar_secao(session, data_str, "DO3E", pasta_tmp, apenas_clientes=True)
        resultados.extend(res_do3e)

        # Deduplica por idMateria (a mesma matéria não deve repetir entre seções)
        vistos, unicos = set(), []
        for r in resultados:
            chave = r.get("numero_doc") or (r["numero_ato"][:100], r["resumo"][:120])
            if chave not in vistos:
                vistos.add(chave)
                unicos.append(r)
        resultados = unicos

        print(
            f"  DOU filtrado: {len(resultados)} atos relevantes "
            f"(DO1={len(res_do1)}, DO1E={len(res_do1e)}, DO3={len(res_do3)}, DO3E={len(res_do3e)})",
            file=sys.stderr,
        )
    finally:
        shutil.rmtree(pasta_tmp, ignore_errors=True)

    return resultados


def main():
    data_str = sys.argv[1] if len(sys.argv) > 1 else None
    saida = sys.argv[2] if len(sys.argv) > 2 else "dados_dou.json"

    resultados = coletar_dou(data_str)

    with open(saida, "w", encoding="utf-8") as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2)

    print(f"Salvo em {saida} ({len(resultados)} registros)", file=sys.stderr)


if __name__ == "__main__":
    main()
