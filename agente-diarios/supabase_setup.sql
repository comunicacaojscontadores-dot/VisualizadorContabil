-- Execute no SQL Editor do Supabase (uma única vez)

CREATE TABLE IF NOT EXISTS diarios_oficiais (
    id               BIGSERIAL PRIMARY KEY,
    data_publicacao  DATE          NOT NULL,
    aba              TEXT          NOT NULL,   -- DOU | DOERJ | DOE-ES | DOE-MG | DOE-SP
    numero_ato       TEXT,
    ato_alterado     TEXT,
    resumo           TEXT,
    orgao            TEXT,
    prazo            TEXT,
    tributo_materia  TEXT,
    numero_doc       TEXT,
    link             TEXT,
    empresa_cliente  TEXT DEFAULT '',
    criado_em        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (numero_ato, data_publicacao)
);

-- Índices para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_diarios_data    ON diarios_oficiais (data_publicacao DESC);
CREATE INDEX IF NOT EXISTS idx_diarios_aba     ON diarios_oficiais (aba);
CREATE INDEX IF NOT EXISTS idx_diarios_tributo ON diarios_oficiais (tributo_materia);
CREATE INDEX IF NOT EXISTS idx_diarios_empresa ON diarios_oficiais (empresa_cliente);

-- Habilita Row Level Security (ajuste as políticas conforme necessário)
ALTER TABLE diarios_oficiais ENABLE ROW LEVEL SECURITY;

-- Política pública de leitura (ajuste se quiser restringir)
CREATE POLICY "Leitura pública" ON diarios_oficiais
    FOR SELECT USING (true);

-- Política de inserção apenas para service_role (o agente usa a anon key com insert habilitado)
CREATE POLICY "Inserção autenticada" ON diarios_oficiais
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Upsert autenticado" ON diarios_oficiais
    FOR UPDATE WITH CHECK (true);
