import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDemonstrativo, publishDemo, deleteDemo, updateDemoDados,
  gerarAnalise, updateAnalise,
} from "@/lib/demonstrativos.functions";
import { AppShell } from "@/components/app-shell";
import { PremiumReport } from "@/components/premium-report";
import { StatusBadge } from "@/routes/_authenticated/dashboard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Globe, Trash2, Copy, ExternalLink, Loader2, Save, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { DemoData } from "@/lib/demo-types";

export const Route = createFileRoute("/_authenticated/demonstrativos/$id")({
  component: DemoDetail,
});

const ANALISE_LABELS: { key: keyof NonNullable<DemoData["analise"]>; label: string; desc: string }[] = [
  { key: "visao_geral", label: "Visão Geral", desc: "Resumo do desempenho geral no período" },
  { key: "ativo", label: "Ativo", desc: "Composição e qualidade dos ativos" },
  { key: "passivo", label: "Passivo e Endividamento", desc: "Estrutura de capital e obrigações" },
  { key: "dre", label: "Resultado (DRE)", desc: "Receita, margens e despesas relevantes" },
  { key: "liquidez", label: "Liquidez", desc: "Índices e capacidade de pagamento" },
  { key: "pontos_atencao", label: "Pontos de Atenção", desc: "Itens que merecem monitoramento" },
  { key: "perspectivas", label: "Perspectivas", desc: "Recomendações para o próximo período" },
  { key: "nota_colaborador", label: "Nota do Contador", desc: "Observações adicionais para o cliente (campo livre)" },
];

function DemoDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getDemonstrativo);
  const pubFn = useServerFn(publishDemo);
  const delFn = useServerFn(deleteDemo);
  const updFn = useServerFn(updateDemoDados);
  const analiseFn = useServerFn(gerarAnalise);
  const updAnaliseFn = useServerFn(updateAnalise);

  const { data: demo, isLoading } = useQuery({
    queryKey: ["demo", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: (q) => (q.state.data?.status === "processando" ? 2500 : false),
  });

  const [draftJson, setDraftJson] = useState<string>("");
  const [analise, setAnalise] = useState<Record<string, string>>({});
  const [gerandoAnalise, setGerandoAnalise] = useState(false);
  const [salvandoAnalise, setSalvandoAnalise] = useState(false);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    if (demo) {
      setDraftJson(JSON.stringify(demo.dados ?? {}, null, 2));
      const a = (demo.dados as DemoData)?.analise ?? {};
      setAnalise(a as Record<string, string>);
    }
  }, [demo]);

  if (isLoading || !demo) return (
    <AppShell title="Demonstrativo">
      <div className="text-center py-20"><Loader2 className="size-6 animate-spin mx-auto text-primary" /></div>
    </AppShell>
  );

  const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/e/${demo.slug}`;
  const dados = (demo.dados ?? {}) as DemoData;
  const temAnalise = Object.values(analise).some(Boolean);

  async function publish() {
    await pubFn({ data: { id } });
    toast.success("Publicado! Link disponível para o cliente.");
    qc.invalidateQueries({ queryKey: ["demo", id] });
  }

  async function remove() {
    if (!confirm("Excluir este demonstrativo?")) return;
    await delFn({ data: { id } });
    nav({ to: "/demonstrativos" });
  }

  async function saveJson() {
    try {
      const parsed = JSON.parse(draftJson);
      await updFn({ data: { id, dados: parsed } });
      toast.success("Dados salvos");
      qc.invalidateQueries({ queryKey: ["demo", id] });
    } catch {
      toast.error("JSON inválido — verifique a formatação");
    }
  }

  async function handleGerarAnalise() {
    setGerandoAnalise(true);
    try {
      const res = await analiseFn({ data: { id } });
      setAnalise(res.analise as Record<string, string>);
      toast.success("Análise gerada pela IA!");
      qc.invalidateQueries({ queryKey: ["demo", id] });
    } catch (e: unknown) {
      toast.error("Erro ao gerar análise. Tente novamente.");
    } finally {
      setGerandoAnalise(false);
    }
  }

  async function handleSalvarAnalise() {
    setSalvandoAnalise(true);
    try {
      await updAnaliseFn({ data: { id, analise } });
      toast.success("Análise salva!");
      qc.invalidateQueries({ queryKey: ["demo", id] });
    } catch {
      toast.error("Erro ao salvar análise");
    } finally {
      setSalvandoAnalise(false);
    }
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {demo.clientes?.razao_social || demo.arquivo_nome}
          </h1>
          <StatusBadge status={demo.status} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {demo.status === "publicado" && (
            <>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Link copiado!"); }}>
                <Copy className="size-3.5 mr-1" />Copiar link
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5 mr-1" />Abrir
                </a>
              </Button>
            </>
          )}
          {demo.status === "rascunho" && (
            <Button size="sm" onClick={publish} className="bg-gradient-primary shadow-glow">
              <Globe className="size-3.5 mr-1" />Publicar para o cliente
            </Button>
          )}
          {demo.status !== "publicado" && demo.status !== "processando" && demo.status !== "rascunho" && (
            <Button size="sm" onClick={publish} className="bg-gradient-primary shadow-glow">
              <Globe className="size-3.5 mr-1" />Publicar
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={remove} className="text-destructive">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Processando */}
      {demo.status === "processando" && (
        <Card className="glass-card p-8 text-center">
          <Loader2 className="size-8 animate-spin mx-auto text-primary mb-3" />
          <p className="font-medium">Processando com IA...</p>
          <p className="text-sm text-muted-foreground mt-1">Extraindo dados do documento.</p>
          <p className="text-xs text-muted-foreground mt-4">Se ficar preso por mais de 1 minuto, exclua e envie novamente.</p>
          <Button size="sm" variant="ghost" className="mt-2 text-destructive" onClick={remove}>
            <Trash2 className="size-3.5 mr-1" />Excluir e tentar novamente
          </Button>
        </Card>
      )}

      {/* Erro */}
      {demo.status === "erro" && (
        <Card className="glass-card p-6 border-destructive/40">
          <p className="font-medium text-destructive mb-1">Erro no processamento</p>
          <p className="text-sm text-muted-foreground">{demo.erro_mensagem}</p>
        </Card>
      )}

      {/* Conteúdo principal */}
      {demo.status !== "processando" && demo.status !== "erro" && (
        <Tabs defaultValue="preview">
          <TabsList className="mb-4">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="analise">
              Análise IA
              {temAnalise && <span className="ml-1.5 size-2 rounded-full bg-green-500 inline-block" />}
            </TabsTrigger>
            <TabsTrigger value="dados">Dados extraídos</TabsTrigger>
          </TabsList>

          {/* PREVIEW */}
          <TabsContent value="preview">
            <Card className="overflow-hidden rounded-2xl border border-border/60">
              <PremiumReport dados={dados} cliente={demo.clientes} competencia={demo.competencia} publishedAt={demo.published_at} />
            </Card>
          </TabsContent>

          {/* ANÁLISE IA */}
          <TabsContent value="analise">
            <div className="space-y-4">
              <Card className="glass-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold mb-1">Análise gerada por IA</h3>
                    <p className="text-sm text-muted-foreground">
                      Clique em "Gerar análise" para que a IA analise os dados extraídos e produza comentários profissionais.
                      Você pode editar qualquer campo antes de publicar.
                    </p>
                  </div>
                  <Button
                    onClick={handleGerarAnalise}
                    disabled={gerandoAnalise}
                    className="bg-gradient-primary shadow-glow shrink-0"
                  >
                    {gerandoAnalise
                      ? <><Loader2 className="size-4 mr-2 animate-spin" />Gerando...</>
                      : <><Sparkles className="size-4 mr-2" />{temAnalise ? "Regenerar" : "Gerar análise"}</>
                    }
                  </Button>
                </div>
              </Card>

              {ANALISE_LABELS.map(({ key, label, desc }) => (
                <Card key={key} className="glass-card p-5">
                  <label className="block mb-1">
                    <span className="font-medium text-sm">{label}</span>
                    <span className="text-xs text-muted-foreground ml-2">{desc}</span>
                  </label>
                  <Textarea
                    value={analise[key] ?? ""}
                    onChange={(e) => setAnalise((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={gerandoAnalise ? "Gerando..." : `Escreva ou aguarde a IA gerar o ${label.toLowerCase()}...`}
                    className="min-h-[100px] text-sm resize-y"
                    disabled={gerandoAnalise}
                  />
                </Card>
              ))}

              <div className="flex justify-end gap-2">
                <Button onClick={handleSalvarAnalise} disabled={salvandoAnalise} className="bg-gradient-primary">
                  {salvandoAnalise ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
                  Salvar análise
                </Button>
                {demo.status === "rascunho" && (
                  <Button onClick={publish} className="bg-green-600 hover:bg-green-700 text-white">
                    <Globe className="size-4 mr-2" />Publicar para o cliente
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>

          {/* DADOS JSON */}
          <TabsContent value="dados">
            <Card className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground">Dados brutos extraídos pela IA. Edite apenas se necessário.</p>
                <Button variant="ghost" size="sm" onClick={() => setShowJson(!showJson)}>
                  {showJson ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  {showJson ? "Ocultar" : "Mostrar"} JSON
                </Button>
              </div>
              {showJson && (
                <>
                  <Textarea
                    value={draftJson}
                    onChange={(e) => setDraftJson(e.target.value)}
                    className="font-mono text-xs min-h-[480px]"
                  />
                  <div className="flex justify-end mt-3">
                    <Button onClick={saveJson} className="bg-gradient-primary">
                      <Save className="size-4 mr-1" />Salvar dados
                    </Button>
                  </div>
                </>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}
