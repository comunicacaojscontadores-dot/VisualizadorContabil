import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Buscador de empresas (prospecção)
//
// Fontes usadas no MVP:
//   1. BrasilAPI  → dados cadastrais OFICIAIS da Receita Federal (gratuito, sem
//      chave). É o coração do dossiê: razão social, CNAE, sócios, porte, regime.
//   2. Google Places (New) → presença física: nota, nº de avaliações, site,
//      telefone, horário. OPCIONAL — só roda se GOOGLE_PLACES_API_KEY existir.
//   3. Faturamento → ESTIMATIVA por porte/regime. Não existe fonte pública de
//      faturamento real de empresa privada; deixamos isso explícito no dossiê.
// ─────────────────────────────────────────────────────────────────────────────

export type DossieEmpresa = {
  cnpj: string | null;
  razao_social: string;
  nome_fantasia: string | null;
  situacao_cadastral: string | null;
  data_abertura: string | null;
  natureza_juridica: string | null;
  porte: string | null;
  capital_social: number | null;
  cnae_principal: { codigo: string; descricao: string } | null;
  cnaes_secundarios: { codigo: string; descricao: string }[];
  regime: { simples: boolean; mei: boolean };
  endereco: {
    logradouro: string | null;
    numero: string | null;
    bairro: string | null;
    municipio: string | null;
    uf: string | null;
    cep: string | null;
  };
  contato: { telefone: string | null; email: string | null };
  socios: { nome: string; qualificacao: string | null }[];
  faturamento_estimado: { faixa: string; base: string };
  google: {
    rating: number | null;
    total_avaliacoes: number | null;
    endereco: string | null;
    telefone: string | null;
    website: string | null;
    maps_url: string | null;
    aberto_agora: boolean | null;
    situacao: string | null;
  } | null;
  fontes: string[];
};

function soDigitos(s: string) {
  return s.replace(/\D/g, "");
}

/** Estima a faixa de faturamento anual a partir do porte/regime da Receita. */
function estimarFaturamento(porte: string | null, mei: boolean): { faixa: string; base: string } {
  if (mei) return { faixa: "Até R$ 81 mil/ano", base: "Limite do MEI (estimativa)" };
  const p = (porte ?? "").toUpperCase();
  if (p.includes("MICRO"))
    return { faixa: "R$ 81 mil a R$ 360 mil/ano", base: "Limite de Microempresa (estimativa)" };
  if (p.includes("PEQUENO"))
    return { faixa: "R$ 360 mil a R$ 4,8 mi/ano", base: "Limite de EPP (estimativa)" };
  return {
    faixa: "Acima de R$ 4,8 mi/ano",
    base: "Porte 'Demais' — acima do teto do Simples (estimativa)",
  };
}

type BrasilApiCnpj = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  descricao_situacao_cadastral: string | null;
  data_inicio_atividade: string | null;
  natureza_juridica: string | null;
  porte: string | null;
  capital_social: number | null;
  cnae_fiscal: number | null;
  cnae_fiscal_descricao: string | null;
  cnaes_secundarios: { codigo: number; descricao: string }[] | null;
  opcao_pelo_simples: boolean | null;
  opcao_pelo_mei: boolean | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  ddd_telefone_1: string | null;
  email: string | null;
  qsa: { nome_socio: string; qualificacao_socio: string | null }[] | null;
};

async function buscarReceita(cnpj: string): Promise<DossieEmpresa> {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (res.status === 404) throw new Error("CNPJ não encontrado na base da Receita Federal.");
  if (!res.ok) throw new Error(`Falha ao consultar a Receita (HTTP ${res.status}).`);
  const d = (await res.json()) as BrasilApiCnpj;

  const mei = !!d.opcao_pelo_mei;
  return {
    cnpj: d.cnpj ?? cnpj,
    razao_social: d.razao_social,
    nome_fantasia: d.nome_fantasia || null,
    situacao_cadastral: d.descricao_situacao_cadastral || null,
    data_abertura: d.data_inicio_atividade || null,
    natureza_juridica: d.natureza_juridica || null,
    porte: d.porte || null,
    capital_social: d.capital_social ?? null,
    cnae_principal: d.cnae_fiscal
      ? { codigo: String(d.cnae_fiscal), descricao: d.cnae_fiscal_descricao ?? "" }
      : null,
    cnaes_secundarios: (d.cnaes_secundarios ?? [])
      .filter((c) => c.codigo)
      .map((c) => ({ codigo: String(c.codigo), descricao: c.descricao })),
    regime: { simples: !!d.opcao_pelo_simples, mei },
    endereco: {
      logradouro: d.logradouro || null,
      numero: d.numero || null,
      bairro: d.bairro || null,
      municipio: d.municipio || null,
      uf: d.uf || null,
      cep: d.cep || null,
    },
    contato: { telefone: d.ddd_telefone_1 || null, email: d.email || null },
    socios: (d.qsa ?? []).map((s) => ({
      nome: s.nome_socio,
      qualificacao: s.qualificacao_socio || null,
    })),
    faturamento_estimado: estimarFaturamento(d.porte, mei),
    google: null,
    fontes: ["Receita Federal (BrasilAPI)"],
  };
}

/** Enriquece o dossiê com dados do Google Places. Best-effort: nunca derruba a busca. */
async function enriquecerGoogle(dossie: DossieEmpresa): Promise<void> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return;
  const nome = dossie.nome_fantasia || dossie.razao_social;
  const cidade = [dossie.endereco.municipio, dossie.endereco.uf].filter(Boolean).join(" ");
  const query = [nome, cidade].filter(Boolean).join(" ");
  if (!query) return;

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri,places.currentOpeningHours.openNow,places.businessStatus",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "pt-BR", maxResultCount: 1 }),
    });
    if (!res.ok) return;
    const json = (await res.json()) as {
      places?: Array<{
        formattedAddress?: string;
        rating?: number;
        userRatingCount?: number;
        websiteUri?: string;
        nationalPhoneNumber?: string;
        googleMapsUri?: string;
        currentOpeningHours?: { openNow?: boolean };
        businessStatus?: string;
      }>;
    };
    const p = json.places?.[0];
    if (!p) return;
    dossie.google = {
      rating: p.rating ?? null,
      total_avaliacoes: p.userRatingCount ?? null,
      endereco: p.formattedAddress ?? null,
      telefone: p.nationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      maps_url: p.googleMapsUri ?? null,
      aberto_agora: p.currentOpeningHours?.openNow ?? null,
      situacao: p.businessStatus ?? null,
    };
    dossie.fontes.push("Google Maps (Places API)");
  } catch {
    // silencioso: Google é opcional
  }
}

/** Busca uma empresa por CNPJ e devolve o dossiê consolidado (não salva). */
export const buscarEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cnpj: z.string().min(11) }).parse(d))
  .handler(async ({ data }) => {
    const cnpj = soDigitos(data.cnpj);
    if (cnpj.length !== 14) throw new Error("CNPJ inválido: informe 14 dígitos.");
    const dossie = await buscarReceita(cnpj);
    await enriquecerGoogle(dossie);
    return dossie;
  });

export const listProspeccoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("prospeccoes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const SalvarInput = z.object({
  dossie: z.record(z.string(), z.unknown()),
  observacoes: z.string().max(2000).optional().nullable(),
});

/** Salva (ou atualiza, pelo CNPJ) uma prospecção a partir de um dossiê. */
export const salvarProspeccao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SalvarInput.parse(d))
  .handler(async ({ data, context }) => {
    const dossie = data.dossie as unknown as DossieEmpresa;
    const payload = {
      owner_id: context.userId,
      cnpj: dossie.cnpj ?? null,
      razao_social: dossie.razao_social,
      nome_fantasia: dossie.nome_fantasia ?? null,
      municipio: dossie.endereco?.municipio ?? null,
      uf: dossie.endereco?.uf ?? null,
      porte: dossie.porte ?? null,
      faturamento_estimado: dossie.faturamento_estimado?.faixa ?? null,
      google_rating: dossie.google?.rating ?? null,
      dossie: data.dossie as never,
      observacoes: data.observacoes || null,
    };

    // Dedup por CNPJ do mesmo dono.
    if (dossie.cnpj) {
      const { data: existing } = await context.supabase
        .from("prospeccoes")
        .select("id")
        .eq("owner_id", context.userId)
        .eq("cnpj", dossie.cnpj)
        .maybeSingle();
      if (existing) {
        const { data: row, error } = await context.supabase
          .from("prospeccoes")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return row;
      }
    }

    const { data: row, error } = await context.supabase
      .from("prospeccoes")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const atualizarStatusProspeccao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["novo", "contatado", "qualificado", "descartado", "convertido"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("prospeccoes")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProspeccao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("prospeccoes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Converte uma prospecção em cliente e marca a prospecção como convertida. */
export const converterEmCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: prosp, error: e1 } = await context.supabase
      .from("prospeccoes")
      .select("*")
      .eq("id", data.id)
      .single();
    if (e1 || !prosp) throw new Error(e1?.message ?? "Prospecção não encontrada.");

    const dossie = (prosp.dossie ?? {}) as Partial<DossieEmpresa>;
    const { data: cliente, error: e2 } = await context.supabase
      .from("clientes")
      .insert({
        owner_id: context.userId,
        razao_social: prosp.razao_social,
        nome_fantasia: prosp.nome_fantasia,
        cnpj: prosp.cnpj,
        email: dossie.contato?.email ?? null,
        telefone: dossie.google?.telefone ?? dossie.contato?.telefone ?? null,
      })
      .select()
      .single();
    if (e2) throw new Error(e2.message);

    await context.supabase
      .from("prospeccoes")
      .update({ status: "convertido", cliente_id: cliente.id })
      .eq("id", data.id);

    return cliente;
  });
