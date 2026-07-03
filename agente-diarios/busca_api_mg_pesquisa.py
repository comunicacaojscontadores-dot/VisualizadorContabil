import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# Procura pesquisarJornalPaginado e pega o contexto mais amplo
for m in re.finditer(r'pesquisarJornalPaginado', js):
    start = m.start()
    chunk = js[max(0, start-50):start+600]
    print(f"[pos={start}] {chunk[:600]}")
    print()

# Procura "Pesquisar" nos paths de API
print("=== Strings com Pesquisar ===")
for m in re.finditer(r'["\`][A-Za-z/]+[Pp]esquis[A-Za-z/]+["\`]', js):
    print(m.group(0)[:100])
