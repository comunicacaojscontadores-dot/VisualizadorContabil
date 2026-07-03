
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
