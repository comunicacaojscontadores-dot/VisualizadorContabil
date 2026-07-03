import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# Encontra contexto de PesquisarJornaisPaginados
for m in re.finditer(r'PesquisarJornaisPaginados', js):
    start = m.start()
    print(js[max(0,start-300):start+600])
    print()
