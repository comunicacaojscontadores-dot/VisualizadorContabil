import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Entrar — Contabil Connect" }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [escritorio, setEscritorio] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/dashboard" });
    });
  }, [nav]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo!");
    nav({ to: "/dashboard" });
  }

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { nome, escritorio_nome: escritorio },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Faça login.");
    setTab("login");
  }

  return (
    <div className="min-h-screen bg-gradient-hero grid-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-up">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="size-9 rounded-xl bg-gradient-primary grid place-items-center shadow-glow">
            <Sparkles className="size-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Contabil<span className="gradient-text">Connect</span></span>
        </Link>

        <Card className="glass-card p-8">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")}>
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={onLogin} className="space-y-4">
                <div>
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-primary shadow-glow">
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                  Entrar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={onSignup} className="space-y-4">
                <div>
                  <Label htmlFor="nome">Seu nome</Label>
                  <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="esc">Nome do escritório</Label>
                  <Input id="esc" value={escritorio} onChange={(e) => setEscritorio(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="email2">E-mail</Label>
                  <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="pw2">Senha</Label>
                  <Input id="pw2" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-primary shadow-glow">
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                  Criar conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Plataforma para contadores entregarem demonstrativos premium aos clientes.
        </p>
      </div>
    </div>
  );
}
