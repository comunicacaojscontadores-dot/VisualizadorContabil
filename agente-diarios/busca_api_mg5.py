import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# Procura todos strings literais que parecem paths de API
# Ex: "/publicacao/pesquisa", "/jornal/pesquisa", etc.
found = set()
for m in re.finditer(r'"(/[a-z][a-z0-9/_-]{2,60})"', js):
    path = m.group(1)
    if any(k in path for k in ['publica', 'pesquis', 'edicao', 'edicoes', 'jornal', 'caderno', 'materia', 'download', 'busca', 'diario', 'pagina']):
        found.add(path)

for p in sorted(found):
    print('PATH:', p)

print()

# Procura contexto do this.API
for m in re.finditer(r'this\.API', js):
    print('this.API context:', js[max(0, m.start()-10):m.start()+200])
    print()
    if len(list(re.finditer(r'this\.API', js[:m.start()]))) > 5:
        break
