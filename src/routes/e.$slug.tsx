import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { getPublicDemo } from "@/lib/demonstrativos.functions";

export const Route = createFileRoute("/e/$slug")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: `Demonstrativo — ${params.slug}` },
      { name: "description", content: "Acesso ao demonstrativo contábil." },
    ],
  }),
  component: EnvelopePage,
});

function EnvelopePage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  const fn = useServerFn(getPublicDemo);
  const { data, isLoading } = useQuery({
    queryKey: ["pub-envelope", slug],
    queryFn: () => fn({ data: { slug } }),
  });

  const clientName =
    data?.clientes?.nome_fantasia ||
    data?.clientes?.razao_social ||
    "Cliente";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#1A3A5C] text-white">
      {/* Fundo decorativo */}
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 20% 30%, rgba(201,168,76,0.18), transparent 45%), radial-gradient(circle at 80% 70%, rgba(40,91,140,0.55), transparent 50%)",
          }}
        />
        <svg
          className="absolute -left-20 top-10 size-[420px] opacity-25"
          viewBox="0 0 200 200"
          fill="none"
        >
          <path
            d="M40 160 C 20 100, 70 30, 160 30 C 150 110, 110 170, 40 160 Z"
            fill="#C9A84C"
          />
          <path
            d="M50 150 C 70 110, 110 70, 150 60"
            stroke="#1A3A5C"
            strokeWidth="2"
            fill="none"
          />
        </svg>
        <svg
          className="absolute -right-24 -bottom-10 size-[460px] rotate-180 opacity-20"
          viewBox="0 0 200 200"
          fill="none"
        >
          <path
            d="M40 160 C 20 100, 70 30, 160 30 C 150 110, 110 170, 40 160 Z"
            fill="#C9A84C"
          />
        </svg>
      </div>

      {/* Topbar estática */}
      <header className="absolute top-0 left-0 right-0 z-20 border-b border-white/10 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-gradient-gold text-[#1A1A2E] text-xs font-bold shadow-soft">
              JS
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">
              JS <span className="text-[#C9A84C]">|</span> Contadores
            </span>
          </div>
          <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/50">
            ContabilConnect
          </span>
        </div>
      </header>

      {/* Card envelope */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-24">
        <div
          className="group relative w-full max-w-xl"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Reflexo */}
          <div className="absolute -bottom-10 left-10 right-10 h-12 rounded-full bg-black/40 blur-2xl" />

          {/* Card */}
          <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-white/5 shadow-elevated backdrop-blur-xl">
            {/* Aba do envelope */}
            <div
              className={`pointer-events-none absolute inset-x-0 top-0 transition-all duration-700 ${
                hovered ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100"
              }`}
            >
              <svg viewBox="0 0 600 220" className="w-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="flap" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#285b8c" />
                    <stop offset="100%" stopColor="#1A3A5C" />
                  </linearGradient>
                </defs>
                <polygon points="0,0 600,0 300,200" fill="url(#flap)" />
                <polyline
                  points="0,0 300,200 600,0"
                  fill="none"
                  stroke="rgba(201,168,76,0.55)"
                  strokeWidth="2"
                />
              </svg>
            </div>

            {/* Conteúdo */}
            <div className="flex flex-col items-center gap-8 px-8 py-16 text-center md:px-14 md:py-20">
              {/* Logo escritório */}
              <div className="flex items-center gap-3">
                <div className="grid size-12 place-items-center rounded-xl bg-gradient-gold text-[#1A1A2E] font-bold shadow-soft">
                  JS
                </div>
                <span className="text-lg font-semibold tracking-tight">
                  JS <span className="text-[#C9A84C]">|</span> Contadores
                </span>
              </div>

              <div className="gold-rule" />

              {/* Estado loading / texto */}
              <div className="relative h-20 w-full">
                <p
                  className={`absolute inset-0 flex items-center justify-center text-sm uppercase tracking-[0.3em] text-white/60 transition-all duration-500 ${
                    hovered ? "opacity-0 -translate-y-2" : "opacity-100"
                  }`}
                >
                  Passe o mouse aqui para revelar
                </p>
                <div
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${
                    hovered ? "opacity-100 scale-100" : "opacity-0 scale-95"
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="size-6 animate-spin text-[#C9A84C]" />
                  ) : (
                    <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
                      {clientName}
                    </h1>
                  )}
                </div>
              </div>

              {/* Botão */}
              <button
                onClick={() => navigate({ to: "/d/$slug", params: { slug } })}
                disabled={isLoading || !data}
                className={`inline-flex items-center gap-3 rounded-full border border-[#C9A84C]/60 bg-[#C9A84C]/10 px-6 py-3 text-sm font-medium text-white backdrop-blur-sm transition-all duration-500 hover:bg-[#C9A84C]/25 disabled:cursor-not-allowed disabled:opacity-40 ${
                  hovered
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-3 opacity-0"
                }`}
              >
                Acessar demonstrativo contábil
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </button>

              <p className="text-[11px] uppercase tracking-[0.3em] text-white/30">
                Confidencial · Uso exclusivo do cliente
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
