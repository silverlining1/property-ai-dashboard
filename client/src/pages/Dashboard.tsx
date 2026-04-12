import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Mail,
  MessageSquare,
  AlertTriangle,
  Phone,
  UserCheck,
  Loader2,
  ChevronDown,
  ChevronUp,
  Moon,
  Sun,
  BrainCircuit,
  Zap,
  Activity,
} from "lucide-react";
import type { EmailLog } from "@shared/schema";

// ─── Theme toggle ────────────────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const toggle = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };
  // Apply on mount
  useState(() => {
    document.documentElement.classList.toggle("dark", dark);
  });
  return { dark, toggle };
}

// ─── Sample emails for quick demo ────────────────────────────────────────────
const SAMPLES = [
  {
    label: "Broken heater",
    from: "tenant.johnson@gmail.com",
    subject: "Heater not working — it's freezing!",
    body: "Hi Earnest,\n\nOur heater stopped working last night and it's really cold in the apartment. There are two kids here. Can someone come take a look ASAP?\n\nThanks,\nMike Johnson\nUnit 4B",
  },
  {
    label: "Rent question",
    from: "sarah.m@outlook.com",
    subject: "Question about late fee",
    body: "Hello,\n\nI paid my rent on the 6th but I'm seeing a late fee on my portal. I thought the grace period was until the 5th? Can you look into this?\n\nThanks,\nSarah",
  },
  {
    label: "Noise complaint",
    from: "unit3a.resident@gmail.com",
    subject: "Noise from upstairs — please help",
    body: "Hi,\n\nThe tenant in unit 4A has been playing loud music past midnight every weekend for the past month. I've knocked on their door but it hasn't helped. I need this resolved.\n\n— Carlos, Unit 3A",
  },
  {
    label: "Move-out",
    from: "taylor.d@gmail.com",
    subject: "Moving out end of month",
    body: "Hi Earnest,\n\nI wanted to let you know that I'll be moving out at the end of this month (April 30). Can you send me the move-out checklist and let me know how to schedule the walk-through?\n\nThanks,\nTaylor",
  },
  {
    label: "Legal threat",
    from: "angry.tenant@gmail.com",
    subject: "I'm contacting a lawyer",
    body: "This is unacceptable. The mold issue in my bathroom has not been fixed in 3 months. I have documented everything and I am now contacting a tenant rights attorney. You will be hearing from them shortly.",
  },
];

// ─── Intent badge ─────────────────────────────────────────────────────────────
function IntentBadge({ intent }: { intent: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    maintenance_request: { label: "Maintenance", cls: "badge-maintenance" },
    payment_question: { label: "Payment", cls: "badge-payment" },
    general_inquiry: { label: "Inquiry", cls: "badge-inquiry" },
    move_in_out: { label: "Move In/Out", cls: "badge-moveinout" },
    complaint: { label: "Complaint", cls: "badge-complaint" },
    needs_human_review: { label: "Human Review", cls: "badge-human" },
  };
  const { label, cls } = map[intent] ?? { label: intent, cls: "badge-payment" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ─── Action badge ─────────────────────────────────────────────────────────────
function ActionBadge({ action }: { action: string }) {
  if (action === "replied")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-reply)" }}>
        <MessageSquare size={12} /> Replied
      </span>
    );
  if (action === "sms_sent")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-sms)" }}>
        <Phone size={12} /> SMS + Replied
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-forwarded)" }}>
      <UserCheck size={12} /> Forwarded
    </span>
  );
}

// ─── Confidence bar ───────────────────────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 72 ? "var(--color-reply)" : pct >= 50 ? "var(--color-maintenance)" : "var(--color-sms)";
  return (
    <div className="flex items-center gap-2">
      <div className="confidence-bar flex-1">
        <div className="confidence-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground">{pct}%</span>
    </div>
  );
}

// ─── Log row ──────────────────────────────────────────────────────────────────
function LogRow({ log }: { log: EmailLog }) {
  const [open, setOpen] = useState(false);
  const ts = new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const conf = parseFloat(log.confidence);

  return (
    <div className="border border-border rounded-lg overflow-hidden mb-2 transition-all">
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
        data-testid={`log-row-${log.id}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <IntentBadge intent={log.intent} />
            <ActionBadge action={log.action} />
            {log.urgency && (
              <span className="flex items-center gap-1 text-xs">
                <span className={`inline-block w-2 h-2 rounded-full urgency-${log.urgency}`} />
                <span className="text-muted-foreground capitalize">{log.urgency}</span>
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{ts}</span>
          </div>
          <div className="font-medium text-sm truncate">{log.subject}</div>
          <div className="text-xs text-muted-foreground truncate">{log.from}</div>
        </div>
        <div className="shrink-0 text-muted-foreground mt-1">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 bg-muted/20 space-y-4 border-t border-border">
          {/* Original email */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-1">Tenant Email</p>
            <p className="reply-body text-sm text-foreground">{log.body}</p>
          </div>

          <Separator />

          {/* AI Analysis */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">AI Analysis</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Intent</p>
                <IntentBadge intent={log.intent} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Confidence</p>
                <ConfidenceBar value={conf} />
              </div>
              {log.maintenanceDescription && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Issue</p>
                  <p className="text-sm">{log.maintenanceDescription}</p>
                  {log.maintenanceLocation && (
                    <p className="text-xs text-muted-foreground mt-1">Location: {log.maintenanceLocation}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Reply or forward note */}
          {log.reply ? (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {log.action === "sms_sent" ? "Auto-Reply Sent + SMS Alert Fired" : "Auto-Reply Sent"}
                </p>
                <div className="bg-card border border-border rounded-md p-3">
                  <p className="reply-body text-sm">{log.reply}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <Separator />
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-forwarded)" }}>
                <UserCheck size={14} />
                <span>Forwarded to owner for human review (low confidence or flagged intent)</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5">
        <div className="rounded-lg p-2" style={{ background: color + "20", color }}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { dark, toggle } = useTheme();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({ from: "", subject: "", body: "" });
  const [result, setResult] = useState<null | { reply: string | null; action: string; classification: Record<string, unknown>; mock?: boolean }>(null);

  const { data: logs = [], isLoading: logsLoading } = useQuery<EmailLog[]>({
    queryKey: ["/api/logs"],
    refetchInterval: 5000,
  });

  const { data: stats } = useQuery<{ total: number; replied: number; forwarded: number; sms_sent: number }>({
    queryKey: ["/api/stats"],
    refetchInterval: 5000,
  });

  const simulate = useMutation({
    mutationFn: (body: typeof form) =>
      apiRequest("POST", "/api/simulate", body).then((r) => r.json()),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["/api/logs"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Email processed", description: `Action: ${data.action}` });
    },
    onError: () => {
      toast({ title: "Processing failed", variant: "destructive" });
    },
  });

  function loadSample(s: (typeof SAMPLES)[0]) {
    setForm({ from: s.from, subject: s.subject, body: s.body });
    setResult(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.from || !form.subject || !form.body) return;
    setResult(null);
    simulate.mutate(form);
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Logo */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="MySmartRoom AI" className="text-primary">
              <rect width="28" height="28" rx="7" fill="currentColor" fillOpacity="0.12" />
              <path d="M7 14h4l2-5 3 10 2-5h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="21" cy="8" r="2" fill="currentColor" />
            </svg>
            <div>
              <span className="font-semibold text-sm">MySmartRoom</span>
              <span className="text-muted-foreground text-sm"> · Property AI</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-green-500 live-dot" />
              Agent live
            </span>
            <button
              onClick={toggle}
              data-testid="theme-toggle"
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              aria-label="Toggle theme"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Processed" value={stats?.total ?? 0} icon={Mail} color="#6366f1" />
          <StatCard label="Auto-Replied" value={stats?.replied ?? 0} icon={MessageSquare} color="var(--color-reply)" />
          <StatCard label="SMS + Replied" value={stats?.sms_sent ?? 0} icon={Phone} color="var(--color-sms)" />
          <StatCard label="Forwarded" value={stats?.forwarded ?? 0} icon={AlertTriangle} color="var(--color-forwarded)" />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left: Simulator */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap size={16} className="text-primary" />
                  Email Simulator
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Submit a tenant email and watch the AI agent classify, decide, and reply in real time.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Sample buttons */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Quick samples:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SAMPLES.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => loadSample(s)}
                        data-testid={`sample-${s.label}`}
                        className="px-2.5 py-1 rounded-full text-xs bg-muted hover:bg-secondary transition-colors border border-border"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <Label htmlFor="from" className="text-xs">From</Label>
                    <Input
                      id="from"
                      data-testid="input-from"
                      type="email"
                      placeholder="tenant@email.com"
                      value={form.from}
                      onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="subject" className="text-xs">Subject</Label>
                    <Input
                      id="subject"
                      data-testid="input-subject"
                      placeholder="Email subject"
                      value={form.subject}
                      onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="body" className="text-xs">Body</Label>
                    <Textarea
                      id="body"
                      data-testid="input-body"
                      placeholder="Write or paste the tenant email here..."
                      rows={6}
                      value={form.body}
                      onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                      required
                      className="resize-none"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={simulate.isPending}
                    data-testid="button-submit"
                    className="w-full"
                  >
                    {simulate.isPending ? (
                      <>
                        <Loader2 size={14} className="mr-2 animate-spin" />
                        Processing…
                      </>
                    ) : (
                      <>
                        <BrainCircuit size={14} className="mr-2" />
                        Run Through Agent
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Result card */}
            {result && (
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity size={14} className="text-primary" />
                    Agent Decision
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <IntentBadge intent={result.classification.intent as string} />
                    <ActionBadge action={result.action} />
                    {result.mock && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                        Demo mode — add API credits for live AI
                      </span>
                    )}
                    <div className="flex-1 min-w-[120px]">
                      <ConfidenceBar value={parseFloat(result.classification.confidence as string)} />
                    </div>
                  </div>

                  {(result.classification.maintenance as Record<string, string> | null)?.description && (
                    <div className="text-sm bg-muted/40 rounded-md p-3">
                      <p className="font-medium text-xs text-muted-foreground mb-1">Issue Extracted</p>
                      <p>{(result.classification.maintenance as Record<string, string>).description}</p>
                      {(result.classification.maintenance as Record<string, string>).location && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Location: {(result.classification.maintenance as Record<string, string>).location}
                        </p>
                      )}
                    </div>
                  )}

                  {result.reply ? (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Reply Sent</p>
                      <div className="bg-card border border-border rounded-md p-3">
                        <p className="reply-body text-sm">{result.reply}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm p-3 rounded-md" style={{ background: "var(--color-forwarded-bg)", color: "var(--color-forwarded)" }}>
                      <UserCheck size={14} />
                      Forwarded to owner for human review
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Activity log */}
          <div>
            <Card className="h-full">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity size={16} className="text-primary" />
                  Activity Log
                  {logsLoading && <Loader2 size={12} className="ml-1 animate-spin text-muted-foreground" />}
                </CardTitle>
                <p className="text-xs text-muted-foreground">All emails processed this session</p>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    <Mail size={32} className="mx-auto mb-3 opacity-30" />
                    <p>No emails processed yet.</p>
                    <p className="text-xs mt-1">Use the simulator to send your first one.</p>
                  </div>
                ) : (
                  <div className="max-h-[600px] overflow-y-auto pr-1">
                    {logs.map((log) => (
                      <LogRow key={log.id} log={log} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Architecture diagram */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium">How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground justify-center">
              {[
                { icon: Mail, label: "Gmail inbox" },
                { sep: "→" },
                { icon: BrainCircuit, label: "Claude classifier" },
                { sep: "→" },
                { icon: Activity, label: "Intent + confidence" },
                { sep: "→" },
                { icon: MessageSquare, label: "RAG reply (your style)" },
                { sep: "+" },
                { icon: Phone, label: "SMS alert (maintenance)" },
              ].map((item, i) =>
                "sep" in item ? (
                  <span key={i} className="text-border font-bold">{item.sep}</span>
                ) : (
                  <span key={i} className="flex items-center gap-1 bg-muted px-2.5 py-1 rounded-full">
                    {item.icon && <item.icon size={11} />}
                    {item.label}
                  </span>
                )
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Built by{" "}
          <a href="https://codealchemistlabs.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            Code Alchemist Labs
          </a>{" "}
          · MySmartRoom Property AI
        </p>
      </main>
    </div>
  );
}
