import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# Encontra a classe ho (que tem ObterUltimaEdicao) e imprime tudo
idx = js.find('ObterUltimaEdicao(){return this.baseService.get("Jornal/ObterUltimaEdicao")}')
if idx != -1:
    # Pega chunk maior para ver todos os metodos
    chunk = js[max(0,idx-200):idx+2000]
    print("=== Classe ho (JornalService) ===")
    print(chunk)
    print()

# Procura a classe que tem PesquisarJornalPaginado
# Procura todos this.baseService.get/post com paths
print("=== Todos this.baseService.get/post ===")
for m in re.finditer(r'this\.baseService\.(?:get|getFiltered|post)\([^)]{5,200}\)', js):
    val = m.group(0)
    if 'Jornal' in val or 'Publicacao' in val or 'Pesquis' in val or 'Edicao' in val:
        print(val[:200])
