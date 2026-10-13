-- ============================================================
-- ContabilConnect — o que falta no banco depois do restore
--
-- Verificado em 16/09/2026: o PostgREST expõe apenas 'clientes' e
-- 'demonstrativos'. As tabelas abaixo existem nas migrations do
-- repositório mas NÃO existem no banco.
--
-- Como usar: Supabase → SQL Editor → cole tudo → Run.
-- É seguro rodar mais de uma vez (tudo usa IF NOT EXISTS).
-- ============================================================

-- ── 1. profiles ───────────────────────────────────────────────
-- Perfil do usuário, criado automaticamente a cada cadastro.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  escritorio_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_profile_select" ON public.profiles;
CREATE POLICY "own_profile_select" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "own_profile_modify" ON public.profiles;
CREATE POLICY "own_profile_modify" ON public.profiles
  FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Trigger que cria o profile quando alguém se cadastra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, escritorio_nome)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'nome',
    NEW.raw_user_meta_data ->> 'escritorio_nome'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Cria o profile de quem já tem conta e ficou sem
INSERT INTO public.profiles (id, nome, escritorio_nome)
SELECT u.id, u.raw_user_meta_data ->> 'nome', u.raw_user_meta_data ->> 'escritorio_nome'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ── 2. prospeccoes ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prospeccoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa TEXT NOT NULL,
  cnpj TEXT,
  contato TEXT,
  telefone TEXT,
  email TEXT,
  origem TEXT,
  status TEXT NOT NULL DEFAULT 'novo',
  valor_estimado NUMERIC,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prospeccoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prospeccoes_own" ON public.prospeccoes;
CREATE POLICY "prospeccoes_own" ON public.prospeccoes
  FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ── 3. academy_inscricoes ─────────────────────────────────────
-- Inscrições públicas: qualquer um se inscreve, só o escritório lê.
CREATE TABLE IF NOT EXISTS public.academy_inscricoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  empresa TEXT,
  cargo TEXT,
  turma TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.academy_inscricoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "academy_insert_publico" ON public.academy_inscricoes;
CREATE POLICY "academy_insert_publico" ON public.academy_inscricoes
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "academy_select_interno" ON public.academy_inscricoes;
CREATE POLICY "academy_select_interno" ON public.academy_inscricoes
  FOR SELECT TO authenticated USING (true);

-- ── 4. inscricoes_inovacao ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inscricoes_inovacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  empresa TEXT,
  cargo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inscricoes_inovacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inovacao_insert_publico" ON public.inscricoes_inovacao;
CREATE POLICY "inovacao_insert_publico" ON public.inscricoes_inovacao
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "inovacao_select_interno" ON public.inscricoes_inovacao;
CREATE POLICY "inovacao_select_interno" ON public.inscricoes_inovacao
  FOR SELECT TO authenticated USING (true);

-- ── 5. keepalive ──────────────────────────────────────────────
-- Uma linha só, atualizada pelo Worker. Serve para duas coisas:
-- gerar ESCRITA no banco (sinal de atividade mais forte que leitura,
-- que o RLS pode responder sem tocar em dado nenhum) e deixar
-- registrado quando foi o último sinal de vida — assim dá para saber
-- se o keepalive parou ANTES de o projeto pausar.
CREATE TABLE IF NOT EXISTS public.keepalive (
  id INT PRIMARY KEY DEFAULT 1,
  ultima_execucao TIMESTAMPTZ NOT NULL DEFAULT now(),
  execucoes BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT keepalive_linha_unica CHECK (id = 1)
);
ALTER TABLE public.keepalive ENABLE ROW LEVEL SECURITY;
-- Sem policy para anon/authenticated: só a service_role escreve aqui.

INSERT INTO public.keepalive (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── 6. status 'rascunho' ──────────────────────────────────────
-- Usado pelo código, nunca versionado nas migrations.
ALTER TYPE public.demo_status ADD VALUE IF NOT EXISTS 'rascunho';

-- ── Conferência ───────────────────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
