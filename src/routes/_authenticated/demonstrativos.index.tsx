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
  const [file, setFile] = useState<File | null>(null);
  const [clienteId, setClienteId] = useState<string>("");
  const [competencia, setCompetencia] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast.error("Selecione um arquivo .docx ou .pdf");
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      const b64 = btoa(binary);
      const arquivo_tipo = file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "docx";
      await upFn({ data: {
        cliente_id: clienteId || null,
        competencia: competencia || undefined,
        arquivo_nome: file.name,
        arquivo_base64: b64,
        arquivo_tipo,
      }});
      toast.success("Documento processado!");
      setOpen(false);
      setFile(null); setClienteId(""); setCompetencia("");
      qc.invalidateQueries({ queryKey: ["demos"] });
    } catch (e) {
      console.error("[upload demonstrativo]", e);
      toast.error(e instanceof Error ? e.message : "Erro no processamento");
    } finally { setLoading(false); }
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
                <Input placeholder="Ex: Janeiro/2026" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
              </div>
              <div>
                <Label>Balancete (PDF) ou Demonstrativo (Word) *</Label>
                <Input type="file" accept=".pdf,.docx" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <p className="text-xs text-muted-foreground mt-1">
                  PDF do balancete (PC Sistemas/Domínio) ou .docx do demonstrativo — a IA reconhece as contas automaticamente.
                </p>
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
