#!/usr/bin/env python3
"""Extrai o texto de um PDF usando apenas a biblioteca padrao do Python.

Existe porque a leitura nativa de PDF depende do poppler, que nao esta instalado
nas maquinas do escritorio — e balancete em PDF e o formato mais comum.

Funciona com PDF de texto (o que sai de Dominio, Alterdata, Questor, Sage...).
NAO funciona com PDF escaneado, que e imagem e precisaria de OCR; nesse caso o
script avisa em vez de devolver lixo.

Uso:
    python extrair_pdf.py "C:/caminho/balancete.pdf"
    python extrair_pdf.py "C:/caminho/balancete.pdf" --paginas 1-5
"""

import argparse
import re
import sys
import zlib

LIMITE_CHARS = 200_000

# Operadores de texto do PDF: (texto) Tj | [(a) -250 (b)] TJ | (texto) ' | (texto) "
RE_TJ = re.compile(rb"\((?:[^()\\]|\\.)*\)\s*(?:Tj|TJ|'|\")", re.S)
RE_TJ_ARRAY = re.compile(rb"\[(.*?)\]\s*TJ", re.S)
RE_STRING = re.compile(rb"\((?:[^()\\]|\\.)*\)", re.S)
RE_QUEBRA = re.compile(rb"(?:T\*|Td|TD|TL|ET)\b")

# Escapes definidos na especificacao do PDF
ESCAPES = {
    b"n": b"\n", b"r": b"\r", b"t": b"\t", b"b": b"\b", b"f": b"\f",
    b"(": b"(", b")": b")", b"\\": b"\\",
}


def _decodifica_string(bruto: bytes) -> bytes:
    """Resolve os escapes de uma string PDF, inclusive octais (\\350)."""
    saida = bytearray()
    i = 0
    while i < len(bruto):
        c = bruto[i : i + 1]
        if c == b"\\" and i + 1 < len(bruto):
            prox = bruto[i + 1 : i + 2]
            if prox in ESCAPES:
                saida += ESCAPES[prox]
                i += 2
                continue
            if prox.isdigit():  # octal: ate 3 digitos
                oct_digits = b""
                j = i + 1
                while j < len(bruto) and len(oct_digits) < 3 and bruto[j : j + 1].isdigit():
                    oct_digits += bruto[j : j + 1]
                    j += 1
                try:
                    saida.append(int(oct_digits, 8))
                except ValueError:
                    pass
                i = j
                continue
            if prox == b"\n":  # continuacao de linha
                i += 2
                continue
            saida += prox
            i += 2
            continue
        saida += c
        i += 1
    return bytes(saida)


def _texto_do_conteudo(conteudo: bytes) -> str:
    """Le os operadores de texto de um stream de conteudo ja descomprimido."""
    partes: list[str] = []

    for trecho in re.split(RE_QUEBRA, conteudo):
        linha = bytearray()

        for m in RE_TJ_ARRAY.finditer(trecho):
            for s in RE_STRING.finditer(m.group(1)):
                linha += _decodifica_string(s.group(0)[1:-1])

        for m in RE_TJ.finditer(trecho):
            bruto = m.group(0)
            fim = bruto.rfind(b")")
            if fim > 0:
                linha += _decodifica_string(bruto[1:fim])

        if linha:
            # PDF usa WinAnsi/Latin-1 na maioria dos casos; cp1252 cobre acentos.
            partes.append(bytes(linha).decode("cp1252", errors="replace"))

    return "\n".join(partes)


def _parece_texto(dados: bytes) -> bool:
    """Descarta stream binario (fonte, imagem) que passou pelo filtro por acaso."""
    if not dados:
        return False
    amostra = dados[:2000]
    imprimiveis = sum(1 for b in amostra if 32 <= b < 127 or b in (9, 10, 13))
    return imprimiveis / len(amostra) > 0.85


def _streams(dados: bytes):
    """Devolve cada stream do arquivo, descomprimido quando for FlateDecode.

    A palavra "stream" tambem aparece dentro de "endstream": procurar por ela
    solta desalinhava tudo depois do primeiro objeto e fazia 306 dos 307 streams
    falharem. Por isso o inicio e casado com a quebra de linha obrigatoria que a
    especificacao exige depois da palavra-chave.
    """
    for m in re.finditer(rb"[^d]stream\r?\n", dados):
        ini = m.end()
        fim = dados.find(b"endstream", ini)
        if fim == -1:
            continue

        corpo = dados[ini:fim].rstrip(b"\r\n")

        try:
            yield zlib.decompress(corpo)
            continue
        except zlib.error:
            pass

        try:  # stream truncado ainda rende texto util
            saida = zlib.decompressobj().decompress(corpo)
            if saida:
                yield saida
                continue
        except zlib.error:
            pass

        if _parece_texto(corpo):  # provavelmente sem compressao
            yield corpo


def extrair_pdf(caminho: str, paginas: tuple[int, int] | None = None) -> str:
    with open(caminho, "rb") as f:
        dados = f.read()

    if not dados.startswith(b"%PDF"):
        raise SystemExit("Este arquivo nao e um PDF valido.")

    blocos: list[str] = []
    for i, stream in enumerate(_streams(dados), start=1):
        if paginas and not (paginas[0] <= i <= paginas[1]):
            continue
        if b"Tj" not in stream and b"TJ" not in stream:
            continue  # stream de imagem ou fonte
        if not _parece_texto(stream):
            continue  # binario que contem "Tj" por coincidencia de bytes
        texto = _texto_do_conteudo(stream)
        if texto.strip():
            blocos.append(texto)

    return "\n".join(blocos)


def main() -> int:
    parser = argparse.ArgumentParser(description="Extrai texto de um PDF (stdlib apenas)")
    parser.add_argument("caminho", help="Caminho do arquivo PDF")
    parser.add_argument("--paginas", help="Intervalo de blocos, ex: 1-5", default=None)
    args = parser.parse_args()

    faixa = None
    if args.paginas:
        try:
            ini, fim = args.paginas.split("-")
            faixa = (int(ini), int(fim))
        except ValueError:
            raise SystemExit("Formato de --paginas invalido. Use, por exemplo, 1-5.")

    try:
        texto = extrair_pdf(args.caminho, faixa)
    except FileNotFoundError:
        raise SystemExit(f"Arquivo nao encontrado: {args.caminho}")

    if not texto.strip():
        raise SystemExit(
            "Nenhum texto encontrado. O PDF provavelmente e escaneado (imagem), "
            "e este script nao faz OCR. Peca o balancete em Excel, ou um PDF "
            "gerado direto pelo sistema contabil."
        )

    if len(texto) > LIMITE_CHARS:
        texto = texto[:LIMITE_CHARS] + f"\n\n[... truncado em {LIMITE_CHARS} caracteres ...]"

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(texto)
    return 0


if __name__ == "__main__":
    sys.exit(main())
