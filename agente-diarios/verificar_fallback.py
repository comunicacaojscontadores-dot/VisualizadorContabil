"""
Se o JSON de coleta está vazio (0 registros para a data de hoje),
re-executa o coletor com o último dia útil anterior e marca os
registros com aviso de fallback.
"""
import json
import os
import subprocess
import sys
from datetime import date, timedelta


def ultimo_dia_util(d: date) -> date:
    """Retorna o último dia útil anterior a d (pula sáb/dom)."""
    d -= timedelta(days=1)
    while d.weekday() >= 5:  # 5=sáb, 6=dom
        d -= timedelta(days=1)
    return d


def main():
    if len(sys.argv) < 4:
        print("Uso: verificar_fallback.py <script.py> <saida.json> <data_hoje>")
        sys.exit(1)

    script = sys.argv[1]
    saida = sys.argv[2]
    data_hoje = sys.argv[3]

    # Verifica se a coleta de hoje resultou em dados
    registros = []
    if os.path.exists(saida):
        with open(saida, encoding="utf-8-sig") as f:
            registros = json.load(f)

    if registros:
        print(f"  [{script}] {len(registros)} registros para {data_hoje} — OK", file=sys.stderr)
        sys.exit(0)

    # Vazio: tenta dia anterior
    dia_ant = ultimo_dia_util(date.fromisoformat(data_hoje))
    dia_ant_str = dia_ant.isoformat()
    print(f"  [{script}] 0 registros para {data_hoje} — usando fallback {dia_ant_str}", file=sys.stderr)

    resultado = subprocess.run(
        [sys.executable, script, dia_ant_str, saida],
        capture_output=True, text=True
    )
    print(resultado.stderr, file=sys.stderr, end="")
    if resultado.stdout:
        print(resultado.stdout)

    # Marca os registros com aviso
    if os.path.exists(saida):
        with open(saida, encoding="utf-8-sig") as f:
            registros = json.load(f)

        aviso = f"ATENÇÃO: dado de {dia_ant_str} (edição de {data_hoje} não publicada até 10h)"
        for reg in registros:
            reg["_aviso_fallback"] = aviso
            # Mantém a data original para aparecer na coluna certa no Excel
            reg["_data_original"] = data_hoje
            reg["data"] = dia_ant_str  # data real do conteúdo

        with open(saida, "w", encoding="utf-8") as f:
            json.dump(registros, f, ensure_ascii=False, indent=2)

        print(f"  [{script}] fallback: {len(registros)} registros de {dia_ant_str} marcados", file=sys.stderr)


if __name__ == "__main__":
    main()
