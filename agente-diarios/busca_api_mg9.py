import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# VZ e o nome do servico pesquisarJornalPaginado
# Procura VZ class/function com metodos que chamam this.get ou this.post
# Primeiro encontra onde VZ e chamado de verdade: 'new VZ' ou 'VZ.prototype'
for m in re.finditer(r'VZ\s*\{', js):
    chunk = js[max(0, m.start()-200):m.start()+800]
    if 'get(' in chunk or 'post(' in chunk:
        print('VZ{:', chunk)
        print()

# Procura classe definida com metodo que chama .get com path pesquisa
for m in re.finditer(r'pesquisarJornalPaginado\([^)]*\)\{[^}]{0,400}', js):
    print('pesquisarJornalPaginado method:', m.group(0))
    print()

# Procura padrao: return this.get("publicacao/pesquisa" ou similar
for m in re.finditer(r'return this\.(?:get|getFiltered|post)\(["\'][^"\']{3,60}["\']', js):
    val = m.group(0)
    if any(k in val for k in ['publi', 'edicao', 'pesquis', 'jornal', 'caderno', 'materia']):
        print('API call:', val)
