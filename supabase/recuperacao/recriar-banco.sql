-- ============================================================
-- ContabilConnect — recriação completa do banco
-- Gerado em 16/09/2026 a partir de supabase/migrations/
--
-- Como usar: Supabase → SQL Editor → cole tudo → Run.
-- Roda uma vez, num projeto novo e vazio.
-- ============================================================

-- ─────────────────────────────────────────────
-- 20260609191622_26db9881-6b43-4cf2-959e-b576c4555fa6.sql
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  escritorio_nome TEXT,
  escritorio_logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_profile_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own_profile_modify" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER tg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email));
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj TEXT,
  email TEXT,
  telefone TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clientes_own" ON public.clientes FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER tg_clientes_updated BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX clientes_owner_idx ON public.clientes(owner_id);

CREATE TYPE public.demo_status AS ENUM ('processando','pendente','publicado','erro');

CREATE TABLE public.demonstrativos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  status public.demo_status NOT NULL DEFAULT 'processando',
  competencia TEXT,
  arquivo_path TEXT,
  arquivo_nome TEXT,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  erro_mensagem TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demonstrativos TO authenticated;
GRANT SELECT ON public.demonstrativos TO anon;
GRANT ALL ON public.demonstrativos TO service_role;
ALTER TABLE public.demonstrativos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demos_own_all" ON public.demonstrativos FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "demos_public_published" ON public.demonstrativos FOR SELECT TO anon USING (status = 'publicado');
CREATE POLICY "demos_public_published_auth" ON public.demonstrativos FOR SELECT TO authenticated USING (status = 'publicado');
CREATE TRIGGER tg_demos_updated BEFORE UPDATE ON public.demonstrativos FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX demos_owner_idx ON public.demonstrativos(owner_id);
CREATE INDEX demos_slug_idx ON public.demonstrativos(slug);

CREATE POLICY "docs_owner_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "docs_owner_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "docs_owner_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'docs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ─────────────────────────────────────────────
-- 20260609191636_4452c4ca-ec0b-476a-b549-86f633d80825.sql
-- ─────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────
-- 20260610123109_1ced75f0-053e-4f0f-9ff7-f4517053386e.sql
-- ─────────────────────────────────────────────

-- 1) Remove overly permissive SELECT policies on demonstrativos.
--    Public access is handled by a server function using the service role,
--    which scopes the query to a specific slug + status='publicado'.
DROP POLICY IF EXISTS demos_public_published ON public.demonstrativos;
DROP POLICY IF EXISTS demos_public_published_auth ON public.demonstrativos;

-- 2) Explicit UPDATE policy on storage.objects for the 'docs' bucket,
--    mirroring the existing INSERT/DELETE owner-scoped checks.
DROP POLICY IF EXISTS "docs_owner_update" ON storage.objects;
CREATE POLICY "docs_owner_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'docs'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'docs'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- ─────────────────────────────────────────────
-- 20260630120000_prospeccoes.sql
-- ─────────────────────────────────────────────
-- Buscador de empresas (prospecção). Cada linha é um dossiê de uma empresa
-- pesquisada pelo usuário. dossie JSONB guarda o resultado bruto consolidado
-- das fontes (Receita via BrasilAPI, Google Places, estimativas).

CREATE TABLE public.prospeccoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cnpj TEXT,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  municipio TEXT,
  uf TEXT,
  porte TEXT,
  faturamento_estimado TEXT,
  google_rating NUMERIC(2,1),
  status TEXT NOT NULL DEFAULT 'novo',           -- novo | contatado | qualificado | descartado | convertido
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  dossie JSONB NOT NULL DEFAULT '{}'::jsonb,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospeccoes TO authenticated;
GRANT ALL ON public.prospeccoes TO service_role;

ALTER TABLE public.prospeccoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prospeccoes_own" ON public.prospeccoes FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER tg_prospeccoes_updated BEFORE UPDATE ON public.prospeccoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX prospeccoes_owner_idx ON public.prospeccoes(owner_id);
CREATE INDEX prospeccoes_cnpj_idx ON public.prospeccoes(owner_id, cnpj);

-- ─────────────────────────────────────────────
-- 20260901120000_academy_inscricoes.sql
-- ─────────────────────────────────────────────
-- Projeto Supabase dedicado da JS Academy (separado do banco principal do
-- ContabilConnect). Uma linha por curso escolhido: quem se candidata às
-- duas formações gera duas linhas, uma por checkout no InfinitePay.
-- Sem policy pública de INSERT: toda escrita e leitura passa pelas funções
-- de servidor em src/lib/academy.functions.ts, usando a service role key
-- (ver src/integrations/supabase/academy-client.server.ts). "pago" é
-- confirmado manualmente pela equipe no painel, conferindo o extrato do
-- InfinitePay — não há webhook de pagamento integrado nesta versão.

CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.academy_inscricoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curso TEXT NOT NULL CHECK (curso IN ('contabil','dp')),
  situacao TEXT NOT NULL CHECK (situacao IN ('aprofundar','migrar','comecar','dono')),
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  rg TEXT NOT NULL,
  data_nascimento DATE,
  whatsapp TEXT NOT NULL,
  email TEXT NOT NULL,
  cep TEXT,
  endereco TEXT,
  numero TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  valor_curso NUMERIC(10,2) NOT NULL,
  pago BOOLEAN NOT NULL DEFAULT FALSE,
  data_pagamento TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS ligado, sem nenhuma policy: por padrão isso já bloqueia anon e
-- authenticated. Só o service_role (usado pelas funções de servidor) lê e
-- escreve — ele ignora RLS por natureza, então não precisa de GRANT extra.
ALTER TABLE public.academy_inscricoes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER tg_academy_inscricoes_updated BEFORE UPDATE ON public.academy_inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX academy_inscricoes_curso_idx ON public.academy_inscricoes(curso);
CREATE INDEX academy_inscricoes_pago_idx ON public.academy_inscricoes(pago);
CREATE INDEX academy_inscricoes_created_idx ON public.academy_inscricoes(created_at DESC);

-- ─────────────────────────────────────────────
-- 20260909120000_inscricoes_inovacao.sql
-- ─────────────────────────────────────────────
-- Cadastro público do Time de Inovação (setor Contábil): nome + cargo.
-- RLS ligado, sem policy pública: bloqueia anon/authenticated por padrão.
-- Toda escrita e leitura passam pela server function, usando a service role key.
CREATE TABLE public.inscricoes_inovacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cargo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inscricoes_inovacao ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- CORREÇÃO: o status 'rascunho' é usado pelo código
-- (uploadDemonstrativo/updateDemoDados) mas nunca foi
-- versionado — existia só no banco antigo, adicionado
-- pelo dashboard. Sem isto, todo upload falha.
-- ─────────────────────────────────────────────
ALTER TYPE public.demo_status ADD VALUE IF NOT EXISTS 'rascunho';
