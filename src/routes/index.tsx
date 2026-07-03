import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Upload, Cpu, Share2, BarChart3, Shield, Zap, ArrowRight, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ContabilConnect — Demonstrativos contábeis premium online" },
      { name: "description", content: "Transforme demonstrativos contábeis em Word em experiências digitais premium para seus clientes. Upload, IA e link público em segundos." },
      { property: "og:title", content: "ContabilConnect — Demonstrativos contábeis premium" },
      { property: "og:description", content: "Upload de .docx, processamento por IA e link público moderno para o cliente." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-gradient-primary grid place-items-center shadow-glow">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">Contabil<span className="gradient-text">Connect</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link to="/auth">Entrar</Link></Button>
            <Button asChild size="sm" className="bg-gradient-primary shadow-glow"><Link to="/auth">Começar grátis</Link></Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="relative max-w-6xl mx-auto px-4 md:px-8 py-20 md:py-32 text-center">
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs mb-6 animate-fade-up">
            <Zap className="size-3.5 text-primary" />Processamento com IA · Lovable Cloud
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight max-w-3xl mx-auto animate-fade-up" style={{ animationDelay: "60ms" }}>
            Demonstrativos contábeis que seus clientes <span className="gradient-text">vão amar abrir</span>.
          </h1>
          <p className="text-lg text-muted-foreground mt-6 max-w-2xl mx-auto animate-fade-up" style={{ animationDelay: "120ms" }}>
            Faça upload do .docx, a IA extrai tudo automaticamente e você compartilha um link moderno — com KPIs, gráficos e tabs DRE / Balanço / DFC.
          </p>
          <div className="flex items-center justify-center gap-3 mt-8 animate-fade-up" style={{ animationDelay: "180ms" }}>
            <Button asChild size="lg" className="bg-gradient-primary shadow-glow">
              <Link to="/auth">Começar agora <ArrowRight className="size-4 ml-1" /></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-24">
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { icon: Upload, title: "1. Upload do Word", desc: "Envie o .docx do demonstrativo. Em segundos o sistema extrai o texto." },
            { icon: Cpu, title: "2. IA estrutura tudo", desc: "Gemini identifica empresa, KPIs, DRE, balanço, DFC, obrigações." },
            { icon: Share2, title: "3. Link premium", desc: "Compartilhe um link público elegante, responsivo e pronto para PDF." },
          ].map((s, i) => (
            <Card key={i} className="glass-card p-6 animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="size-10 rounded-xl bg-gradient-primary grid place-items-center shadow-glow mb-4">
                <s.icon className="size-5 text-primary-foreground" />
              </div>
              <h3 className="font-semibold mb-1">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 pb-20">
        <Card className="glass-card p-8 md:p-12">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Tudo o que o cliente precisa ver, num só lugar.</h2>
              <p className="text-muted-foreground mt-3">Visual escuro premium, gráficos animados, micro-interações e impressão otimizada para PDF.</p>
              <ul className="space-y-2 mt-6">
                {["KPIs com gradientes e ícones", "Gráficos de área, barras e pizza (Recharts)", "Tabs DRE, Balanço, DFC, DMPL", "Obrigações acessórias com status", "100% responsivo · Pronto para PDF"].map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-success shrink-0" />{f}</li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: BarChart3, label: "Gráficos" },
                { icon: Shield, label: "Seguro" },
                { icon: Cpu, label: "IA Nativa" },
                { icon: Zap, label: "Instantâneo" },
              ].map((f) => (
                <div key={f.label} className="glass rounded-2xl p-6 text-center">
                  <f.icon className="size-6 mx-auto text-primary mb-2" />
                  <p className="text-sm">{f.label}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} ContabilConnect
      </footer>
    </div>
  );
}
