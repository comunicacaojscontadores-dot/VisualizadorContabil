import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { nanoid } from "nanoid";
import { generateText } from "ai";
import { createGemini } from "./ai-gateway.server";
import type { DemoData } from "./demo-types";

const EXTRACTION_PROMPT = `Você é um especialista em contabilidade brasileira.
Receberá o TEXTO COMPLETO de um demonstrativo contábil extraído de um documento Word.
Extraia TODAS as informações de cima a baixo em JSON estritamente válido.

REGRAS IMPORTANTES:
- Extraia TODOS os anos presentes (geralmente exercício atual e exercício anterior).
- "valor" = exercício atual, "valor_ant" = exercício anterior. Use null se não houver comparativo.
- Valores monetários como números puros (sem R$, sem pontos de milhar). Negativos com sinal negativo.
- Extraia TODAS as notas explicativas com seu número, título, texto narrativo e subtabelas.
- Nas subtabelas dentro de notas, inclua TODAS as linhas e colunas exatamente como no documento.
- Para o DMPL: extraia as colunas (ex: Capital Social, Lucros Acumulados, Reservas, Total) e linhas.
- Assinaturas: extraia nome, cargo, CPF e CRC se presentes.

Schema JSON a seguir (omita campos sem dados):
{
  "empresa": { "nome": string, "cnpj": string, "sede": string, "objeto_social": string },
  "competencia": string,
  "competencia_anterior": string,
  "data_emissao": string,
  "data_aprovacao": string,
  "kpis": { "faturamento": number, "impostos": number, "folha": number, "lucro": number },
  "balanco_patrimonial": {
    "ativo": [{"item":string,"valor":number,"valor_ant":number,"nota":string,"indent":bool,"tipo":"grupo"|"subtotal"|null}],
    "passivo": [{"item":string,"valor":number,"valor_ant":number,"nota":string,"indent":bool,"tipo":"grupo"|"subtotal"|null}],
    "patrimonio_liquido": [{"item":string,"valor":number,"valor_ant":number,"nota":string,"indent":bool,"tipo":"grupo"|"subtotal"|null}]
  },
  "dre": [{"item":string,"valor":number,"valor_ant":number,"nota":string,"tipo":"receita"|"custo"|"despesa"|"resultado"|"subtotal"|"grupo","indent":bool}],
  "dra": [{"item":string,"valor":number,"valor_ant":number}],
  "dmpl": {
    "colunas": [string],
    "linhas": [{"descricao":string,"valores":[number]}]
  },
  "dfc": {
    "operacional": [{"item":string,"valor":number,"valor_ant":number,"indent":bool,"tipo":"subtotal"|null}],
    "investimento": [{"item":string,"valor":number,"valor_ant":number,"indent":bool,"tipo":"subtotal"|null}],
    "financiamento": [{"item":string,"valor":number,"valor_ant":number,"indent":bool,"tipo":"subtotal"|null}],
    "variacao_caixa": number, "variacao_caixa_ant": number,
    "caixa_inicio": number, "caixa_inicio_ant": number,
    "caixa_fim": number, "caixa_fim_ant": number
  },
  "notas_explicativas": [{
    "numero": string,
    "titulo": string,
    "conteudo": string,
    "tabelas": [{"colunas":[string],"linhas":[{"descricao":string,"valores":[string|number]}]}]
  }],
  "assinaturas": [{"nome":string,"cargo":string,"cpf":string,"crc":string}],
  "observacoes": string
}
Responda APENAS com o JSON válido, sem markdown, sem texto adicional.`;

const BALANCETE_PROMPT = `Você é um especialista em contabilidade brasileira.

Receberá o texto de um BALANCETE CONTÁBIL exportado pelo sistema PC Sistemas.
Cada linha tem o formato: CÓDIGO - DESCRIÇÃO  [SALDO_ANTERIOR D/C]  [DÉBITO]  [CRÉDITO]  [SALDO_FINAL D/C]
D = Devedor (Ativo, Custo, Despesa)   C = Credor (Passivo, Receita)
Use sempre o SALDO FINAL (última coluna) de cada conta.
DIVIDA todos os valores por 1000 (represente em R$ milhares, arredonde para inteiro).
Valores negativos no DRE (custos, despesas) devem ser negativos no JSON.

MAPEAMENTO DE CONTAS → BALANÇO PATRIMONIAL:

Ativo Circulante:
- "Caixa e equivalentes de caixa": contas 11100, 11111, 11200, 11300 (use o saldo da conta pai 11100 se existir)
- "Clientes": conta 31
- "Estoque": conta 11600
- "Adiantamentos": contas 17, 18, 32 (some os saldos)
- "Impostos a recuperar": conta 23
- "Depósitos judiciais": conta 33
- "Partes relacionadas": contas 11508, 11511, 800 (some os saldos D)

Ativo Não Circulante:
- "Imobilizado": conta 36 (ou 35 se 36 não existir)

Passivo Circulante:
- "Fornecedores": conta 21004
- "Obrigações fiscais e tributárias": conta 21300
- "Empréstimos e financiamentos": contas 398, 401 (some os saldos C)
- "Salários e encargos sociais": contas 21200, 21500 (some os saldos C)
- "Partes relacionadas": contas 21627, 216002 (some os saldos C)

Patrimônio Líquido:
- "Capital social": conta 24100
- "Reservas de incentivos fiscais": contas 24201, 24205
- "Lucros acumulados": conta 24500 (se saldo D = prejuízo, valor negativo)

MAPEAMENTO DE CONTAS → DRE:
- "Receita líquida de vendas" (tipo receita): conta 62001 ou 62000 (saldo C)
- "Custo das mercadorias vendidas" (tipo custo): conta 40000 (saldo D → negativo)
- "Despesas com vendas" (tipo despesa): conta 53000 (saldo D → negativo)
- "Despesas gerais e administrativas" (tipo despesa): soma contas 54000 + 55000 (saldo D → negativo)
- "Despesas tributárias" (tipo despesa): conta 56000 (saldo D → negativo)
- "Depreciações" (tipo despesa): conta 58000 (saldo D → negativo)
- "Outros resultados operacionais" (tipo despesa): conta 65000 (saldo C = positivo, saldo D = negativo)
- "Receitas financeiras" (tipo resultado): soma contas 65209 + 65210 (saldo C)
- "Despesas financeiras" (tipo resultado): conta 57000 (saldo D → negativo)
- "Imposto de renda" (tipo resultado): conta 59519 (saldo D → negativo)
- "Contribuição social" (tipo resultado): conta 59520 (saldo D → negativo)

KPIS a calcular:
- faturamento: valor absoluto de "Receita líquida de vendas"
- lucro: RESULTADO DO PERIODO do resumo do balancete (última página, saldo C → positivo)
- impostos: soma absoluta de IRPJ (59519) + CSLL (59520) + débitos de impostos sobre vendas (ICMS/PIS/COFINS da DRE)
- folha: soma absoluta de salários e encargos nas despesas (contas 300001, 21200, 600013, 600014)

Extraia do cabeçalho:
- Nome da empresa (campo "Empresa:")
- CNPJ (campo "CNPJ:")
- Competência: período no formato "mês/ano" baseado na data fim do período

Notas explicativas: retorne array VAZIO [] (o contador preencherá manualmente).

Responda SOMENTE com o JSON válido sem markdown, seguindo este schema exato:
{
  "empresa": { "nome": string, "cnpj": string },
  "competencia": string,
  "kpis": { "faturamento": number, "impostos": number, "folha": number, "lucro": number },
  "balanco_patrimonial": {
    "ativo": [{"item": string, "valor": number}],
    "passivo": [{"item": string, "valor": number}],
    "patrimonio_liquido": [{"item": string, "valor": number}]
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
      pendente: rows.filter((r) => r.status === "pendente").length,
      publicado: rows.filter((r) => r.status === "publicado").length,
      erro: rows.filter((r) => r.status === "erro").length,
    };
  });

const UploadInput = z.object({
  cliente_id: z.string().uuid().nullable().optional(),
  competencia: z.string().max(40).optional(),
  arquivo_nome: z.string().max(200),
  arquivo_base64: z.string(),
  arquivo_tipo: z.enum(["docx", "pdf"]).default("docx"),
});

export const uploadDemonstrativo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadInput.parse(d))
  .handler(async ({ data, context }) => {
    const slug = nanoid(10);
    // Create row in 'processando' state immediately
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
      console.log("[uploadDemonstrativo] start", created.id, data.arquivo_nome, data.arquivo_tipo);
      const buf = Uint8Array.from(atob(data.arquivo_base64), (c) => c.charCodeAt(0));

      let text: string;
      let prompt: string;

      if (data.arquivo_tipo === "pdf") {
        const { extractPdfText } = await import("./pdf-extractor.server");
        text = await extractPdfText(buf.buffer as ArrayBuffer);
        prompt = BALANCETE_PROMPT;
      } else {
        const mammoth = await import("mammoth");
        const { value } = await mammoth.extractRawText({ arrayBuffer: buf.buffer as ArrayBuffer });
        text = value;
        prompt = EXTRACTION_PROMPT;
      }
      console.log("[uploadDemonstrativo] text length", text.length);

      const ai = createGemini();
      const aiTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Tempo limite da IA excedido (25s). Tente um documento menor.")), 25_000)
      );
      const { text: jsonText } = await Promise.race([
        generateText({
          model: ai("gemini-2.0-flash"),
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: text.slice(0, 40_000) },
          ],
        }),
        aiTimeout,
      ]);
      console.log("[uploadDemonstrativo] ai response chars", jsonText.length);


      // Clean possible markdown fences
      const cleaned = jsonText.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      let dados: DemoData = {};
      try {
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        dados = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        dados = { observacoes: "Não foi possível interpretar automaticamente o documento." };
      }

      const { error: upErr } = await context.supabase
        .from("demonstrativos")
        .update({
          status: "pendente",
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

// Public read by slug — no auth
export const getPublicDemo = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("demonstrativos")
      .select("id, slug, status, competencia, dados, published_at, cliente_id, clientes(razao_social, nome_fantasia, cnpj, logo_url)")
      .eq("slug", data.slug)
      .eq("status", "publicado")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return row;
  });
