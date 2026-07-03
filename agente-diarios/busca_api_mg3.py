import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# Contexto em torno de pesquisarJornalPaginado
idx = js.find('pesquisarJornalPaginado')
while idx != -1:
    print("=== pesquisarJornalPaginado ===")
    print(js[max(0,idx-100):idx+300])
    print()
    idx = js.find('pesquisarJornalPaginado', idx+1)

# Procura chamadas http.get/post com URL
for m in re.finditer(r'this\._?http\.[a-z]+\([^\)]{5,150}\)', js):
    snippet = m.group(0)
    if 'api' in snippet.lower() or 'v1' in snippet.lower() or 'pesquis' in snippet.lower():
        print("HTTP CALL:", snippet[:200])
