import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buscarEmpresa,
  listProspeccoes,
  salvarProspeccao,
  atualizarStatusProspeccao,
  deleteProspeccao,
  converterEmCliente,
  type DossieEmpresa,
} from "@/lib/prospeccao.functions";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  Star,
  Users,
  TrendingUp,
  Save,
  UserPlus,
  Trash2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { brlFull } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/prospeccao")({
  component: ProspeccaoPage,
});

const STATUS_LABEL: Record<string, string> = {
  novo: "Novo",
  contatado: "Contatado",
  qualificado: "Qualificado",
  descartado: "Descartado",
  convertido: "Convertido",
};

function ProspeccaoPage() {
  const buscarFn = useServerFn(buscarEmpresa);
  const salvarFn = useServerFn(salvarProspeccao);
  const statusFn = useServerFn(atualizarStatusProspeccao);
  const delFn = useServerFn(deleteProspeccao);
  const convFn = useServerFn(converterEmCliente);
  const qc = useQueryClient();

  const [cnpj, setCnpj] = useState("");
  const [dossie, setDossie] = useState<DossieEmpresa | null>(null);

  const { data: salvas } = useQuery({
    queryKey: ["prospeccoes"],
    queryFn: () => listProspeccoes(),
  });

  const busca = useMutation({
    mutationFn: (c: string) => buscarFn({ data: { cnpj: c } }),
    onSuccess: (d) => setDossie(d as DossieEmpresa),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro na busca"),
  });

  async function onBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (cnpj.replace(/\D/g, "").length !== 14) {
      toast.error("Informe um CNPJ com 14 dígitos.");
      return;
    }
    busca.mutate(cnpj);
  }

  async function salvar() {
    if (!dossie) return;
    try {
      await salvarFn({ data: { dossie: dossie as unknown as Record<string, unknown> } });
      toast.success("Prospecção salva");
      qc.invalidateQueries({ queryKey: ["prospeccoes"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  async function setStatus(id: string, status: string) {
    await statusFn({ data: { id, status: status as never } });
    qc.invalidateQueries({ queryKey: ["prospeccoes"] });
  }

  async function converter(id: string) {
    try {
      await convFn({ data: { id } });
      toast.success("Convertido em cliente");
      qc.invalidateQueries({ queryKey: ["prospeccoes"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao converter");
    }
  }

  async function remover(id: string) {
    if (!confirm("Excluir esta prospecção?")) return;
    await delFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["prospeccoes"] });
  }

  return (
    <AppShell title="Prospecção de empresas">
      {/* Busca */}
      <Card className="glass-card p-5 mb-6">
        <form onSubmit={onBuscar} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              placeholder="Digite o CNPJ da empresa (ex: 00.000.000/0001-00)"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <Button
            type="submit"
            disabled={busca.isPending}
            className="bg-gradient-primary shadow-glow"
          >
            {busca.isPending ? (
              <Loader2 className="size-4 mr-1 animate-spin" />
            ) : (
              <Search className="size-4 mr-1" />
            )}
            Buscar
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">
          Dados cadastrais da Receita Federal + presença no Google Maps. O faturamento é uma{" "}
          <strong>estimativa</strong> por porte — não é dado oficial.
        </p>
      </Card>

      {/* Dossiê */}
      {dossie && <Dossie dossie={dossie} onSalvar={salvar} salvando={false} />}

      {/* Prospecções salvas */}
      <h2 className="text-lg font-semibold mt-10 mb-4">Prospecções salvas</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {salvas?.map((p) => (
          <Card key={p.id} className="glass-card p-5 group">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{p.nome_fantasia || p.razao_social}</div>
                <div className="text-xs text-muted-foreground truncate">{p.cnpj || "—"}</div>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {STATUS_LABEL[p.status] ?? p.status}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-2 space-y-1">
              {(p.municipio || p.uf) && (
                <div className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {[p.municipio, p.uf].filter(Boolean).join(" / ")}
                </div>
              )}
              {p.faturamento_estimado && (
                <div className="flex items-center gap-1">
                  <TrendingUp className="size-3" />
                  {p.faturamento_estimado}
                </div>
              )}
              {p.google_rating != null && (
                <div className="flex items-center gap-1">
                  <Star className="size-3 text-amber-500" />
                  {p.google_rating}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-4">
              {p.status !== "contatado" && (
                <Button size="sm" variant="ghost" onClick={() => setStatus(p.id, "contatado")}>
                  Contatado
                </Button>
              )}
              {p.status !== "convertido" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => converter(p.id)}
                  className="text-primary"
                >
                  <UserPlus className="size-3.5 mr-1" />
                  Virar cliente
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remover(p.id)}
                className="text-destructive hover:text-destructive ml-auto"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </Card>
        ))}
        {!salvas?.length && (
          <div className="col-span-full text-center py-12 text-muted-foreground text-sm">
            Nenhuma prospecção salva ainda. Busque um CNPJ acima.
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Linha({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium">{children}</span>
      </div>
    </div>
  );
}

function Dossie({
  dossie,
  onSalvar,
}: {
  dossie: DossieEmpresa;
  onSalvar: () => void;
  salvando: boolean;
}) {
  const e = dossie.endereco;
  const endereco = [e.logradouro, e.numero, e.bairro, e.municipio, e.uf, e.cep]
    .filter(Boolean)
    .join(", ");
  const ativa = (dossie.situacao_cadastral ?? "").toUpperCase().includes("ATIVA");

  return (
    <Card className="glass-card p-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="size-12 rounded-xl bg-accent grid place-items-center shrink-0">
            <Building2 className="size-6 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold truncate">
              {dossie.nome_fantasia || dossie.razao_social}
            </h2>
            {dossie.nome_fantasia && (
              <div className="text-sm text-muted-foreground truncate">{dossie.razao_social}</div>
            )}
            <div className="text-xs text-muted-foreground mt-1">{dossie.cnpj}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={ativa ? "default" : "destructive"}>
            {dossie.situacao_cadastral ?? "—"}
          </Badge>
          <Button onClick={onSalvar} size="sm" className="bg-gradient-primary">
            <Save className="size-4 mr-1" />
            Salvar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {dossie.porte && <Badge variant="secondary">{dossie.porte}</Badge>}
        {dossie.regime.mei && <Badge variant="secondary">MEI</Badge>}
        {dossie.regime.simples && <Badge variant="secondary">Simples Nacional</Badge>}
      </div>

      <Separator className="my-5" />

      <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
        <Linha icon={MapPin} label="Endereço">
          {endereco || "—"}
        </Linha>
        <Linha icon={Phone} label="Telefone">
          {dossie.google?.telefone || dossie.contato.telefone || "—"}
        </Linha>
        <Linha icon={Mail} label="E-mail">
          {dossie.contato.email || "—"}
        </Linha>
        <Linha icon={TrendingUp} label="Faturamento estimado">
          {dossie.faturamento_estimado.faixa}{" "}
          <span className="text-xs text-muted-foreground">
            ({dossie.faturamento_estimado.base})
          </span>
        </Linha>
        <Linha icon={Building2} label="Capital social">
          {brlFull(dossie.capital_social)}
        </Linha>
        <Linha icon={Building2} label="Abertura">
          {dossie.data_abertura ? new Date(dossie.data_abertura).toLocaleDateString("pt-BR") : "—"}
        </Linha>
      </div>

      {dossie.cnae_principal && (
        <div className="mt-5">
          <div className="text-xs text-muted-foreground mb-1">Atividade principal (CNAE)</div>
          <div className="text-sm font-medium">
            {dossie.cnae_principal.codigo} — {dossie.cnae_principal.descricao}
          </div>
        </div>
      )}

      {dossie.socios.length > 0 && (
        <div className="mt-5">
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <Users className="size-3.5" /> Quadro societário
          </div>
          <div className="flex flex-wrap gap-2">
            {dossie.socios.map((s, i) => (
              <Badge key={i} variant="outline" className="font-normal">
                {s.nome}
                {s.qualificacao ? ` · ${s.qualificacao}` : ""}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Bloco Google Maps */}
      {dossie.google && (
        <>
          <Separator className="my-5" />
          <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
            <Star className="size-3.5 text-amber-500" /> Presença no Google Maps
          </div>
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
            {dossie.google.rating != null && (
              <Linha icon={Star} label="Avaliação">
                {dossie.google.rating} ⭐ ({dossie.google.total_avaliacoes ?? 0} avaliações)
              </Linha>
            )}
            {dossie.google.website && (
              <Linha icon={Globe} label="Site">
                <a
                  href={dossie.google.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1"
                >
                  {dossie.google.website.replace(/^https?:\/\//, "").slice(0, 40)}
                  <ExternalLink className="size-3" />
                </a>
              </Linha>
            )}
            {dossie.google.maps_url && (
              <Linha icon={MapPin} label="Maps">
                <a
                  href={dossie.google.maps_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1"
                >
                  Abrir no Google Maps <ExternalLink className="size-3" />
                </a>
              </Linha>
            )}
          </div>
        </>
      )}

      <Separator className="my-5" />
      <div className="text-xs text-muted-foreground">Fontes: {dossie.fontes.join(" · ")}</div>
    </Card>
  );
}
