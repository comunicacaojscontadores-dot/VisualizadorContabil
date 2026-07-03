import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { dashboardStats, listDemonstrativos } from "@/lib/demonstrativos.functions";
import { listClientes } from "@/lib/clientes.functions";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Users, CheckCircle2, Clock, AlertTriangle, Plus, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const statsFn = useServerFn(dashboardStats);
  const listFn = useServerFn(listDemonstrativos);
  const cliFn = useServerFn(listClientes);
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => statsFn() });
  const { data: demos } = useQuery({ queryKey: ["demos"], queryFn: () => listFn() });
  const { data: clientes } = useQuery({ queryKey: ["clientes"], queryFn: () => cliFn() });

  const cards = [
    { label: "Demonstrativos", value: stats?.total ?? 0, icon: FileText, color: "from-primary to-primary-glow" },
    { label: "Publicados", value: stats?.publicado ?? 0, icon: CheckCircle2, color: "from-success to-success" },
    { label: "Pendentes", value: (stats?.pendente ?? 0) + (stats?.processando ?? 0), icon: Clock, color: "from-warning to-warning" },
    { label: "Clientes", value: clientes?.length ?? 0, icon: Users, color: "from-chart-5 to-primary" },
  ];

  return (
    <AppShell title="Dashboard">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <Card key={c.label} className="glass-card p-5 animate-fade-up">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</p>
                <p className="text-3xl font-semibold mt-2">{c.value}</p>
              </div>
              <div className={`size-10 rounded-xl bg-gradient-to-br ${c.color} grid place-items-center shadow-glow`}>
                <c.icon className="size-5 text-primary-foreground" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Demonstrativos recentes</h2>
          <Button asChild size="sm" className="bg-gradient-primary shadow-glow">
            <Link to="/demonstrativos"><Plus className="size-4 mr-1" />Novo</Link>
          </Button>
        </div>
        {!demos?.length ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum demonstrativo ainda. <Link to="/demonstrativos" className="text-primary underline">Faça o primeiro upload</Link>.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {demos.slice(0, 6).map((d) => (
              <Link key={d.id} to="/demonstrativos/$id" params={{ id: d.id }} className="flex items-center justify-between py-3 hover:bg-accent/30 rounded-lg px-2 -mx-2 transition-colors">
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.clientes?.razao_social || d.arquivo_nome || "Sem cliente"}</div>
                  <div className="text-xs text-muted-foreground">{d.competencia || new Date(d.created_at).toLocaleDateString("pt-BR")}</div>
                </div>
                <div className="flex items-center gap-3">
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

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
    processando: { label: "Processando", cls: "bg-warning/15 text-warning border-warning/30", icon: Clock },
    pendente: { label: "Pendente", cls: "bg-chart-5/15 text-chart-5 border-chart-5/30", icon: Clock },
    publicado: { label: "Publicado", cls: "bg-success/15 text-success border-success/30", icon: CheckCircle2 },
    erro: { label: "Erro", cls: "bg-destructive/15 text-destructive border-destructive/30", icon: AlertTriangle },
  };
  const v = map[status] ?? map.pendente;
  return (
    <Badge variant="outline" className={`gap-1 ${v.cls}`}>
      <v.icon className="size-3" />{v.label}
    </Badge>
  );
}
