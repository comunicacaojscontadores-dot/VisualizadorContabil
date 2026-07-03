"""
Combina JSONs de todos os diarios em um unico arquivo.
Uso:
  python combinar_jsons.py                    -> usa nomes padrao, saida dados_combinados.json
  python combinar_jsons.py <sufixo> <saida>   -> ex: python combinar_jsons.py _25 dados_combinados_25.json
"""
import json, os, sys

sufixo = sys.argv[1] if len(sys.argv) > 1 else ''
saida  = sys.argv[2] if len(sys.argv) > 2 else 'dados_combinados.json'

arquivos = [
    f'dados_dou{sufixo}.json',
    f'dados_doe_rj{sufixo}.json',
    f'dados_doe_es{sufixo}.json',
    f'dados_doe_mg{sufixo}.json',
    f'dados_doe_sp{sufixo}.json',
]
todos = []
for arq in arquivos:
    if os.path.exists(arq):
        with open(arq, encoding='utf-8-sig') as f:
            dados = json.load(f)
            todos.extend(dados)
        print(f'  {arq}: {len(dados)} registros', file=sys.stderr)
    else:
        print(f'  {arq}: nao encontrado', file=sys.stderr)

with open(saida, 'w', encoding='utf-8') as f:
    json.dump(todos, f, ensure_ascii=False)

print(f'Total combinado: {len(todos)} registros')
