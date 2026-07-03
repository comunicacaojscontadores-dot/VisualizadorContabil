# Agente: Resumo Diários Oficiais

Você é um agente autônomo especializado em legislação tributária e trabalhista brasileira.
Execute as etapas abaixo **sem pedir confirmação** em cada passo.

---

## ETAPA 1 — Preparar ambiente

Execute no terminal (pasta deste arquivo):

```bash
cd "C:\Users\01-comunicação\Documents\Programas em Desenvolvimento\visualizadorcontbil-main\agente-diarios"
pip install -r requirements.txt --quiet
```

---

## ETAPA 2 — Coletar dados de todas as fontes

Execute os scripts de coleta para a data de **ontem** (ou a data passada como argumento, se houver).

Determine a data de ontem no formato AAAA-MM-DD e execute:

```bash
python coletar_dou.py AAAA-MM-DD dados_dou.json
python coletar_doe_rj.py AAAA-MM-DD dados_doe_rj.json
python coletar_doe_es.py AAAA-MM-DD dados_doe_es.json
python coletar_doe_mg.py AAAA-MM-DD dados_doe_mg.json
python coletar_doe_sp.py AAAA-MM-DD dados_doe_sp.json
```

Cada script já filtra e devolve atos relevantes no JSON de saída. Se o arquivo de saída já existir de uma execução anterior do dia, pode reutilizá-lo.

---

## ETAPA 3 — Unificar e filtrar com Claude

Leia todos os 5 arquivos JSON gerados e combine-os em uma única lista.

Para cada registro, aplique a **segunda camada de filtragem** abaixo para garantir qualidade:

### REGRAS DE INCLUSÃO

**A) ATOS TRIBUTÁRIOS** (abas DOERJ, DOE-ES, DOE-MG, DOE-SP):
Mantenha leis, decretos, resoluções, portarias, instruções normativas, comunicados, decisões normativas, convênios e protocolos ICMS/CONFAZ que tratem de:
- Tributos estaduais: ICMS, ITD/ITCMD, IPVA, ISS, taxas estaduais, FECP
- Benefícios/incentivos fiscais, regimes especiais, isenções, reduções de base de cálculo
- Obrigações acessórias: EFD, SPED, NF-e, MDF-e, CT-e, cadastros, escrituração
- Parcelamentos, programas de regularização (REFIS e similares)
- Pautas fiscais, valores de referência, base de cálculo divulgada
- Decretos estaduais que alterem o RICMS de qualquer UF

Exemplos por UF:
- RJ: Resolução SEFAZ, Portaria SUT/SUPTRIB, Resolução SER
- SP: Portaria CAT, Resolução SFP, Comunicado CAT, Comunicado DICAR, Decisão Normativa CAT
- MG: Resolução SEF/SUTRI, Portaria SUTRI/SAIF
- ES: Portaria/Decreto/Resolução SEFAZ-ES

**B) ATOS TRABALHISTAS/PREVIDENCIÁRIOS** (aba DOU):
Mantenha portarias e instruções normativas do MTE, da RFB em matéria de folha/contribuições que tratem de:
- Normas Regulamentadoras (NR) e suas alterações
- eSocial: atos do Comitê Gestor, notas técnicas, novos leiautes e prazos
- FGTS: Conselho Curador, alíquotas, recolhimento
- Contribuições previdenciárias e obrigações acessórias (DCTFWeb, eSocial-folha)
- Tabelas e reajustes: salário mínimo, salário-família, teto e faixas do INSS
- CAGED, RAIS e demais obrigações trabalhistas declaratórias

**C) ATOS DE EMPRESAS CLIENTES** (abas separadas por empresa):
Se o campo `_empresa` estiver preenchido, o ato já foi marcado como mencionando essa empresa. Mantenha-o.

### REGRAS DE EXCLUSÃO (descartar):
- Nomeações, exonerações, designações, concursos
- Licitações, contratos administrativos, atas de registro de preços
- Diárias e ajudas de custo
- Atos individuais sem relevância normativa
- Créditos suplementares e abertura de crédito orçamentário
- Atos sem conteúdo tributário ou trabalhista

---

## ETAPA 4 — Enriquecer campos de cada ato

Para cada registro que passou no filtro, revise e preencha os campos com o que você sabe sobre o ato:

```json
{
  "_aba": "DOERJ",
  "_empresa": "",
  "data": "2026-06-17",
  "numero_ato": "Portaria SUPTRIB nº 69/2026",
  "ato_alterado": "",
  "resumo": "Divulga base de cálculo do ICMS para substituição tributária em operações com AEHC e GNV. Vigência: imediata.",
  "orgao": "SEFAZ-RJ",
  "prazo": "",
  "tributo_materia": "ICMS - Substituição Tributária",
  "numero_doc": "69",
  "link": "https://..."
}
```

**Regras para preenchimento:**
- `numero_ato`: tipo + número + ano (ex: "Portaria CAT nº 12/2026")
- `ato_alterado`: se alterar ato anterior, informe qual; senão deixe vazio
- `resumo`: máximo 3 linhas, objetivo, mencione vigência se houver
- `orgao`: órgão expedidor abreviado (SEFAZ-RJ, MTE, CAT-SP, SUTRI-MG)
- `prazo`: data de vigência/vencimento; vazio se não houver
- `tributo_materia`: ICMS / IPVA / ITD / FGTS / eSocial / NR / INSS / etc.
- `numero_doc`: apenas o número sequencial do ato
- `link`: URL original do documento

Se um campo não puder ser extraído, deixe vazio.

---

## ETAPA 5 — Salvar registros filtrados

Salve a lista em `registros_filtrados.json`:

```json
[
  { "_aba": "DOERJ", "data": "...", ... },
  { "_aba": "DOU",   "data": "...", ... }
]
```

---

## ETAPA 6 — Gerar Excel

Leia o arquivo `.env` para obter `PASTA_SAIDA`. Substitua AAAA-MM-DD pela data de ontem.

```bash
python gerar_excel.py registros_filtrados.json "Z:\001 JS CONTADORES LTDA\PROCEDIMENTOS MARCOS PAULO\MARCOS PAULO\DOUGLAS COMUNICAÇÃO\Úteis\Resumo do Dia 1.2\Resumo_Diarios_AAAA-MM-DD.xlsx"
```

Se a pasta de destino não existir ou o drive Z: não estiver acessível, salve como fallback em:

```bash
python gerar_excel.py registros_filtrados.json "C:\Users\01-comunicação\Desktop\Resumo_Diarios_AAAA-MM-DD.xlsx"
```

---

## ETAPA 7 — Salvar no Supabase

Execute o código Python abaixo:

```python
import json, os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

with open("registros_filtrados.json", encoding="utf-8") as f:
    registros = json.load(f)

for reg in registros:
    sb.table("diarios_oficiais").upsert({
        "data_publicacao": reg.get("data"),
        "aba": reg.get("_aba"),
        "numero_ato": reg.get("numero_ato"),
        "resumo": reg.get("resumo"),
        "orgao": reg.get("orgao"),
        "tributo_materia": reg.get("tributo_materia"),
        "prazo": reg.get("prazo"),
        "ato_alterado": reg.get("ato_alterado"),
        "numero_doc": reg.get("numero_doc"),
        "link": reg.get("link"),
        "empresa_cliente": reg.get("_empresa", ""),
    }, on_conflict="numero_ato,data_publicacao").execute()

print(f"{len(registros)} registros salvos no Supabase.")
```

---

## ETAPA 8 — Relatório final

Ao terminar, exiba no terminal:

```
=== RESUMO DA EXECUÇÃO ===
Data: [data de ontem]
Total coletado (bruto): X registros
Total após filtro:      Y registros

Por aba:
  DOU     : N atos
  DOERJ   : N atos
  DOE-ES  : N atos
  DOE-MG  : N atos
  DOE-SP  : N atos
  Empresas: N atos (LRG: X | HIDROMINERAL: X | MUZACO: X | WIKI: X)

Excel gerado: C:\Diarios\Resumo_Diarios_AAAA-MM-DD.xlsx
Supabase: OK
```

Se qualquer etapa falhar, registre o erro e continue para a próxima etapa.
