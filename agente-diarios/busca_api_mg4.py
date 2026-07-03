import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# pesquisarJornalPaginado e mapeada para VZ
idx = js.find('pesquisarJornalPaginado:VZ')
if idx != -1:
    print('Mapping at', idx)
    print(js[max(0, idx-50):idx+300])
    print()

# Procura definicao de VZ
for pat in [r'VZ=function\(', r'function VZ\(']:
    for m in re.finditer(pat, js):
        print(f'VZ def ({pat}):', js[m.start():m.start()+500])
        print()

# Procura URLs com pesquisa
for m in re.finditer(r'["\'/][a-z/-]*pesquis[a-z/-]*["\'/]', js):
    print('pesquisa URL:', m.group(0))

# Procura todos strings com api/v1
for m in re.finditer(r'"api/v1/[^"]*"', js):
    print('api/v1 string:', m.group(0))
