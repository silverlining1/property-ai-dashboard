import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, canManageTeam, type ConnectorAccount, type ConnectorManifest } from "./api";
import { FormError, errorText } from "./AuthCard";
import { ago, label } from "./format";
import { useMe } from "./session";

const CATEGORY_ORDER = ["productivity", "messaging", "chatops", "property_management", "short_term_rental", "crm"];
const CATEGORY_TEXT: Record<string, string> = {
  productivity: "Email and calendar",
  messaging: "Text messaging",
  chatops: "Team chat (approvals)",
  property_management: "Property management systems",
  short_term_rental: "Short-term rentals",
  crm: "CRM",
};

const CAPABILITY_TEXT: Record<string, string> = {
  mail: "Email",
  calendar: "Calendar",
  sms: "SMS",
  whatsapp: "WhatsApp",
  voice: "Voice",
  webchat: "Web chat",
  chatops: "Team chat approvals",
  pms_residents: "Residents",
  pms_units: "Units",
  pms_ledger: "Rent ledger",
  pms_work_orders: "Work orders",
  pms_reservations: "Reservations",
  crm: "CRM",
};

export default function Connectors() {
  const me = useMe();
  // Connected accounts hold credentials, so the API limits them to admins.
  if (!canManageTeam(me.role)) {
    return <p className="text-muted-foreground text-sm">Only owners and admins can manage connectors.</p>;
  }
  return <ConnectorsPage />;
}

function ConnectorsPage() {
  const catalog = useQuery({ queryKey: ["connector-catalog"], queryFn: () => api<ConnectorManifest[]>("/v1/connectors/catalog") });
  const accounts = useQuery({ queryKey: ["connectors"], queryFn: () => api<ConnectorAccount[]>("/v1/connectors") });
  const byKey = new Map(catalog.data?.map((m) => [m.key, m]));
  // Known kinds first, in a set order; any kind the API adds later still shows, after them.
  const extra = Array.from(new Set(catalog.data?.map((m) => m.category))).filter((c) => !CATEGORY_ORDER.includes(c));
  const groups = [...CATEGORY_ORDER, ...extra]
    .map((c) => ({ category: c, items: catalog.data?.filter((m) => m.category === c) ?? [] }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Connectors</h1>
        <p className="text-sm text-muted-foreground">
          Systems the agent reads from and acts on. Credentials are encrypted when saved and are never shown again.
        </p>
      </div>
      <section className="space-y-2" aria-labelledby="connected-heading">
        <h2 id="connected-heading" className="font-medium">
          Connected
        </h2>
        {accounts.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {accounts.error && <p className="text-destructive text-sm">{(accounts.error as Error).message}</p>}
        {accounts.data && accounts.data.length === 0 && <p className="text-muted-foreground text-sm">Nothing connected yet.</p>}
        {accounts.data && accounts.data.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {accounts.data.map((a) => (
              <AccountRow key={a.id} account={a} name={byKey.get(a.connector)?.name ?? a.connector} />
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-4" aria-labelledby="add-heading">
        <h2 id="add-heading" className="font-medium">
          Add a connection
        </h2>
        {catalog.error && <p className="text-destructive text-sm">{(catalog.error as Error).message}</p>}
        {groups.map((g) => (
          <div key={g.category} className="space-y-2">
            <h3 className="text-sm text-muted-foreground">{CATEGORY_TEXT[g.category] ?? label(g.category)}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {g.items.map((m) => (
                <CatalogCard key={m.key} manifest={m} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

// "active" means saved and not known to fail: it's set on connect and kept while tests pass.
function statusBadge(status: string) {
  if (status === "active") return <Badge variant="secondary">Connected</Badge>;
  if (status === "error") return <Badge variant="destructive">Failing</Badge>;
  return <Badge variant="outline">{label(status)}</Badge>;
}

function AccountRow({ account: a, name }: { account: ConnectorAccount; name: string }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["connectors"] });
  const test = useMutation({ mutationFn: () => api<{ ok: boolean }>(`/v1/connectors/${a.id}/test`, { method: "POST" }), onSettled: refresh });
  const remove = useMutation({ mutationFn: () => api(`/v1/connectors/${a.id}`, { method: "DELETE" }), onSuccess: refresh });
  // The newest of the row's actions decides what's shown, so an older result can't linger after a newer one.
  const latest = [test, remove].sort((x, y) => y.submittedAt - x.submittedAt)[0];

  return (
    <li data-testid="connector-account" className="px-3 py-2 text-sm space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="font-medium">{a.label || name}</span>
          {a.label && a.label !== name && <span className="text-muted-foreground"> · {name}</span>}
          <span className="text-muted-foreground"> · added {ago(a.created_at)}</span>
        </span>
        <span className="flex items-center gap-2">
          {statusBadge(a.status)}
          {!confirming && (
            <>
              <Button size="sm" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
                {test.isPending ? "Testing…" : "Test"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                Remove
              </Button>
            </>
          )}
          {confirming && (
            <>
              <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
                Confirm remove
              </Button>
              <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          )}
        </span>
      </div>
      {latest === test && test.data && (
        <p role="status" className={test.data.ok ? "text-muted-foreground" : "text-destructive"}>
          {test.data.ok ? "Connection works." : "The test failed. Check the credentials, then remove and add it again."}
        </p>
      )}
      <FormError error={latest.error ? errorText(latest.error) : null} />
    </li>
  );
}

function CatalogCard({ manifest: m }: { manifest: ConnectorManifest }) {
  const [open, setOpen] = useState(false);
  const planned = m.status === "planned";

  return (
    <Card data-testid="connector-option">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-sm">{m.name}</h4>
          {m.status === "beta" && <Badge variant="outline">Beta</Badge>}
          {planned && <Badge variant="secondary">Planned</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{m.capabilities.map((c) => CAPABILITY_TEXT[c] ?? label(c)).join(", ")}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {m.notes && <p className="text-xs text-muted-foreground">{m.notes}</p>}
        {!planned && !open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Connect
          </Button>
        )}
        {open && <ConnectForm manifest={m} onDone={() => setOpen(false)} />}
      </CardContent>
    </Card>
  );
}

function ConnectForm({ manifest: m, onDone }: { manifest: ConnectorManifest; onDone: () => void }) {
  const qc = useQueryClient();
  const [labelText, setLabelText] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const add = useMutation({
    mutationFn: () => {
      // Blank optional fields are left out rather than saved as empty strings.
      const credentials = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ""));
      return api<{ id: string }>("/v1/connectors", { method: "POST", body: { connector: m.key, label: labelText, credentials } });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["connectors"] });
      onDone();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate();
  }

  return (
    <form onSubmit={submit} className="space-y-3" aria-label={`Connect ${m.name}`}>
      {m.auth === "oauth2" && (
        <p className="text-xs text-muted-foreground">
          Until one-click sign-in is available, use the tokens from an app you registered with {m.name.split(" (")[0]}.
        </p>
      )}
      {m.auth === "file_import" && (
        <p className="text-xs text-muted-foreground">No credentials needed. Roster files are imported separately.</p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`${m.key}-label`}>Name (optional)</Label>
        <Input id={`${m.key}-label`} placeholder={m.name} value={labelText} onChange={(e) => setLabelText(e.target.value)} />
      </div>
      {m.fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={`${m.key}-${f.key}`}>
            {f.label}
            {f.optional && <span className="text-muted-foreground font-normal"> (optional)</span>}
          </Label>
          <Input
            id={`${m.key}-${f.key}`}
            type={f.secret ? "password" : "text"}
            autoComplete="off"
            required={!f.optional}
            value={values[f.key] ?? ""}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
          />
        </div>
      ))}
      <FormError error={add.error ? errorText(add.error) : null} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={add.isPending}>
          {add.isPending ? "Connecting…" : "Connect"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
