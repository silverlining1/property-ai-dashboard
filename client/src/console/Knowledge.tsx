import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, canDecide, KNOWLEDGE_KINDS, type KnowledgeDoc } from "./api";
import { FormError, errorText } from "./AuthCard";
import { label } from "./format";
import { useMe } from "./session";

const selectClass = "block h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60";

export default function Knowledge() {
  const me = useMe();
  const { data, isLoading, error } = useQuery({ queryKey: ["knowledge"], queryFn: () => api<KnowledgeDoc[]>("/v1/knowledge") });
  // Managers and up add and remove documents, matching who can approve the replies drafted from them.
  const editable = canDecide(me.role);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Knowledge</h1>
        <p className="text-sm text-muted-foreground">
          Leases, house rules, FAQs and listings the agent draws on when it drafts replies. Content is stored encrypted and isn't shown here
          once saved.
        </p>
      </div>
      {editable && <AddDocument />}
      <section className="space-y-2" aria-labelledby="docs-heading">
        <h2 id="docs-heading" className="font-medium">
          Documents
        </h2>
        {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {error && <p className="text-destructive text-sm">{(error as Error).message}</p>}
        {data && data.length === 0 && <p className="text-muted-foreground text-sm">No documents yet.</p>}
        {data && data.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {data.map((d) => (
              <DocumentRow key={d.id} doc={d} editable={editable} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AddDocument() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", kind: "house_rules" as KnowledgeDoc["kind"], content: "" });
  const [added, setAdded] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => api<{ id: string }>("/v1/knowledge", { method: "POST", body: form }),
    onSuccess: () => {
      setAdded(form.title);
      setForm({ ...form, title: "", content: "" });
      return qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setAdded(null);
    add.mutate();
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="font-medium">Add a document</h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Title</Label>
              <Input id="doc-title" required maxLength={300} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-kind">Type</Label>
              <select
                id="doc-kind"
                className={selectClass + " w-full"}
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as KnowledgeDoc["kind"] })}
              >
                {KNOWLEDGE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {label(k)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-content">Content</Label>
            <Textarea
              id="doc-content"
              required
              rows={8}
              maxLength={200_000}
              placeholder="Paste the text the agent should know, e.g. quiet hours, parking rules, pet policy."
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </div>
          <FormError error={add.error ? errorText(add.error) : null} />
          {added && (
            <p role="status" className="text-sm text-muted-foreground">
              Added “{added}”.
            </p>
          )}
          <Button type="submit" disabled={add.isPending}>
            {add.isPending ? "Adding…" : "Add document"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DocumentRow({ doc: d, editable }: { doc: KnowledgeDoc; editable: boolean }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => api(`/v1/knowledge/${d.id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge"] }),
  });

  return (
    <li data-testid="knowledge-doc" className="px-3 py-2 text-sm space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 flex items-center gap-2">
          <span className="font-medium truncate">{d.title}</span>
          <Badge variant="secondary">{label(d.kind)}</Badge>
        </span>
        {editable && !confirming && (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Remove
          </Button>
        )}
        {editable && confirming && (
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground">The agent stops using it.</span>
            <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Confirm remove
            </Button>
            <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </span>
        )}
      </div>
      <FormError error={remove.error ? errorText(remove.error) : null} />
    </li>
  );
}
