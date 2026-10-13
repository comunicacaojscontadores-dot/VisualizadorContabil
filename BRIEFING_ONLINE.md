# Briefing — Versão Online do Resumo de Diários Oficiais

## O que é este projeto

Sistema que coleta diariamente atos fiscais, tributários e trabalhistas dos diários oficiais brasileiros, filtra com IA e entrega um resumo para os diretores do escritório contábil JS Contadores.

**Versão local (branch `main`):** já funciona — roda no Windows via Agendador de Tarefas (10h e 12h, seg-sex), gera Excel em pasta de rede.

**Versão online (branch `online-version`):** objetivo desta sessão — tornar o resumo acessível via web, com histórico, sem depender do PC local estar ligado.

---

## Diretório do projeto

```
C:\Users\01-comunicação\Documents\Programas em Desenvolvimento\visualizadorcontbil-main\
└── agente-diarios\
    ├── coletar_dou.py          — coleta DOU federal
    ├── coletar_doe_rj.py       — coleta DOE-RJ (só Parte I hoje)
    ├── coletar_doe_es.py       — coleta DOE-ES
    ├── coletar_doe_mg.py       — coleta DOE-MG (Jornal Minas Gerais)
    ├── coletar_doe_sp.py       — coleta DOE-SP
    ├── combinar_jsons.py       — une os JSONs de cada fonte
    ├── filtrar_enriquecer.py   — filtra e resume com Claude
    ├── gerar_excel.py          — gera Excel com abas por UF + Clientes JS
    ├── verificar_execucao.py   — verifica execução e envia notificação Windows
    ├── rodar_agente.bat        — script do Agendador de Tarefas
    ├── clientes.json           — ~767 clientes da JS Contadores
    └── logs\agente.log         — log de cada execução
```

---

## Arquitetura atual (local)

```
Agendador Windows (10h e 12h, seg-sex)
    └── rodar_agente.bat
        ├── coletar_*.py  →  dados_*.json (por fonte)
        ├── combinar_jsons.py  →  dados_combinados.json
        ├── filtrar_enriquecer.py  →  registros_filtrados.json
        ├── gerar_excel.py  →  Z:\...\Resumo_Diarios_AAAA-MM-DD.xlsx
        ├── upload Supabase  ←── JÁ EXISTE
        └── verificar_execucao.py  →  notificação Windows
```

---

## Banco de dados — Supabase (já configurado)

O upload para o Supabase **já acontece** em cada execução local. A tabela `diarios_oficiais` já recebe os registros com os campos:

| Campo | Descrição |
|---|---|
| `data_publicacao` | Data do ato (AAAA-MM-DD) |
| `aba` | Fonte: DOU, DOERJ, DOE-ES, DOE-MG, DOE-SP |
| `numero_ato` | Ex: "Portaria SRE nº 32/2026" |
| `resumo` | Resumo em português gerado pelo Claude |
| `orgao` | Ex: "SEFAZ-SP", "RFB" |
| `tributo_materia` | ICMS, ISS, IRPJ, etc. |
| `prazo` | Prazo de cumprimento se houver |
| `ato_alterado` | Ato que foi alterado, se houver |
| `numero_doc` | ID interno do documento |
| `link` | URL do ato no diário |
| `empresa_cliente` | Nome do cliente JS Contadores se citado |

Credenciais em `.env` na pasta `agente-diarios\`.

---

## O que construir na versão online

### Objetivo
Painel web acessível pelos diretores do escritório mostrando:
- Resumo do dia atual
- Histórico por data
- Filtro por estado/tributo
- Destaque quando um cliente JS Contadores foi citado

### Arquitetura proposta (híbrida — manter coleta local)

```
Máquina local (mantém como está)      Web (a construir)
────────────────────────────────       ──────────────────────
10h → coleta → Claude → Excel          Supabase (já recebe dados)
12h → recoleta tardios          ──→    Frontend web (Cloudflare Pages ou similar)
16h → edições extras (adicionar)       Consulta por data / estado / cliente
```

**Não mover a coleta para a nuvem** — o Claude na nuvem exigiria API key paga separada. A coleta local usa o claude.exe CLI (sessão do Claude Code Desktop) que funciona com o plano de assinatura.

### Decisões técnicas a tomar na nova sessão
1. Qual framework para o frontend (Next.js? Astro? HTML simples com Supabase JS?)
2. Autenticação no painel (só para o escritório — login simples ou link secreto?)
3. Adicionar execução das 16h no Agendador de Tarefas
4. Ampliar DOE-RJ para capturar Parte II (administração indireta — CODIN, FAPERJ, etc.)

---

## Pontos de atenção

### Claude — autenticação
- **Não tem API key** — usa plano de assinatura Claude
- O `filtrar_enriquecer.py` chama o `claude.exe` como subprocess:
  ```
  C:\Users\01-comunicação\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe
  ```
- Isso só funciona na máquina local com Claude Code Desktop aberto e logado
- Modelo obrigatório: `claude-opus-4-8`

### DOE-RJ — cobertura incompleta
- Hoje só coleta Parte I (Poder Executivo direto)
- Parte II (administração indireta: CODIN, FAPERJ, DETRAN-RJ, etc.) não é capturada
- Portaria CODIN nº 102/2026 foi perdida por isso
- Correção pendente: ampliar `coletar_doe_rj.py` para baixar Parte II também

### Leis estaduais
- DOE-MG e DOE-RJ tinham filtro duplo que descartava leis sem keyword fiscal no texto cru do PDF
- Corrigido em 01/07/2026: blocos "LEI Nº" passam direto para o Claude agora

### Clientes JS
- A aba Clientes JS mostra TODOS os ~767 clientes
- Os citados nos diários aparecem no TOPO (linha verde)
- Os não citados aparecem abaixo em cinza: "Nada a informar nos diários de hoje."

---

## Branch de trabalho

- `main` — versão local estável (não mexer)
- `online-version` — esta branch, para desenvolver a versão web

---

## Contato / contexto do usuário
- Escritório: JS Contadores
- Email: adm.welliton@jscontadores.com.br
- Objetivo do painel: diretores visualizarem o resumo diário sem abrir Excel
- Tom: informal, prático
