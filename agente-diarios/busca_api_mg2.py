import requests, re, json

session = requests.Session()
session.headers.update({'User-Agent': 'Mozilla/5.0'})

# Busca os endpoints no bundle
r = session.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# Contexto com as rotas da API
for m in re.finditer(r'["\']([/a-zA-Z0-9_-]*(?:publicacao|pesquisa|edicao|caderno|materia|download|busca)[a-zA-Z0-9/_-]*)["\']', js):
    print("ROTA:", m.group(1))

print("\n--- Testando endpoints ---")
base = "https://www.jornalminasgerais.mg.gov.br/api/v1/"
for endpoint in ["publicacoes", "pesquisa", "edicoes", "cadernos", "publicacao/pesquisa", "pesquisa/publicacoes"]:
    try:
        resp = session.get(base + endpoint, timeout=10)
        print(f"{endpoint}: {resp.status_code} | {resp.text[:100]}")
    except Exception as e:
        print(f"{endpoint}: ERRO {e}")
