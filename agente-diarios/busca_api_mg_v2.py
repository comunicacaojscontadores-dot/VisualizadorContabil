import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# Procura a string "ObterUltimaEdicao" no bundle (a URL path real)
for m in re.finditer(r'ObterUltimaEdicao', js):
    print('Contexto ObterUltimaEdicao:')
    print(js[max(0, m.start()-200):m.start()+300])
    print()

# Procura TODOS os paths que passam para this.get / this.getFiltered / this.post
print('\n=== Todos os paths passados para chamadas HTTP ===')
for m in re.finditer(r'(?:this\.(?:get|getFiltered|post))\(\s*["\']([^"\']{3,80})["\']', js):
    print('PATH:', m.group(1))
