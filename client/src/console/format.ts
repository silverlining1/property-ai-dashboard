import { formatDistanceToNow } from "date-fns";

export const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true });

export const label = (value: string | null | undefined) =>
  (value ?? "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Only high and emergency urgencies are worth a badge. */
export const isUrgent = (urgency: string | null | undefined) => urgency === "high" || urgency === "emergency";

export function urgencyClass(urgency: string | null | undefined): string {
  switch (urgency) {
    case "emergency":
      return "bg-destructive text-destructive-foreground border-transparent";
    case "high":
      return "bg-accent text-accent-foreground border-transparent";
    default:
      return "bg-secondary text-secondary-foreground border-transparent";
  }
}

export function describeAction(a: { type: string; [k: string]: unknown }): string {
  switch (a.type) {
    case "create_work_order":
      return `Create a ${label(String(a.trade ?? "maintenance"))} work order`;
    case "notify_vendor":
      return "Text the assigned vendor";
    case "upsert_crm_contact":
      return "Add or update the lead in the CRM";
    case "schedule_event":
      return `Add "${String(a.title ?? "an appointment")}" to the calendar`;
    case "send_sms":
      return "Send a text message";
    default:
      return label(a.type);
  }
}
