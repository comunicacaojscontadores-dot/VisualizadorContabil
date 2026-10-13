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
