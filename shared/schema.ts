import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Existing: email_logs (kept for backward compat) ─────────────────────────
export const emailLogs = sqliteTable("email_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  from: text("from").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  intent: text("intent").notNull(),
  confidence: text("confidence").notNull(),
  urgency: text("urgency"),
  maintenanceDescription: text("maintenance_description"),
  maintenanceLocation: text("maintenance_location"),
  reply: text("reply"),
  action: text("action").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({ id: true });
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogs.$inferSelect;

// ─── Members (simulated PadSplit tenants) ─────────────────────────────────────
export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  email: text("email").notNull(),
  avatar: text("avatar").notNull(), // initials
  score: integer("score").notNull().default(85),
  scoreHistory: text("score_history").notNull().default("[]"), // JSON int[]
  status: text("status").notNull().default("good"), // good | watch | at_risk
  joinedAt: integer("joined_at").notNull(),
});
export const insertMemberSchema = createInsertSchema(members).omit({ id: true });
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof members.$inferSelect;

// ─── Threads (messenger conversations) ───────────────────────────────────────
export const threads = sqliteTable("threads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull(),
  lastMessage: text("last_message").notNull(),
  lastAt: integer("last_at").notNull(),
  unread: integer("unread").notNull().default(0),
  intent: text("intent"), // last classified intent
  status: text("status").notNull().default("open"), // open | resolved
});
export const insertThreadSchema = createInsertSchema(threads).omit({ id: true });
export type InsertThread = z.infer<typeof insertThreadSchema>;
export type Thread = typeof threads.$inferSelect;

// ─── Messages ─────────────────────────────────────────────────────────────────
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: integer("thread_id").notNull(),
  role: text("role").notNull(), // "tenant" | "agent"
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// ─── Vendors ─────────────────────────────────────────────────────────────────
export const vendors = sqliteTable("vendors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  specialty: text("specialty").notNull(), // plumbing|electrical|hvac|pest|general
  phone: text("phone").notNull(),
  available: integer("available").notNull().default(1), // 0|1
});
export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;

// ─── Tickets (maintenance board) ──────────────────────────────────────────────
export const tickets = sqliteTable("tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: integer("thread_id"),
  memberId: integer("member_id").notNull(),
  unit: text("unit").notNull(),
  issueType: text("issue_type").notNull(), // plumbing|electrical|hvac|pest|general
  description: text("description").notNull(),
  urgency: text("urgency").notNull().default("normal"), // normal|high|emergency
  status: text("status").notNull().default("new"), // new|assigned|in_progress|resolved
  vendorId: integer("vendor_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const insertTicketSchema = createInsertSchema(tickets).omit({ id: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof tickets.$inferSelect;

// ─── SMS Log ─────────────────────────────────────────────────────────────────
export const smsLog = sqliteTable("sms_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  to: text("to").notNull(),
  toName: text("to_name").notNull(),
  body: text("body").notNull(),
  type: text("type").notNull(), // owner_alert|vendor_dispatch|emergency
  ticketId: integer("ticket_id"),
  createdAt: integer("created_at").notNull(),
});
export const insertSmsSchema = createInsertSchema(smsLog).omit({ id: true });
export type InsertSms = z.infer<typeof insertSmsSchema>;
export type Sms = typeof smsLog.$inferSelect;

// ─── Notifications (house-wide broadcasts) ───────────────────────────────────
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  house: text("house").notNull(),
  body: text("body").notNull(),
  severity: text("severity").notNull().default("info"), // info|warning|emergency
  deliveries: text("deliveries").notNull().default("[]"), // JSON
  createdAt: integer("created_at").notNull(),
});
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// ─── Activity Feed ────────────────────────────────────────────────────────────
export const activityFeed = sqliteTable("activity_feed", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  // SMS_SENT|VENDOR_DISPATCHED|TICKET_CREATED|TICKET_STATUS_CHANGED|
  // SCORE_ALERT|BROADCAST_SENT|EMERGENCY_ESCALATED|AUTO_REPLIED|
  // FORWARDED_TO_OWNER|MSG_RECEIVED
  label: text("label").notNull(),
  detail: text("detail"), // extra context
  refId: integer("ref_id"), // ticket/thread/member id
  refType: text("ref_type"), // ticket|thread|member
  urgent: integer("urgent").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
export const insertActivitySchema = createInsertSchema(activityFeed).omit({ id: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activityFeed.$inferSelect;

// ─── API input schemas ────────────────────────────────────────────────────────
export const simulateEmailSchema = z.object({
  from: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});
export type SimulateEmailInput = z.infer<typeof simulateEmailSchema>;

export const sendTenantMessageSchema = z.object({
  threadId: z.number().optional(),
  memberId: z.number(),
  body: z.string().min(1),
});

export const broadcastSchema = z.object({
  house: z.string().min(1),
  body: z.string().min(1),
  severity: z.enum(["info", "warning", "emergency"]),
});

export const triggerScoreDropSchema = z.object({
  memberId: z.number(),
  drop: z.number().min(1).max(40),
});
