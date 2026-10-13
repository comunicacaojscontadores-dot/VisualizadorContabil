import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { nanoid } from "nanoid";
import { extractWithAI, AI_MODEL_RAPIDO } from "./ai-gateway.server";
import type { DemoData } from "./demo-types";
import { createClient } from "@supabase/supabase-js";

const EXTRACTION_PROMPT = `Extraia dados do demonstrativo contábil abaixo e retorne SOMENTE JSON válido, sem texto adicional.
Valores são números puros sem R$ ou pontos de milhar. Negativos com sinal negativo.
"valor"=exercício atual, "valor_ant"=exercício anterior.

{"empresa":{"nome":"...","cnpj":"..."},"competencia":"MM/AAAA","kpis":{"faturamento":0,"lucro":0,"impostos":0,"folha":0},"balanco_patrimonial":{"ativo":[{"item":"...","valor":0,"valor_ant":0}],"passivo":[{"item":"...","valor":0,"valor_ant":0}],"patrimonio_liquido":[{"item":"...","valor":0,"valor_ant":0}]},"dre":[{"item":"...","valor":0,"valor_ant":0,"tipo":"receita"}],"notas_explicativas":[]}`;

const BALANCETE_PROMPT = `Você é um contador sênior brasileiro especialista em análise de balancetes e demonstrações contábeis.

Receberá dados brutos de um BALANCETE — pode ser exportado de qualquer sistema (PC Sistemas, Domínio, Alterdata, Sage, Questor, etc.) em formato PDF, Excel ou texto.

REGRAS CRÍTICAS — leia com atenção antes de qualquer extração:

1. RECEITA vs CMV (ERRO COMUM A EVITAR):
   - RECEITA DE VENDAS = grupo "CONTAS DE RECEITAS", "RECEITA LÍQUIDA", "VENDAS DE MERCADORIAS/SERVIÇOS", contas crédoras de resultado. Saldo é CREDOR (C).
   - CMV/COMPRAS = grupo "ENTRADAS E CUSTOS", "COMPRAS P/ COMERCIALIZAÇÃO", "CUSTO DAS MERCADORIAS VENDIDAS". Saldo é DEVEDOR (D).
   - NUNCA use "ENTRADAS E CUSTOS" como faturamento. ENTRADAS E CUSTOS = CMV.

2. RESULTADO DO PERÍODO (LUCRO/PREJUÍZO):
   - O lucro líquido do período está no RESUMO DO BALANCETE (última seção, linhas "Resultado do Período" ou "Contas de Receitas e Ingressos" - "Entradas e Custos" - "Contas de Despesas").
   - A conta "Lucros/Prejuízos Acumulados" (ex: conta 24500) é saldo ACUMULADO de períodos anteriores — NÃO é o resultado do período atual.
   - Se houver "RESULTADO DO PERÍODO: X C" no RESUMO, esse é o LUCRO. Se for "D", é PREJUÍZO.

3. BALANÇO PATRIMONIAL:
   - Use saldo final das contas patrimoniais (ativo = contas D, passivo = contas C).
   - "Lucros/Prejuízos Acumulados" no PL = saldo acumulado (pode ser negativo se for prejuízo acumulado).

4. FORMATO DE VALORES:
   - Se valores em reais inteiros (ex: 166.088.725,03), divida por 1000 → 166.089.
   - Se já em milhares, use diretamente.
   - Valores D (devedores) no DRE = negativos (custo/despesa).
   - Valores C (credores) no DRE = positivos (receita).

5. SINAIS NO BALANÇO (ERRO GRAVE JÁ COMETIDO):
   - Contas do ATIVO são POSITIVAS. Não existe "Estoques -84" nem "Caixa -249".
   - Contas do PASSIVO e do PL são POSITIVAS.
   - A única linha que pode ser negativa no balanço é prejuízo acumulado ou resultado
     negativo do período, dentro do Patrimônio Líquido.
   - Use o SALDO ATUAL (última coluna), nunca o saldo anterior nem as colunas de
     movimento (débito/crédito do período).

6. NÃO INVENTE A EMPRESA:
   - Só preencha "nome" se for a razão social do TITULAR do balancete, normalmente no
     cabeçalho. Nomes que aparecem em contas ("ARREND. MERC. - FULANO LTDA",
     "EMPRÉSTIMO BANCO X") são terceiros, NÃO são a empresa. Na dúvida, use null.
   - Sem CNPJ no documento → null. Nunca invente.

ESTRUTURA DO BALANÇO — cada seção é uma hierarquia de 3 níveis:

  1. linha de GRUPO   → "tipo":"grupo"     — total da seção (ex.: "Ativo Circulante")
  2. linhas de DETALHE → "indent":true     — a composição desse grupo
  3. linha de TOTAL   → "tipo":"subtotal"  — ex.: "TOTAL DO ATIVO"

Isso não é enfeite: o relatório usa a linha de grupo para calcular os índices de liquidez
e a linha de subtotal para o KPI "Ativo Total". Portanto:
  - o valor do GRUPO tem que ser igual à soma das linhas de detalhe dele;
  - o SUBTOTAL tem que ser igual à soma dos grupos.
Se sobrar diferença, crie uma linha de detalhe "Outros ..." para absorvê-la.

Ativo Circulante: Caixa e Equivalentes, Clientes / Contas a Receber, Estoques, Outros Ativos Circulantes
Ativo Não Circulante: Realizável a Longo Prazo, Imobilizado, Intangível
Passivo Circulante: Fornecedores, Obrigações Fiscais, Obrigações Trabalhistas e Sociais, Empréstimos e Financiamentos CP, Outras Contas a Pagar
Passivo Não Circulante: Empréstimos e Financiamentos LP, Provisões
Patrimônio Líquido: Capital Social, Reservas, Lucros/Prejuízos Acumulados, Resultado do Período

CONFERÊNCIA OBRIGATÓRIA antes de responder:
  - TOTAL DO ATIVO = TOTAL DO PASSIVO + TOTAL DO PATRIMÔNIO LÍQUIDO.
    Num balancete de verificação o resultado do período ainda não foi encerrado: se o
    passivo ficar maior que o ativo, a diferença é PREJUÍZO do período; se menor, LUCRO.
    Inclua esse resultado no Patrimônio Líquido para o balanço fechar.
  - Faturamento e CMV não podem ser iguais nem parecidos por acaso — se ficaram, você
    somou o mesmo grupo duas vezes.
  - Refaça a conta Receita − CMV − Despesas e compare com o resultado que você declarou.

ESTRUTURA DA DRE:
- Receita bruta de vendas (tipo: receita) — grupo CONTAS DE RECEITAS
- Deduções (devoluções + impostos sobre vendas) (tipo: custo, negativo)
- Receita líquida (tipo: receita)
- CMV / Custo das mercadorias (tipo: custo, negativo) — grupo ENTRADAS E CUSTOS
- Lucro bruto (tipo: resultado)
- Despesas com vendas (tipo: despesa, negativo)
- Despesas gerais e administrativas (tipo: despesa, negativo)
- Outras despesas/receitas operacionais (tipo: resultado)
- Resultado operacional (tipo: resultado)
- Receitas financeiras (tipo: resultado, positivo)
- Despesas financeiras (tipo: resultado, negativo)
- IRPJ (tipo: resultado, negativo)
- CSLL (tipo: resultado, negativo)
- Resultado líquido do período (tipo: resultado) — use o RESUMO DO BALANCETE

KPIS:
- faturamento: receita bruta de vendas (grupo RECEITAS, saldo C), valor absoluto em R$ mil
- lucro: resultado líquido do período do RESUMO (positivo = lucro, negativo = prejuízo), em R$ mil
- impostos: total de tributos do período — ICMS, ICMS ST, PIS, COFINS, ISS, IPI, IRPJ e CSLL, o que houver. Valor absoluto em R$ mil
- folha: despesas com pessoal/salários/encargos/FGTS, valor absoluto em R$ mil

CABEÇALHO:
- nome empresa: razão social
- CNPJ: formato XX.XXX.XXX/XXXX-XX
- competência "MM/AAAA": mês e ano do PERÍODO DO BALANCETE (ex: balancete de 01/01/2024 a 31/12/2024 → "12/2024"). NÃO use a data de impressão, processamento ou geração do relatório.

Notas explicativas: retorne array VAZIO [].

Responda SOMENTE com JSON válido sem markdown:
{
  "empresa": { "nome": string, "cnpj": string },
  "competencia": string,
  "kpis": { "faturamento": number, "impostos": number, "folha": number, "lucro": number },
  "balanco_patrimonial": {
    "ativo": [
      {"item": "Ativo Circulante", "valor": 0, "tipo": "grupo"},
      {"item": "Caixa e Equivalentes", "valor": 0, "indent": true},
      {"item": "Ativo Não Circulante", "valor": 0, "tipo": "grupo"},
      {"item": "Imobilizado", "valor": 0, "indent": true},
      {"item": "TOTAL DO ATIVO", "valor": 0, "tipo": "subtotal"}
    ],
    "passivo": [
      {"item": "Passivo Circulante", "valor": 0, "tipo": "grupo"},
      {"item": "Fornecedores", "valor": 0, "indent": true},
      {"item": "Passivo Não Circulante", "valor": 0, "tipo": "grupo"},
      {"item": "TOTAL DO PASSIVO", "valor": 0, "tipo": "subtotal"}
    ],
    "patrimonio_liquido": [
      {"item": "Capital Social", "valor": 0},
      {"item": "Resultado do Período", "valor": 0},
      {"item": "TOTAL DO PATRIMÔNIO LÍQUIDO", "valor": 0, "tipo": "subtotal"}
    ]
  },
  "dre": [{"item": string, "valor": number, "tipo": "receita"|"custo"|"despesa"|"resultado"}],
  "notas_explicativas": [],
  "observacoes": null
}`;

export const listDemonstrativos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("demonstrativos")
      .select("*, clientes(razao_social, nome_fantasia, logo_url)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getDemonstrativo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("demonstrativos")
      .select("*, clientes(*)")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("demonstrativos").select("status");
    const rows = data ?? [];
    return {
      total: rows.length,
      processando: rows.filter((r) => r.status === "processando").length,
      rascunho: rows.filter((r) => r.status === "rascunho").length,
      pendente: rows.filter((r) => r.status === "pendente").length,
      publicado: rows.filter((r) => r.status === "publicado").length,
      erro: rows.filter((r) => r.status === "erro").length,
    };
  });

const UploadInput = z.object({
  cliente_id: z.string().uuid().nullable().optional(),
  competencia: z.string().max(40).optional(),
  arquivo_nome: z.string().max(200),
  arquivo_tipo: z.enum(["docx", "pdf", "xlsx", "json"]).default("docx"),
  texto_extraido: z.string().min(1).max(60_000), // frontend já entrega texto pré-filtrado (~55k)
});

export const uploadDemonstrativo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadInput.parse(d))
  .handler(async ({ data, context }) => {
    const slug = nanoid(10);
    const { data: created, error: insErr } = await context.supabase
      .from("demonstrativos")
      .insert({
        owner_id: context.userId,
        cliente_id: data.cliente_id ?? null,
        slug,
        status: "processando",
        competencia: data.competencia ?? null,
        arquivo_nome: data.arquivo_nome,
        dados: {},
      })
      .select()
      .single();
    if (insErr || !created) throw new Error(insErr?.message ?? "Falha ao criar demonstrativo");

    try {
      const text = data.texto_extraido;

      // ── Modo JSON: dados pré-gerados pelo Claude (sem extração por IA) ──────────
      if (data.arquivo_tipo === "json") {
        let dados: DemoData = {};
        let extractionOk = false;
        try {
          dados = JSON.parse(text) as DemoData;
          extractionOk = true;
          console.log("[uploadDemonstrativo] JSON direto OK — kpis:", JSON.stringify(dados.kpis));
        } catch (e) {
          console.error("[uploadDemonstrativo] JSON inválido:", e);
          dados = { observacoes: "JSON inválido. Verifique o formato gerado pelo Claude." };
        }

        if (extractionOk) {
          const resumo = JSON.stringify(dados, null, 0).slice(0, 5_000);
          try {
            const analiseRaw = await extractWithAI(ANALISE_PROMPT, resumo, AI_MODEL_RAPIDO);
            const analiseStripped = analiseRaw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
            const as = analiseStripped.indexOf("{"); const ae = analiseStripped.lastIndexOf("}");
            if (as !== -1 && ae !== -1) dados.analise = JSON.parse(analiseStripped.slice(as, ae + 1));
          } catch (e) { console.warn("[uploadDemonstrativo] análise falhou:", e); }

          if (!dados.notas_explicativas?.length) {
            try {
              const notasRaw = await extractWithAI(NOTAS_PROMPT, resumo, AI_MODEL_RAPIDO);
              const notasStripped = notasRaw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
              const ns = notasStripped.indexOf("["); const ne = notasStripped.lastIndexOf("]");
              if (ns !== -1 && ne !== -1) dados.notas_explicativas = JSON.parse(notasStripped.slice(ns, ne + 1));
            } catch (e) { console.warn("[uploadDemonstrativo] notas falhou:", e); }
          }
        }

        const { error: upErr } = await context.supabase
          .from("demonstrativos")
          .update({ status: "rascunho", dados, competencia: data.competencia ?? dados.competencia ?? null })
          .eq("id", created.id);
        if (upErr) throw new Error(upErr.message);
        return { id: created.id, slug };
      }
      // ─────────────────────────────────────────────────────────────────────────────

      const prompt = (data.arquivo_tipo === "pdf" || data.arquivo_tipo === "xlsx") ? BALANCETE_PROMPT : EXTRACTION_PROMPT;
      console.log("[uploadDemonstrativo] start", created.id, data.arquivo_nome, "text length:", text.length);

      // Limpa o texto: remove sumário (linhas com pontinhos), espaços excessivos
      const cleanedText = text
        .split("\n")
        .filter(line => !(/\.{5,}/.test(line)))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      // A conta da Groq tem teto de 8.000 tokens por MINUTO (input + output somados).
      // Com o prompt (~1.500) e a resposta (~3.000), sobram ~3.500 tokens de documento —
      // cerca de 8.000 caracteres de balancete, que é denso em números.
      //
      // Acima disso não há recorte honesto possível: a versão anterior mandava 18 mil
      // caracteres em pedaços soltos, sem o passivo nem as despesas, e o modelo
      // preenchia o resto inventando. Melhor recusar e mandar usar a skill.
      const LIMITE_EXTRACAO_CHARS = 8_000;

      if (cleanedText.length > LIMITE_EXTRACAO_CHARS) {
        console.warn("[uploadDemonstrativo] documento grande demais:", cleanedText.length, "chars");
        const { error: upErr } = await context.supabase
          .from("demonstrativos")
          .update({
            status: "rascunho",
            dados: {
              observacoes:
                `Este arquivo tem ${cleanedText.length.toLocaleString("pt-BR")} caracteres — ` +
                `grande demais para a leitura automática, que hoje comporta cerca de ` +
                `${LIMITE_EXTRACAO_CHARS.toLocaleString("pt-BR")}.\n\n` +
                `Nenhum número foi extraído: preencher com uma leitura parcial produziria ` +
                `valores inventados.\n\n` +
                `Use a skill ContabilConnect no Claude para gerar o arquivo .json a partir ` +
                `deste mesmo balancete e suba o .json aqui — os números entram exatamente ` +
                `como foram lidos, sem limite de tamanho.`,
            } satisfies DemoData,
          })
          .eq("id", created.id);
        if (upErr) throw new Error(upErr.message);
        return { id: created.id, slug };
      }

      const buildFinancialText = (src: string): string => src;

      const financialText = buildFinancialText(cleanedText);
      console.log("[uploadDemonstrativo] financial text length", financialText.length);

      const aiTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Tempo limite da IA excedido (90s). Tente um documento menor.")), 90_000)
      );
      const aiRaw = await Promise.race([
        extractWithAI(prompt, financialText),
        aiTimeout,
      ]);
      const jsonText = typeof aiRaw === "string" ? aiRaw : JSON.stringify(aiRaw);
      console.log("[uploadDemonstrativo] ai response chars", jsonText.length);
      console.log("[uploadDemonstrativo] ai response preview", jsonText.slice(0, 200));

      // Extrair JSON da resposta (remove markdown fences e texto extra)
      let dados: DemoData = {};
      let extractionOk = false;
      try {
        // Remove blocos ```json ... ``` ou ``` ... ```
        const stripped = jsonText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
        const start = stripped.indexOf("{");
        const end = stripped.lastIndexOf("}");
        if (start === -1 || end === -1) throw new Error("no json brackets found");
        let jsonSlice = stripped.slice(start, end + 1);

        // Sanitiza números com formatação brasileira que invalidam o JSON
        // Ex: 166.088.725,03 → 166088725.03 | 166.088.725.03 → 166088725.03
        jsonSlice = jsonSlice.replace(
          /:\s*(-?\d{1,3}(?:\.\d{3})+)([,.](\d+))?(?=\s*[,\}\]])/g,
          (_m, intPart, _sep, dec) => {
            const cleaned = intPart.replace(/\./g, "");
            return `: ${dec ? `${cleaned}.${dec}` : cleaned}`;
          }
        );
        // Converte vírgula decimal remanescente em contexto numérico
        jsonSlice = jsonSlice.replace(/:\s*(-?\d+),(\d+)(?=\s*[,\}\]])/g, ": $1.$2");

        dados = JSON.parse(jsonSlice);
        extractionOk = true;
        console.log("[uploadDemonstrativo] parse OK — kpis:", JSON.stringify(dados.kpis), "dre rows:", dados.dre?.length);

        // Escala: decidida UMA vez para o documento inteiro. Antes cada valor acima de
        // 10.000 era dividido por 1000 isoladamente, o que misturava escalas na mesma
        // tabela — Capital Social 25.562 virava 26 enquanto Obrigações Fiscais 4.214
        // ficava intacto, e o balanço deixava de fechar.
        const todosValores: number[] = [];
        const coletar = (arr: unknown[] | undefined) =>
          arr?.forEach((it: any) => {
            if (typeof it?.valor === "number") todosValores.push(Math.abs(it.valor));
            if (typeof it?.valor_ant === "number") todosValores.push(Math.abs(it.valor_ant));
          });
        coletar(dados.dre); coletar(dados.dra);
        coletar(dados.balanco_patrimonial?.ativo);
        coletar(dados.balanco_patrimonial?.passivo);
        coletar(dados.balanco_patrimonial?.patrimonio_liquido);
        for (const k of ["faturamento", "lucro", "impostos", "folha"] as const) {
          const v = dados.kpis?.[k];
          if (typeof v === "number") todosValores.push(Math.abs(v));
        }

        // Em R$ mil, 20.000.000 seria R$ 20 bilhões — não é a realidade da carteira.
        // Esse patamar só aparece quando a IA devolveu reais brutos.
        const maiorValor = todosValores.length ? Math.max(...todosValores) : 0;
        const emReaisBrutos = maiorValor > 20_000_000;
        const divisor = emReaisBrutos ? 1000 : 1;
        console.log("[uploadDemonstrativo] maior valor:", maiorValor, "| dividir por:", divisor);

        const normalizeVal = (v: unknown): number | unknown =>
          typeof v === "number" && divisor !== 1 ? Math.round(v / divisor) : v;

        const normalizeLines = (arr: unknown[] | undefined) =>
          arr?.map((it: any) => ({ ...it, valor: normalizeVal(it.valor), valor_ant: normalizeVal(it.valor_ant) }));

        // KPIs
        if (dados.kpis) {
          for (const k of ["faturamento", "lucro", "impostos", "folha"] as const) {
            dados.kpis[k] = normalizeVal(dados.kpis[k]) as number;
          }
        }
        // DRE / DRA
        dados.dre = normalizeLines(dados.dre) as typeof dados.dre;
        dados.dra = normalizeLines(dados.dra) as typeof dados.dra;
        // BP
        if (dados.balanco_patrimonial) {
          dados.balanco_patrimonial.ativo = normalizeLines(dados.balanco_patrimonial.ativo) as typeof dados.balanco_patrimonial.ativo;
          dados.balanco_patrimonial.passivo = normalizeLines(dados.balanco_patrimonial.passivo) as typeof dados.balanco_patrimonial.passivo;
          dados.balanco_patrimonial.patrimonio_liquido = normalizeLines(dados.balanco_patrimonial.patrimonio_liquido) as typeof dados.balanco_patrimonial.patrimonio_liquido;
        }
        // DFC
        if (dados.dfc) {
          dados.dfc.operacional = normalizeLines(dados.dfc.operacional) as typeof dados.dfc.operacional;
          dados.dfc.investimento = normalizeLines(dados.dfc.investimento) as typeof dados.dfc.investimento;
          dados.dfc.financiamento = normalizeLines(dados.dfc.financiamento) as typeof dados.dfc.financiamento;
          if (typeof dados.dfc.variacao_caixa === "number")
            dados.dfc.variacao_caixa = Math.round(dados.dfc.variacao_caixa / divisor);
          if (typeof dados.dfc.caixa_fim === "number")
            dados.dfc.caixa_fim = Math.round(dados.dfc.caixa_fim / divisor);
        }

        // Conferência: o contador precisa saber quando os números não fecham, em vez de
        // descobrir depois de publicar. O aviso aparece no campo Observações.
        const alertas: string[] = [];
        const bpx = dados.balanco_patrimonial;
        const totalDe = (rows?: { item?: string; valor?: number; tipo?: string }[]) => {
          if (!rows?.length) return null;
          const subs = rows.filter((r) => r.tipo === "subtotal" && typeof r.valor === "number");
          if (subs.length) return subs[subs.length - 1].valor as number;
          return rows.filter((r) => r.tipo !== "grupo").reduce((s, r) => s + (r.valor || 0), 0);
        };
        const tAtivo = totalDe(bpx?.ativo);
        const tPassivo = totalDe(bpx?.passivo);
        const tPl = totalDe(bpx?.patrimonio_liquido);
        if (tAtivo != null && tPassivo != null && tPl != null) {
          const dif = Math.round(tAtivo - (tPassivo + tPl));
          if (Math.abs(dif) > 1) {
            alertas.push(`O balanço não fecha: Ativo ${tAtivo} × Passivo + PL ${tPassivo + tPl} (diferença de ${dif}). Confira antes de publicar.`);
          }
        }
        const negativos = (bpx?.ativo ?? []).filter((r) => (r.valor ?? 0) < 0).map((r) => r.item);
        if (negativos.length) {
          alertas.push(`Contas do ativo com saldo negativo: ${negativos.join(", ")}. Provável inversão de sinal na leitura.`);
        }
        if (dados.kpis?.faturamento === 0 || dados.kpis?.faturamento == null) {
          alertas.push("Faturamento não identificado no arquivo.");
        }
        if (emReaisBrutos) {
          alertas.push("Os valores vieram em reais e foram convertidos para R$ mil. Confira a escala.");
        }
        if (alertas.length) {
          console.warn("[uploadDemonstrativo] alertas:", alertas);
          dados.observacoes = ["⚠ Conferir antes de publicar:", ...alertas.map((a) => `• ${a}`)].join("\n");
        }
      } catch (parseErr) {
        console.error("[uploadDemonstrativo] parse error", parseErr, "raw:", jsonText.slice(0, 800));
        dados = { observacoes: `Extração automática falhou. Resposta da IA: ${jsonText.slice(0, 300)}` };
      }

      // Gera análise + notas automaticamente se dados foram extraídos com sucesso
      if (extractionOk) {
        const resumo = JSON.stringify(dados, null, 0).slice(0, 5_000);

        // 1) Análise IA
        try {
          const analiseRaw = await extractWithAI(ANALISE_PROMPT, resumo, AI_MODEL_RAPIDO);
          const analiseStripped = analiseRaw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
          const as = analiseStripped.indexOf("{");
          const ae = analiseStripped.lastIndexOf("}");
          if (as !== -1 && ae !== -1) {
            dados.analise = JSON.parse(analiseStripped.slice(as, ae + 1));
            console.log("[uploadDemonstrativo] análise OK");
          }
        } catch (e) {
          console.warn("[uploadDemonstrativo] auto-análise falhou:", e);
        }

        // 2) Notas explicativas padrão
        try {
          const notasRaw = await extractWithAI(NOTAS_PROMPT, resumo, AI_MODEL_RAPIDO);
          const notasStripped = notasRaw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
          const ns = notasStripped.indexOf("[");
          const ne = notasStripped.lastIndexOf("]");
          if (ns !== -1 && ne !== -1) {
            dados.notas_explicativas = JSON.parse(notasStripped.slice(ns, ne + 1));
            console.log("[uploadDemonstrativo] notas OK, qty:", dados.notas_explicativas?.length);
          }
        } catch (e) {
          console.warn("[uploadDemonstrativo] notas falhou:", e);
        }
      }

      const { error: upErr } = await context.supabase
        .from("demonstrativos")
        .update({
          status: "rascunho",
          dados,
          competencia: data.competencia ?? dados.competencia ?? null,
        })
        .eq("id", created.id);
      if (upErr) throw new Error(upErr.message);

      return { id: created.id, slug };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro de processamento";
      console.error("[uploadDemonstrativo] error", msg, e);

      // Usa admin client para garantir que o update funciona mesmo com token expirado
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("demonstrativos")
          .update({ status: "erro", erro_mensagem: msg })
          .eq("id", created.id);
      } catch {
        await context.supabase
          .from("demonstrativos")
          .update({ status: "erro", erro_mensagem: msg })
          .eq("id", created.id);
      }
      throw new Error(msg);
    }
  });

export const updateDemoDados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      dados: z.record(z.unknown()),
      competencia: z.string().max(40).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("demonstrativos")
      .update({ dados: data.dados as never, competencia: data.competencia ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const publishDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Um demonstrativo sem número nenhum não pode ir para o cliente. Isso
    // acontece quando o arquivo é grande demais para a leitura automática: o
    // sistema recusa extrair, e o que sobra é um relatório vazio — ou, pior,
    // só com texto de IA escrito sobre nada.
    const { data: demo } = await context.supabase
      .from("demonstrativos")
      .select("dados")
      .eq("id", data.id)
      .single();

    const dados = (demo?.dados ?? {}) as DemoData;
    const temNumeros =
      !!dados.balanco_patrimonial?.ativo?.length ||
      !!dados.dre?.length ||
      Object.values(dados.kpis ?? {}).some((v) => typeof v === "number" && v !== 0);

    if (!temNumeros) {
      throw new Error(
        "Este demonstrativo não tem nenhum número extraído e não pode ser publicado. " +
        "Gere o arquivo .json pela skill ContabilConnect a partir do balancete e suba o .json.",
      );
    }

    const { error } = await context.supabase
      .from("demonstrativos")
      .update({ status: "publicado", published_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("demonstrativos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const NOTAS_PROMPT = `Você é um contador sênior brasileiro. Com base nos dados financeiros abaixo, redija notas explicativas padrão para o demonstrativo contábil.
Gere entre 5 e 7 notas relevantes para o porte e atividade da empresa.
Retorne SOMENTE um array JSON válido, sem markdown, sem texto fora do JSON.
Schema de cada nota:
{"numero": number, "titulo": string, "conteudo": string}

Notas obrigatórias (adapte ao contexto):
1. Contexto Operacional — descreva brevemente a atividade, porte e setor da empresa com base nos dados.
2. Base de Preparação e Principais Políticas Contábeis — mencione adoção das NBC TG/CPC, regime de competência, moeda funcional BRL.
3. Caixa e Equivalentes de Caixa — comente o saldo e composição (caixa em bancos, aplicações de curtíssimo prazo).
4. Resultado do Período — explique receita, custo, margens e lucro/prejuízo apurado.
5. Patrimônio Líquido — descreva capital social integralizado e reservas ou lucros/prejuízos acumulados.
6. Partes Relacionadas — inclua nota padrão: "Não foram identificadas transações relevantes com partes relacionadas no período." se não houver dados.
7. Eventos Subsequentes — inclua nota padrão: "Não há eventos subsequentes relevantes a divulgar após a data-base do balanço." se não houver dados.

Seja técnico e objetivo. Máximo 120 palavras por nota. Não invente dados — use apenas o que está nos dados fornecidos.

UNIDADE — os números que você recebe JÁ ESTÃO em R$ mil. Ao citar um valor, repita o número
exatamente como está e acrescente "mil". Nunca converta para milhões ou bilhões, nunca divida
nem multiplique.
- valor 1337511 → escreva "R$ 1.337.511 mil"   (nunca "R$ 1.337,511 milhões", nunca "R$ 1.337 bilhões")
- valor -951    → escreva "prejuízo de R$ 951 mil"  (nunca "R$ -0,951 mil")
- valor 2043    → escreva "R$ 2.043 mil"

Não classifique o porte da empresa (pequeno, médio, grande) nem afirme o ramo de atividade —
esses dados não estão no balancete.`;

const ANALISE_PROMPT = `Você é um contador analista sênior brasileiro. Analise os dados financeiros abaixo e gere comentários profissionais em português.
Retorne SOMENTE JSON válido com este schema exato (sem markdown, sem texto fora do JSON):
{
  "visao_geral": "2-3 frases resumindo o desempenho geral da empresa no período",
  "ativo": "análise do ativo: composição, liquidez dos ativos, pontos relevantes",
  "passivo": "análise do passivo e endividamento: estrutura de capital, obrigações",
  "dre": "análise do resultado: receita, margens, custos e despesas relevantes",
  "liquidez": "análise dos índices de liquidez e capacidade de pagamento",
  "pontos_atencao": "2-3 pontos que merecem atenção ou monitoramento",
  "perspectivas": "perspectivas e recomendações para o próximo período"
}
Seja técnico mas acessível. Máximo 150 palavras por campo.

UNIDADE — os números que você recebe JÁ ESTÃO em R$ mil. Ao citar um valor, repita o número
exatamente como está e acrescente "mil". Nunca converta para milhões ou bilhões, nunca divida
nem multiplique.
- valor 1337511 → escreva "R$ 1.337.511 mil"   (nunca "R$ 1.337,511 mil", nunca "R$ 1.337 bilhões")
- valor -951    → escreva "prejuízo de R$ 951 mil"  (nunca "R$ -0,951 mil")
- valor 2043    → escreva "R$ 2.043 mil"

Não classifique o porte da empresa (pequeno, médio, grande) — você não tem os dados para isso.
Só cite um índice ou percentual se conseguir calculá-lo com os números fornecidos.`;

export const gerarAnalise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: demo, error } = await context.supabase
      .from("demonstrativos")
      .select("dados, competencia")
      .eq("id", data.id)
      .single();
    if (error || !demo) throw new Error("Demonstrativo não encontrado");

    // Sem números, a IA escreve sobre o nada: sai "entidade de médio porte",
    // "atividades não especificadas" e outras frases que parecem análise e não
    // são. Pior que não ter análise.
    const dadosDemo = (demo.dados ?? {}) as DemoData;
    const temNumeros =
      !!dadosDemo.balanco_patrimonial?.ativo?.length ||
      !!dadosDemo.dre?.length ||
      Object.values(dadosDemo.kpis ?? {}).some((v) => typeof v === "number" && v !== 0);
    if (!temNumeros) {
      throw new Error(
        "Não há números neste demonstrativo para analisar. Suba o arquivo .json gerado " +
        "pela skill ContabilConnect antes de gerar a análise.",
      );
    }

    const resumo = JSON.stringify(demo.dados, null, 0).slice(0, 5_000);
    console.log("[gerarAnalise] dados chars:", resumo.length);

    const jsonText = await extractWithAI(ANALISE_PROMPT, resumo);
    console.log("[gerarAnalise] resposta:", jsonText.slice(0, 200));

    let analise: Record<string, string> = {};
    try {
      const stripped = jsonText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
      const start = stripped.indexOf("{");
      const end = stripped.lastIndexOf("}");
      if (start !== -1 && end !== -1) analise = JSON.parse(stripped.slice(start, end + 1));
    } catch { analise = { visao_geral: jsonText.slice(0, 500) }; }

    // Salvar análise vazia é pior que falhar: o botão parece ter funcionado e o
    // demonstrativo fica sem análise nenhuma, sem ninguém saber por quê.
    if (!Object.keys(analise).length) {
      console.error("[gerarAnalise] IA não retornou JSON utilizável:", jsonText.slice(0, 500));
      throw new Error("A IA não retornou uma análise válida. Tente novamente em alguns segundos.");
    }

    const dadosAtuais = demo.dados as DemoData;

    // As notas só eram geradas no upload. Se falhassem lá, nada na interface as
    // regenerava — este botão passa a cobrir os dois.
    let notas = dadosAtuais.notas_explicativas;
    if (!notas?.length) {
      try {
        const notasRaw = await extractWithAI(NOTAS_PROMPT, resumo, AI_MODEL_RAPIDO);
        const notasStripped = notasRaw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
        const ns = notasStripped.indexOf("[");
        const ne = notasStripped.lastIndexOf("]");
        if (ns !== -1 && ne !== -1) notas = JSON.parse(notasStripped.slice(ns, ne + 1));
        console.log("[gerarAnalise] notas geradas:", notas?.length ?? 0);
      } catch (e) {
        console.warn("[gerarAnalise] notas falharam:", e);
      }
    }

    const dadosAtualizado = { ...dadosAtuais, analise, notas_explicativas: notas ?? [] };
    const { error: upErr } = await context.supabase
      .from("demonstrativos")
      .update({ dados: dadosAtualizado })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    return { analise, notas_explicativas: notas ?? [] };
  });

export const updateAnalise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    analise: z.record(z.string()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: demo } = await context.supabase
      .from("demonstrativos").select("dados").eq("id", data.id).single();
    const dadosAtualizado = { ...(demo?.dados as object ?? {}), analise: data.analise };
    const { error } = await context.supabase
      .from("demonstrativos").update({ dados: dadosAtualizado }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Public read by slug — raw REST fetch, sem Supabase JS client
export const getPublicDemo = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const cfEnv = (globalThis as any).__CF_ENV__;
    const supabaseUrl = (process.env.SUPABASE_URL || cfEnv?.SUPABASE_URL || "").replace(/\/$/, "");
    // Remove BOM UTF-8 que o PowerShell adiciona ao salvar secrets via pipe
    const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || cfEnv?.SUPABASE_SERVICE_ROLE_KEY || "";
    const serviceKey = rawKey.replace(/^﻿/, "").trim();

    console.log("[getPublicDemo] url:", supabaseUrl ? "ok" : "MISSING", "serviceKey:", serviceKey ? "ok" : "MISSING", "slug:", data.slug);
    const readKey = serviceKey;
    if (!supabaseUrl || !readKey) return null;

    const select = "id,slug,status,competencia,dados,published_at,cliente_id,clientes(razao_social,nome_fantasia,cnpj,logo_url)";
    const apiUrl = `${supabaseUrl}/rest/v1/demonstrativos?slug=eq.${encodeURIComponent(data.slug)}&select=${select}`;

    const res = await fetch(apiUrl, {
      headers: {
        "apikey": readKey,
        "Authorization": `Bearer ${readKey}`,
        "Accept": "application/json",
      },
    });

    console.log("[getPublicDemo] HTTP:", res.status);
    if (!res.ok) { console.error("[getPublicDemo] erro:", await res.text()); return null; }

    const rows = await res.json() as any[];
    const row = rows?.[0];
    console.log("[getPublicDemo] rows:", rows.length, "status:", row?.status);
    if (!row || row.status !== "publicado") return null;
    return row;
  });
