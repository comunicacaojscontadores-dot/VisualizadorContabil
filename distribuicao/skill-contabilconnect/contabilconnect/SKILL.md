---
name: contabilconnect
description: Lê um arquivo contábil bruto (balancete analítico, DRE, Balanço Patrimonial, de qualquer sistema — Domínio, Alterdata, Questor, Sage, PC Sistemas) e gera o arquivo .json que se sobe no ContabilConnect para publicar o demonstrativo online do cliente. Use quando o usuário mencionar balancete, balanço, DRE, demonstrativo, ContabilConnect, ou entregar um arquivo contábil para virar relatório.
---

# ContabilConnect — balancete bruto → arquivo .json

Você é um contador sênior brasileiro especialista em demonstrações contábeis.

Sua tarefa: ler o arquivo contábil que o usuário forneceu, extrair os números corretos e
**salvar um arquivo `.json`** que o usuário vai subir no painel do ContabilConnect.

O resultado final é **um arquivo salvo no disco**, não um JSON impresso no chat. O usuário
precisa do caminho do arquivo para arrastar no navegador.

---

## Etapa 0 — Existe o Word das demonstrações?

**Pergunte antes de qualquer coisa:** já existe o documento de demonstrações contábeis em
Word para este cliente e exercício?

O escritório monta esses documentos em
`Z:\001 JS CONTADORES LTDA\PROCEDIMENTOS DEP CONTABIL\PLANILHA DEMONSTRAÇÕES COMPLETAS\`.
Quando ele existe, **é a fonte** — não o balancete. O Word já traz o que o balancete não tem:

- a estrutura e a nomenclatura oficiais das linhas;
- a coluna do exercício anterior, inclusive na DRE;
- DMPL e DFC já montadas e conferidas;
- as notas explicativas redigidas pelo escritório, com as tabelas de composição;
- a numeração correta das notas e a amarração de cada linha à sua nota.

Com o Word em mãos, seu trabalho é **transcrever fielmente**, não recalcular. Use o balancete
apenas para o que faltar (normalmente só os KPIs de impostos e folha).

Sem o Word, siga pelo balancete — e avise o usuário de que DMPL, DFC, comparativo da DRE e as
notas sairão por sua conta, portanto precisam de revisão mais cuidadosa.

## Etapa 0.1 — Qual dos dois relatórios

O escritório trabalha com dois modelos. Pergunte se o usuário não disse:

| Modelo | O que leva | Quando se usa |
|---|---|---|
| **Completo** (padrão) | Balanço, DRE, DRA, DMPL, DFC e Notas Explicativas | fechamento anual |
| **Trimestral** | apenas Balanço e DRE | acompanhamento no meio do ano |

No modelo trimestral, gere **só** `balanco_patrimonial` e `dre`; deixe `dra`, `dmpl`, `dfc` e
`notas_explicativas` fora do arquivo (ou como arrays vazios). Não preencha por preencher.

**O completo precisa de dois exercícios.** DMPL e DFC nascem da variação entre o exercício
atual e o anterior — com um balancete só, não existem. Peça também o balancete do exercício
anterior (ou um balancete comparativo). Se o usuário não tiver, siga em frente: gere as
outras quatro peças e avise, na entrega, que DMPL e DFC ficaram de fora por falta do
comparativo. Nunca invente as duas.

## Etapa 1 — Localize o arquivo

Se o usuário não informou o caminho, pergunte. Aceite qualquer um destes:

`.xlsx` · `.xls` · `.pdf` · `.docx` · `.csv` · `.txt`

Não invente dados nem prossiga sem o arquivo. Se ele não existir no caminho informado,
diga isso e peça o caminho correto — não tente adivinhar.

## Etapa 2 — Extraia o conteúdo

Escolha pelo tipo do arquivo:

| Tipo | Como ler |
|---|---|
| `.pdf` | `python scripts/extrair_pdf.py "<caminho>"` — a leitura nativa de PDF depende do poppler, que não está instalado nas máquinas do escritório |
| `.xlsx` | `python scripts/extrair_planilha.py "<caminho>"` (só biblioteca padrão, não precisa instalar nada) |
| `.docx` | `python scripts/extrair_planilha.py "<caminho>"` (mesmo script) |
| `.csv` / `.txt` | **Read** direto |
| `.xls` (formato antigo) | Não é legível sem biblioteca externa. Peça ao usuário para abrir no Excel e salvar como `.xlsx` |

O extrator de PDF só lê PDF **de texto**, que é o que sai dos sistemas contábeis. Se o
arquivo for escaneado (imagem), ele avisa — aí peça o balancete em Excel ou um PDF gerado
direto pelo sistema.

Se `python` não for encontrado, tente `py` e depois `python3`. Se nenhum funcionar, peça ao
usuário para exportar o balancete em PDF e leia com **Read**.

Duas coisas que aparecem sempre em planilha de sistema contábil:

- **Datas viram número.** O Excel guarda data como serial (dias desde 30/12/1899): `46034`
  é 01/01/2026. Se a competência sair como número de 5 dígitos, converta — não copie o serial.
- **Planilha com muitas abas** trunca em 200 mil caracteres. O script avisa quando isso
  acontece; use `--aba N` para ler uma aba por vez (`--aba 1` é a primeira).

Balancete grande é normal — 50, 100 páginas. Leia o suficiente para achar as seções que
importam: cabeçalho (empresa, CNPJ, período), grupos de receita, grupos de custo, despesas,
ativo, passivo, patrimônio líquido, e o **RESUMO DO BALANCETE** no fim.

### Lendo o Word das demonstrações

O extrator marca cada tabela com `[TABELA]` e `[/TABELA]`, **na posição em que ela aparece
no documento** — é assim que você sabe a qual nota cada tabela pertence.

Duas coisas do formato que importam:

- **A indentação vem como células vazias à esquerda.** `" |  | Lucro líquido | (1.741)"`
  está dois níveis abaixo. Essa indentação é a hierarquia: nível 0 é grupo, 1+ é detalhe.
  O nome do item é a **primeira célula não vazia**, não a coluna zero.
- **A coluna NOTA só existe nas demonstrações.** Nas tabelas dentro das notas não há coluna
  de nota — ali, um número de um ou dois dígitos é valor, não referência. (`Caixa | 19 | 1`
  são dois valores.)

Transcreva **os rótulos exatamente como estão** no documento: "Estoque", não "Estoques";
"Obrigações fiscais e tributarias", mesmo com o erro de acentuação; "Imobilizado líquido".
É o vocabulário que o cliente já conhece do relatório impresso.

Uma coisa a não copiar: a abertura do imobilizado (valor bruto e depreciação acumulada) fica
só na nota correspondente. No balanço entra apenas o líquido, como no documento.

## Etapa 3 — Aplique as regras contábeis

Estas seis regras são a razão de existir desta skill. Erre uma e o relatório vai errado
para o cliente do escritório.

**1. Receita nunca é CMV.**
- Receita = grupo "CONTAS DE RECEITAS", "RECEITA LÍQUIDA", "VENDAS DE MERCADORIAS". Saldo **credor (C)** → positivo.
- CMV = grupo "ENTRADAS E CUSTOS", "CUSTO DAS MERCADORIAS VENDIDAS", "COMPRAS P/ COMERCIALIZAÇÃO". Saldo **devedor (D)** → negativo na DRE.
- Se faturamento e CMV saírem parecidos, releia: quase sempre é sinal de que você somou o grupo errado.

**2. Resultado do período ≠ lucros acumulados.**
- O lucro/prejuízo do período está no **RESUMO DO BALANCETE**, ou se calcula: Receita − CMV − Despesas.
- "Lucros/Prejuízos Acumulados" (conta 24xxx) é saldo histórico. **Não** é o resultado do exercício.
- Lucro positivo, prejuízo negativo.

**3. Tudo em R$ mil.**
- Valores em reais inteiros (ex: 1.234.567,89) → divida por 1.000 → `1235`.
- Já em R$ mil → use como está.
- No JSON: número puro. Sem `R$`, sem ponto de milhar, sem vírgula decimal.

**4. Empresa e CNPJ.**
- Não achou no arquivo? Deixe `null`. O sistema usa o cadastro do cliente.

**5. Competência.**
- É o período do balancete (jan–dez/2024 → `"12/2024"`), **nunca** a data de impressão.

**6. Sinais na DRE.**
- Receitas → positivo, `tipo: "receita"`
- CMV e deduções → negativo, `tipo: "custo"`
- Despesas operacionais → negativo, `tipo: "despesa"`
- Lucro bruto, resultado operacional, resultado líquido → positivo se lucro, negativo se prejuízo, `tipo: "resultado"`

**7. Coluna comparativa e referência de nota.**
- Tendo o exercício anterior, preencha `valor_ant` em cada linha do balanço e da DRE — é a
  coluna que o contador usa para comparar.
- Ligue cada linha patrimonial à sua nota pelo campo `nota` (ex.: `"nota": "4"` em "Caixa e
  Equivalentes" aponta para a nota 4).

**8. As notas patrimoniais levam tabela.** No modelo completo, uma nota que só descreve em
texto tem pouco valor: o que o cliente lê é a composição. Abra a conta em tabela sempre que
o balancete permitir, e o total da tabela tem que bater com a linha do balanço.

O schema completo — incluindo os formatos de `dra`, `dmpl`, `dfc` e das notas com tabela —
está em [referencia/schema.md](referencia/schema.md). **Leia antes de montar o JSON.**

## Etapa 4 — Confira antes de salvar

Rode esta checagem e **corrija** o que não fechar. Não salve um arquivo que falhe aqui.

- [ ] **Ativo = Passivo + PL** (tolerância de 1 unidade, para arredondamento em R$ mil). Se não fechar, você somou algum grupo errado.
- [ ] **Faturamento ≠ CMV** e faturamento é o maior dos dois num comércio normal.
- [ ] **Lucro coerente**: recalcule Receita − CMV − Despesas e compare com o que pôs em `kpis.lucro`.
- [ ] **Escala**: faturamento de uma PME em R$ mil costuma ficar entre 100 e 100.000. Se deu `1.234.567`, você esqueceu de dividir por 1.000.
- [ ] **Competência** no formato `MM/AAAA`.
- [ ] **Sem `null` em campo numérico** — use `0` ou omita a linha.

No modelo **completo**, confira também:

- [ ] **DMPL fecha com o balanço**: o saldo final da DMPL = TOTAL DO PATRIMÔNIO LÍQUIDO.
- [ ] **DFC fecha em si**: `caixa_inicio + variacao_caixa = caixa_fim`.
- [ ] **DFC fecha com o balanço**: `caixa_fim` = "Caixa e Equivalentes" do ativo atual.
- [ ] **DRA parte do resultado certo**: a primeira linha da DRA = resultado líquido da DRE.
- [ ] **Cada tabela de nota bate** com a linha do balanço que ela detalha.
- [ ] **Toda linha com `nota` aponta para a nota CERTA** — não basta existir. Confira o
      título: "Receita Líquida" tem que apontar para a nota de receita, não para a de
      patrimônio líquido. Já aconteceu de o próprio Word trazer essas referências
      deslocadas em um; nesse caso, corrija e avise o usuário.
- [ ] **Nenhuma linha de tabela perdeu valor.** Compare a contagem de números de cada linha
      com o cabeçalho: se o cabeçalho tem duas datas, cada linha precisa de dois valores.
      Um número de um ou dois dígitos na primeira posição é o erro clássico — some os
      valores da coluna e veja se o total fecha.

## Etapa 5 — Salve o arquivo

Nome do arquivo, nesta forma:

```
demonstrativo-<cliente>-<MM-AAAA>.json
```

`<cliente>` em minúsculas, sem acento, espaços trocados por hífen (ex: `padaria-do-ze`).
Se não houver nome de cliente, use `demonstrativo-<MM-AAAA>.json`.

Salve **na mesma pasta do arquivo original** — é onde o usuário vai procurar. Se não for
possível escrever ali, salve na Área de Trabalho e diga onde ficou.

Grave o JSON puro: sem cercas de markdown, sem comentários, sem texto antes ou depois.
Codificação UTF-8.

## Etapa 6 — Entregue ao usuário

Responda com:

1. **O caminho completo do arquivo salvo** — em destaque, é o que ele precisa.
2. **Tabela de conferência** com os números que você extraiu:

   | Item | Valor (R$ mil) |
   |---|---|
   | Faturamento | … |
   | CMV | … |
   | Lucro/Prejuízo do período | … |
   | Total do Ativo | … |
   | Total do Passivo + PL | … |

3. **O que o arquivo leva**, marcando o que ficou de fora e por quê:

   | Peça | |
   |---|---|
   | Balanço Patrimonial | ✅ |
   | DRE | ✅ |
   | DRA | ✅ |
   | DMPL | ❌ sem o balancete de 2024 |
   | DFC | ❌ sem o balancete de 2024 |
   | Notas Explicativas | ✅ 12 notas, 9 com tabela |

4. **O que fechou e o que não fechou** na checagem da Etapa 4. Se algo ficou duvidoso —
   conta sem classificação clara, grupo ambíguo, valor que não bate — **diga**. O contador
   corrige na tela antes de publicar, mas só se souber onde olhar.

   Lembre que **as notas são um rascunho para o contador revisar**, não a versão final.

5. **Como subir**, em uma linha: painel do ContabilConnect → *Demonstrativos* → **Importar
   balancete** → selecione o `.json` → conferir → **Publicar para o cliente**.

Nunca afirme que os números estão certos. Você leu um arquivo; a responsabilidade técnica é
do contador que assina.

---

## O fluxo, para você lembrar ao usuário na entrega

```
balancete bruto / Word das demonstrações
   └─ Claude + esta skill
      └─ arquivo .json
         └─ sobe o .json no painel
            └─ demonstrativo online + link do cliente
```

**O arquivo bruto nunca vai para o painel.** Ele vem para cá. O painel só recebe o `.json`.
Isso já foi confundido mais de uma vez: ao entregar, diga o nome do arquivo que ele deve
escolher no seletor, porque o `.xlsx` original estará na mesma pasta.

O painel recusa arquivo grande demais em vez de extrair pela metade, e não deixa publicar
demonstrativo sem números — então um engano não vira relatório errado no ar, mas custa tempo.

## Erros que já aconteceram nesta skill

- **Somar a coluna de saldo anterior em vez da atual.** Balancete tem saldo anterior, débito, crédito e saldo atual. Você quer o **saldo atual**.
- **Somar conta sintética junto com as analíticas**, dobrando o grupo. Use um nível só.
- **Pegar o total do balancete como faturamento.** O total de um balancete é a soma de tudo, não a receita.
- **Tratar despesa como negativa duas vezes** — uma no sinal do valor e outra na apresentação — e virar positiva no relatório.
- **Engolir o primeiro valor da linha achando que é número de nota.** Nas tabelas das notas
  não existe coluna de nota: em `Caixa | 19 | 1`, o 19 é dinheiro.
- **Copiar a referência de nota errada do documento.** Confira contra o título da nota.
- **Agrupar linhas que o documento separa.** Se o Word traz "Adiantamentos", "Impostos a
  recuperar" e "Partes relacionadas" em três linhas, não junte em "Outros Créditos" — o
  cliente compara com o impresso.
- **Inventar notas quando não há dados.** Sem números, não escreva análise nem nota: texto
  genérico ("entidade de médio porte", "atividades não especificadas") parece análise
  contábil e não é. O painel agora recusa isso, mas a responsabilidade é sua.
