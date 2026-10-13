# Schema do arquivo .json

Todos os campos são opcionais — o painel renderiza o que existir e ignora o resto. Mas
`kpis`, `balanco_patrimonial` e `dre` são o que faz o relatório valer algo: preencha os três
sempre que o arquivo permitir.

Valores sempre em **R$ mil**, como número puro.

## Estrutura mínima

```json
{
  "empresa": { "nome": "RAZAO SOCIAL LTDA", "cnpj": "00.000.000/0000-00" },
  "competencia": "12/2024",
  "kpis": { "faturamento": 0, "lucro": 0, "impostos": 0, "folha": 0 },
  "balanco_patrimonial": {
    "ativo": [
      { "item": "Ativo Circulante", "valor": 0, "tipo": "grupo" },
      { "item": "Caixa e Equivalentes", "valor": 0, "indent": true },
      { "item": "Clientes / Contas a Receber", "valor": 0, "indent": true },
      { "item": "Estoques", "valor": 0, "indent": true },
      { "item": "Outros Ativos Circulantes", "valor": 0, "indent": true },
      { "item": "Ativo Não Circulante", "valor": 0, "tipo": "grupo" },
      { "item": "Imobilizado", "valor": 0, "indent": true },
      { "item": "Intangível", "valor": 0, "indent": true },
      { "item": "TOTAL DO ATIVO", "valor": 0, "tipo": "subtotal" }
    ],
    "passivo": [
      { "item": "Passivo Circulante", "valor": 0, "tipo": "grupo" },
      { "item": "Fornecedores", "valor": 0, "indent": true },
      { "item": "Obrigações Fiscais", "valor": 0, "indent": true },
      { "item": "Obrigações Trabalhistas", "valor": 0, "indent": true },
      { "item": "Empréstimos e Financiamentos CP", "valor": 0, "indent": true },
      { "item": "Passivo Não Circulante", "valor": 0, "tipo": "grupo" },
      { "item": "Empréstimos e Financiamentos LP", "valor": 0, "indent": true },
      { "item": "TOTAL DO PASSIVO", "valor": 0, "tipo": "subtotal" }
    ],
    "patrimonio_liquido": [
      { "item": "Capital Social", "valor": 0 },
      { "item": "Reservas de Capital", "valor": 0 },
      { "item": "Lucros/Prejuízos Acumulados", "valor": 0 },
      { "item": "TOTAL DO PATRIMÔNIO LÍQUIDO", "valor": 0, "tipo": "subtotal" }
    ]
  },
  "dre": [
    { "item": "Receita Bruta de Vendas", "valor": 0, "tipo": "receita" },
    { "item": "(-) Deduções e Impostos s/ Vendas", "valor": 0, "tipo": "custo" },
    { "item": "Receita Líquida", "valor": 0, "tipo": "resultado" },
    { "item": "(-) CMV / Custo das Mercadorias Vendidas", "valor": 0, "tipo": "custo" },
    { "item": "Lucro Bruto", "valor": 0, "tipo": "resultado" },
    { "item": "(-) Despesas com Vendas", "valor": 0, "tipo": "despesa" },
    { "item": "(-) Despesas Gerais e Administrativas", "valor": 0, "tipo": "despesa" },
    { "item": "(-) Despesas Financeiras", "valor": 0, "tipo": "despesa" },
    { "item": "Outras Receitas/Despesas Operacionais", "valor": 0, "tipo": "resultado" },
    { "item": "Resultado Operacional", "valor": 0, "tipo": "resultado" },
    { "item": "(-) IRPJ e CSLL", "valor": 0, "tipo": "despesa" },
    { "item": "Resultado Líquido do Período", "valor": 0, "tipo": "resultado" }
  ],
  "notas_explicativas": []
}
```

Omita linhas que não existem no documento — exceto os grupos e subtotais, que dão estrutura
ao relatório. Seção ausente no arquivo (sem DRE, por exemplo) → array vazio `[]`.

**`grupo` e `subtotal` não são só formatação — o relatório calcula com eles:**

- A linha `tipo: "grupo"` (ex.: "Ativo Circulante") deve trazer o **total da seção**, e as
  linhas `indent` abaixo dela são o detalhamento desse total. O relatório usa o valor do grupo
  para os índices de liquidez.
- A linha `tipo: "subtotal"` (ex.: "TOTAL DO ATIVO") é o que vira o KPI "Ativo Total" no topo
  do relatório do cliente.
- Por isso: **o grupo tem que ser igual à soma dos próprios filhos**, e o subtotal igual à
  soma dos grupos. Se não fechar, o KPI e a tabela mostram números diferentes na mesma tela.

## Como o relatório desenha o que você gera

O layout do site reproduz o documento do escritório. Saber as regras evita gerar algo que
sai torto na tela.

**O passivo e o PL aparecem juntos, numa coluna só.** No arquivo eles continuam separados —
`passivo` e `patrimonio_liquido` — porque o sistema precisa dos dois apartados para calcular
liquidez e endividamento. É a tela que junta: o PL entra como terceiro grupo e o
"TOTAL DO PASSIVO" exibido soma passivo + PL. Você não precisa fazer nada além de preencher
os dois campos corretamente, cada um com seu `subtotal`.

**As datas das colunas saem do último dia do período.** `"competencia": "12/2025"` vira
`31/12/2025` no cabeçalho. Em `competencia_anterior`, escreva já por extenso: `"31/12/2024"`.

**Linhas que começam com "Saldo", "Mutações" ou "Total" ganham fundo azul e negrito**, como
no Word. Vale na DMPL e nas tabelas das notas — então nomeie a linha de fechamento de cada
tabela como `"Total"` para ela ser grifada.

**Zero vira traço.** Não precisa escrever `"-"`: mande `0` e a tela resolve.

**Negativo aparece entre parênteses, em preto.** Mande o número negativo e pronto.

**Nas tabelas das notas, a primeira coluna não tem rótulo na tela.** Pode manter
`"Descrição"` em `colunas` — o site omite.

**O texto da nota vem antes da tabela**, e parágrafos curtos iniciados por numeração
(`3.1. Caixa e equivalentes`) ou títulos sem ponto final (`Moeda funcional e de apresentação`)
viram subtítulos azuis. Para isso funcionar, separe os parágrafos com **linha em branco**
(`\n\n`) dentro do campo `conteudo`.

## Os quatro KPIs do topo

| Campo | O que colocar |
|---|---|
| `faturamento` | Receita bruta de vendas e serviços do período |
| `lucro` | Resultado do período — positivo se lucro, negativo se prejuízo |
| `impostos` | **Total** de tributos do período: ICMS, ICMS ST, PIS, COFINS, ISS, IPI, IRPJ, CSLL — o que houver. Valor absoluto |
| `folha` | Salários, encargos, INSS, FGTS, pró-labore e benefícios. Valor absoluto |

Se você somar só parte dos tributos (por exemplo, deixar as despesas tributárias de fora),
**diga isso ao usuário** na entrega — o KPI aparece no relatório do cliente sem nenhuma
explicação do critério.

## Linha (`LineItem`)

| Campo | Tipo | Para que serve |
|---|---|---|
| `item` | texto | Nome da linha (obrigatório) |
| `valor` | número | Valor em R$ mil (obrigatório) |
| `valor_ant` | número | Mesmo item no exercício anterior — habilita a coluna comparativa |
| `nota` | texto | Número da nota explicativa ligada à linha, ex: `"4"` |
| `tipo` | texto | `receita` · `custo` · `despesa` · `resultado` · `subtotal` · `grupo` |
| `indent` | bool | `true` recua a linha visualmente (sub-item de um grupo) |

## As seis demonstrações do relatório completo

O relatório completo tem seis peças. O painel já sabe desenhar todas — o que faltar
simplesmente não aparece.

| # | Peça | Campo | Precisa do exercício anterior? |
|---|---|---|---|
| 1 | Balanço Patrimonial | `balanco_patrimonial` | não (mas a coluna comparativa sim) |
| 2 | Demonstração do Resultado | `dre` | não |
| 3 | Resultado Abrangente (DRA) | `dra` | não |
| 4 | Mutações do PL (DMPL) | `dmpl` | **sim** |
| 5 | Fluxos de Caixa (DFC) | `dfc` | **sim** |
| 6 | Notas Explicativas | `notas_explicativas` | não |

**DMPL e DFC não se inventam a partir de um exercício só.** O fluxo de caixa indireto nasce
da variação de cada conta entre um balanço e outro; a DMPL mostra as movimentações do
período. Sem o balancete do exercício anterior, gere as outras quatro peças e **diga ao
usuário** que essas duas ficaram de fora e por quê.

### 3. Resultado Abrangente — `dra`

Mesmo formato do `dre`. Quando não há outros resultados abrangentes (o caso mais comum na
PME), são três linhas:

```json
"dra": [
  { "item": "Lucro líquido do exercício", "valor": -973, "valor_ant": 600, "tipo": "resultado" },
  { "item": "Outros resultados abrangentes", "valor": 0, "valor_ant": 0 },
  { "item": "Resultado abrangente do exercício", "valor": -973, "valor_ant": 600, "tipo": "subtotal" }
]
```

### 4. Mutações do Patrimônio Líquido — `dmpl`

Uma coluna por grupo do PL, mais a coluna TOTAL. Cada linha traz os valores **na ordem das
colunas**, e a última posição é o total da linha:

```json
"dmpl": {
  "colunas": ["Capital Social", "Lucros / (Prejuízos) Acumulados", "Reservas de Incentivos Fiscais", "TOTAL"],
  "linhas": [
    { "descricao": "Saldo em 01/01/2025", "valores": [200, 2074, 3783, 6057] },
    { "descricao": "Dividendos pagos ou creditados", "valores": [0, -69, 0, -69] },
    { "descricao": "Resultado do período", "valores": [0, -973, 0, -973] },
    { "descricao": "Saldo em 31/12/2025", "valores": [200, 1033, 3783, 5016] }
  ]
}
```

O saldo final tem que bater com o TOTAL DO PATRIMÔNIO LÍQUIDO do balanço.

### 5. Fluxos de Caixa — `dfc` (método indireto)

```json
"dfc": {
  "operacional": [
    { "item": "Lucro líquido", "valor": -973, "valor_ant": 600 },
    { "item": "Depreciações / Amortizações", "valor": 593, "valor_ant": 550 },
    { "item": "Contas a receber", "valor": 181, "valor_ant": 1370 },
    { "item": "Estoques", "valor": -282, "valor_ant": 225 },
    { "item": "Fornecedores", "valor": 426, "valor_ant": -481 }
  ],
  "investimento": [{ "item": "Aquisição de imobilizado", "valor": -19, "valor_ant": -279 }],
  "financiamento": [
    { "item": "Dividendos pagos", "valor": -69, "valor_ant": -894 },
    { "item": "Empréstimos e financiamentos", "valor": 168, "valor_ant": -386 }
  ],
  "variacao_caixa": -269, "variacao_caixa_ant": 196,
  "caixa_inicio": 588, "caixa_inicio_ant": 392,
  "caixa_fim": 319, "caixa_fim_ant": 588
}
```

Regras: ativo que **aumenta** consome caixa (sinal negativo); passivo que **aumenta** gera
caixa (positivo). E a conferência final é obrigatória:
`caixa_inicio + variacao_caixa = caixa_fim`, e o `caixa_fim` tem que ser igual a
"Caixa e Equivalentes" do balanço atual.

### 6. Notas com tabela

No modelo completo, quase toda nota patrimonial traz a composição em tabela — é o que dá
utilidade à nota. Formato:

```json
{
  "numero": "4",
  "titulo": "Caixa e Equivalentes de Caixa",
  "conteudo": "Composto por saldos bancários de livre movimentação e aplicações de liquidez imediata.",
  "tabelas": [{
    "colunas": ["Descrição", "31/12/2025", "31/12/2024"],
    "linhas": [
      { "descricao": "Caixa", "valores": [12, 15] },
      { "descricao": "Bancos conta movimento", "valores": [307, 573] },
      { "descricao": "Total", "valores": [319, 588] }
    ]
  }]
}
```

O total da tabela da nota tem que bater com a linha correspondente do balanço — é para isso
que serve o campo `nota` na linha (`"nota": "4"` liga a linha do balanço a esta nota).

## Campos extras — preencha quando o arquivo tiver

Só inclua o que existir de verdade no documento. Gráfico com número inventado é pior que
gráfico ausente.

| Campo | Formato | Vira o quê no relatório |
|---|---|---|
| `competencia_anterior` | `"31/12/2024"` | Cabeçalho da coluna comparativa |
| `kpis.obrigacoes_total` / `kpis.obrigacoes_entregues` | número | Painel de obrigações entregues |
| `evolucao_faturamento` | `[{ "mes": "jan", "valor": 0 }]` | Gráfico de faturamento mês a mês |
| `evolucao_impostos` | `[{ "mes": "jan", "valor": 0 }]` | Gráfico de impostos |
| `carga_tributaria` | `[{ "nome": "ICMS", "valor": 0 }]` | Composição da carga tributária |
| `fluxo_caixa` | `[{ "mes": "jan", "entrada": 0, "saida": 0 }]` | Gráfico de entradas × saídas |
| `dfc` | `{ "operacional": [], "investimento": [], "financiamento": [], "caixa_inicio": 0, "caixa_fim": 0 }` | Demonstração do Fluxo de Caixa |
| `dmpl` | `{ "colunas": [], "linhas": [{ "descricao": "", "valores": [] }] }` | Mutações do Patrimônio Líquido |
| `notas_explicativas` | `[{ "numero": "1", "titulo": "", "conteudo": "" }]` | Notas ao pé do relatório |
| `observacoes` | texto | Observação livre no rodapé |

## Sobre `analise` e `notas_explicativas`

**`analise`** — não preencha. O painel gera ao receber o arquivo e o contador ajusta o texto
na tela antes de publicar.

**`notas_explicativas`** — depende do modelo:

- **Completo**: gere as notas, com tabela onde couber. Elas são metade do relatório. O painel
  também sabe gerar notas sozinho, mas as dele saem genéricas e sem tabela: você está lendo o
  balancete inteiro e consegue abrir a composição de cada conta, o painel não.
- **Trimestral**: deixe `[]`.

Se o próprio documento já traz notas escritas, **transcreva, não resuma** — são as notas que o
escritório redigiu, e o texto delas tem peso técnico.

As notas que você gerar são um ponto de partida para o contador, nunca a palavra final: ele
revisa e completa na tela antes de publicar. Diga isso na entrega.
