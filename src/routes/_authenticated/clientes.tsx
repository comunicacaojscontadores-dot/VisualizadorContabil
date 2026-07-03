import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listClientes, upsertCliente, deleteCliente } from "@/lib/clientes.functions";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: ClientesPage,
});

type Cliente = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  logo_url: string | null;
};

function ClientesPage() {
  const listFn = useServerFn(listClientes);
  const upFn = useServerFn(upsertCliente);
  const delFn = useServerFn(deleteCliente);
  const qc = useQueryClient();
  const { data: clientes } = useQuery({ queryKey: ["clientes"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Cliente> | null>(null);

  function openNew() { setEditing({ razao_social: "" }); setOpen(true); }
  function openEdit(c: Cliente) { setEditing(c); setOpen(true); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing?.razao_social) return;
    try {
      await upFn({ data: {
        id: editing.id,
        razao_social: editing.razao_social,
        nome_fantasia: editing.nome_fantasia || null,
        cnpj: editing.cnpj || null,
        email: editing.email || null,
        telefone: editing.telefone || null,
        logo_url: editing.logo_url || null,
      }});
      toast.success("Cliente salvo");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["clientes"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este cliente?")) return;
    await delFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["clientes"] });
    toast.success("Excluído");
  }

  return (
    <AppShell title="Clientes">
      <div className="flex justify-end mb-4">
        <Button onClick={openNew} className="bg-gradient-primary shadow-glow">
          <Plus className="size-4 mr-1" />Novo cliente
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {clientes?.map((c) => (
          <Card key={c.id} className="glass-card p-5 group hover:shadow-glow transition-all animate-fade-up">
            <div className="flex items-start gap-3">
              <div className="size-12 rounded-xl bg-accent grid place-items-center shrink-0 overflow-hidden">
                {c.logo_url ? <img src={c.logo_url} alt="" className="size-full object-cover" /> : <Building2 className="size-5 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{c.razao_social}</div>
                {c.nome_fantasia && <div className="text-xs text-muted-foreground truncate">{c.nome_fantasia}</div>}
                {c.cnpj && <div className="text-xs text-muted-foreground mt-1">{c.cnpj}</div>}
              </div>
            </div>
            <div className="flex gap-2 mt-4 opacity-60 group-hover:opacity-100 transition-opacity">
              <Button size="sm" variant="ghost" onClick={() => openEdit(c)} className="flex-1"><Pencil className="size-3.5 mr-1" />Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(c.id)} className="text-destructive hover:text-destructive"><Trash2 className="size-3.5" /></Button>
            </div>
          </Card>
        ))}
        {!clientes?.length && (
          <div className="col-span-full text-center py-16 text-muted-foreground text-sm">
            Nenhum cliente cadastrado.
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-card">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div><Label>Razão social *</Label><Input required value={editing?.razao_social ?? ""} onChange={(e) => setEditing({ ...editing!, razao_social: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome fantasia</Label><Input value={editing?.nome_fantasia ?? ""} onChange={(e) => setEditing({ ...editing!, nome_fantasia: e.target.value })} /></div>
              <div><Label>CNPJ</Label><Input value={editing?.cnpj ?? ""} onChange={(e) => setEditing({ ...editing!, cnpj: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>E-mail</Label><Input type="email" value={editing?.email ?? ""} onChange={(e) => setEditing({ ...editing!, email: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={editing?.telefone ?? ""} onChange={(e) => setEditing({ ...editing!, telefone: e.target.value })} /></div>
            </div>
            <div><Label>URL do logo</Label><Input placeholder="https://..." value={editing?.logo_url ?? ""} onChange={(e) => setEditing({ ...editing!, logo_url: e.target.value })} /></div>
            <DialogFooter><Button type="submit" className="bg-gradient-primary">Salvar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
