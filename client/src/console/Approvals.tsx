import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api, canDecide, type Approval } from "./api";
import { ago, describeAction, isUrgent, label, urgencyClass } from "./format";
import { useMe } from "./session";

const STATES = ["pending", "held", "sent", "failed"] as const;

export default function Approvals() {
  const [state, setState] = useState<(typeof STATES)[number]>("pending");
  const { data, isLoading, error } = useQuery({
    queryKey: ["approvals", state],
    queryFn: () => api<Approval[]>(`/v1/approvals?state=${state}`),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Approvals</h1>
        <div className="flex gap-1" role="tablist" aria-label="Approval state">
          {STATES.map((s) => (
            <Button key={s} role="tab" aria-selected={state === s} size="sm" variant={state === s ? "default" : "ghost"} onClick={() => setState(s)}>
              {label(s)}
            </Button>
          ))}
        </div>
      </div>
      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error && <p className="text-destructive text-sm">{(error as Error).message}</p>}
      {data && data.length === 0 && (
        <p className="text-muted-foreground text-sm py-12 text-center">
          {state === "pending" ? "Nothing waiting for review. New drafts appear here automatically." : `No ${label(state).toLowerCase()} items.`}
        </p>
      )}
      <div className="space-y-4">
        {data?.map((a) => <ApprovalCard key={a.id} approval={a} />)}
      </div>
    </div>
  );
}

function ApprovalCard({ approval: a }: { approval: Approval }) {
  const me = useMe();
  const qc = useQueryClient();
  const [draft, setDraft] = useState(a.draft);
  const [rejecting, setRejecting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const decidable = a.state === "pending" && canDecide(me.role);
  const edited = draft.trim() !== a.draft.trim();

  const done = () => qc.invalidateQueries({ queryKey: ["approvals"] });
  const approve = useMutation({
    mutationFn: () => api<Approval>(`/v1/approvals/${a.id}/approve`, { method: "POST", body: edited ? { edited_text: draft } : {} }),
    onSuccess: done,
  });
  const reject = useMutation({
    mutationFn: () => api<Approval>(`/v1/approvals/${a.id}/reject`, { method: "POST", body: { feedback } }),
    onSuccess: done,
  });
  const err = (approve.error || reject.error) as Error | null;
  const conv = a.conversation;

  return (
    <Card data-testid="approval">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{conv?.contact_name || "Unknown sender"}</span>
          {conv && <Badge variant="outline">{conv.channel.toUpperCase()}</Badge>}
          {conv?.intent && <Badge variant="secondary">{label(conv.intent)}</Badge>}
          {conv && isUrgent(conv.urgency) && <Badge className={urgencyClass(conv.urgency)}>{label(conv.urgency)}</Badge>}
          {a.round > 1 && <Badge variant="outline">Revision {a.round}</Badge>}
          <span className="text-muted-foreground ml-auto">{ago(a.created_at)}</span>
        </div>
        {conv && (
          <Link href={`/conversations/${conv.id}`} className="text-sm text-muted-foreground hover:text-foreground truncate">
            {conv.subject || "(no subject)"}
          </Link>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {a.inbound && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">They wrote</p>
            <blockquote className="border-l-2 border-border pl-3 text-sm whitespace-pre-wrap">{a.inbound.body}</blockquote>
          </div>
        )}
        {a.reason && a.state !== "pending" && <p className="text-sm text-muted-foreground">{a.reason}</p>}
        <div>
          <label htmlFor={`draft-${a.id}`} className="text-xs font-medium text-muted-foreground">
            {decidable ? "Draft reply (edit before approving if needed)" : "Reply"}
          </label>
          <Textarea id={`draft-${a.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} readOnly={!decidable} rows={Math.min(12, Math.max(4, draft.split("\n").length + 1))} className="mt-1" />
        </div>
        {a.actions.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Also, once approved</p>
            <ul className="text-sm list-disc pl-5 space-y-0.5">
              {a.actions.map((act, i) => (
                <li key={i}>{describeAction(act)}</li>
              ))}
            </ul>
          </div>
        )}
        {err && (
          <p role="alert" className="text-sm text-destructive">
            {err.message}
          </p>
        )}
        {decidable && !rejecting && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => approve.mutate()} disabled={approve.isPending || !draft.trim()}>
              {approve.isPending ? "Sending…" : edited ? "Approve edited reply" : "Approve & send"}
            </Button>
            <Button variant="outline" onClick={() => setRejecting(true)}>
              Ask for a rewrite
            </Button>
          </div>
        )}
        {decidable && rejecting && (
          <div className="space-y-2">
            <label htmlFor={`fb-${a.id}`} className="text-xs font-medium text-muted-foreground">
              What should change? The assistant rewrites the draft using this.
            </label>
            <Textarea id={`fb-${a.id}`} value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} />
            <div className="flex gap-2">
              <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending || feedback.trim().length < 3}>
                {reject.isPending ? "Sending…" : "Request rewrite"}
              </Button>
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {a.state === "pending" && !canDecide(me.role) && (
          <p className="text-xs text-muted-foreground">A manager, admin or owner needs to approve this.</p>
        )}
      </CardContent>
    </Card>
  );
}
