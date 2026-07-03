import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDemonstrativo, publishDemo, deleteDemo, updateDemoDados } from "@/lib/demonstrativos.functions";
import { AppShell } from "@/components/app-shell";
import { PremiumReport } from "@/components/premium-report";
import { StatusBadge } from "@/routes/_authenticated/dashboard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Globe, Trash2, Copy, ExternalLink, Loader2, Save } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { DemoData } from "@/lib/demo-types";

export const Route = createFileRoute("/_authenticated/demonstrativos/$id")({
  component: DemoDetail,
});

function DemoDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getDemonstrativo);
  const pubFn = useServerFn(publishDemo);
  const delFn = useServerFn(deleteDemo);
  const updFn = useServerFn(updateDemoDados);

  const { data: demo, isLoading } = useQuery({
    queryKey: ["demo", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: (q) => (q.state.data?.status === "processando" ? 2500 : false),
  });

  const [draft, setDraft] = useState<string>("");
  useEffect(() => { if (demo) setDraft(JSON.stringify(demo.dados ?? {}, null, 2)); }, [demo]);

  if (isLoading || !demo) return <AppShell title="Demonstrativo"><div className="text-center py-20"><Loader2 className="size-6 animate-spin mx-auto text-primary" /></div></AppShell>;

  const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/e/${demo.slug}`;
  const dados = (demo.dados ?? {}) as DemoData;

  async function publish() {
    await pubFn({ data: { id } });
    toast.success("Publicado!");
    qc.invalidateQueries({ queryKey: ["demo", id] });
  }
  async function remove() {
    if (!confirm("Excluir?")) return;
    await delFn({ data: { id } });
    nav({ to: "/demonstrativos" });
  }
  async function saveDraft() {
    try {
      const parsed = JSON.parse(draft);
      await updFn({ data: { id, dados: parsed } });
      toast.success("Salvo");
      qc.invalidateQueries({ queryKey: ["demo", id] });
    } catch (e) {
      toast.error("JSON inválido");
    }
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{demo.clientes?.razao_social || demo.arquivo_nome}</h1>
          <StatusBadge status={demo.status} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {demo.status === "publicado" && (
            <>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Link copiado!"); }}>
                <Copy className="size-3.5 mr-1" />Copiar link
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5 mr-1" />Abrir</a>
              </Button>
            </>
          )}
          {demo.status !== "publicado" && demo.status !== "processando" && (
            <Button size="sm" onClick={publish} className="bg-gradient-primary shadow-glow">
              <Globe className="size-3.5 mr-1" />Publicar
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={remove} className="text-destructive"><Trash2 className="size-3.5" /></Button>
        </div>
      </div>

      {demo.status === "processando" && (
        <Card className="glass-card p-8 text-center">
          <Loader2 className="size-8 animate-spin mx-auto text-primary mb-3" />
          <p className="font-medium">Processando com IA...</p>
          <p className="text-sm text-muted-foreground mt-1">Extraindo dados do documento.</p>
        </Card>
      )}

      {demo.status === "erro" && (
        <Card className="glass-card p-6 border-destructive/40">
          <p className="font-medium text-destructive mb-1">Erro no processamento</p>
          <p className="text-sm text-muted-foreground">{demo.erro_mensagem}</p>
        </Card>
      )}

      {demo.status !== "processando" && demo.status !== "erro" && (
        <Tabs defaultValue="preview">
          <TabsList className="mb-4">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="json">Editar dados (JSON)</TabsTrigger>
          </TabsList>
          <TabsContent value="preview">
            <Card className="overflow-hidden rounded-2xl border border-border/60">
              <PremiumReport dados={dados} cliente={demo.clientes} competencia={demo.competencia} publishedAt={demo.published_at} />
            </Card>
          </TabsContent>
          <TabsContent value="json">
            <Card className="glass-card p-4">
              <p className="text-xs text-muted-foreground mb-2">Edite os dados extraídos pela IA. Mantenha um JSON válido.</p>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="font-mono text-xs min-h-[480px]" />
              <div className="flex justify-end mt-3">
                <Button onClick={saveDraft} className="bg-gradient-primary"><Save className="size-4 mr-1" />Salvar</Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}
