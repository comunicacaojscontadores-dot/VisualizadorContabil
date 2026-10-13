import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listDemonstrativos, uploadDemonstrativo } from "@/lib/demonstrativos.functions";
import { listClientes } from "@/lib/clientes.functions";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/routes/_authenticated/dashboard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Upload, FileText, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/demonstrativos/")({
  component: DemosPage,
});

function DemosPage() {
  const listFn = useServerFn(listDemonstrativos);
  const cliFn = useServerFn(listClientes);
  const upFn = useServerFn(uploadDemonstrativo);
  const qc = useQueryClient();
  const { data: demos } = useQuery({ queryKey: ["demos"], queryFn: () => listFn() });
  const { data: clientes } = useQuery({ queryKey: ["clientes"], queryFn: () => cliFn() });

  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [competencia, setCompetencia] = useState("");
  const [loading, setLoading] = useState(false);

  function buildBalanceteAnaliticoText(rows: unknown[][]): string {
    const parseBalance = (cell: unknown): number => {
      let s = String(cell ?? "").trim();
      if (!s || s === "0,00" || s === "0.00" || s === "0") return 0;
      let sign = 1;
      if (s.endsWith(" D")) { sign = 1; s = s.slice(0, -2).trim(); }
      else if (s.endsWith(" C")) { sign = -1; s = s.slice(0, -2).trim(); }
      // Formato brasileiro: tem ponto de milhares + vírgula decimal
      if (/\d\.\d{3},/.test(s)) { s = s.replace(/\./g, "").replace(",", "."); }
      else { s = s.replace(/,/g, ""); }
      return (parseFloat(s) || 0) * sign;
    };

    const accounts: { code: string; name: string; balance: number }[] = [];
    for (const row of rows) {
      const first = String(row[0] ?? "").trim();
      const m = first.match(/^(\d{4,6})\s*[-–]\s*(.+)/);
      if (!m) continue;
      const code = m[1];
      const name = m[2].trim().replace(/\s+/g, " ");
      // Coluna 4 (índice 4) = saldo final
      const balance = parseBalance(row[4]);
      accounts.push({ code, name, balance });
    }

    // Grupos principais: códigos terminando em 00, saldo >= R$ 100
    const groups = accounts.filter((a) => a.code.endsWith("00") && Math.abs(a.balance) >= 100);

    const fmtMil = (v: number) =>
      `R$ ${Math.abs(Math.round(v / 1000)).toLocaleString("pt-BR")} mil`;

    const ativo = groups.filter((a) => /^1/.test(a.code));
    const passivo = groups.filter((a) => /^2/.test(a.code) && !/^24/.test(a.code));
    const pl = groups.filter((a) => /^24/.test(a.code));
    const custos = groups.filter((a) => /^4/.test(a.code));
    const despesas = groups.filter((a) => /^5/.test(a.code));
    const receitas = groups.filter((a) => /^6/.test(a.code));

    const lines: string[] = [
      "=== BALANCETE ANALÍTICO — saldos finais (R$ mil) ===",
      "(D)=devedor/ativo/custo/despesa  (C)=credor/passivo/PL/receita",
      "EMPRESA E CNPJ: usar dados do cliente selecionado no sistema",
      "",
    ];

    if (ativo.length) {
      lines.push("=== BALANÇO PATRIMONIAL — ATIVO ===");
      for (const a of ativo) {
        lines.push(`  ${a.code} - ${a.name}: ${fmtMil(a.balance)} (${a.balance >= 0 ? "D" : "C"})`);
      }
      lines.push("");
    }

    if (passivo.length || pl.length) {
      lines.push("=== BALANÇO PATRIMONIAL — PASSIVO + PATRIMÔNIO LÍQUIDO ===");
      for (const a of [...passivo, ...pl]) {
        lines.push(`  ${a.code} - ${a.name}: ${fmtMil(a.balance)} (${a.balance <= 0 ? "C=passivo" : "D"})`);
      }
      lines.push("");
    }

    if (receitas.length) {
      lines.push("=== CONTAS DE RECEITAS E INGRESSOS ===");
      for (const a of receitas) {
        lines.push(`  ${a.code} - ${a.name}: ${fmtMil(a.balance)} (C=receita)`);
      }
      lines.push("");
    }

    if (custos.length) {
      lines.push("=== ENTRADAS E CUSTOS (CMV/CPV) ===");
      for (const a of custos) {
        lines.push(`  ${a.code} - ${a.name}: ${fmtMil(a.balance)} (D=custo)`);
      }
      lines.push("");
    }

    if (despesas.length) {
      lines.push("=== CONTAS DE DESPESAS ===");
      for (const a of despesas) {
        lines.push(`  ${a.code} - ${a.name}: ${fmtMil(a.balance)} (D=despesa)`);
      }
      lines.push("");
    }

    const totalReceitas = receitas.reduce((s, a) => s + Math.abs(a.balance), 0);
    const totalCustos = custos.reduce((s, a) => s + Math.abs(a.balance), 0);
    const totalDespesas = despesas.reduce((s, a) => s + Math.abs(a.balance), 0);
    const resultado = totalReceitas - totalCustos - totalDespesas;

    lines.push("=== RESUMO DO PERÍODO ===");
    lines.push(`  Receita Total: ${fmtMil(totalReceitas)}`);
    lines.push(`  (-) CMV/Entradas e Custos: ${fmtMil(totalCustos)}`);
    lines.push(`  (-) Despesas Totais: ${fmtMil(totalDespesas)}`);
    lines.push(`  Resultado do Período: ${fmtMil(resultado)} ${resultado >= 0 ? "(LUCRO)" : "(PREJUÍZO)"}`);

    return lines.join("\n").slice(0, 55_000);
  }

  async function extractTexto(file: File): Promise<{ texto_extraido: string; arquivo_tipo: "pdf" | "xlsx" | "docx" }> {
    const buf = await file.arrayBuffer();
    const name = file.name.toLowerCase();
    const arquivo_tipo = name.endsWith(".pdf") ? "pdf" : name.endsWith(".xlsx") || name.endsWith(".xls") ? "xlsx" : "docx";

    let texto_extraido: string;
    if (arquivo_tipo === "pdf") {
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(buf), { mergePages: true });

      // Extração inteligente: pesquisa seções-chave no texto COMPLETO (independente do tamanho do PDF)
      const parts: string[] = [];

      // Cabeçalho: empresa, CNPJ, Período (não Data da Emissão)
      parts.push(text.slice(0, 1_200));

      // RESUMO DO BALANCETE — contém RESULTADO DO PERÍODO (lucro real) e totais
      const resumoIdx = text.search(/RESUMO\s+DO\s+BALANCETE|^\*+RESUMO/im);
      if (resumoIdx >= 0) {
        parts.push("\n\n=== RESUMO DO BALANCETE ===\n" + text.slice(resumoIdx, resumoIdx + 3_000));
      }

      // CONTAS DE RECEITAS E INGRESSOS — faturamento bruto
      const receitaIdx = text.search(/CONTAS\s+DE\s+RECEITAS|RECEITA\s+LÍQ|RECEITA\s+LIQ|VENDAS\s+DE\s+(MERCAD|COMERCIO)/i);
      if (receitaIdx >= 0) {
        parts.push("\n\n=== CONTAS DE RECEITAS ===\n" + text.slice(receitaIdx, receitaIdx + 3_000));
      }

      // ENTRADAS E CUSTOS — CMV (NÃO é faturamento)
      const cmvIdx = text.search(/ENTRADAS\s+E\s+CUSTOS|COMPRAS\s+LIQUIDAS/i);
      if (cmvIdx >= 0) {
        parts.push("\n\n=== ENTRADAS E CUSTOS (CMV) ===\n" + text.slice(cmvIdx, cmvIdx + 2_000));
      }

      // CONTAS DE DESPESAS — despesas operacionais
      const despIdx = text.search(/CONTAS\s+DE\s+DESPESAS|DESPESAS\s+COM\s+VENDAS/i);
      if (despIdx >= 0) {
        parts.push("\n\n=== CONTAS DE DESPESAS ===\n" + text.slice(despIdx, despIdx + 2_000));
      }

      // ATIVO/PASSIVO — balanço patrimonial (primeiros grupos)
      const ativoIdx = text.search(/^10000\s*-\s*A\s*T\s*I\s*V\s*O|^\bATIVO\b/im);
      if (ativoIdx >= 0) {
        parts.push("\n\n=== BALANÇO PATRIMONIAL ===\n" + text.slice(ativoIdx, ativoIdx + 4_000));
      }

      texto_extraido = parts.join("\n").slice(0, 55_000);
    } else if (arquivo_tipo === "xlsx") {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" }) as unknown[][];

      // Detecta balancete analítico: primeira célula não-vazia é um código de conta (4-6 dígitos)
      const firstDataRow = rows.find((r) => String(r[0] ?? "").trim().length > 0);
      const isBalancete = firstDataRow ? /^\d{4,6}[\s\-–]/.test(String(firstDataRow[0] ?? "").trim()) : false;

      if (isBalancete) {
        texto_extraido = buildBalanceteAnaliticoText(rows);
      } else {
        const linhas: string[] = [];
        for (const sheetName of wb.SheetNames) {
          linhas.push(`=== Planilha: ${sheetName} ===`);
          const ws = wb.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
          linhas.push(csv);
        }
        texto_extraido = linhas.join("\n").slice(0, 55_000);
      }
    } else {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
      texto_extraido = value.slice(0, 55_000);
    }
    return { texto_extraido, arquivo_tipo };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    if (!files.length) { setLoading(false); return toast.error("Selecione um ou mais arquivos (.json, .pdf, .docx ou .xlsx)"); }
    const oversized = files.find(f => f.size > 25_000_000);
    if (oversized) { setLoading(false); return toast.error(`${oversized.name} é muito grande. Máximo: 25 MB por arquivo.`); }

    // ── Arquivo .json gerado pela skill do Claude: pula a extração por IA ──
    const jsonFile = files.find(f => f.name.toLowerCase().endsWith(".json"));
    if (jsonFile) {
      if (files.length > 1) {
        setLoading(false);
        return toast.error("Envie o arquivo .json sozinho — ele já contém o demonstrativo pronto.");
      }
      const tidJson = toast.loading(`Lendo ${jsonFile.name}…`);
      try {
        const conteudo = await jsonFile.text();
        try {
          JSON.parse(conteudo);
        } catch {
          setLoading(false);
          return toast.error(`${jsonFile.name} não é um JSON válido. Gere o arquivo novamente pela skill ContabilConnect.`, { id: tidJson });
        }
        await upFn({ data: {
          cliente_id: clienteId || null,
          competencia: competencia || undefined,
          arquivo_nome: jsonFile.name,
          arquivo_tipo: "json",
          texto_extraido: conteudo.slice(0, 59_000),
        }});
        toast.success("Demonstrativo criado com sucesso!", { id: tidJson });
        setOpen(false);
        setFiles([]); setClienteId(""); setCompetencia("");
        qc.invalidateQueries({ queryKey: ["demos"] });
      } catch (err) {
        console.error("[upload json]", err);
        toast.error(err instanceof Error ? err.message : "Erro ao enviar o JSON", { id: tidJson });
      } finally {
        setLoading(false);
      }
      return;
    }
    const tid = toast.loading(`Extraindo ${files.length} arquivo(s)…`);
    try {
      const partes: string[] = [];
      let arquivo_tipo: "pdf" | "xlsx" | "docx" = "docx";
      for (const file of files) {
        toast.loading(`Lendo ${file.name}…`, { id: tid });
        const { texto_extraido, arquivo_tipo: tipo } = await extractTexto(file);
        partes.push(`\n\n=== Arquivo: ${file.name} ===\n${texto_extraido}`);
        if (tipo === "pdf" || (tipo === "xlsx" && arquivo_tipo === "docx")) arquivo_tipo = tipo;
      }
      const texto_combinado = partes.join("").slice(0, 55_000);
      const nome_principal = files[0].name;

      toast.loading("Analisando com IA… aguarde.", { id: tid });
      await upFn({ data: {
        cliente_id: clienteId || null,
        competencia: competencia || undefined,
        arquivo_nome: nome_principal,
        arquivo_tipo,
        texto_extraido: texto_combinado,
      }});
      toast.success("Demonstrativo criado com sucesso!", { id: tid });
      setOpen(false);
      setFiles([]); setClienteId(""); setCompetencia("");
      qc.invalidateQueries({ queryKey: ["demos"] });
    } catch (err) {
      console.error("[upload demonstrativo]", err);
      toast.error(err instanceof Error ? err.message : "Erro no processamento", { id: tid });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="Demonstrativos">
      <div className="flex justify-end mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary shadow-glow"><Upload className="size-4 mr-1" />Importar balancete</Button>
          </DialogTrigger>
          <DialogContent className="glass-card">
            <DialogHeader><DialogTitle>Novo demonstrativo</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>Cliente</Label>
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar cliente (opcional)" /></SelectTrigger>
                  <SelectContent>
                    {clientes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Competência</Label>
                <Select value={competencia} onValueChange={setCompetencia}>
                  <SelectTrigger><SelectValue placeholder="Selecionar mês/ano" /></SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const options: React.ReactNode[] = [];
                      const now = new Date();
                      for (let i = 0; i < 24; i++) {
                        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                        const val = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
                        options.push(<SelectItem key={val} value={val}>{val}</SelectItem>);
                      }
                      return options;
                    })()}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Balancete, Demonstrativo ou JSON do Claude *</Label>
                <Input type="file" multiple accept=".json,.pdf,.docx,.xlsx,.xls,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
                {files.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {files.map(f => (
                      <p key={f.name} className="flex items-center gap-1">
                        <FileText className="size-3 shrink-0" />
                        {f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    ))}
                  </div>
                )}
                {!files.length && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <strong>.json</strong> da skill ContabilConnect — os números entram exatamente como o
                    Claude leu, sem extração automática. Envie o .json sozinho.
                    <br />
                    Ou <strong>.pdf</strong>, <strong>.xlsx</strong>, <strong>.docx</strong> para extração
                    automática — vários ao mesmo tempo, máx. 25 MB cada.
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={loading} className="bg-gradient-primary">
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                  Processar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass-card overflow-hidden">
        {!demos?.length ? (
          <div className="text-center py-20 text-muted-foreground">
            <FileText className="size-10 mx-auto mb-3 opacity-50" />
            <p>Nenhum demonstrativo ainda.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {demos.map((d) => (
              <Link key={d.id} to="/demonstrativos/$id" params={{ id: d.id }} className="flex items-center justify-between p-4 hover:bg-accent/30 transition-colors">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="size-10 rounded-lg bg-gradient-primary/20 grid place-items-center shrink-0">
                    <FileText className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{d.clientes?.razao_social || d.arquivo_nome || "—"}</div>
                    <div className="text-xs text-muted-foreground">{d.competencia || new Date(d.created_at).toLocaleDateString("pt-BR")}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={d.status} />
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </AppShell>
  );
}
