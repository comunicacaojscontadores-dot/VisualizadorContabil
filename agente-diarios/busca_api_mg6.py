import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# Procura onde this.API é definido como string concreta
# Gi.API deve ser um valor
for m in re.finditer(r'Gi\.API\s*=\s*["\'][^"\']+["\']', js):
    print('Gi.API def:', m.group(0))

# Procura static API= com string
for m in re.finditer(r'static\s+API\s*=\s*["\'][^"\']+["\']', js):
    print('static API:', m.group(0))

# Procura API: "..." (objeto literal)
for m in re.finditer(r'"API"\s*:\s*["\'][^"\']+["\']', js):
    print('API obj:', m.group(0))

# Procura padroes de URL como "api/v1" ou "/api/" no contexto
for m in re.finditer(r'["\'][^"\']{0,10}api/[^"\']{1,60}["\']', js):
    val = m.group(0)
    if 'script' not in val and 'google' not in val:
        print('api url:', val[:100])
