import { useState, useEffect, useRef, useCallback } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Mail, MessageSquare, Phone, AlertTriangle, Wrench, Users, Bell,
  Activity, BrainCircuit, Moon, Sun, Loader2, Send, ChevronDown,
  ChevronUp, Zap, CheckCircle, ArrowRight, Radio,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Member { id:number; name:string; unit:string; email:string; avatar:string; score:number; scoreHistory:string; status:string; }
interface Thread { id:number; memberId:number; lastMessage:string; lastAt:number; unread:number; intent:string|null; status:string; }
interface Message { id:number; threadId:number; role:string; body:string; createdAt:number; }
interface Vendor { id:number; name:string; specialty:string; phone:string; available:number; }
interface Ticket { id:number; memberId:number; unit:string; issueType:string; description:string; urgency:string; status:string; vendorId:number|null; createdAt:number; }
interface Sms { id:number; to:string; toName:string; body:string; type:string; ticketId:number|null; createdAt:number; }
interface Notification { id:number; house:string; body:string; severity:string; deliveries:string; createdAt:number; }
interface ActivityItem { id:number; type:string; label:string; detail:string|null; refId:number|null; refType:string|null; urgent:number; createdAt:number; }
interface Stats { tickets_open:number; tickets_resolved:number; sms_sent:number; emergencies:number; vendors_dispatched:number; threads_total:number; auto_replied:number; forwarded:number; }

// ─── Theme ─────────────────────────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  return { dark, toggle: () => setDark(d => !d) };
}

// ─── Scenario presets ──────────────────────────────────────────────────────────
const SCENARIOS = [
  { label: "🔧 Broken heater", body: "Hi, our heater stopped working last night. It's freezing in here and we have two kids. Please send someone ASAP — Unit 4B." },
  { label: "🚰 Toilet flooding", body: "EMERGENCY — water is flooding from the toilet in my bathroom, it won't stop! I've turned off the valve but the floor is soaked. Unit 2A." },
  { label: "💡 No power", body: "My electricity went out about an hour ago. The circuit breaker tripped and won't reset. Can someone come check it? — Unit 3A" },
  { label: "🐜 Pest issue", body: "Hi Earnest, there are cockroaches in my kitchen. I've seen them multiple times this week near the stove. Please have someone come out. Unit 2B." },
  { label: "💰 Late fee question", body: "Hey, I see a $75 late fee on my portal but I paid rent on the 4th. I thought the grace period was until the 5th? Can you look into this?" },
  { label: "😤 Noise complaint", body: "The tenant in Unit 4A has been playing loud music past midnight every weekend for a month. I've knocked but nothing changed. Unit 3A." },
  { label: "📦 Move-out notice", body: "Hi Earnest, I'll be moving out at the end of this month (April 30). Can you send me the move-out checklist and schedule the walk-through?" },
  { label: "⚖️ Legal threat", body: "The mold issue in my bathroom has not been fixed in 3 months. I have documented everything and I am now contacting a tenant rights attorney." },
];

// ─── Intent badge ──────────────────────────────────────────────────────────────
function IntentBadge({ intent }: { intent: string | null }) {
  if (!intent) return null;
  const map: Record<string, { label: string; cls: string }> = {
    maintenance_request: { label: "Maintenance", cls: "badge-maintenance" },
    payment_question:    { label: "Payment",     cls: "badge-payment" },
    general_inquiry:     { label: "Inquiry",     cls: "badge-inquiry" },
    move_in_out:         { label: "Move In/Out", cls: "badge-moveinout" },
    complaint:           { label: "Complaint",   cls: "badge-complaint" },
    needs_human_review:  { label: "Review",      cls: "badge-human" },
  };
  const { label, cls } = map[intent] ?? { label: intent, cls: "badge-payment" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
}

// ─── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-4 pb-4">
        <div className="rounded-lg p-2 shrink-0" style={{ background: color + "20", color }}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-xl font-bold leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground leading-tight">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Avatar chip ───────────────────────────────────────────────────────────────
function Avatar({ initials, size = "md" }: { initials: string; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  return (
    <div className={`${sz} rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0`}>
      {initials}
    </div>
  );
}

// ─── Messenger Panel ──────────────────────────────────────────────────────────
function MessengerPanel({ members }: { members: Member[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedThread, setSelectedThread] = useState<number | null>(null);
  const [selectedMember, setSelectedMember] = useState<number>(members[0]?.id ?? 1);
  const [compose, setCompose] = useState("");
  const [activeScenario, setActiveScenario] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: threads = [] } = useQuery<Thread[]>({ queryKey: ["/api/threads"], refetchInterval: 3000 });
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/threads", selectedThread, "messages"],
    queryFn: () => selectedThread ? apiRequest("GET", `/api/threads/${selectedThread}/messages`).then(r => r.json()) : Promise.resolve([]),
    enabled: !!selectedThread,
    refetchInterval: 2000,
  });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMutation = useMutation({
    mutationFn: (body: string) => apiRequest("POST", "/api/threads/message", { memberId: selectedMember, body }).then(r => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/threads"] });
      qc.invalidateQueries({ queryKey: ["/api/tickets"] });
      qc.invalidateQueries({ queryKey: ["/api/sms"] });
      qc.invalidateQueries({ queryKey: ["/api/activity"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      if (data.thread) {
        setSelectedThread(data.thread.id);
        qc.invalidateQueries({ queryKey: ["/api/threads", data.thread.id, "messages"] });
      }
      setCompose("");
      setActiveScenario("");
      toast({ title: `Processed — ${data.action}`, description: `Intent: ${data.intent}` });
    },
    onError: () => toast({ title: "Processing failed", variant: "destructive" }),
  });

  function loadScenario(scenario: typeof SCENARIOS[0]) {
    setActiveScenario(scenario.label);
    setCompose(scenario.body);
  }

  const selectedMemberObj = members.find(m => m.id === selectedMember);
  const threadForMember = threads.find(t => t.memberId === selectedMember);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare size={16} className="text-primary" /> PadSplit Messenger
        </CardTitle>
        <p className="text-xs text-muted-foreground">Simulate tenant messages through the AI agent pipeline</p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3 min-h-0">
        {/* Tenant selector */}
        <div className="flex gap-2 items-center">
          <Label className="text-xs shrink-0">Sending as:</Label>
          <Select value={String(selectedMember)} onValueChange={v => setSelectedMember(Number(v))}>
            <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-member">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {members.map(m => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.name} · {m.unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Scenario pills */}
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Quick scenarios:</p>
          <div className="flex flex-wrap gap-1.5">
            {SCENARIOS.map(s => (
              <button key={s.label} onClick={() => loadScenario(s)} data-testid={`scenario-${s.label}`}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${activeScenario === s.label ? "bg-primary text-primary-foreground border-primary" : "bg-muted hover:bg-secondary border-border"}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chat view for selected thread */}
        {threadForMember && selectedThread === threadForMember.id && (
          <div className="flex-1 overflow-y-auto space-y-2 min-h-[120px] max-h-[200px] bg-muted/30 rounded-lg p-3">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === "agent" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 text-sm ${msg.role === "agent" ? "bubble-agent" : "bubble-tenant"}`}>
                  {msg.body}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Compose */}
        <div className="space-y-2">
          <Textarea
            value={compose}
            onChange={e => setCompose(e.target.value)}
            placeholder={`Type a message as ${selectedMemberObj?.name ?? "tenant"}...`}
            rows={4} className="resize-none text-sm" data-testid="compose-body"
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && compose.trim()) sendMutation.mutate(compose.trim()); }}
          />
          <Button onClick={() => compose.trim() && sendMutation.mutate(compose.trim())}
            disabled={sendMutation.isPending || !compose.trim()} className="w-full" data-testid="btn-send">
            {sendMutation.isPending
              ? <><Loader2 size={14} className="mr-2 animate-spin" /> Processing through AI pipeline…</>
              : <><BrainCircuit size={14} className="mr-2" /> Send → Run Pipeline</>}
          </Button>
        </div>

        {/* Thread list */}
        {threads.length > 0 && (
          <div className="border-t border-border pt-2">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Active Threads</p>
            <div className="space-y-1 max-h-[160px] overflow-y-auto">
              {threads.map(t => {
                const mem = members.find(m => m.id === t.memberId);
                return (
                  <button key={t.id} onClick={() => { setSelectedThread(t.id); setSelectedMember(t.memberId); }}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${selectedThread === t.id ? "bg-primary/10" : "hover:bg-muted"}`}>
                    {mem && <Avatar initials={mem.avatar} size="sm" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 justify-between">
                        <span className="font-medium truncate">{mem?.name}</span>
                        {t.unread > 0 && <span className="bg-primary text-primary-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center">{t.unread}</span>}
                      </div>
                      <p className="text-muted-foreground truncate">{t.lastMessage}</p>
                    </div>
                    {t.intent && <IntentBadge intent={t.intent} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Maintenance Board ─────────────────────────────────────────────────────────
const TICKET_STAGES: { key: string; label: string }[] = [
  { key: "new", label: "New" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
];

function MaintenanceBoard({ vendors, members }: { vendors: Vendor[]; members: Member[] }) {
  const qc = useQueryClient();
  const { data: tickets = [] } = useQuery<Ticket[]>({ queryKey: ["/api/tickets"], refetchInterval: 3000 });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/tickets/${id}/status`, { status }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tickets"] }); qc.invalidateQueries({ queryKey: ["/api/activity"] }); qc.invalidateQueries({ queryKey: ["/api/stats"] }); },
  });

  const ISSUE_ICONS: Record<string, string> = { plumbing: "🚰", electrical: "💡", hvac: "🌡️", pest: "🐜", general: "🔧" };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench size={16} className="text-primary" /> Maintenance Board
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-3">
          {TICKET_STAGES.map(stage => {
            const cols = tickets.filter(t => t.status === stage.key);
            return (
              <div key={stage.key} className="kanban-col">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{stage.label}</p>
                  {cols.length > 0 && <span className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full">{cols.length}</span>}
                </div>
                <div className="space-y-2">
                  {cols.map(t => {
                    const member = members.find(m => m.id === t.memberId);
                    const vendor = vendors.find(v => v.id === t.vendorId);
                    const isEmergency = t.urgency === "emergency";
                    return (
                      <div key={t.id}
                        className={`bg-card border rounded-lg p-2.5 text-xs slide-in ${isEmergency ? "emergency-card" : "border-border"}`}>
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <span className="font-medium">{ISSUE_ICONS[t.issueType] ?? "🔧"} {t.unit}</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium urgency-${t.urgency}`}
                            style={{ background: t.urgency === "emergency" ? "#fee2e2" : t.urgency === "high" ? "#fef3c7" : "#d1fae5",
                                     color: t.urgency === "emergency" ? "#dc2626" : t.urgency === "high" ? "#d97706" : "#059669" }}>
                            {t.urgency}
                          </span>
                        </div>
                        <p className="text-muted-foreground mb-1.5 line-clamp-2">{t.description}</p>
                        {vendor && <p className="text-[10px] text-primary">👷 {vendor.name}</p>}
                        {member && <p className="text-[10px] text-muted-foreground">{member.name}</p>}
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {TICKET_STAGES.filter(s => s.key !== stage.key && s.key !== "resolved").map(s => (
                            <button key={s.key} onClick={() => updateStatus.mutate({ id: t.id, status: s.key })}
                              className="text-[10px] px-1.5 py-0.5 bg-muted hover:bg-secondary rounded transition-colors">
                              → {s.label}
                            </button>
                          ))}
                          {stage.key !== "resolved" && (
                            <button onClick={() => updateStatus.mutate({ id: t.id, status: "resolved" })}
                              className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 rounded transition-colors">
                              ✓ Resolve
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {cols.length === 0 && (
                    <div className="border border-dashed border-border rounded-lg p-3 text-center text-[10px] text-muted-foreground">
                      Empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── SMS Log Panel ────────────────────────────────────────────────────────────
function SmsPanel() {
  const { data: sms = [] } = useQuery<Sms[]>({ queryKey: ["/api/sms"], refetchInterval: 3000 });
  const typeColor: Record<string, string> = {
    emergency: "#dc2626", owner_alert: "#d97706", vendor_dispatch: "#6366f1",
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone size={16} className="text-primary" /> SMS Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sms.length === 0
          ? <p className="text-xs text-muted-foreground text-center py-6">No SMS sent yet. Send a maintenance message to trigger one.</p>
          : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {sms.map(s => (
                <div key={s.id} className="flex gap-2 p-2 border border-border rounded-lg text-xs slide-in">
                  <Phone size={12} style={{ color: typeColor[s.type] ?? "#6366f1", marginTop: 2, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium">{s.toName}</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ background: (typeColor[s.type] ?? "#6366f1") + "20", color: typeColor[s.type] ?? "#6366f1" }}>
                        {s.type.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-muted-foreground line-clamp-2">{s.body}</p>
                  </div>
                  <span className="text-muted-foreground shrink-0">{new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          )}
      </CardContent>
    </Card>
  );
}

// ─── Vendor Panel ─────────────────────────────────────────────────────────────
function VendorPanel() {
  const qc = useQueryClient();
  const { data: vendors = [] } = useQuery<Vendor[]>({ queryKey: ["/api/vendors"], refetchInterval: 5000 });

  const toggle = useMutation({
    mutationFn: ({ id, available }: { id: number; available: boolean }) =>
      apiRequest("PATCH", `/api/vendors/${id}/availability`, { available }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/vendors"] }),
  });

  const SPEC_ICONS: Record<string, string> = { plumbing: "🚰", electrical: "💡", hvac: "🌡️", pest: "🐜", general: "🔧" };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users size={16} className="text-primary" /> Vendor Roster
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {vendors.map(v => (
            <div key={v.id} className="flex items-center gap-2 p-2 border border-border rounded-lg text-xs">
              <span className="text-base">{SPEC_ICONS[v.specialty] ?? "🔧"}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{v.name}</p>
                <p className="text-muted-foreground capitalize">{v.specialty} · {v.phone}</p>
              </div>
              <button onClick={() => toggle.mutate({ id: v.id, available: !v.available })}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${v.available ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200" : "bg-muted text-muted-foreground hover:bg-secondary"}`}>
                {v.available ? "Available" : "Busy"}
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Member Score Monitor ──────────────────────────────────────────────────────
function MemberScorePanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: members = [] } = useQuery<Member[]>({ queryKey: ["/api/members"], refetchInterval: 4000 });

  const drop = useMutation({
    mutationFn: ({ id, drop }: { id: number; drop: number }) =>
      apiRequest("POST", `/api/members/${id}/score-drop`, { drop }).then(r => r.json()),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["/api/members"] });
      qc.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "Score drop triggered", description: `Member score decreased by ${v.drop}` });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity size={16} className="text-primary" /> Member Scores
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {members.map(m => {
            const hist: number[] = JSON.parse(m.scoreHistory || "[]");
            const trend = hist.length > 1 ? hist[hist.length - 1] - hist[hist.length - 2] : 0;
            return (
              <div key={m.id} className="flex items-center gap-2 p-2 border border-border rounded-lg">
                <Avatar initials={m.avatar} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium">{m.name}</p>
                    <span className="text-[10px] text-muted-foreground">{m.unit}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="conf-bar w-16">
                      <div className="conf-fill" style={{
                        width: `${m.score}%`,
                        background: m.score >= 80 ? "#059669" : m.score >= 65 ? "#d97706" : "#dc2626"
                      }} />
                    </div>
                    <span className="text-xs font-bold">{m.score}</span>
                    <span className={`text-[10px] ${trend > 0 ? "text-green-600" : trend < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {trend > 0 ? "▲" : trend < 0 ? "▼" : "—"}{Math.abs(trend) || ""}
                    </span>
                    <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-medium ${m.status === "good" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : m.status === "watch" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"}`}>
                      {m.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
                <button onClick={() => drop.mutate({ id: m.id, drop: 12 })} disabled={drop.isPending}
                  className="text-[10px] px-2 py-1 border border-border rounded hover:bg-muted transition-colors text-muted-foreground">
                  Drop
                </button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Broadcast Panel ──────────────────────────────────────────────────────────
function BroadcastPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ house: "House Alpha", body: "", severity: "info" });
  const [lastDeliveries, setLastDeliveries] = useState<any[] | null>(null);

  const send = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/broadcast", form).then(r => r.json()),
    onSuccess: (data) => {
      setLastDeliveries(data.deliveries);
      qc.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: `Broadcast sent to ${data.deliveries.length} members` });
      setForm(f => ({ ...f, body: "" }));
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell size={16} className="text-primary" /> House Broadcast
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Select value={form.house} onValueChange={v => setForm(f => ({ ...f, house: v }))}>
            <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="House Alpha">House Alpha</SelectItem>
              <SelectItem value="House Beta">House Beta</SelectItem>
              <SelectItem value="House Gamma">House Gamma</SelectItem>
            </SelectContent>
          </Select>
          <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
            <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="emergency">Emergency</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
          placeholder="Message to all members in this house..." rows={3} className="resize-none text-xs" />
        <Button onClick={() => send.mutate()} disabled={send.isPending || !form.body.trim()} className="w-full" size="sm">
          {send.isPending ? <Loader2 size={13} className="mr-2 animate-spin" /> : <Radio size={13} className="mr-2" />}
          Broadcast to All Members
        </Button>
        {lastDeliveries && (
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {lastDeliveries.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span>{d.name} · {d.unit}</span>
                <span className={`px-1.5 py-0.5 rounded-full ${d.status === "delivered" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-100 text-red-600"}`}>
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Activity Feed ─────────────────────────────────────────────────────────────
const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  SMS_SENT: Phone, EMERGENCY_ESCALATED: AlertTriangle, VENDOR_DISPATCHED: Wrench,
  TICKET_CREATED: Wrench, TICKET_STATUS_CHANGED: CheckCircle, SCORE_ALERT: Activity,
  BROADCAST_SENT: Bell, AUTO_REPLIED: MessageSquare, FORWARDED_TO_OWNER: ArrowRight,
  MSG_RECEIVED: Mail,
};
const ACTIVITY_COLORS: Record<string, string> = {
  SMS_SENT: "#d97706", EMERGENCY_ESCALATED: "#dc2626", VENDOR_DISPATCHED: "#6366f1",
  TICKET_CREATED: "#6366f1", TICKET_STATUS_CHANGED: "#059669", SCORE_ALERT: "#d97706",
  BROADCAST_SENT: "#0284c7", AUTO_REPLIED: "#059669", FORWARDED_TO_OWNER: "#7c3aed",
  MSG_RECEIVED: "#6b7280",
};

function ActivityFeed({ filter }: { filter: string }) {
  const { data: activity = [] } = useQuery<ActivityItem[]>({ queryKey: ["/api/activity"], refetchInterval: 2000 });
  const filtered = filter === "all" ? activity : activity.filter(a => a.type === filter);
  return (
    <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
      {filtered.length === 0
        ? <p className="text-xs text-muted-foreground text-center py-8">No activity yet. Send a message through the Messenger to start the pipeline.</p>
        : filtered.map(a => {
            const Icon = ACTIVITY_ICONS[a.type] ?? Activity;
            const color = ACTIVITY_COLORS[a.type] ?? "#6b7280";
            const ts = new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            return (
              <div key={a.id} className={`flex gap-2 p-2 rounded-lg text-xs slide-in ${a.urgent ? "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900" : "bg-muted/40"}`}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: color + "20" }}>
                  <Icon size={11} style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{a.label}</p>
                  {a.detail && <p className="text-muted-foreground truncate">{a.detail}</p>}
                </div>
                <span className="text-muted-foreground shrink-0 tabular-nums">{ts}</span>
              </div>
            );
          })}
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { dark, toggle } = useTheme();
  const [actFilter, setActFilter] = useState("all");

  const { data: members = [] } = useQuery<Member[]>({ queryKey: ["/api/members"], refetchInterval: 5000 });
  const { data: vendors = [] } = useQuery<Vendor[]>({ queryKey: ["/api/vendors"] });
  const { data: stats } = useQuery<Stats>({ queryKey: ["/api/stats"], refetchInterval: 3000 });

  // SSE for real-time updates
  const qc = useQueryClient();
  useEffect(() => {
    const evtSource = new EventSource("/api/v2/events");
    evtSource.addEventListener("pipeline", () => {
      ["tickets","sms","activity","stats","threads","members"].forEach(k => qc.invalidateQueries({ queryKey: [`/api/${k}`] }));
    });
    evtSource.addEventListener("ticket_update", () => qc.invalidateQueries({ queryKey: ["/api/tickets"] }));
    evtSource.addEventListener("score_alert", () => { qc.invalidateQueries({ queryKey: ["/api/members"] }); qc.invalidateQueries({ queryKey: ["/api/activity"] }); });
    return () => evtSource.close();
  }, [qc]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
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
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-green-500 live-dot" />Agent live
            </span>
            <button onClick={toggle} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-4 space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          <StatCard label="Open Tickets"      value={stats?.tickets_open ?? 0}       icon={Wrench}        color="#6366f1" />
          <StatCard label="Resolved"          value={stats?.tickets_resolved ?? 0}   icon={CheckCircle}   color="#059669" />
          <StatCard label="SMS Sent"          value={stats?.sms_sent ?? 0}           icon={Phone}         color="#d97706" />
          <StatCard label="Emergencies"       value={stats?.emergencies ?? 0}        icon={AlertTriangle} color="#dc2626" />
          <StatCard label="Vendors Dispatched" value={stats?.vendors_dispatched ?? 0} icon={Users}        color="#7c3aed" />
          <StatCard label="Threads"           value={stats?.threads_total ?? 0}      icon={MessageSquare} color="#0284c7" />
          <StatCard label="Auto-Replied"      value={stats?.auto_replied ?? 0}       icon={Zap}           color="#059669" />
          <StatCard label="Forwarded"         value={stats?.forwarded ?? 0}          icon={ArrowRight}    color="#6b7280" />
        </div>

        {/* Main layout */}
        <Tabs defaultValue="messenger" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="messenger" className="text-xs"><MessageSquare size={12} className="mr-1" />Messenger</TabsTrigger>
            <TabsTrigger value="maintenance" className="text-xs"><Wrench size={12} className="mr-1" />Maintenance Board</TabsTrigger>
            <TabsTrigger value="sms" className="text-xs"><Phone size={12} className="mr-1" />SMS Log</TabsTrigger>
            <TabsTrigger value="vendors" className="text-xs"><Users size={12} className="mr-1" />Vendors & Scores</TabsTrigger>
            <TabsTrigger value="broadcast" className="text-xs"><Bell size={12} className="mr-1" />Broadcast</TabsTrigger>
            <TabsTrigger value="activity" className="text-xs"><Activity size={12} className="mr-1" />Activity Feed</TabsTrigger>
          </TabsList>

          <TabsContent value="messenger">
            <div className="grid lg:grid-cols-2 gap-4">
              <MessengerPanel members={members} />
              {/* Live pipeline result */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BrainCircuit size={15} className="text-primary" /> Pipeline Output
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">What the AI agent decided on the last message</p>
                </CardHeader>
                <CardContent>
                  <ActivityFeed filter="all" />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="maintenance">
            <MaintenanceBoard vendors={vendors} members={members} />
          </TabsContent>

          <TabsContent value="sms">
            <SmsPanel />
          </TabsContent>

          <TabsContent value="vendors">
            <div className="grid md:grid-cols-2 gap-4">
              <VendorPanel />
              <MemberScorePanel />
            </div>
          </TabsContent>

          <TabsContent value="broadcast">
            <div className="max-w-xl">
              <BroadcastPanel />
            </div>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity size={15} className="text-primary" /> Activity Feed
                </CardTitle>
                <div className="flex flex-wrap gap-1 mt-2">
                  {["all","MSG_RECEIVED","AUTO_REPLIED","SMS_SENT","EMERGENCY_ESCALATED","TICKET_CREATED","VENDOR_DISPATCHED","SCORE_ALERT","FORWARDED_TO_OWNER"].map(f => (
                    <button key={f} onClick={() => setActFilter(f)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${actFilter === f ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border hover:bg-secondary"}`}>
                      {f === "all" ? "All" : f.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <ActivityFeed filter={actFilter} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Architecture pill */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground justify-center pb-2">
          {[
            { icon: MessageSquare, label: "PadSplit Messenger" },
            "→",
            { icon: BrainCircuit, label: "Claude classifier" },
            "→",
            { icon: Activity, label: "Intent + confidence" },
            "→",
            { icon: Wrench, label: "Ticket created" },
            "+",
            { icon: Phone, label: "SMS alert" },
            "+",
            { icon: MessageSquare, label: "Auto-reply" },
          ].map((item, i) =>
            typeof item === "string"
              ? <span key={i} className="font-bold text-border">{item}</span>
              : <span key={i} className="flex items-center gap-1 bg-muted px-2 py-1 rounded-full">
                  <item.icon size={10} />{item.label}
                </span>
          )}
        </div>
      </main>
    </div>
  );
}
