"""
Carrega os termos de busca dos clientes para uso nos coletores.
Permite que qualquer ato que mencione um cliente seja incluído,
independente de ser fiscal ou não.
"""
import json
import re
import unicodedata
from pathlib import Path


def _norm(s: str) -> str:
    return unicodedata.normalize("NFD", s.upper()).encode("ascii", "ignore").decode()


def carregar_termos() -> list[tuple[str, str, re.Pattern]]:
    """
    Retorna lista de (nome_cliente, termo_normalizado, pattern_compilado).
    Usa word boundaries para evitar falsos positivos (ex: ATIVA em NORMATIVA).
    """
    caminho = Path(__file__).parent / "clientes.json"
    if not caminho.exists():
        return []
    with open(caminho, encoding="utf-8") as f:
        clientes = json.load(f)
    termos = []
    for c in clientes:
        nome = c["nome"]
        for t in c.get("busca", []):
            nt = _norm(t)
            try:
                pat = re.compile(r"\b" + re.escape(nt) + r"\b")
            except re.error:
                pat = re.compile(re.escape(nt))
            termos.append((nome, nt, pat))
    return termos


def cliente_mencionado(texto: str, termos: list[tuple[str, str, re.Pattern]]) -> str:
    """
    Retorna o nome do primeiro cliente encontrado no texto (word boundary), ou ''.
    """
    t_norm = _norm(texto)
    for nome, _, pat in termos:
        if pat.search(t_norm):
            return nome
    return ""


# Carrega uma vez no import para reutilizar
TERMOS_CLIENTES = carregar_termos()
