import "@/styles/public-report.css";
import { useEffect, useState } from "react";
import type { DemoData, LineItem } from "@/lib/demo-types";

type Cliente = {
  razao_social?: string | null;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  logo_url?: string | null;
} | null;

interface Props {
  dados: DemoData;
  cliente: Cliente;
  competencia?: string | null;
  publishedAt?: string | null;
}

// ── formatadores ──────────────────────────────────────────────────
const fmtBRL = (v?: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

// Em demonstração contábil, ausência de valor se escreve com traço — não com
// zero nem com célula vazia.
const fmtN = (v?: number | null, parens = false): string => {
  if (v == null || v === 0) return "-";
  if (parens && v < 0) return `(${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.abs(v))})`;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
};

// A coluna da demonstração é datada pelo último dia do período: "12/2025" vira
// "31/12/2025". Uma competência já escrita por extenso passa direto.
const rotuloData = (c?: string | null): string => {
  const s = (c || "").trim();
  if (!s) return "";
  const mm = s.match(/^(\d{2})\/(\d{4})$/);
  if (!mm) return s;
  const mes = Number(mm[1]);
  const ano = Number(mm[2]);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return `${String(ultimoDia).padStart(2, "0")}/${mm[1]}/${ano}`;
};

const cleanItem = (s?: string | null): string => {
  if (!s) return "";
  return s
    .replace(/\s*\(grupo[^)]*\)/gi, "")
    .replace(/\s*\(tipo[^)]*\)/gi, "")
    .replace(/,\s*(saldo|subtotal|resultado|grupo)\b.*/gi, "")
    .replace(/\s*-\s*(C|D)\s*$/gi, "")
    .trim();
};

function initials(name?: string | null) {
  if (!name) return "JS";
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ── componente de tabela comparativa ─────────────────────────────
function CompTable({
  rows,
  col1,
  col2,
  parens = true,
  titulo = "Descrição",
}: {
  rows: LineItem[];
  col1: string;
  col2?: string;
  parens?: boolean;
  titulo?: string;
}) {
  const hasAnt = rows.some((r) => r.valor_ant != null);
  return (
    <div className="pr-table-wrap">
      <table>
        <thead>
          <tr>
            <th>{titulo}</th>
            {col2 && <th style={{ width: 80, fontSize: 10 }}>Nota</th>}
            <th>{col1}</th>
            {hasAnt && col2 && <th>{col2}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isGrupo = r.tipo === "grupo";
            const isSubtotal = r.tipo === "subtotal" || r.tipo === "resultado";
            const neg = r.valor < 0;
            const negAnt = (r.valor_ant ?? 0) < 0;
            return (
              <tr
                key={i}
                className={
                  isGrupo
                    ? "pr-tr-grupo"
                    : isSubtotal
                    ? "pr-tr-total"
                    : r.indent
                    ? "pr-tr-indent"
                    : ""
                }
              >
                <td>{cleanItem(r.item)}</td>
                {col2 && <td style={{ color: "var(--accent-mid)", fontFamily: "monospace", fontSize: 11 }}>{r.nota ?? ""}</td>}
                {/* A linha de grupo carrega o total da seção — "circulante, não
                    circulante, patrimônio líquido, cada um com seus totais". */}
                <td className={neg ? "neg" : ""}>{fmtN(r.valor, parens)}</td>
                {hasAnt && col2 && (
                  <td className={negAnt ? "neg" : ""}>{fmtN(r.valor_ant, parens)}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// No Word, as linhas de fechamento vêm com fundo azul claro e negrito:
// "Saldo em 31/12/2025", "Mutações do Período", "Saldo Contábil, líquido",
// "Total". É o grifo que o relatório online tem de repetir.
const linhaGrifada = (descricao?: string | null): boolean => {
  const t = (descricao || "").trim().toLowerCase();
  return ["saldo", "mutaç", "mutac", "total"].some((prefixo) => t.startsWith(prefixo));
};

// O corpo de uma nota mistura parágrafos e subtítulos numerados ("3.1. Caixa e
// equivalentes", "17.2. Reservas"). Sem distinguir os dois, tudo vira um bloco
// cinzento de texto e some a hierarquia que o documento impresso tem.
function NotaTexto({ texto }: { texto: string }) {
  const paragrafos = texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <>
      {paragrafos.map((p, i) => {
        const subtitulo = /^\d+\.\d+\.?\s+\S/.test(p) && p.length < 90;
        const rotulo = !subtitulo && /^[A-ZÀ-Ú][^.!?]{3,70}$/.test(p) && !p.endsWith(".");
        if (subtitulo || rotulo) {
          return <div key={i} className="pr-nota__subtitle">{p}</div>;
        }
        return <p key={i} className="pr-nota__text">{p}</p>;
      })}
    </>
  );
}

// ── nota com tabelas internas ─────────────────────────────────────
function NotaBlock({ n, idx }: { n: NonNullable<DemoData["notas_explicativas"]>[number]; idx: number }) {
  return (
    <div className="pr-nota">
      <div className="pr-nota__num">Nota {n.numero ?? idx + 1}</div>
      <div className="pr-nota__title">{n.titulo}</div>
      {n.conteudo && <NotaTexto texto={n.conteudo} />}
      {n.tabelas?.map((t, ti) => (
        <div key={ti} className="pr-table-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead>
              {/* A primeira coluna da nota não leva rótulo: a tabela vai direto
                  para as informações, com as datas por cima dos valores. */}
              <tr>{t.colunas.map((c, ci) => (
                <th key={ci}>{ci === 0 && /^descri/i.test(c) ? "" : c}</th>
              ))}</tr>
            </thead>
            <tbody>
              {t.linhas.map((l, li) => (
                <tr key={li} className={linhaGrifada(l.descricao) ? "pr-tr-grifo" : ""}>
                  <td>{cleanItem(l.descricao)}</td>
                  {l.valores.map((v, vi) => (
                    <td key={vi} className={typeof v === "number" && v < 0 ? "neg" : ""}>
                      {typeof v === "number" ? fmtN(v, true) : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ── KPI row por seção ─────────────────────────────────────────────
function SectionKpis({ items }: { items: { label: string; value: string; note?: string; neg?: boolean }[] }) {
  return (
    <div className="pr-section-kpi-row">
      {items.map((it, i) => (
        <div key={i} className="pr-section-kpi-item">
          <div className="pr-section-kpi-label">{it.label}</div>
          <div className={`pr-section-kpi-value${it.neg ? " neg" : ""}`}>{it.value}</div>
          {it.note && <div className="pr-section-kpi-note">{it.note}</div>}
        </div>
      ))}
    </div>
  );
}

// ── componente principal ──────────────────────────────────────────
export function PublicReport({ dados, cliente, competencia, publishedAt }: Props) {
  useEffect(() => {
    const id = "pr-gfonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id; link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  const nomeCliente = cliente?.nome_fantasia || cliente?.razao_social || dados.empresa?.nome || "Cliente";
  const cnpj = cliente?.cnpj || dados.empresa?.cnpj;
  const logoUrl = cliente?.logo_url;
  const comp = rotuloData(competencia || dados.competencia);
  const compAnt = rotuloData(dados.competencia_anterior);
  const pubDate = publishedAt ? new Date(publishedAt).toLocaleDateString("pt-BR") : "";

  const kpis = dados.kpis ?? {};
  const bp = dados.balanco_patrimonial;
  const dre = dados.dre ?? [];
  const dra = dados.dra ?? [];
  const dmpl = dados.dmpl;
  const dfc = dados.dfc;
  const notas = dados.notas_explicativas ?? [];
  const assinaturas = dados.assinaturas ?? [];

  const totalAtivo = bp?.ativo?.filter(r => r.tipo !== "grupo").reduce((s, r) => s + (r.tipo === "subtotal" ? 0 : r.valor ?? 0), 0) ?? 0;
  const totalAtivoAnt = bp?.ativo?.filter(r => r.tipo !== "grupo").reduce((s, r) => s + (r.tipo === "subtotal" ? 0 : r.valor_ant ?? 0), 0) ?? 0;

  // ── KPIs derivados da DRE e BP ─────────────────────────────────
  const findRow = (rows: LineItem[] | undefined, kws: string[]) =>
    rows?.find((r) => r.item && kws.every((k) => r.item.toLowerCase().includes(k)));
  // Total de uma seção do balanço. Um balanço estruturado repete o mesmo dinheiro
  // três vezes — na linha de grupo, nas linhas analíticas e no subtotal — então
  // somar tudo triplicava o total. Prefere o subtotal declarado (TOTAL DO ATIVO);
  // sem ele, soma apenas as analíticas.
  const sumRows = (rows?: LineItem[]) => {
    if (!rows?.length) return 0;
    const subtotais = rows.filter((r) => r.tipo === "subtotal" && r.valor != null);
    if (subtotais.length) return subtotais[subtotais.length - 1].valor;
    return rows.filter((r) => r.tipo !== "grupo").reduce((s, r) => s + (r.valor || 0), 0);
  };

  const receitaLiquida = (() => {
    const named = findRow(dre, ["receita", "líquida"]) ?? findRow(dre, ["receita", "liquida"]);
    if (named?.valor != null && named.valor !== 0) return named.valor;
    const dreReceitas = dre.filter((r) => r.tipo === "receita").reduce((s, r) => s + (r.valor ?? 0), 0);
    if (dreReceitas !== 0) return dreReceitas;
    return kpis.faturamento;
  })();

  // Busca o último item tipo=resultado na DRE (resultado final, não subtotais)
  const dreResultados = dre.filter((r) => r.tipo === "resultado" && r.valor != null);
  const dreResultadoFinal = dreResultados.length ? dreResultados[dreResultados.length - 1] : null;
  const dreNamed =
    findRow(dre, ["lucro", "líquido"]) ??
    findRow(dre, ["lucro", "liquido"]) ??
    findRow(dre, ["resultado", "período"]) ??
    findRow(dre, ["resultado", "periodo"]);
  const lucroLiquido = (() => {
    // Prefere linha nomeada, depois último resultado, depois kpi
    const fromDre = dreNamed ?? dreResultadoFinal;
    if (fromDre?.valor != null && fromDre.valor !== 0) return fromDre.valor;
    if (kpis.lucro != null && kpis.lucro !== 0) return kpis.lucro;
    // Aceita 0 como valor válido se algo explícito existe
    if (fromDre?.valor != null) return fromDre.valor;
    return kpis.lucro;
  })();

  const patrimonioLiquido = bp?.patrimonio_liquido ? sumRows(bp.patrimonio_liquido) : undefined;

  // O passivo e o PL são uma coluna só no modelo do escritório: o PL entra como
  // mais um grupo, e o TOTAL DO PASSIVO no fim engloba os três grupos.
  const passivoComPl = (() => {
    const passivo = bp?.passivo ?? [];
    const pl = bp?.patrimonio_liquido ?? [];
    if (!pl.length) return passivo;

    const semTotalGeral = passivo.filter((r) => r.tipo !== "subtotal");
    const totalPassivo = passivo.find((r) => r.tipo === "subtotal");
    const totalPl = pl.find((r) => r.tipo === "subtotal");
    const itensPl = pl.filter((r) => r.tipo !== "subtotal");

    const linhas: LineItem[] = [
      ...semTotalGeral,
      { item: "Patrimônio Líquido", valor: totalPl?.valor ?? sumRows(pl),
        valor_ant: totalPl?.valor_ant, tipo: "grupo" },
      ...itensPl.map((r) => ({ ...r, indent: true })),
    ];
    if (totalPassivo) {
      linhas.push({
        item: "TOTAL DO PASSIVO",
        valor: (totalPassivo.valor ?? 0) + (totalPl?.valor ?? 0),
        valor_ant: (totalPassivo.valor_ant ?? 0) + (totalPl?.valor_ant ?? 0),
        tipo: "subtotal",
      });
    }
    return linhas;
  })();
  const margem = receitaLiquida && lucroLiquido != null ? (lucroLiquido / receitaLiquida) * 100 : null;

  // Índices de liquidez
  const casaTermos = (item: string | undefined, inc: string[], exc: string[]) => {
    if (!item) return false;
    const t = item.toLowerCase();
    return inc.every((w) => t.includes(w)) && exc.every((w) => !t.includes(w));
  };
  // Soma apenas linhas analíticas — grupos e subtotais são agregados dos filhos.
  const matchVal = (rows: LineItem[], inc: string[], exc: string[] = []) =>
    rows.filter((r) => r.tipo !== "grupo" && r.tipo !== "subtotal" && casaTermos(r.item, inc, exc))
        .reduce((s, r) => s + r.valor, 0);
  // Valor da linha de grupo (ex.: "Ativo Circulante"). Quando ela existe, é o total
  // da seção: somá-la com os filhos contava "Outros Ativos Circulantes" duas vezes.
  const grupoVal = (rows: LineItem[], inc: string[], exc: string[] = []) =>
    rows.find((r) => r.tipo === "grupo" && casaTermos(r.item, inc, exc))?.valor ?? null;
  const ativos = bp?.ativo ?? [];
  const passivos = bp?.passivo ?? [];

  // Itens não-circulantes do ativo (imobilizado, intangível, etc.)
  const NCIRC_ATIVO = ["imobilizado", "intangível", "intangivel", "investimento", "realizável", "realizavel", "diferido"];
  const isNaoCircAtivo = (item: string) => NCIRC_ATIVO.some((w) => item.toLowerCase().includes(w));
  // Se existir item com "circulante" no nome, usa; senão, subtrai não-circulantes do total
  const ativoCircExplicit =
    grupoVal(ativos, ["circulante"], ["não", "nao"]) ?? matchVal(ativos, ["circulante"], ["não", "nao"]);
  const ativoNaoCircExplicit =
    grupoVal(ativos, ["não", "circulante"]) ?? grupoVal(ativos, ["nao", "circulante"]) ??
    (matchVal(ativos, ["não", "circulante"]) || matchVal(ativos, ["nao", "circulante"]));
  const ativoNaoCirc = ativoNaoCircExplicit || ativos.filter(r => r.tipo !== "grupo" && r.tipo !== "subtotal" && r.item && isNaoCircAtivo(r.item)).reduce((s, r) => s + r.valor, 0);
  const ativoTotal = sumRows(ativos);
  const ativoCirc = ativoCircExplicit || (ativoTotal - ativoNaoCirc);

  const estoques = matchVal(ativos, ["estoque"]);
  const caixa = matchVal(ativos, ["caixa"]) || matchVal(ativos, ["equivalente"]);

  // Passivo circulante: usa explícito ou subtrai não-circulantes
  const NCIRC_PASSIVO = ["não circulante", "nao circulante", "longo prazo", "exigível", "exigivel"];
  const passivoCircExplicit =
    grupoVal(passivos, ["circulante"], ["não", "nao"]) ?? matchVal(passivos, ["circulante"], ["não", "nao"]);
  const passivoNaoCirc =
    grupoVal(passivos, ["não", "circulante"]) ?? grupoVal(passivos, ["nao", "circulante"]) ??
    (matchVal(passivos, ["não", "circulante"]) || matchVal(passivos, ["nao", "circulante"]) ||
      passivos.filter(r => r.tipo !== "grupo" && r.tipo !== "subtotal" && r.item && NCIRC_PASSIVO.some(w => r.item.toLowerCase().includes(w))).reduce((s, r) => s + r.valor, 0));
  const passivoTotal = sumRows(passivos);
  const passivoCirc = passivoCircExplicit || (passivoTotal - passivoNaoCirc);

  const lc = passivoCirc ? ativoCirc / passivoCirc : null;
  const ls = passivoCirc ? (ativoCirc - estoques) / passivoCirc : null;
  const li = passivoCirc ? caixa / passivoCirc : null;
  const lg = (passivoCirc + passivoNaoCirc) ? (ativoCirc + ativoNaoCirc) / (passivoCirc + passivoNaoCirc) : null;

  const liqIndices = [
    { label: "Liquidez Corrente", value: lc, good: 1.5, warn: 1.0, desc: "Saudável ≥ 1,50 · Atenção ≥ 1,00" },
    { label: "Liquidez Seca", value: ls, good: 1.0, warn: 0.7, desc: "Saudável ≥ 1,00 · Atenção ≥ 0,70" },
    { label: "Liquidez Imediata", value: li, good: 0.3, warn: 0.15, desc: "Saudável ≥ 0,30 · Atenção ≥ 0,15" },
    { label: "Liquidez Geral", value: lg, good: 1.0, warn: 0.7, desc: "Saudável ≥ 1,00 · Atenção ≥ 0,70" },
  ];
  const liqMedia = (() => {
    const vs = liqIndices.map((x) => x.value).filter((v): v is number => typeof v === "number" && isFinite(v));
    return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
  })();

  const liqStatus = (v: number | null, good: number, warn: number) =>
    v == null ? "muted" : v >= good ? "green" : v >= warn ? "amber" : "red";

  const lucroNeg = (lucroLiquido ?? 0) < 0;
  const [liqOpen, setLiqOpen] = useState(false);

  // Nav links
  const navLinks = [
    bp && { id: "bp", label: "Balanço" },
    dre.length > 0 && { id: "dre", label: "DRE" },
    dra.length > 0 && { id: "dra", label: "DRA" },
    dmpl && { id: "dmpl", label: "DMPL" },
    dfc && { id: "dfc", label: "DFC" },
    notas.length > 0 && { id: "notas", label: "Notas" },
    assinaturas.length > 0 && { id: "assinaturas", label: "Assinaturas" },
  ].filter(Boolean) as { id: string; label: string }[];

  return (
    <>
      {/* ── CORPO ── */}
      <div className="pr-root">
        <div className="pr-shell">

          {/* Cabeçalho */}
          <div className="pr-header no-print">
            <div className="pr-header__top">
              <div className="pr-header__left">
                <div className="pr-header__icon">
                  {logoUrl
                    ? <img src={logoUrl} alt={nomeCliente} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "10px" }} />
                    : <span className="pr-header__initials">{initials(nomeCliente)}</span>}
                </div>
                <div>
                  <div className="pr-header__meta">JS Contadores · Demonstrativo</div>
                  <div className="pr-header__name">{nomeCliente.toUpperCase()}</div>
                  <div className="pr-header__sub">
                    {cnpj && <span className="pr-header__sub-item">CNPJ {cnpj}</span>}
                    {comp && (
                      <span className="pr-header__sub-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        Exercício <strong>{comp}</strong>
                      </span>
                    )}
                    {pubDate && (
                      <span className="pr-header__sub-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Publicado em {pubDate}
                      </span>
                    )}
                  </div>
                  <div className="pr-header__rule" />
                </div>
              </div>
              <div className="pr-header__actions">
                <button className="pr-btn" onClick={() => history.back()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                  Voltar
                </button>
                <button className="pr-btn primary" onClick={() => window.print()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  PDF
                </button>
              </div>
            </div>
          </div>

          {/* KPIs + Liquidez */}
          {(receitaLiquida != null || lucroLiquido != null || patrimonioLiquido != null || liqMedia != null) && (
            <div className="no-print">
              <div className="pr-kpi-grid">
                {receitaLiquida != null && (
                  <div className="pr-kpi-card">
                    <div className="pr-kpi-card__top">
                      <div className="pr-kpi-card__label">Receita Líquida</div>
                      <div className="pr-kpi-card__icon icon-blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>
                    </div>
                    <div className="pr-kpi-card__value">{fmtBRL(receitaLiquida)}</div>
                    <div className="pr-kpi-card__note">Receita do período</div>
                  </div>
                )}
                {lucroLiquido != null && (
                  <div className="pr-kpi-card">
                    <div className="pr-kpi-card__top">
                      <div className="pr-kpi-card__label">Lucro Líquido</div>
                      <div className={`pr-kpi-card__icon ${lucroNeg ? "icon-red" : "icon-green"}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
                    </div>
                    <div className={`pr-kpi-card__value ${lucroNeg ? "danger" : "success"}`}>
                      {lucroNeg ? `(${fmtBRL(Math.abs(lucroLiquido))})` : fmtBRL(lucroLiquido)}
                    </div>
                    {margem != null && <div className="pr-kpi-card__note">Margem {margem.toFixed(1)}%</div>}
                  </div>
                )}
                {patrimonioLiquido != null && (
                  <div className="pr-kpi-card">
                    <div className="pr-kpi-card__top">
                      <div className="pr-kpi-card__label">Patrimônio Líquido</div>
                      <div className="pr-kpi-card__icon icon-navy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="22" x2="21" y2="22"/><rect x="2" y="9" width="4" height="13"/><rect x="10" y="5" width="4" height="17"/><rect x="18" y="2" width="4" height="20"/></svg></div>
                    </div>
                    <div className="pr-kpi-card__value">{fmtBRL(patrimonioLiquido)}</div>
                    <div className="pr-kpi-card__note">Total do patrimônio</div>
                  </div>
                )}
                {liqMedia != null && (
                  <button className="pr-kpi-card pr-kpi-liq-btn" onClick={() => setLiqOpen((o) => !o)}>
                    <div className="pr-kpi-card__top">
                      <div className="pr-kpi-card__label">Índices de Liquidez</div>
                      <div className="pr-kpi-card__icon icon-green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
                    </div>
                    <div className="pr-kpi-liq-media">
                      <span className={`pr-kpi-liq-val liq-${liqStatus(liqMedia, 1.2, 0.9)}`}>{liqMedia.toFixed(2)}</span>
                      <span className={`pr-kpi-liq-badge liq-${liqStatus(liqMedia, 1.2, 0.9)}`}>
                        {liqStatus(liqMedia, 1.2, 0.9) === "green" ? "SAUDÁVEL" : liqStatus(liqMedia, 1.2, 0.9) === "amber" ? "ATENÇÃO" : "CRÍTICO"}
                      </span>
                    </div>
                    <div className="pr-kpi-card__note">Média dos 4 índices · {liqOpen ? "Recolher ▲" : "Ver detalhes ▼"}</div>
                  </button>
                )}
              </div>

              {/* Painel de liquidez expandível */}
              {liqOpen && liqMedia != null && (
                <div className="pr-liq-panel">
                  <div className="pr-liq-panel__title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    Painel de Índices de Liquidez
                  </div>
                  <div className="pr-liq-grid">
                    {liqIndices.map((ix) => {
                      const st = liqStatus(ix.value, ix.good, ix.warn);
                      return (
                        <div key={ix.label} className="pr-liq-card">
                          <div className="pr-liq-card__top">
                            <span className="pr-liq-card__label">{ix.label.toUpperCase()}</span>
                            <span className={`pr-liq-dot liq-dot-${st}`} />
                          </div>
                          <div className="pr-liq-card__row">
                            <span className={`pr-liq-card__val liq-${st}`}>{ix.value != null ? ix.value.toFixed(2) : "—"}</span>
                            <span className={`pr-liq-card__status liq-${st}`}>
                              {st === "green" ? "SAUDÁVEL" : st === "amber" ? "ATENÇÃO" : "CRÍTICO"}
                            </span>
                          </div>
                          <div className="pr-liq-card__desc">{ix.desc}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="pr-liq-footnote">Benchmark indicativo. Verde: saudável · Amarelo: atenção · Vermelho: abaixo do mínimo.</div>
                </div>
              )}
            </div>
          )}

          {/* Nav */}
          {navLinks.length > 0 && (
            <nav className="pr-nav no-print">
              <span className="pr-nav__brand">{nomeCliente}</span>
              <div className="pr-nav__links">
                {navLinks.map((l) => (
                  <a key={l.id} href={`#${l.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(l.id)?.scrollIntoView({ behavior: "smooth" }); }}>
                    {l.label}
                  </a>
                ))}
              </div>
            </nav>
          )}

          {/* ── BALANÇO PATRIMONIAL ── */}
          {bp && (
            <div id="bp" className="pr-section">
              <div className="pr-section__header">
                <div className="pr-section__eyebrow">Balanço Patrimonial</div>
                <div className="pr-section__title">Posição Patrimonial</div>
                {comp && <div className="pr-section__subtitle">Exercício findo em {comp}{compAnt ? ` e ${compAnt}` : ""} — valores em R$ mil</div>}
              </div>
              <div className="pr-section__note">As notas explicativas da administração são parte integrante das demonstrações contábeis.</div>

              <SectionKpis items={[
                { label: "Ativo Total", value: fmtBRL(ativoTotal), note: "Total do ativo" },
                { label: "Passivo Total", value: fmtBRL(passivoTotal), note: "Total do passivo" },
                { label: "Patrimônio Líquido", value: fmtBRL(patrimonioLiquido ?? 0), note: "Capital próprio" },
                { label: "Endividamento", value: passivoTotal && ativoTotal ? `${((passivoTotal / ativoTotal) * 100).toFixed(1)}%` : "—", note: "Passivo / Ativo" },
              ]} />

              <div className="bp-grid">
                {/* ATIVO */}
                {(bp.ativo?.length ?? 0) > 0 && (
                  <CompTable titulo="ATIVO" rows={bp.ativo!} col1={comp || "Atual"} col2={compAnt || (bp.ativo!.some(r => r.valor_ant != null) ? "Anterior" : undefined)} />
                )}
                {/* PASSIVO E PATRIMÔNIO LÍQUIDO — uma coluna só, como no modelo
                    do escritório: Circulante, Não Circulante e Patrimônio Líquido,
                    cada um com seu total, e um TOTAL DO PASSIVO fechando tudo. */}
                {passivoComPl.length > 0 && (
                  <CompTable
                    titulo="PASSIVO E PATRIMÔNIO LÍQUIDO"
                    rows={passivoComPl}
                    col1={comp || "Atual"}
                    col2={compAnt || (passivoComPl.some(r => r.valor_ant != null) ? "Anterior" : undefined)}
                  />
                )}
              </div>

              {/* Total check */}
              {totalAtivo > 0 && (
                <div className="pr-table-note">
                  Total do Ativo: <strong>R$ {fmtN(totalAtivo)} mil</strong>
                  {totalAtivoAnt > 0 && <> · Anterior: <strong>R$ {fmtN(totalAtivoAnt)} mil</strong></>}
                </div>
              )}
            </div>
          )}

          {/* ── DRE ── */}
          {dre.length > 0 && (
            <div id="dre" className="pr-section">
              <div className="pr-section__header">
                <div className="pr-section__eyebrow">DRE</div>
                <div className="pr-section__title">Demonstração do Resultado do Exercício</div>
                {comp && <div className="pr-section__subtitle">Exercícios findos em {comp}{compAnt ? ` e ${compAnt}` : ""} — valores em R$ mil</div>}
              </div>
              <div className="pr-section__note">As notas explicativas da administração são parte integrante das demonstrações contábeis.</div>
              {(() => {
                const lucroBruto = findRow(dre, ["lucro", "bruto"])?.valor ?? null;
                const margemBruta = receitaLiquida && lucroBruto != null ? (lucroBruto / receitaLiquida) * 100 : null;
                return (
                  <SectionKpis items={[
                    { label: "Receita Líquida", value: receitaLiquida != null ? fmtBRL(receitaLiquida) : "—", note: "do período" },
                    { label: "Lucro Bruto", value: lucroBruto != null ? fmtBRL(lucroBruto) : "—", note: margemBruta != null ? `Margem ${margemBruta.toFixed(1)}%` : undefined, neg: (lucroBruto ?? 0) < 0 },
                    { label: "Lucro Líquido", value: lucroLiquido != null ? fmtBRL(lucroLiquido) : "—", note: margem != null ? `Margem ${margem.toFixed(1)}%` : undefined, neg: (lucroLiquido ?? 0) < 0 },
                    { label: "Impostos", value: kpis.impostos != null ? fmtBRL(kpis.impostos) : "—", note: "Tributos do período" },
                  ]} />
                );
              })()}
              <CompTable rows={dre} col1={comp || "Atual"} col2={compAnt || (dre.some(r => r.valor_ant != null) ? "Anterior" : undefined)} />
            </div>
          )}

          {/* ── DRA ── */}
          {dra.length > 0 && (
            <div id="dra" className="pr-section">
              <div className="pr-section__header">
                <div className="pr-section__eyebrow">DRA</div>
                <div className="pr-section__title">Demonstração do Resultado Abrangente</div>
                {comp && <div className="pr-section__subtitle">Exercícios findos em {comp}{compAnt ? ` e ${compAnt}` : ""} — valores em R$ mil</div>}
              </div>
              <div className="pr-section__note">As notas explicativas da administração são parte integrante das demonstrações contábeis.</div>
              <CompTable rows={dra} col1={comp || "Atual"} col2={compAnt || (dra.some(r => r.valor_ant != null) ? "Anterior" : undefined)} />
            </div>
          )}

          {/* ── DMPL ── */}
          {dmpl && dmpl.linhas && dmpl.linhas.length > 0 && (
            <div id="dmpl" className="pr-section">
              <div className="pr-section__header">
                <div className="pr-section__eyebrow">DMPL</div>
                <div className="pr-section__title">Demonstração das Mutações do Patrimônio Líquido</div>
                {comp && <div className="pr-section__subtitle">Valores em R$ mil</div>}
              </div>
              <div className="pr-section__note">As notas explicativas da administração são parte integrante das demonstrações contábeis.</div>
              <div className="pr-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      {(dmpl.colunas ?? []).map((c, i) => <th key={i}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {dmpl.linhas.map((l, i) => {
                      return (
                        <tr key={i} className={linhaGrifada(l.descricao) ? "pr-tr-grifo" : ""}>
                          <td>{cleanItem(l.descricao)}</td>
                          {l.valores.map((v, vi) => (
                            <td key={vi} className={v < 0 ? "neg" : ""}>{fmtN(v, true)}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── DFC ── */}
          {dfc && (
            <div id="dfc" className="pr-section">
              <div className="pr-section__header">
                <div className="pr-section__eyebrow">DFC</div>
                <div className="pr-section__title">Demonstração dos Fluxos de Caixa</div>
                {comp && <div className="pr-section__subtitle">Método indireto — exercícios findos em {comp}{compAnt ? ` e ${compAnt}` : ""} — valores em R$ mil</div>}
              </div>
              <div className="pr-section__note">As notas explicativas da administração são parte integrante das demonstrações contábeis.</div>
              {dfc && (
                <SectionKpis items={[
                  { label: "Caixa Inicial", value: dfc.caixa_inicio != null ? fmtBRL(dfc.caixa_inicio) : "—", note: "início do exercício" },
                  { label: "Gerado Operacional", value: dfc.operacional ? fmtBRL(dfc.operacional.reduce((s, r) => s + (r.valor ?? 0), 0)) : "—", note: "atividades operacionais", neg: (dfc.operacional?.reduce((s,r)=>s+(r.valor??0),0)??0)<0 },
                  { label: "Caixa Final", value: dfc.caixa_fim != null ? fmtBRL(dfc.caixa_fim) : "—", note: "fim do exercício" },
                  { label: "Variação de Caixa", value: dfc.variacao_caixa != null ? fmtBRL(dfc.variacao_caixa) : "—", note: "no período", neg: (dfc.variacao_caixa ?? 0) < 0 },
                ]} />
              )}
              <div style={{ display: "grid", gap: 12 }}>
                {([
                  { key: "operacional" as const, label: "Atividades Operacionais", data: dfc.operacional },
                  { key: "investimento" as const, label: "Atividades de Investimento", data: dfc.investimento },
                  { key: "financiamento" as const, label: "Atividades de Financiamento", data: dfc.financiamento },
                ] as const).filter((g) => (g.data?.length ?? 0) > 0).map((grupo) => (
                  <CompTable key={grupo.key} rows={grupo.data!} col1={comp || "Atual"} col2={compAnt || (grupo.data!.some(r => r.valor_ant != null) ? "Anterior" : undefined)} />
                ))}
                {/* Variação de caixa */}
                {(dfc.variacao_caixa != null || dfc.caixa_inicio != null) && (
                  <div className="pr-table-wrap">
                    <table>
                      <tbody>
                        {dfc.variacao_caixa != null && (
                          <tr className="pr-tr-subtotal">
                            <td>Aumento (redução) de caixa e equivalentes</td>
                            <td className={dfc.variacao_caixa < 0 ? "neg" : ""}>{fmtN(dfc.variacao_caixa, true)}</td>
                            {dfc.variacao_caixa_ant != null && <td className={dfc.variacao_caixa_ant < 0 ? "neg" : ""}>{fmtN(dfc.variacao_caixa_ant, true)}</td>}
                          </tr>
                        )}
                        {dfc.caixa_inicio != null && (
                          <tr>
                            <td>Caixa e equivalentes no início do exercício</td>
                            <td>{fmtN(dfc.caixa_inicio)}</td>
                            {dfc.caixa_inicio_ant != null && <td>{fmtN(dfc.caixa_inicio_ant)}</td>}
                          </tr>
                        )}
                        {dfc.caixa_fim != null && (
                          <tr className="pr-tr-total">
                            <td>Caixa e equivalentes no final do exercício</td>
                            <td>{fmtN(dfc.caixa_fim)}</td>
                            {dfc.caixa_fim_ant != null && <td>{fmtN(dfc.caixa_fim_ant)}</td>}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── NOTAS EXPLICATIVAS ── */}
          {notas.length > 0 && (
            <div id="notas" className="pr-section">
              <div className="pr-section__header">
                <div className="pr-section__eyebrow">Notas Explicativas</div>
                <div className="pr-section__title">Notas Explicativas às Demonstrações Contábeis</div>
                {comp && <div className="pr-section__subtitle">Exercício findo em {comp} — valores em R$ mil</div>}
              </div>
              {notas.map((n, i) => <NotaBlock key={i} n={n} idx={i} />)}
            </div>
          )}
          {/* ── ANÁLISE IA ── */}
          {dados.analise && Object.values(dados.analise).some(Boolean) && (() => {
            const a = dados.analise!;
            const secoes = [
              { label: "Visão Geral", texto: a.visao_geral },
              { label: "Ativo", texto: a.ativo },
              { label: "Passivo e Endividamento", texto: a.passivo },
              { label: "Resultado (DRE)", texto: a.dre },
              { label: "Liquidez", texto: a.liquidez },
              { label: "Pontos de Atenção", texto: a.pontos_atencao },
              { label: "Perspectivas", texto: a.perspectivas },
              { label: "Nota do Contador", texto: a.nota_colaborador },
            ].filter((s) => s.texto);
            return (
              <div id="analise" className="pr-section">
                <div className="pr-section__header">
                  <div className="pr-section__eyebrow">Análise Contábil</div>
                  <div className="pr-section__title">Análise das Demonstrações Contábeis</div>
                  {comp && <div className="pr-section__subtitle">Exercício findo em {comp}</div>}
                </div>
                <div className="space-y-4">
                  {secoes.map((s) => (
                    <div key={s.label} className="rounded-xl border border-border/50 bg-background/60 p-5">
                      <div className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">{s.label}</div>
                      <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">{s.texto}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}


          {/* ── ASSINATURAS ── */}
          {assinaturas.length > 0 && (
            <div id="assinaturas" className="pr-section">
              <div className="pr-section__header">
                <div className="pr-section__eyebrow">Responsáveis</div>
                <div className="pr-section__title">Assinaturas</div>
              </div>
              <div className="pr-assinaturas">
                {assinaturas.map((a, i) => (
                  <div key={i} className="pr-assinatura">
                    <div className="pr-assinatura__linha" />
                    <div className="pr-assinatura__nome">{a.nome}</div>
                    {a.cargo && <div className="pr-assinatura__cargo">{a.cargo}</div>}
                    {a.cpf && <div className="pr-assinatura__cargo">CPF {a.cpf}</div>}
                    {a.crc && <div className="pr-assinatura__cargo">{a.crc}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <footer className="pr-footer no-print">
            <div>
              <div className="pr-footer__brand">JS Contadores</div>
              <div className="pr-footer__info">
                {cnpj && <>CNPJ {cnpj}<br /></>}
                Documento gerado por ContabilConnect{pubDate && ` · ${pubDate}`}
              </div>
            </div>
            <div className="pr-footer__badge">Confidencial</div>
          </footer>

        </div>
      </div>
    </>
  );
}
