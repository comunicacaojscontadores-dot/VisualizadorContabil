import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const InscricaoInput = z.object({
  nome: z.string().trim().min(1).max(200),
  cargo: z.string().trim().min(1).max(200),
});

// Rota pública (sem middleware de auth) — o insert usa a service role key,
// que ignora RLS. A tabela não tem policy pública de leitura/escrita.
export const criarInscricaoInovacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InscricaoInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("inscricoes_inovacao")
      .insert({ nome: data.nome, cargo: data.cargo });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
