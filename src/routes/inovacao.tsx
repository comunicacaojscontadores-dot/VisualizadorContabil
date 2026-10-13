import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Lightbulb, Loader2, Check } from "lucide-react";
import { criarInscricaoInovacao } from "@/lib/inovacao.functions";

export const Route = createFileRoute("/inovacao")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Time de Inovação — JS Contadores" },
      { name: "description", content: "Cadastro do Time de Inovação do setor Contábil." },
    ],
  }),
  component: InovacaoPage,
});

function InovacaoPage() {
  const submit = useServerFn(criarInscricaoInovacao);
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !cargo.trim()) {
      toast.error("Preencha nome e cargo.");
      return;
    }
    setLoading(true);
    try {
      await submit({ data: { nome: nome.trim(), cargo: cargo.trim() } });
      setEnviado(true);
    } catch {
      toast.error("Erro ao enviar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-hero grid-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-up">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="size-9 rounded-xl bg-gradient-primary grid place-items-center shadow-glow">
            <Lightbulb className="size-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold tracking-tight">
            Time de <span className="gradient-text">Inovação</span>
          </span>
        </div>

        <Card className="glass-card p-8">
          {enviado ? (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div className="size-12 rounded-full bg-gradient-primary grid place-items-center shadow-glow">
                <Check className="size-6 text-primary-foreground" />
              </div>
              <h1 className="text-lg font-semibold tracking-tight">Cadastro recebido</h1>
              <p className="text-sm text-muted-foreground">
                Obrigado, {nome.split(" ")[0]}! Você agora faz parte do Time de Inovação do setor Contábil.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold tracking-tight text-center mb-1">
                Entre para o Time de Inovação
              </h1>
              <p className="text-sm text-muted-foreground text-center mb-6">
                Setor Contábil · JS Contadores. Informe seu nome e cargo para participar.
              </p>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="nome">Nome completo</Label>
                  <Input
                    id="nome"
                    required
                    autoComplete="name"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="mt-1.5"
                    placeholder="Ex.: Ana Beatriz Souza"
                  />
                </div>
                <div>
                  <Label htmlFor="cargo">Cargo / função</Label>
                  <Input
                    id="cargo"
                    required
                    autoComplete="organization-title"
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value)}
                    className="mt-1.5"
                    placeholder="Ex.: Analista Fiscal Pleno"
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-primary shadow-glow">
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                  Cadastrar
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
