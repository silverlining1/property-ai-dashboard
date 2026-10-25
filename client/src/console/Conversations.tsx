import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api, type ConversationDetail, type ConversationSummary } from "./api";
import { ago, isUrgent, label, urgencyClass } from "./format";

export default function Conversations({ id }: { id?: string }) {
  const list = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<ConversationSummary[]>("/v1/conversations"),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Conversations</h1>
      <div className="grid gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          {list.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
          {list.error && <p className="p-4 text-sm text-destructive">{(list.error as Error).message}</p>}
          {list.data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">No conversations yet.</p>}
          <ul className="divide-y divide-border">
            {list.data?.map((c) => (
              <li key={c.id}>
                <Link href={`/conversations/${c.id}`} className={cn("block px-4 py-3 hover:bg-muted", c.id === id && "bg-muted")}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium truncate">{c.contact_name || "Unknown sender"}</span>
                    {isUrgent(c.urgency) && <Badge className={urgencyClass(c.urgency)}>{label(c.urgency)}</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{ago(c.last_message_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.channel.toUpperCase()} · {c.subject || "(no subject)"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        {id ? <Thread id={id} /> : <p className="text-sm text-muted-foreground p-4">Select a conversation to read it.</p>}
      </div>
    </div>
  );
}

function Thread({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api<ConversationDetail>(`/v1/conversations/${id}`),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Loading…</p>;
  if (error) return <p className="text-sm text-destructive p-4">{(error as Error).message}</p>;
  if (!data) return null;
  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{data.subject || "(no subject)"}</h2>
        <Badge variant="outline">{data.channel.toUpperCase()}</Badge>
        {data.intent && <Badge variant="secondary">{label(data.intent)}</Badge>}
        <Badge variant="outline">{label(data.status)}</Badge>
      </div>
      <ol className="space-y-3">
        {data.messages.map((m) => (
          <li key={m.id} className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", m.direction === "inbound" ? "bg-muted" : "bg-primary/10 ml-auto")}>
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {m.direction === "inbound" ? data.contact_name || "Sender" : "You"} · {ago(m.created_at)}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
