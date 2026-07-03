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
