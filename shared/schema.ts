import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  action: text("action").notNull(), // "replied" | "forwarded" | "sms_sent"
  createdAt: integer("created_at").notNull(),
});

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({ id: true });
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogs.$inferSelect;

// For simulate endpoint
export const simulateEmailSchema = z.object({
  from: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});
export type SimulateEmailInput = z.infer<typeof simulateEmailSchema>;
