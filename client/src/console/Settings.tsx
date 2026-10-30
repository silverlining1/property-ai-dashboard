import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, canManageTeam, type OrgSettings } from "./api";
import { FormError, errorText } from "./AuthCard";
import { useMe } from "./session";

const selectClass = "block h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60";

const PROVIDERS = [
  { value: "", text: "Platform default" },
  { value: "anthropic", text: "Anthropic (Claude)" },
  { value: "ollama", text: "Ollama (self-hosted)" },
  { value: "openai", text: "OpenAI-compatible endpoint" },
];

export default function Settings() {
  const me = useMe();
  if (!canManageTeam(me.role)) {
    return <p className="text-muted-foreground text-sm">Only owners and admins can change settings.</p>;
  }
  return <SettingsPage />;
}

function SettingsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["settings"], queryFn: () => api<OrgSettings>("/v1/settings") });
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          How the agent signs, times and drafts replies for {data?.name ?? "your organization"}. Two-factor requirements are on the{" "}
          <a className="text-primary underline-offset-4 hover:underline" href="#/team">
            Team
          </a>{" "}
          page.
        </p>
      </div>
      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error && <p className="text-destructive text-sm">{(error as Error).message}</p>}
      {/* The forms mount once the settings have loaded and start from those values. */}
      {data && (
        <>
          <BrandForm settings={data} />
          <ApprovalForm settings={data} />
          <ModelForm settings={data} />
        </>
      )}
    </div>
  );
}

/** One card per settings group: each saves only its own keys, so saving one never overwrites another. */
function Section({ title, description, onSubmit, pending, error, saved, children }: {
  title: string;
  description: string;
  onSubmit: () => void;
  pending: boolean;
  error: unknown;
  saved: boolean;
  children: ReactNode;
}) {
  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3" aria-label={title}>
          {children}
          <FormError error={error ? errorText(error) : null} />
          {saved && (
            <p role="status" className="text-sm text-muted-foreground">
              Saved.
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function useSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Omit<OrgSettings, "name">>) => api<OrgSettings>("/v1/settings", { method: "PATCH", body: patch }),
    onSuccess: (updated) => qc.setQueryData(["settings"], (prev: OrgSettings | undefined) => ({ ...updated, name: prev?.name ?? "" })),
  });
}

function BrandForm({ settings }: { settings: OrgSettings }) {
  const [signature, setSignature] = useState(settings.brand?.signature ?? "");
  const save = useSave();
  return (
    <Section
      title="Reply signature"
      description="How the agent signs the replies it drafts."
      onSubmit={() => save.mutate({ brand: { signature: signature.trim() } })}
      pending={save.isPending}
      error={save.error}
      saved={save.isSuccess}
    >
      <div className="space-y-1.5">
        <Label htmlFor="signature">Signature</Label>
        <Input id="signature" required maxLength={200} value={signature} onChange={(e) => setSignature(e.target.value)} />
      </div>
    </Section>
  );
}

function ApprovalForm({ settings }: { settings: OrgSettings }) {
  const [expiry, setExpiry] = useState(String(settings.approval?.expiry_hours ?? 4));
  const [rounds, setRounds] = useState(String(settings.approval?.max_rounds ?? 2));
  const save = useSave();
  return (
    <Section
      title="Approvals"
      description="Every reply to a resident or applicant waits for a manager's approval; that can't be turned off."
      onSubmit={() => save.mutate({ approval: { expiry_hours: Number(expiry), max_rounds: Number(rounds) } })}
      pending={save.isPending}
      error={save.error}
      saved={save.isSuccess}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="expiry">Hold drafts after (hours)</Label>
          <Input id="expiry" type="number" required min={0.5} max={168} step={0.5} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <p className="text-xs text-muted-foreground">Drafts still waiting are held and staff are alerted.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rounds">Revision rounds</Label>
          <Input id="rounds" type="number" required min={0} max={5} step={1} value={rounds} onChange={(e) => setRounds(e.target.value)} />
          <p className="text-xs text-muted-foreground">How many times the agent redrafts after a rejection.</p>
        </div>
      </div>
    </Section>
  );
}

function ModelForm({ settings }: { settings: OrgSettings }) {
  const llm = settings.llm ?? {};
  const [provider, setProvider] = useState(llm.provider ?? "");
  const [model, setModel] = useState(llm.model ?? "");
  const [baseUrl, setBaseUrl] = useState(llm.base_url ?? "");
  const [pii, setPii] = useState<"redact" | "allow">(llm.pii_policy ?? "redact");
  const save = useSave();
  const needsUrl = provider === "openai" || provider === "ollama";

  function submit() {
    // Empty fields are sent as null, which removes them: the platform default applies again.
    save.mutate({
      llm: {
        provider: provider || null,
        model: provider ? model.trim() || null : null,
        base_url: needsUrl ? baseUrl.trim() || null : null,
        pii_policy: pii,
      } as OrgSettings["llm"],
    });
  }

  return (
    <Section
      title="AI model"
      description="Which model drafts replies, and whether personal details are masked before they reach it."
      onSubmit={submit}
      pending={save.isPending}
      error={save.error}
      saved={save.isSuccess}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="provider">Provider</Label>
          <select id="provider" className={selectClass} value={provider} onChange={(e) => setProvider(e.target.value)}>
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.text}
              </option>
            ))}
          </select>
        </div>
        {provider && (
          <div className="space-y-1.5">
            <Label htmlFor="model">Model</Label>
            <Input id="model" placeholder="Platform default model" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
        )}
      </div>
      {needsUrl && (
        <div className="space-y-1.5">
          <Label htmlFor="base-url">Endpoint URL</Label>
          <Input
            id="base-url"
            type="url"
            required={provider === "openai"}
            placeholder="https://…"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Must be https, on a host the platform allows.</p>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="pii">Personal details sent to external models</Label>
        <select id="pii" className={selectClass} value={pii} onChange={(e) => setPii(e.target.value as "redact" | "allow")}>
          <option value="redact">Masked (recommended)</option>
          <option value="allow">Sent as written</option>
        </select>
      </div>
    </Section>
  );
}
