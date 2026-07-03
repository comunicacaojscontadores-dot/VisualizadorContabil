import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPublicDemo } from "@/lib/demonstrativos.functions";
import { PublicReport } from "@/components/public-report";
import { Loader2 } from "lucide-react";
import type { DemoData } from "@/lib/demo-types";

export const Route = createFileRoute("/d/$slug")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: `Demonstrativo — ${params.slug}` },
      { name: "description", content: "Demonstrativo contábil interativo." },
      { property: "og:title", content: "Demonstrativo Contábil" },
      { property: "og:description", content: "Visualize o demonstrativo contábil online." },
    ],
  }),
  component: PublicDemo,
  notFoundComponent: () => <Empty title="Demonstrativo não encontrado" />,
  errorComponent: () => <Empty title="Não foi possível carregar" />,
});

function PublicDemo() {
  const { slug } = Route.useParams();
  const fn = useServerFn(getPublicDemo);
  const { data, isLoading } = useQuery({ queryKey: ["pub", slug], queryFn: () => fn({ data: { slug } }) });

  if (isLoading) return <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="size-6 animate-spin text-primary" /></div>;
  if (!data) return <Empty title="Demonstrativo indisponível" />;

  return <PublicReport dados={(data.dados ?? {}) as DemoData} cliente={data.clientes} competencia={data.competencia} publishedAt={data.published_at} />;
}

function Empty({ title }: { title: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-gradient-hero grid-bg px-4">
      <div className="text-center max-w-md glass-card rounded-2xl p-10">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground mt-2">O link pode ter expirado ou ainda não foi publicado.</p>
      </div>
    </div>
  );
}
