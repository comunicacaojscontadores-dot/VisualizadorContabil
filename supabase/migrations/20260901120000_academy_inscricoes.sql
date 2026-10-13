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
