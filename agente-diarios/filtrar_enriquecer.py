"""
Filtra e enriquece os registros coletados usando Claude API.
Uso: python filtrar_enriquecer.py dados_combinados.json registros_filtrados.json
"""
import json
import sys
import os
from dotenv import load_dotenv

load_dotenv()

PALAVRAS_INCLUIR = [
    # Tributos estaduais — específicos
    "ICMS", "RICMS", "ITD", "ITCMD", "IPVA", "ISS", "FECP",
    "substituição tributária", "isenção fiscal", "benefício fiscal",
    "regime especial", "parcelamento fiscal", "REFIS", "pauta fiscal",
    "base de cálculo", "alíquota", "redução de base",
    "convênio ICMS", "protocolo ICMS", "CONFAZ",
    # Obrigações acessórias
    "EFD", "SPED", "NF-e", "MDF-e", "CT-e", "escrituração fiscal",
    "cadastro de contribuinte",
    # Órgãos fazendários — com contexto fiscal
    "SEFAZ", "SUTRI", "SUPTRIB", "CAT-SP", "SRE", "SAIF",
    # Trabalhista/previdenciário — DOU
    "eSocial", "FGTS", "DCTFWeb", "CAGED", "RAIS",
    "salário mínimo", "Norma Regulamentadora",
    "contribuição previdenciária", "salário-família",
    # Jurisprudência
    "conselho de contribuintes", "câmara julgadora",
    "resposta à consulta", "acórdão tributário",
    # Órgãos fazendários — qualquer ato deles é candidato
    "SAIF", "SUPTRIB", "SRE-MG", "GAET", "GECAT",
    "regularização fiscal", "regularização de débitos",
    "programa de parcelamento", "programa de regularização",
    "nota técnica tributária",
]

PALAVRAS_EXCLUIR = [
    "nomeação", "nomeado", "nomeados",
    "exoneração", "exonerado", "exonerada",
    "designação", "designado", "concurso público",
    "licitação", "contrato administrativo", "ata de registro de preços",
    "diária", "ajuda de custo",
    "crédito suplementar", "abertura de crédito", "crédito adicional",
    "cedido", "cessão de servidor",
    "processo administrativo disciplinar", "sindicância",
    "radiodifusão", "outorga de permissão", "outorga de autorização",
    "secretaria de saúde", "conselho estadual de educação",
    # Saúde/educação — sem relação fiscal
    "comissão intergestores bipartite", "CIB", "conselho estadual de saúde",
    "escola estadual", "EEEFM", "CEEFMTI", "IBREP",
    # Segurança pública interna
    "academia de polícia", "acadepol", "polícia penal", "uso de algemas",
    "ingresso a guarda", "revista pessoal",
    # Rescisão de contrato de pessoal
    "rescisão contratual", "rescisão consensual do contrato",
]

EMPRESAS = {
    "LRG": ["LRG"],
    "EMPRESA HIDROMINERAL": ["HIDROMINERAL", "EMPRESA HIDROMINERAL"],
    "MUZACO": ["MUZACO"],
    "WIKI SUPRIMENTOS": ["WIKI SUPRIMENTOS", "WIKI"],
}


def filtro_basico(reg: dict) -> bool:
    texto = " ".join([
        reg.get("resumo", ""),
        reg.get("numero_ato", ""),
        reg.get("orgao", ""),
        reg.get("tributo_materia", ""),
    ]).upper()

    excluir = any(p.upper() in texto for p in PALAVRAS_EXCLUIR)
    if excluir:
        return False

    incluir = any(p.upper() in texto for p in PALAVRAS_INCLUIR)
    return incluir


def detectar_empresa(reg: dict) -> str:
    texto = " ".join([
        reg.get("resumo", ""),
        reg.get("numero_ato", ""),
        reg.get("orgao", ""),
    ]).upper()
    for empresa, termos in EMPRESAS.items():
        if any(t.upper() in texto for t in termos):
            return empresa
    return ""


SYSTEM_PROMPT = """\
Você é especialista em legislação tributária e trabalhista brasileira.

Abaixo está uma lista JSON de atos de diários oficiais pré-filtrados.
Para cada ato, faça duas coisas: (1) decida se mantém ou descarta; (2) preencha os campos.

=== O QUE MANTER ===
ABAS ESTADUAIS (DOERJ, DOE-ES, DOE-MG, DOE-SP): leis, decretos, resoluções, portarias,
instruções normativas, comunicados, decisões normativas, convênios e protocolos ICMS/CONFAZ que tratem de:
- tributos: ICMS, ITD/ITCMD, IPVA, ISS, taxas estaduais, FECP;
- benefícios/incentivos fiscais, regimes especiais, isenções, reduções de base;
- obrigações acessórias: EFD, SPED, NF-e/MDF-e/CT-e, cadastros, escrituração;
- parcelamentos, programas de regularização (REFIS e similares);
- pautas fiscais, valores de referência, base de cálculo divulgada;
- decisões de Conselhos de Contribuintes / Tribunais Administrativos / Respostas a Consulta.
Exemplos de atos por UF: RJ = Resolução SEFAZ, Portaria SUT/SUPTRIB, Resolução SER;
SP = Portaria CAT, Resolução SFP, Comunicado CAT, Decisão Normativa CAT;
MG = Resolução SEF/SUTRI, Portaria SUTRI/SAIF; ES = Portaria/IN SEFAZ-ES.
Decretos estaduais que alterem o RICMS de qualquer UF também entram.
ABA DOU: portarias e instruções normativas do MTE e RFB que tratem de:
- NR (Normas Regulamentadoras) e suas alterações;
- eSocial (novos leiautes, prazos, notas técnicas);
- FGTS (alíquotas, recolhimento, Conselho Curador);
- contribuições previdenciárias, DCTFWeb, eSocial-folha;
- salário mínimo, salário-família, teto/faixas INSS;
- CAGED, RAIS e obrigações trabalhistas declaratórias.

=== O QUE DESCARTAR ===
- Nomeações, exonerações, designações, concursos públicos;
- Licitações, contratos, atas de registro de preços;
- Atos individuais sobre contribuinte específico (cancela inscrição de CNPJ/CPF específico, auto de infração individual sem norma geral);
- Créditos suplementares, abertura de crédito orçamentário;
- Atos de RH, disciplinares, internos de segurança pública, saúde ou educação;
- Resoluções de saúde (CIB, CES), conselhos de educação (CEE) sem relação fiscal.

=== REGRA DE OURO ===
EM CASO DE DÚVIDA, MANTENHA o registro — é preferível incluir um ato que não seja
estritamente tributário do que descartar algo relevante.
Mantenha SEMPRE atos emitidos por: SEFAZ, SUTRI, CAT-SP, SRE, SAIF, RFB, MTE, CONFAZ,
independentemente do conteúdo do campo "resumo" (que pode estar incompleto).
Se o campo "resumo" for um fragmento de texto sem sentido completo, avalie pelo "numero_ato"
e "orgao" — se o órgão for fazendário/trabalhista, mantenha.

=== CAMPOS A PREENCHER (para os atos mantidos) ===
- numero_ato: tipo + número + ano (ex: 'Portaria CAT nº 12/2026')
- ato_alterado: qual norma o ato altera/revoga; se não alterar, preencha com '—'
- resumo: síntese OBJETIVA E CONCISA em português, com suas próprias palavras.
  NÃO copie trechos literais do diário. Máximo 3 frases. Diga O QUE o ato faz.
- orgao: órgão expedidor abreviado (SEFAZ-RJ, MTE, CAT-SP, SUTRI-MG, RFB etc.)
- prazo: SOMENTE prazos operacionais que o ato fixe (adesão, cumprimento de obrigação,
  regularização, pagamento) no formato DD/MM/AAAA. NÃO registrar vigência/produção de efeitos.
  Se não houver prazo operacional, preencha com '—'.
- tributo_materia: ICMS / IPVA / ITD / FGTS / eSocial / NR-XX / INSS / etc.
- numero_doc: apenas o número identificador da publicação
- link: URL original (não altere)
- data: data da publicação no formato YYYY-MM-DD (não altere)
- _aba: não altere
- _empresa: não altere

Retorne SOMENTE um JSON array com os atos mantidos (descartados não aparecem).
Sem markdown, sem explicações, sem texto fora do JSON.
"""


def _refresh_oauth_token() -> str:
    """Renova o accessToken usando o refreshToken do Claude Code."""
    import urllib.request
    creds_file = os.path.expanduser(r"~\.claude\.credentials.json")
    with open(creds_file, encoding="utf-8") as f:
        creds = json.load(f)
    oauth = creds.get("claudeAiOauth", {})
    refresh_token = oauth.get("refreshToken", "")
    if not refresh_token:
        raise RuntimeError("refreshToken não encontrado.")

    payload = json.dumps({
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": "9d1c250a-e61b-48ab-9916-984d06ed84be",
    }).encode()

    req = urllib.request.Request(
        "https://console.anthropic.com/v1/oauth/token",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    new_token = data.get("access_token", "")
    if not new_token:
        raise RuntimeError(f"Refresh falhou: {data}")

    # Persiste o novo token
    oauth["accessToken"] = new_token
    if "expires_in" in data:
        import time
        oauth["expiresAt"] = int((time.time() + data["expires_in"]) * 1000)
    if "refresh_token" in data:
        oauth["refreshToken"] = data["refresh_token"]
    creds["claudeAiOauth"] = oauth
    with open(creds_file, "w", encoding="utf-8") as f:
        json.dump(creds, f, ensure_ascii=False, indent=2)

    print("  Token OAuth renovado com sucesso.", flush=True)
    return new_token


def _get_anthropic_client():
    """Retorna cliente Anthropic usando API key do .env ou token OAuth do Claude Code."""
    import anthropic
    import time as _t

    # Tenta API key no .env primeiro
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        return anthropic.Anthropic(api_key=api_key)

    # Usa token OAuth do Claude Code — tenta renovar se expirado, mas usa o existente como fallback
    creds_file = os.path.expanduser(r"~\.claude\.credentials.json")
    if os.path.exists(creds_file):
        with open(creds_file, encoding="utf-8") as f:
            creds = json.load(f)
        oauth = creds.get("claudeAiOauth", {})
        token = oauth.get("accessToken", "")
        expires_at = oauth.get("expiresAt", 0)
        # Tenta renovar se expirado
        if not token or (_t.time() * 1000) > (expires_at - 300_000):
            try:
                print("  Token expirado — renovando via refreshToken...", flush=True)
                token = _refresh_oauth_token()
            except Exception as e:
                print(f"  Aviso: refresh falhou ({e}), usando token existente.", flush=True)
                token = oauth.get("accessToken", "")  # fallback: token atual
        if token:
            return anthropic.Anthropic(auth_token=token)

    raise RuntimeError("Nenhuma credencial Anthropic encontrada.")


def enriquecer_com_claude(registros: list) -> list:
    import re

    dados = json.dumps([{
        "_aba": r.get("_aba"),
        "_empresa": r.get("_empresa", ""),
        "data": r.get("data", ""),
        "numero_ato": r.get("numero_ato", "")[:200],
        "resumo": r.get("resumo", "")[:800],
        "orgao": r.get("orgao", "")[:100],
        "tributo_materia": r.get("tributo_materia", ""),
        "prazo": r.get("prazo", ""),
        "ato_alterado": r.get("ato_alterado", ""),
        "numero_doc": r.get("numero_doc", ""),
        "link": r.get("link", ""),
    } for r in registros], ensure_ascii=True, indent=2)

    mensagem = SYSTEM_PROMPT + "\nREGISTROS:\n" + dados

    # Usa o claude CLI diretamente — evita rate limits da API e problemas de token OAuth
    import subprocess

    _CLAUDE_EXE = r"C:\Users\01-comunicação\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe"

    print(f"Enviando {len(registros)} registros para enriquecimento via claude CLI...", flush=True)

    for tentativa in range(3):
        try:
            result = subprocess.run(
                [_CLAUDE_EXE, "--print", "--output-format", "text"],
                input=mensagem,
                capture_output=True, text=True, encoding='utf-8',
                timeout=240,
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr[:300])

            resposta = result.stdout.strip()
            if "```" in resposta:
                m = re.search(r"```(?:json)?\s*([\s\S]+?)```", resposta, re.DOTALL)
                if m:
                    resposta = m.group(1).strip()

            return json.loads(resposta)

        except Exception as e:
            if tentativa < 2:
                import time as _time
                print(f"  Tentativa {tentativa+1} falhou ({e}) — aguardando 30s...", flush=True)
                _time.sleep(30)
            else:
                print(f"Aviso: enriquecimento falhou ({e}), usando registros sem enriquecimento.", file=sys.stderr)
                return registros

    return registros


def main():
    if len(sys.argv) < 3:
        print("Uso: python filtrar_enriquecer.py dados_combinados.json registros_filtrados.json")
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        todos = json.load(f)

    print(f"Total coletado: {len(todos)} registros", flush=True)

    # Detecta menções a empresas
    for reg in todos:
        if not reg.get("_empresa"):
            reg["_empresa"] = detectar_empresa(reg)

    # Filtro básico local
    filtrados = [r for r in todos if filtro_basico(r) or r.get("_empresa")]
    print(f"Após filtro básico: {len(filtrados)} registros", flush=True)

    if not filtrados:
        print("Nenhum registro para enriquecer.")
        with open(sys.argv[2], "w", encoding="utf-8") as f:
            json.dump([], f)
        return

    # Índice por numero_doc para restaurar campos que Claude pode esvaziar
    idx_original = {str(r.get("numero_doc", "") or r.get("numero_ato", "")[:30]): r for r in filtrados}

    # Enriquecimento via Claude (em lotes de 10 para evitar truncamento)
    enriquecidos = []
    LOTE = 10
    for i in range(0, len(filtrados), LOTE):
        lote = filtrados[i:i+LOTE]
        resultado = enriquecer_com_claude(lote)
        # Restaura campos que Claude pode ter esvaziado
        for r in resultado:
            chave = str(r.get("numero_doc", "") or r.get("numero_ato", "")[:30])
            orig = idx_original.get(chave)
            if orig:
                if not r.get("data"):
                    r["data"] = orig.get("data", "")
                if not r.get("link"):
                    r["link"] = orig.get("link", "")
                if not r.get("_aba"):
                    r["_aba"] = orig.get("_aba", "")
        enriquecidos.extend(resultado)
        print(f"Lote {i//LOTE + 1}: {len(resultado)} registros processados", flush=True)

    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(enriquecidos, f, ensure_ascii=False, indent=2)

    print(f"\nRegistros finais: {len(enriquecidos)}")

    # Resumo por aba
    from collections import Counter
    abas = Counter(r.get("_aba", "?") for r in enriquecidos)
    empresas = Counter(r.get("_empresa", "") for r in enriquecidos if r.get("_empresa"))
    for aba, n in sorted(abas.items()):
        print(f"  {aba}: {n} atos")
    if empresas:
        print(f"  Empresas: {dict(empresas)}")

    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(enriquecidos, f, ensure_ascii=False, indent=2)
    print(f"\nSalvo em: {sys.argv[2]}")


if __name__ == "__main__":
    main()










