import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# Procura Gi= (onde Gi é definido como objeto/classe com API)
for m in re.finditer(r'Gi=\{[^}]{0,500}API', js):
    print('Gi={API}:', m.group(0)[:600])
    print()

# Procura var Gi = ou let Gi = ou const Gi =
for m in re.finditer(r'(?:var|let|const)\s+Gi\s*=', js):
    print('Gi const/var:', js[m.start():m.start()+300])
    print()

# Procura Gi.API=
for m in re.finditer(r'Gi\.API\s*=', js):
    print('Gi.API=:', js[m.start():m.start()+200])
    print()
