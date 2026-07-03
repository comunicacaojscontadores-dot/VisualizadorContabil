import "@/styles/public-report.css";
import { useEffect } from "react";
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

const fmtN = (v?: number | null, parens = false): string => {
  if (v == null) return "—";
  if (parens && v < 0) return `(${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.abs(v))})`;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
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
}: {
  rows: LineItem[];
  col1: string;
  col2?: string;
  parens?: boolean;
}) {
  const hasAnt = rows.some((r) => r.valor_ant != null);
  return (
    <div className="pr-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Descrição</th>
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
                <td>{r.item}</td>
                {col2 && <td style={{ color: "var(--accent-mid)", fontFamily: "monospace", fontSize: 11 }}>{r.nota ?? ""}</td>}
                <td className={neg && !isGrupo ? "neg" : ""}>{isGrupo ? "" : fmtN(r.valor, parens)}</td>
                {hasAnt && col2 && (
                  <td className={negAnt && !isGrupo ? "neg" : ""}>{isGrupo ? "" : fmtN(r.valor_ant, parens)}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── nota com tabelas internas ─────────────────────────────────────
function NotaBlock({ n, idx }: { n: NonNullable<DemoData["notas_explicativas"]>[number]; idx: number }) {
  return (
    <div className="pr-nota">
      <div className="pr-nota__num">Nota {n.numero ?? idx + 1}</div>
      <div className="pr-nota__title">{n.titulo}</div>
      {n.conteudo && <p className="pr-nota__text">{n.conteudo}</p>}
      {n.tabelas?.map((t, ti) => (
        <div key={ti} className="pr-table-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead>
              <tr>{t.colunas.map((c, ci) => <th key={ci}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {t.linhas.map((l, li) => (
                <tr key={li} className={l.descricao.toLowerCase().includes("total") ? "pr-tr-total" : ""}>
                  <td>{l.descricao}</td>
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

// ── componente principal ──────────────────────────────────────────
export function PublicReport({ dados, cliente, competencia, publishedAt }: Props) {
  useEffect(() => {
    const id = "pr-gfonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id; link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  const nomeCliente = cliente?.nome_fantasia || cliente?.razao_social || dados.empresa?.nome || "Cliente";
  const cnpj = cliente?.cnpj || dados.empresa?.cnpj;
  const logoUrl = cliente?.logo_url;
  const comp = (competencia || dados.competencia || "").toUpperCase();
  const compAnt = (dados.competencia_anterior || "").toUpperCase();
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

  const lucroNeg = (kpis.lucro ?? 0) < 0;

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

          {/* KPIs */}
          {(kpis.faturamento != null || kpis.lucro != null || kpis.impostos != null || kpis.folha != null) && (
            <div className="pr-kpi-grid no-print">
              {kpis.faturamento != null && (
                <div className="pr-kpi-card">
                  <div className="pr-kpi-card__top">
                    <div className="pr-kpi-card__label">Receita Líquida</div>
                    <div className="pr-kpi-card__icon icon-blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>
                  </div>
                  <div className="pr-kpi-card__value">{fmtBRL(kpis.faturamento)}</div>
                  <div className="pr-kpi-card__note">Receita bruta do período</div>
                </div>
              )}
              {kpis.lucro != null && (
                <div className="pr-kpi-card">
                  <div className="pr-kpi-card__top">
                    <div className="pr-kpi-card__label">Resultado Líquido</div>
                    <div className={`pr-kpi-card__icon ${lucroNeg ? "icon-red" : "icon-green"}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
                  </div>
                  <div className={`pr-kpi-card__value ${lucroNeg ? "danger" : "success"}`}>
                    {lucroNeg ? `(${fmtBRL(Math.abs(kpis.lucro!))})` : fmtBRL(kpis.lucro)}
                  </div>
                  <div className="pr-kpi-card__note">Lucro/Prejuízo do exercício</div>
                </div>
              )}
              {kpis.impostos != null && (
                <div className="pr-kpi-card">
                  <div className="pr-kpi-card__top">
                    <div className="pr-kpi-card__label">Impostos</div>
                    <div className="pr-kpi-card__icon icon-navy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="22" x2="21" y2="22"/><rect x="2" y="9" width="4" height="13"/><rect x="10" y="5" width="4" height="17"/><rect x="18" y="2" width="4" height="20"/></svg></div>
                  </div>
                  <div className="pr-kpi-card__value">{fmtBRL(kpis.impostos)}</div>
                  <div className="pr-kpi-card__note">Carga tributária total</div>
                </div>
              )}
              {kpis.folha != null && (
                <div className="pr-kpi-card">
                  <div className="pr-kpi-card__top">
                    <div className="pr-kpi-card__label">Folha de Pagamento</div>
                    <div className="pr-kpi-card__icon icon-amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></div>
                  </div>
                  <div className="pr-kpi-card__value">{fmtBRL(kpis.folha)}</div>
                  <div className="pr-kpi-card__note">Salários e encargos</div>
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

              <div className="bp-grid">
                {/* ATIVO */}
                {(bp.ativo?.length ?? 0) > 0 && (
                  <CompTable rows={bp.ativo!} col1={comp || "Atual"} col2={compAnt || (bp.ativo!.some(r => r.valor_ant != null) ? "Anterior" : undefined)} />
                )}
                {/* PASSIVO + PL */}
                <div>
                  {(bp.passivo?.length ?? 0) > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <CompTable rows={bp.passivo!} col1={comp || "Atual"} col2={compAnt || (bp.passivo!.some(r => r.valor_ant != null) ? "Anterior" : undefined)} />
                    </div>
                  )}
                  {(bp.patrimonio_liquido?.length ?? 0) > 0 && (
                    <CompTable rows={bp.patrimonio_liquido!} col1={comp || "Atual"} col2={compAnt || (bp.patrimonio_liquido!.some(r => r.valor_ant != null) ? "Anterior" : undefined)} />
                  )}
                </div>
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
                      const isTotal = l.descricao.toLowerCase().includes("saldo") || l.descricao.toLowerCase().includes("total");
                      const isMut = l.descricao.toLowerCase().includes("mutação");
                      return (
                        <tr key={i} className={isTotal ? "pr-tr-total" : isMut ? "pr-tr-subtotal" : ""}>
                          <td>{l.descricao}</td>
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
