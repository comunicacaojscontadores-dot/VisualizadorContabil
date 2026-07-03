import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ClienteInput = z.object({
  id: z.string().uuid().optional(),
  razao_social: z.string().min(1).max(200),
  nome_fantasia: z.string().max(200).optional().nullable(),
  cnpj: z.string().max(20).optional().nullable(),
  email: z.string().email().max(200).optional().nullable().or(z.literal("")),
  telefone: z.string().max(40).optional().nullable(),
  logo_url: z.string().max(500).optional().nullable(),
});

export const listClientes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clientes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClienteInput.parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      ...data,
      email: data.email || null,
      owner_id: context.userId,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("clientes")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("clientes")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("clientes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
