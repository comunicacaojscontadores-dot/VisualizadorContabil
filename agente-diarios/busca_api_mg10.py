import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# Procura todos chamados this.get("...") e this.post("...")
all_calls = []
for m in re.finditer(r'this\.(?:get|getFiltered|post)\(["\'][^"\']{2,80}["\']', js):
    all_calls.append(m.group(0))

for c in all_calls:
    print(c)

print(f'\nTotal: {len(all_calls)} chamadas')
