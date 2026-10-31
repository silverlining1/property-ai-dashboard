import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api, canWriteWorkOrders, WORK_ORDER_STATUSES, type WorkOrder, type WorkOrderStatus } from "./api";
import { FormError, errorText } from "./AuthCard";
import { ago, label, urgencyClass } from "./format";
import { useMe } from "./session";

const FILTERS = {
  open: { text: "Open", statuses: ["new", "assigned", "scheduled", "in_progress"] },
  done: { text: "Done", statuses: ["done"] },
  cancelled: { text: "Cancelled", statuses: ["cancelled"] },
} as const;
type Filter = keyof typeof FILTERS;

const selectClass = "block h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60";

export default function WorkOrders() {
  const [filter, setFilter] = useState<Filter>("open");
  const { data, isLoading, error } = useQuery({
    queryKey: ["work-orders"],
    queryFn: () => api<WorkOrder[]>("/v1/work-orders"),
    refetchInterval: 60_000,
  });
  const shown = data?.filter((w) => (FILTERS[filter].statuses as readonly string[]).includes(w.status));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Work orders</h1>
        <div className="flex gap-1" role="tablist" aria-label="Work order status">
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <Button key={f} role="tab" aria-selected={filter === f} size="sm" variant={filter === f ? "default" : "ghost"} onClick={() => setFilter(f)}>
              {FILTERS[f].text}
            </Button>
          ))}
        </div>
      </div>
      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error && <p className="text-destructive text-sm">{(error as Error).message}</p>}
      {shown && shown.length === 0 && (
        <p className="text-muted-foreground text-sm py-12 text-center">
          {filter === "open" ? "No open work orders. The agent creates them when an approved reply includes a repair." : `No ${FILTERS[filter].text.toLowerCase()} work orders.`}
        </p>
      )}
      <div className="space-y-3">
        {shown?.map((w) => <WorkOrderRow key={w.id} order={w} />)}
      </div>
    </div>
  );
}

function WorkOrderRow({ order: w }: { order: WorkOrder }) {
  const me = useMe();
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (status: WorkOrderStatus) => api(`/v1/work-orders/${w.id}`, { method: "PATCH", body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-orders"] }),
  });
  const refs = Object.entries(w.external_refs ?? {});

  return (
    <Card data-testid="work-order">
      <CardContent className="pt-4 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{label(w.trade)}</span>
              <Badge variant="outline" className={urgencyClass(w.urgency)}>
                {label(w.urgency)}
              </Badge>
              <span className="text-xs text-muted-foreground">Opened {ago(w.created_at)}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">{w.description}</p>
            {refs.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {refs.map(([system, id]) => `${label(system)} #${id}`).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={`status-${w.id}`} className="text-xs text-muted-foreground">
              Status
            </label>
            <select
              id={`status-${w.id}`}
              className={selectClass}
              value={update.isPending ? update.variables : w.status}
              disabled={!canWriteWorkOrders(me.role) || update.isPending}
              onChange={(e) => update.mutate(e.target.value as WorkOrderStatus)}
            >
              {WORK_ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <FormError error={update.error ? errorText(update.error) : null} />
      </CardContent>
    </Card>
  );
}
