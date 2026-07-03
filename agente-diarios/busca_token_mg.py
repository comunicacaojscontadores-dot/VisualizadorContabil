import requests, re

r = requests.get('https://www.jornalminasgerais.mg.gov.br/main-WNVABJRQ.js', timeout=30)
js = r.text

# Procura como o token e obtido: BY(n) seta o token, s_() le
# Procura onde BY e chamado com um token JWT
for m in re.finditer(r'BY\(', js):
    ctx = js[max(0,m.start()-200):m.start()+300]
    if 'token' in ctx.lower() or 'jwt' in ctx.lower() or 'auth' in ctx.lower() or 'login' in ctx.lower():
        print(ctx)
        print()

# Procura endpoint de login/auth
for m in re.finditer(r'["\'][A-Za-z/]*(?:login|auth|token|autenticar)[A-Za-z/]*["\']', js, re.IGNORECASE):
    print('AUTH:', m.group(0))

# Procura chamada para obter token
for m in re.finditer(r'this\.baseService\.(?:get|post)\(["\'][^"\']*[Aa]uth[^"\']*["\']', js):
    print('AUTH CALL:', m.group(0))
for m in re.finditer(r'this\.baseService\.(?:get|post)\(["\'][^"\']*[Ll]ogin[^"\']*["\']', js):
    print('LOGIN CALL:', m.group(0))
for m in re.finditer(r'this\.baseService\.(?:get|post)\(["\'][^"\']*[Tt]oken[^"\']*["\']', js):
    print('TOKEN CALL:', m.group(0))
