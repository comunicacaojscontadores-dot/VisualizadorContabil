import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# Encontra Gi class - deve ser a service class
idx = js.find('this.API=Gi.API')
if idx != -1:
    # Vai atrás para ver o contexto mais amplo
    chunk = js[max(0, idx-2000):idx+500]
    print(chunk)
    print()

# Procura Gi.API em todo o bundle
for m in re.finditer(r'Gi\s*=\s*class|class Gi', js):
    print('Gi class:', js[m.start():m.start()+600])
    print()

# Procura API= com uma URL
for m in re.finditer(r'API="[^"]+"', js):
    print('API=string:', m.group(0))
for m in re.finditer(r"API='[^']+'", js):
    print("API=string:", m.group(0))
