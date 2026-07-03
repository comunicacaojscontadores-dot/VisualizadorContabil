import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# Encontra o que VZ faz (metodo pesquisarJornalPaginado)
# Procura UZ para ver como obterUltimaEdicao é definido (confirmado como Jornal/ObterUltimaEdicao)
# e VZ no mesmo contexto

# Encontra o bloco da service class com todos esses metodos
idx = js.find('obterUltimaEdicao:UZ')
if idx == -1:
    idx = js.find('pesquisarJornalPaginado:VZ')

chunk = js[max(0, idx-3000):idx+5000]

# Encontra todos this.get/post/getFiltered dentro do chunk
for m in re.finditer(r'(?:this\.get|this\.post|this\.getFiltered)\(["\'][^"\']{2,100}["\']', chunk):
    print('CALL:', m.group(0))
print()

# Procura strings que parecem paths de API dentro do chunk
for m in re.finditer(r'["\'][A-Za-z][A-Za-z0-9/]{3,60}["\']', chunk):
    val = m.group(0)
    # Filtra strings que parecem paths (tem slash ou começa maiusculo)
    inner = val[1:-1]
    if '/' in inner or (inner[0].isupper() and len(inner) > 5):
        if not any(x in inner for x in ['Component', 'Module', 'Service', 'Directive', 'Pipe', 'Guard', 'Injectable', 'Input', 'Output']):
            print('STRING:', val)
