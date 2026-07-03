import { useEffect, useRef, useState } from "react";
import type { DemoData } from "@/lib/demo-types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { brl, brlFull, compactBR } from "@/lib/format";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Building2, Calendar, TrendingUp, Receipt, Users, Wallet,
  CheckCircle2, Clock, AlertTriangle, FileText, BarChart3,
  ScrollText, Printer, ArrowUpRight, ArrowDownRight,
  ArrowLeft, ChevronDown, Activity, Landmark, CircleDollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const C_PRIMARY = "#1A3A5C";
const C_GOLD = "#C9A84C";
const C_GRAY = "#9CA3AF";
const C_GREEN = "#16A34A";
const C_RED = "#DC2626";
const PIE_COLORS = [C_PRIMARY, C_GOLD, "#285B8C", "#E6C878", C_GRAY];

type Cliente = {
  razao_social?: string | null;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  logo_url?: string | null;
};

/* ------------ Reveal on scroll (IntersectionObserver) ------------ */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      el.classList.add("is-visible");
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const items = e.target.querySelectorAll<HTMLElement>("[data-reveal-item]");
            items.forEach((it, i) => {
              const delay = Number(it.dataset.revealDelay ?? 30) * i;
              setTimeout(() => it.classList.add("is-visible"), delay);
            });
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/* ------------ Tooltip ------------ */
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-soft text-xs">
      {label && <div className="font-semibold text-foreground mb-1">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="tabular-nums font-medium text-foreground">{brlFull(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function PremiumReport({
  dados, cliente, competencia, publishedAt,
}: {
  dados: DemoData;
  cliente?: Cliente | null;
  competencia?: string | null;
  publishedAt?: string | null;
}) {
  const nome =
    cliente?.nome_fantasia || cliente?.razao_social || dados.empresa?.nome || "Demonstrativo Contábil";
  const cnpj = cliente?.cnpj || dados.empresa?.cnpj;
  const logo = cliente?.logo_url || dados.empresa?.logo_url;

  const k = dados.kpis ?? {};
  const obrigPct =
    k.obrigacoes_total && k.obrigacoes_entregues
      ? Math.round((k.obrigacoes_entregues / k.obrigacoes_total) * 100)
      : null;

  // ---- Derive KPIs dinamicamente a partir dos dados ----
  const findRow = (rows: { item: string; valor: number }[] | undefined, kw: string[]) =>
    rows?.find((r) => kw.every((k) => r.item.toLowerCase().includes(k)));
  const sum = (rows?: { item: string; valor: number }[]) =>
    rows?.reduce((s, r) => s + (r.valor || 0), 0) ?? 0;

  const receitaLiquida =
    findRow(dados.dre, ["receita", "líquida"])?.valor ??
    findRow(dados.dre, ["receita", "liquida"])?.valor ??
    (dados.dre?.filter((r) => r.tipo === "receita").reduce((s, r) => s + r.valor, 0) ||
      k.faturamento);

  const lucroLiquido =
    findRow(dados.dre, ["lucro", "líquido"])?.valor ??
    findRow(dados.dre, ["lucro", "liquido"])?.valor ??
    dados.dre?.find((r) => r.tipo === "resultado")?.valor ??
    k.lucro;

  const patrimonioLiquido = dados.balanco_patrimonial?.patrimonio_liquido
    ? sum(dados.balanco_patrimonial.patrimonio_liquido)
    : undefined;

  const margem =
    receitaLiquida && lucroLiquido !== undefined ? (lucroLiquido / receitaLiquida) * 100 : null;

  // Tendência da receita (último vs penúltimo mês do evolucao_faturamento)
  const ev = dados.evolucao_faturamento ?? [];
  const receitaTrend =
    ev.length >= 2 && ev[ev.length - 2].valor
      ? ((ev[ev.length - 1].valor - ev[ev.length - 2].valor) / Math.abs(ev[ev.length - 2].valor)) * 100
      : null;
  const receitaAnterior = ev.length >= 2 ? ev[ev.length - 2].valor : undefined;

  // ---- Índices de Liquidez ----
  const ativos = dados.balanco_patrimonial?.ativo ?? [];
  const passivos = dados.balanco_patrimonial?.passivo ?? [];
  const matchVal = (rows: { item: string; valor: number }[], inc: string[], exc: string[] = []) =>
    rows
      .filter((r) => {
        const t = r.item.toLowerCase();
        return inc.every((w) => t.includes(w)) && exc.every((w) => !t.includes(w));
      })
      .reduce((s, r) => s + r.valor, 0);

  const ativoCirc = matchVal(ativos, ["circulante"], ["não"]);
  const ativoNaoCirc =
    matchVal(ativos, ["não", "circulante"]) || matchVal(ativos, ["realizável"]);
  const estoques = matchVal(ativos, ["estoque"]);
  const caixa = matchVal(ativos, ["caixa"]) || matchVal(ativos, ["equivalente"]);
  const passivoCirc = matchVal(passivos, ["circulante"], ["não"]);
  const passivoNaoCirc =
    matchVal(passivos, ["não", "circulante"]) || matchVal(passivos, ["exigível"]);

  const lc = passivoCirc ? ativoCirc / passivoCirc : null;
  const ls = passivoCirc ? (ativoCirc - estoques) / passivoCirc : null;
  const li = passivoCirc ? caixa / passivoCirc : null;
  const lg = passivoCirc + passivoNaoCirc ? (ativoCirc + ativoNaoCirc) / (passivoCirc + passivoNaoCirc) : null;

  const liquidezIndices = [
    { label: "Liquidez Corrente", value: lc, good: 1.5, warn: 1.0 },
    { label: "Liquidez Seca", value: ls, good: 1.0, warn: 0.7 },
    { label: "Liquidez Imediata", value: li, good: 0.3, warn: 0.15 },
    { label: "Liquidez Geral", value: lg, good: 1.0, warn: 0.7 },
  ];
  const indiceMedio = (() => {
    const vs = liquidezIndices.map((x) => x.value).filter((v): v is number => typeof v === "number" && isFinite(v));
    return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
  })();

  const [liqOpen, setLiqOpen] = useState(false);

  const defaultTab = dados.balanco_patrimonial ? "bp" : dados.dre?.length ? "dre" : dados.dra?.length ? "dra" : dados.dmpl?.length ? "dmpl" : "dfc";
  const [demoTab, setDemoTab] = useState<string>(defaultTab);

  const tabMap: Record<string, string> = { balanco: "bp", dre: "dre", dra: "dra", dmpl: "dmpl", dfc: "dfc" };

  const navItems = [
    { id: "balanco", label: "Balanço", show: !!dados.balanco_patrimonial },
    { id: "dre", label: "DRE", show: !!dados.dre?.length },
    { id: "dra", label: "DRA", show: !!dados.dra?.length },
    { id: "dmpl", label: "DMPL", show: !!dados.dmpl?.length },
    { id: "dfc", label: "DFC", show: !!dados.dfc },
    { id: "notas", label: "Notas", show: !!dados.notas_explicativas?.length },
  ].filter((n) => n.show);

  const scrollTo = (id: string) => {
    if (tabMap[id]) setDemoTab(tabMap[id]);
    const target = id === "notas" ? "notas" : "demonstrativos";
    const el = document.getElementById(target);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HERO com KPIs dinâmicos */}
      <header className="border-b border-border bg-white">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 pt-8 pb-6 md:pt-10">
          {/* Linha 1: cliente + período + voltar */}
          <div className="flex items-start justify-between gap-4 flex-wrap animate-fade-up">
            <div className="flex items-center gap-4 min-w-0">
              {logo ? (
                <img
                  src={logo}
                  alt={nome}
                  className="size-12 rounded-xl object-cover border border-border shrink-0"
                />
              ) : (
                <div
                  className="size-12 rounded-xl grid place-items-center text-white shrink-0"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  <Building2 className="size-5" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                  JS Contadores · Demonstrativo
                </div>
                <h1 className="text-2xl md:text-[30px] leading-tight font-bold tracking-tight mt-0.5 truncate" style={{ color: C_PRIMARY }}>
                  {nome}
                </h1>
                <div className="flex items-center gap-3 flex-wrap mt-1 text-xs text-muted-foreground">
                  {cnpj && <span>CNPJ {cnpj}</span>}
                  {competencia && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="size-3.5" />
                      Exercício <strong className="font-semibold ml-0.5" style={{ color: C_PRIMARY }}>{competencia}</strong>
                    </span>
                  )}
                  {publishedAt && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" />
                      Publicado em {new Date(publishedAt).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 no-print">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
                  else window.location.href = "/";
                }}
                className="border-border hover:bg-secondary"
              >
                <ArrowLeft className="size-4 mr-1.5" />
                Voltar ao índice
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="border-border hover:bg-secondary"
              >
                <Printer className="size-4 mr-1.5" />
                PDF
              </Button>
            </div>
          </div>

          <div className="gold-rule mt-5" />

          {/* Linha 2: KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            <KpiHeaderCard
              label="Receita Líquida"
              value={receitaLiquida}
              icon={TrendingUp}
              trendPct={receitaTrend}
              compareValue={receitaAnterior}
              compareLabel="mês ant."
            />
            <KpiHeaderCard
              label="Lucro Líquido"
              value={lucroLiquido}
              icon={CircleDollarSign}
              negativeAware
              subtitle={margem !== null ? `Margem ${margem.toFixed(1)}%` : undefined}
            />
            <KpiHeaderCard
              label="Patrimônio Líquido"
              value={patrimonioLiquido}
              icon={Landmark}
            />
            <LiquidezHeaderCard
              indices={liquidezIndices}
              media={indiceMedio}
              open={liqOpen}
              onToggle={() => setLiqOpen((o) => !o)}
            />
          </div>

          {liqOpen && (
            <div className="mt-3 rounded-xl border border-border bg-card shadow-soft p-5 animate-fade-up">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="size-4" style={{ color: C_PRIMARY }} />
                <h3 className="text-sm font-semibold" style={{ color: C_PRIMARY }}>
                  Painel de Índices de Liquidez
                </h3>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {liquidezIndices.map((ix) => (
                  <LiquidezRow key={ix.label} {...ix} />
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-4">
                Benchmark indicativo. Verde: saudável · Amarelo: atenção · Vermelho: abaixo do mínimo.
              </p>
            </div>
          )}
        </div>
      </header>

      {/* NAV STICKY */}
      {navItems.length > 0 && (
        <nav className="sticky top-0 z-30 border-b border-border bg-white/85 backdrop-blur-md no-print">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8">
            <div className="flex items-center gap-1 overflow-x-auto py-2.5">
              {navItems.map((n) => (
                <button
                  key={n.id}
                  onClick={() => scrollTo(n.id)}
                  className="px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-white hover:bg-[var(--primary)] transition-colors whitespace-nowrap"
                >
                  {n.label}
                </button>
              ))}
            </div>
          </div>
        </nav>
      )}

      <main className="max-w-[1200px] mx-auto px-4 md:px-8 py-10 md:py-14 space-y-16">


        {/* CHARTS */}
        {(dados.evolucao_faturamento?.length || dados.carga_tributaria?.length || dados.fluxo_caixa?.length) && (
          <Section>
            <SectionTitle eyebrow="Visão geral" title="Indicadores visuais" />
            <div className="grid lg:grid-cols-2 gap-4 mt-6">
              {dados.evolucao_faturamento?.length ? (
                <ChartCard icon={TrendingUp} title="Evolução do faturamento">
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={dados.evolucao_faturamento} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C_PRIMARY} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={C_PRIMARY} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="mes" stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => compactBR(v)} />
                      <Tooltip content={<ChartTip />} cursor={{ stroke: C_PRIMARY, strokeOpacity: 0.15 }} />
                      <Area type="monotone" dataKey="valor" name="Faturamento" stroke={C_PRIMARY} strokeWidth={2.5} fill="url(#gf)" animationDuration={1000} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              ) : null}

              {dados.carga_tributaria?.length ? (
                <ChartCard icon={Receipt} title="Carga tributária">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={dados.carga_tributaria} dataKey="valor" nameKey="nome" cx="50%" cy="50%" innerRadius={62} outerRadius={96} paddingAngle={3} animationDuration={1000}>
                        {dados.carga_tributaria.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="white" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTip />} />
                      <Legend wrapperStyle={{ fontSize: 12, color: "#6B7280" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              ) : null}

              {dados.fluxo_caixa?.length ? (
                <ChartCard icon={BarChart3} title="Fluxo de caixa" className="lg:col-span-2">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={dados.fluxo_caixa} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="mes" stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => compactBR(v)} />
                      <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(26,58,92,0.05)" }} />
                      <Legend wrapperStyle={{ fontSize: 12, color: "#6B7280" }} />
                      <Bar dataKey="entrada" name="Entradas" fill={C_PRIMARY} radius={[6, 6, 0, 0]} animationDuration={1000} />
                      <Bar dataKey="saida" name="Saídas" fill={C_GOLD} radius={[6, 6, 0, 0]} animationDuration={1000} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              ) : null}
            </div>
          </Section>
        )}

        {/* OBRIGAÇÕES */}
        {dados.obrigacoes?.length || obrigPct !== null ? (
          <Section>
            <div className="bg-card border border-border rounded-xl shadow-soft p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <SectionTitle eyebrow="Compliance" title="Obrigações acessórias" inline />
                {obrigPct !== null && (
                  <span
                    className="text-xs font-semibold px-3 py-1 rounded-full"
                    style={{ background: "rgba(22,163,74,0.10)", color: C_GREEN }}
                  >
                    {obrigPct}% entregues
                  </span>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {dados.obrigacoes?.map((o, i) => {
                  const map = {
                    entregue: { bg: "rgba(22,163,74,0.06)", brd: "rgba(22,163,74,0.25)", color: C_GREEN, icon: CheckCircle2 },
                    pendente: { bg: "rgba(217,119,6,0.06)", brd: "rgba(217,119,6,0.25)", color: "#D97706", icon: Clock },
                    atrasada: { bg: "rgba(220,38,38,0.06)", brd: "rgba(220,38,38,0.25)", color: C_RED, icon: AlertTriangle },
                  } as const;
                  const v = map[o.status] ?? map.pendente;
                  const Icon = v.icon;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      style={{ background: v.bg, borderColor: v.brd }}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="size-4" style={{ color: v.color }} />
                        <span className="text-sm font-medium">{o.nome}</span>
                      </div>
                      {o.vencimento && <span className="text-xs text-muted-foreground tabular-nums">{o.vencimento}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>
        ) : null}

        {/* DEMONSTRATIVOS */}
        {(dados.dre?.length || dados.balanco_patrimonial || dados.dfc || dados.dmpl?.length || dados.dra?.length) && (
          <Section>
            <div id="demonstrativos">
              <SectionTitle eyebrow="Demonstrativos" title="Balanço, DRE, DFC e mais" />
              <div className="bg-card border border-border rounded-xl shadow-soft p-4 md:p-6 mt-6">
                <Tabs
                  value={demoTab}
                  onValueChange={setDemoTab}
                >
                  <TabsList className="bg-secondary p-1 rounded-lg gap-1 flex-wrap h-auto">
                    {dados.balanco_patrimonial ? <PillTab value="bp">Balanço</PillTab> : null}
                    {dados.dre?.length ? <PillTab value="dre">DRE</PillTab> : null}
                    {dados.dra?.length ? <PillTab value="dra">DRA</PillTab> : null}
                    {dados.dmpl?.length ? <PillTab value="dmpl">DMPL</PillTab> : null}
                    {dados.dfc ? <PillTab value="dfc">DFC</PillTab> : null}
                  </TabsList>

                  {dados.dre?.length ? (
                    <TabsContent value="dre" className="mt-6 animate-fade-up">
                      <FinancialTable
                        rows={dados.dre.map((r) => ({
                          item: r.item,
                          valor: r.valor,
                          highlight: r.tipo === "resultado",
                          isGroup: r.tipo === "receita",
                        }))}
                      />
                    </TabsContent>
                  ) : null}

                  {dados.balanco_patrimonial ? (
                    <TabsContent value="bp" className="mt-6 animate-fade-up">
                      <div className="grid md:grid-cols-3 gap-4">
                        <BPColumn title="Ativo" rows={dados.balanco_patrimonial.ativo} />
                        <BPColumn title="Passivo" rows={dados.balanco_patrimonial.passivo} />
                        <BPColumn title="Patrimônio Líquido" rows={dados.balanco_patrimonial.patrimonio_liquido} />
                      </div>
                    </TabsContent>
                  ) : null}

                  {dados.dra?.length ? (
                    <TabsContent value="dra" className="mt-6 animate-fade-up">
                      <FinancialTable rows={dados.dra} />
                    </TabsContent>
                  ) : null}

                  {dados.dfc ? (
                    <TabsContent value="dfc" className="mt-6 animate-fade-up space-y-8">
                      {dados.dfc.operacional?.length ? <DFCBlock title="Operacional" rows={dados.dfc.operacional} /> : null}
                      {dados.dfc.investimento?.length ? <DFCBlock title="Investimento" rows={dados.dfc.investimento} /> : null}
                      {dados.dfc.financiamento?.length ? <DFCBlock title="Financiamento" rows={dados.dfc.financiamento} /> : null}
                    </TabsContent>
                  ) : null}

                  {dados.dmpl?.length ? (
                    <TabsContent value="dmpl" className="mt-6 animate-fade-up">
                      <FinancialTable rows={dados.dmpl} />
                    </TabsContent>
                  ) : null}
                </Tabs>
              </div>
            </div>
          </Section>
        )}

        {/* NOTAS */}
        {dados.notas_explicativas?.length ? (
          <Section>
            <div id="notas" className="bg-card border border-border rounded-xl shadow-soft p-6">
              <SectionTitle eyebrow="Anexos" title="Notas explicativas" icon={ScrollText} inline />
              <div className="space-y-5 mt-6">
                {dados.notas_explicativas.map((n, i) => (
                  <div key={i} className="border-l-2 pl-4" style={{ borderColor: C_GOLD }}>
                    <h4 className="font-semibold text-foreground mb-1">{n.titulo}</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{n.conteudo}</p>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        ) : null}


        {dados.observacoes && (
          <Section>
            <div className="bg-card border border-border rounded-xl shadow-soft p-6">
              <SectionTitle eyebrow="Adicional" title="Observações" icon={FileText} inline />
              <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-4 leading-relaxed">
                {dados.observacoes}
              </p>
            </div>
          </Section>
        )}

        {dados.assinaturas?.length ? (
          <div className="flex flex-wrap gap-10 pt-8 border-t border-border">
            {dados.assinaturas.map((a, i) => (
              <div key={i} className="text-center">
                <div className="w-44 border-b border-foreground/40 mb-2 h-10" />
                <p className="text-sm font-semibold" style={{ color: C_PRIMARY }}>{a.nome}</p>
                {a.cargo && <p className="text-xs text-muted-foreground">{a.cargo}</p>}
              </div>
            ))}
          </div>
        ) : null}
      </main>

      {/* FOOTER */}
      <footer
        className="no-print relative mt-12 text-white"
        style={{ background: C_PRIMARY }}
      >
        <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: C_GOLD }} />
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em]" style={{ color: C_GOLD }}>
              JS Contadores
            </div>
            <p className="text-sm text-white/80 mt-1">
              Gerado por JS Contadores • {new Date().toLocaleDateString("pt-BR")}
            </p>
          </div>
          <p className="text-xs text-white/60">Documento contábil digital — confidencial</p>
        </div>
      </footer>
    </div>
  );
}

/* ====================== Helpers ====================== */

function Section({ children }: { children: React.ReactNode }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section ref={ref} className="reveal">
      {children}
    </section>
  );
}

function SectionTitle({
  eyebrow, title, icon: Icon, inline,
}: { eyebrow?: string; title: string; icon?: any; inline?: boolean }) {
  return (
    <div className={inline ? "flex items-center gap-3 flex-wrap" : ""}>
      <div>
        {eyebrow && (
          <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1">
          {Icon && <Icon className="size-5" style={{ color: C_PRIMARY }} />}
          <h2 className="text-xl md:text-2xl font-bold tracking-tight" style={{ color: C_PRIMARY }}>
            {title}
          </h2>
        </div>
      </div>
    </div>
  );
}

function Chip({
  children,
  intent = "neutral",
}: { children: React.ReactNode; intent?: "neutral" | "positive" | "negative" }) {
  const color = intent === "positive" ? C_GREEN : intent === "negative" ? C_RED : C_PRIMARY;
  const bg =
    intent === "positive"
      ? "rgba(22,163,74,0.08)"
      : intent === "negative"
      ? "rgba(220,38,38,0.08)"
      : "rgba(26,58,92,0.06)";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border"
      style={{ color, background: bg, borderColor: "rgba(26,58,92,0.12)" }}
    >
      {children}
    </span>
  );
}

function ChartCard({
  icon: Icon, title, children, className = "",
}: { icon: any; title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-xl shadow-soft p-6 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="size-4" style={{ color: C_PRIMARY }} />
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function PillTab({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-[var(--primary)] data-[state=active]:text-white data-[state=active]:shadow-soft transition-all"
    >
      {children}
    </TabsTrigger>
  );
}

function FinancialTable({
  rows,
}: {
  rows: { item: string; valor: number; highlight?: boolean; isGroup?: boolean }[];
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="overflow-x-auto -mx-2 md:mx-0">
      <table className="w-full text-sm min-w-[420px]">
        <thead>
          <tr style={{ background: C_PRIMARY, color: "white" }}>
            <th className="text-left font-semibold px-4 py-3 rounded-l-md">Descrição</th>
            <th className="text-right font-semibold px-4 py-3 rounded-r-md">Valor (R$)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const negative = r.valor < 0;
            const rowStyle: React.CSSProperties = r.highlight
              ? { background: C_PRIMARY, color: "white", fontWeight: 700 }
              : r.isGroup
              ? { background: "var(--row-group)", color: C_PRIMARY, fontWeight: 600 }
              : { background: i % 2 ? "var(--row-alt)" : "white" };
            return (
              <tr
                key={i}
                data-reveal-item
                data-reveal-delay="30"
                className="reveal border-b border-border transition-colors hover:!bg-[var(--row-hover)]"
                style={rowStyle}
              >
                <td className="px-4 py-2.5">{r.item}</td>
                <td
                  className="px-4 py-2.5 text-right tabular-nums"
                  style={{
                    color: r.highlight
                      ? "white"
                      : negative
                      ? C_RED
                      : r.isGroup
                      ? C_PRIMARY
                      : undefined,
                  }}
                >
                  {brlFull(r.valor)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DFCBlock({ title, rows }: { title: string; rows: { item: string; valor: number }[] }) {
  return (
    <div>
      <h4 className="font-semibold text-xs uppercase tracking-[0.16em] text-muted-foreground mb-3">{title}</h4>
      <FinancialTable rows={rows} />
    </div>
  );
}

function BPColumn({ title, rows }: { title: string; rows?: { item: string; valor: number }[] }) {
  const total = rows?.reduce((s, r) => s + (r.valor || 0), 0) ?? 0;
  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden">
      <div className="px-4 py-3 text-white font-semibold text-sm" style={{ background: C_PRIMARY }}>
        {title}
      </div>
      <div className="divide-y divide-border">
        {rows?.map((r, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs hover:bg-[var(--row-hover)]">
            <span className="text-muted-foreground">{r.item}</span>
            <span className="tabular-nums font-medium" style={{ color: r.valor < 0 ? C_RED : "inherit" }}>
              {brl(r.valor)}
            </span>
          </div>
        ))}
      </div>
      <div
        className="flex items-center justify-between px-4 py-3 text-sm font-bold border-t border-border"
        style={{ background: "var(--row-group)", color: C_PRIMARY }}
      >
        <span>Total</span>
        <span className="tabular-nums">{brl(total)}</span>
      </div>
    </div>
  );
}

/* ====================== Header KPI cards ====================== */

function formatBRWithParens(v: number | undefined) {
  if (typeof v !== "number" || !isFinite(v)) return "—";
  if (v < 0) return `(${brl(Math.abs(v))})`;
  return brl(v);
}

function KpiHeaderCard({
  label,
  value,
  icon: Icon,
  trendPct,
  compareValue,
  compareLabel,
  negativeAware,
  subtitle,
}: {
  label: string;
  value?: number;
  icon: any;
  trendPct?: number | null;
  compareValue?: number;
  compareLabel?: string;
  negativeAware?: boolean;
  subtitle?: string;
}) {
  const isNeg = negativeAware && typeof value === "number" && value < 0;
  return (
    <div className="hover-lift bg-card border border-border rounded-xl p-4 shadow-soft">
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </p>
        <div
          className="size-8 rounded-lg grid place-items-center"
          style={{
            background: isNeg ? "rgba(220,38,38,0.10)" : "rgba(26, 58, 92, 0.08)",
            color: isNeg ? C_RED : C_PRIMARY,
          }}
        >
          <Icon className="size-4" />
        </div>
      </div>
      <p
        className="text-xl md:text-[24px] font-bold tracking-tight tabular-nums leading-tight"
        style={{ color: isNeg ? C_RED : C_PRIMARY }}
      >
        {negativeAware ? formatBRWithParens(value) : brl(value)}
      </p>
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        {typeof trendPct === "number" && isFinite(trendPct) && (
          <span
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold"
            style={{ color: trendPct >= 0 ? C_GREEN : C_RED }}
          >
            {trendPct >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {trendPct.toFixed(1)}%
          </span>
        )}
        {typeof compareValue === "number" && compareLabel && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            vs {brl(compareValue)} ({compareLabel})
          </span>
        )}
        {subtitle && (
          <span className="text-[11px] text-muted-foreground">{subtitle}</span>
        )}
      </div>
    </div>
  );
}

type LiqIdx = { label: string; value: number | null; good: number; warn: number };

function liqStatus(ix: LiqIdx): { color: string; bg: string; label: string } {
  if (ix.value === null || !isFinite(ix.value))
    return { color: "#6B7280", bg: "rgba(107,114,128,0.12)", label: "—" };
  if (ix.value >= ix.good) return { color: C_GREEN, bg: "rgba(22,163,74,0.12)", label: "Saudável" };
  if (ix.value >= ix.warn) return { color: "#D97706", bg: "rgba(217,119,6,0.14)", label: "Atenção" };
  return { color: C_RED, bg: "rgba(220,38,38,0.12)", label: "Crítico" };
}

function LiquidezHeaderCard({
  indices,
  media,
  open,
  onToggle,
}: {
  indices: LiqIdx[];
  media: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  const allEmpty = indices.every((i) => i.value === null);
  const aggStatus = media !== null ? liqStatus({ label: "", value: media, good: 1.2, warn: 0.9 }) : null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-left hover-lift bg-card border border-border rounded-xl p-4 shadow-soft focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          Índices de Liquidez
        </p>
        <div
          className="size-8 rounded-lg grid place-items-center"
          style={{
            background: aggStatus?.bg ?? "rgba(26, 58, 92, 0.08)",
            color: aggStatus?.color ?? C_PRIMARY,
          }}
        >
          <Activity className="size-4" />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-xl md:text-[24px] font-bold tracking-tight tabular-nums leading-tight" style={{ color: aggStatus?.color ?? C_PRIMARY }}>
          {media !== null ? media.toFixed(2) : "—"}
        </p>
        {aggStatus && !allEmpty && (
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: aggStatus.color }}>
            {aggStatus.label}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">Média dos 4 índices</span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: C_PRIMARY }}>
          {open ? "Recolher" : "Expandir"}
          <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </div>
    </button>
  );
}

function LiquidezRow(ix: LiqIdx) {
  const s = liqStatus(ix);
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {ix.label}
        </span>
        <span
          className="size-2.5 rounded-full"
          style={{ background: s.color, boxShadow: `0 0 0 3px ${s.bg}` }}
          aria-label={s.label}
          title={s.label}
        />
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-bold tabular-nums" style={{ color: s.color }}>
          {ix.value !== null && isFinite(ix.value) ? ix.value.toFixed(2) : "—"}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: s.color }}>
          {s.label}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">
        Saudável ≥ {ix.good.toFixed(2)} · Atenção ≥ {ix.warn.toFixed(2)}
      </p>
    </div>
  );
}

