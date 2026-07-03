// Default shape of dados extracted from a demonstrativo. All optional.

// Line item with optional comparative year value and note reference
export type LineItem = {
  item: string;
  valor: number;
  valor_ant?: number;  // valor do ano anterior
  nota?: string;       // ex: "4", "5"
  tipo?: "receita" | "custo" | "despesa" | "resultado" | "subtotal" | "grupo";
  indent?: boolean;    // recuo visual (sub-item)
};

export type DemoData = {
  empresa?: {
    nome?: string;
    cnpj?: string;
    logo_url?: string;
    sede?: string;
    objeto_social?: string;
  };
  competencia?: string;
  competencia_anterior?: string;   // ex: "31/12/2024"
  data_emissao?: string;
  data_aprovacao?: string;

  kpis?: {
    faturamento?: number;
    impostos?: number;
    folha?: number;
    lucro?: number;
    obrigacoes_total?: number;
    obrigacoes_entregues?: number;
  };

  evolucao_faturamento?: { mes: string; valor: number }[];
  evolucao_impostos?: { mes: string; valor: number }[];
  carga_tributaria?: { nome: string; valor: number }[];
  fluxo_caixa?: { mes: string; entrada: number; saida: number }[];
  obrigacoes?: { nome: string; vencimento?: string; status: "entregue" | "pendente" | "atrasada" }[];
  cronograma?: { data: string; titulo: string; descricao?: string }[];

  balanco_patrimonial?: {
    ativo?: LineItem[];
    passivo?: LineItem[];
    patrimonio_liquido?: LineItem[];
  };

  dre?: LineItem[];
  dra?: LineItem[];

  // DMPL com colunas por grupo de PL
  dmpl?: {
    colunas?: string[];   // ex: ["Capital Social","Lucros Acumulados","Reservas","Total"]
    linhas?: { descricao: string; valores: number[] }[];
  };

  dfc?: {
    operacional?: LineItem[];
    investimento?: LineItem[];
    financiamento?: LineItem[];
    variacao_caixa?: number;
    variacao_caixa_ant?: number;
    caixa_inicio?: number;
    caixa_inicio_ant?: number;
    caixa_fim?: number;
    caixa_fim_ant?: number;
  };

  notas_explicativas?: {
    numero?: string;           // "1", "3.2", "10"
    titulo: string;
    conteudo: string;          // texto narrativo
    tabelas?: {
      colunas: string[];
      linhas: { descricao: string; valores: (string | number)[] }[];
    }[];
  }[];

  observacoes?: string;
  assinaturas?: { nome: string; cargo?: string; cpf?: string; crc?: string }[];
};

export const EMPTY_DEMO_DATA: DemoData = {};
