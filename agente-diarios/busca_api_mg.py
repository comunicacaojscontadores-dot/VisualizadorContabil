import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# Procura URLs de API e backend
patterns = [
    r'https?://[a-zA-Z0-9._-]+(?:api|backend|service)[a-zA-Z0-9._/-]*',
    r'"(https?://[^"]{10,80})"',
    r"'(https?://[^']{10,80})'",
]
found = set()
for p in patterns:
    for m in re.findall(p, js):
        if 'google' not in m and 'font' not in m and 'cdn' not in m.lower():
            found.add(m[:120])

# Procura padrões de endpoint
ep = re.findall(r'["\']/(pesquisa|busca|publicacao|edicao|caderno|materia)[^"\']*["\']', js)
for e in set(ep):
    print("ENDPOINT:", e)

for u in sorted(found)[:20]:
    print("URL:", u)
