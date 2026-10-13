#!/usr/bin/env python3
"""Extrai o texto de um .xlsx ou .docx usando apenas a biblioteca padrao.

Nao precisa de openpyxl, pandas nem python-docx: os dois formatos sao ZIP com XML
dentro, e a stdlib abre os dois. Isso importa porque a skill roda na maquina de
qualquer colaborador, sem instalacao previa.

Uso:
    python extrair_planilha.py "C:/caminho/balancete.xlsx"
    python extrair_planilha.py "C:/caminho/balancete.xlsx" --aba 2
"""

import argparse
import re
import sys
import zipfile
from xml.etree import ElementTree

NS_SHEET = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
NS_DOC = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
LIMITE_CHARS = 200_000


def _texto_de_celula_compartilhada(no) -> str:
    """Uma entrada de sharedStrings pode vir quebrada em varios <t> (rich text)."""
    return "".join(t.text or "" for t in no.iter(f"{NS_SHEET}t"))


def _coluna_para_indice(referencia: str) -> int:
    """'A' -> 0, 'B' -> 1, 'AA' -> 26. Preserva colunas vazias no meio da linha."""
    letras = re.match(r"([A-Z]+)", referencia or "")
    if not letras:
        return 0
    indice = 0
    for caractere in letras.group(1):
        indice = indice * 26 + (ord(caractere) - ord("A") + 1)
    return indice - 1


def extrair_xlsx(caminho: str, aba: int | None = None) -> str:
    with zipfile.ZipFile(caminho) as zf:
        compartilhadas: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            raiz = ElementTree.fromstring(zf.read("xl/sharedStrings.xml"))
            compartilhadas = [
                _texto_de_celula_compartilhada(si) for si in raiz.findall(f"{NS_SHEET}si")
            ]

        planilhas = sorted(
            n for n in zf.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n)
        )
        if not planilhas:
            raise SystemExit("Nenhuma planilha encontrada dentro do arquivo.")

        if aba is not None:
            if not 1 <= aba <= len(planilhas):
                raise SystemExit(
                    f"Aba {aba} nao existe. O arquivo tem {len(planilhas)} aba(s)."
                )
            planilhas = [planilhas[aba - 1]]

        partes: list[str] = []
        for numero, nome_interno in enumerate(planilhas, start=aba or 1):
            partes.append(f"=== ABA {numero} ===")
            raiz = ElementTree.fromstring(zf.read(nome_interno))
            for linha in raiz.iter(f"{NS_SHEET}row"):
                celulas: list[str] = []
                for celula in linha.findall(f"{NS_SHEET}c"):
                    destino = _coluna_para_indice(celula.get("r", ""))
                    while len(celulas) < destino:
                        celulas.append("")

                    valor_no = celula.find(f"{NS_SHEET}v")
                    tipo = celula.get("t")

                    if tipo == "s" and valor_no is not None:
                        indice = int(valor_no.text or 0)
                        texto = compartilhadas[indice] if indice < len(compartilhadas) else ""
                    elif tipo == "inlineStr":
                        texto = _texto_de_celula_compartilhada(celula)
                    else:
                        texto = (valor_no.text or "") if valor_no is not None else ""

                    celulas.append(texto.strip())

                # rstrip apenas: uma celula vazia no inicio da linha precisa continuar
                # ocupando lugar, senao as colunas de saldo do balancete desalinham.
                linha_texto = " | ".join(celulas).rstrip(" |")
                if linha_texto.strip(" |"):
                    partes.append(linha_texto)

        return "\n".join(partes)


def extrair_docx(caminho: str) -> str:
    """Le o documento NA ORDEM: paragrafo e tabela saem onde aparecem.

    Ler todos os paragrafos primeiro e as tabelas depois perde a posicao de cada
    tabela, e em demonstracoes contabeis isso e fatal: nao da para saber a qual
    nota explicativa uma tabela pertence.
    """
    with zipfile.ZipFile(caminho) as zf:
        raiz = ElementTree.fromstring(zf.read("word/document.xml"))

    corpo = raiz.find(f"{NS_DOC}body")
    if corpo is None:
        corpo = raiz

    def texto_paragrafo(p) -> str:
        return "".join(t.text or "" for t in p.iter(f"{NS_DOC}t")).strip()

    def linhas_tabela(tbl):
        for linha in tbl.iter(f"{NS_DOC}tr"):
            celulas = [
                "".join(t.text or "" for t in celula.iter(f"{NS_DOC}t")).strip()
                for celula in linha.findall(f"{NS_DOC}tc")
            ]
            # rstrip apenas: celula vazia no inicio mantem o alinhamento da coluna
            linha_texto = " | ".join(celulas).rstrip(" |")
            if linha_texto.strip(" |"):
                yield linha_texto

    partes: list[str] = []
    for filho in corpo:
        tag = filho.tag
        if tag == f"{NS_DOC}p":
            texto = texto_paragrafo(filho)
            if texto:
                partes.append(texto)
        elif tag == f"{NS_DOC}tbl":
            partes.append("[TABELA]")
            partes.extend(linhas_tabela(filho))
            partes.append("[/TABELA]")

    return "\n".join(partes)


def main() -> int:
    parser = argparse.ArgumentParser(description="Extrai texto de .xlsx ou .docx")
    parser.add_argument("caminho", help="Caminho do arquivo")
    parser.add_argument(
        "--aba", type=int, default=None, help="Ler apenas esta aba (1 = primeira)"
    )
    args = parser.parse_args()

    minusculo = args.caminho.lower()
    try:
        if minusculo.endswith(".xlsx") or minusculo.endswith(".xlsm"):
            texto = extrair_xlsx(args.caminho, args.aba)
        elif minusculo.endswith(".docx"):
            texto = extrair_docx(args.caminho)
        elif minusculo.endswith(".xls"):
            raise SystemExit(
                ".xls antigo nao e legivel sem biblioteca externa. "
                "Abra no Excel e salve como .xlsx."
            )
        else:
            raise SystemExit(
                "Formato nao suportado por este script. "
                "Use .xlsx ou .docx; para .pdf/.csv/.txt leia o arquivo direto."
            )
    except FileNotFoundError:
        raise SystemExit(f"Arquivo nao encontrado: {args.caminho}")
    except zipfile.BadZipFile:
        raise SystemExit(
            "Arquivo corrompido ou nao e um .xlsx/.docx de verdade "
            "(pode ser um .xls renomeado)."
        )

    if len(texto) > LIMITE_CHARS:
        texto = (
            texto[:LIMITE_CHARS]
            + f"\n\n[... truncado em {LIMITE_CHARS} caracteres. "
            "Use --aba N para ler uma aba especifica ...]"
        )

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(texto)
    return 0


if __name__ == "__main__":
    sys.exit(main())
