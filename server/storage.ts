import { db } from "./db";
import { emailLogs, type EmailLog, type InsertEmailLog } from "@shared/schema";
import { desc } from "drizzle-orm";

export interface IStorage {
  insertEmailLog(log: InsertEmailLog): Promise<EmailLog>;
  getEmailLogs(limit?: number): Promise<EmailLog[]>;
  getStats(): Promise<{ total: number; replied: number; forwarded: number; sms_sent: number }>;
}

export class DatabaseStorage implements IStorage {
  async insertEmailLog(log: InsertEmailLog): Promise<EmailLog> {
    const rows = await db.insert(emailLogs).values(log).returning();
    return rows[0];
  }

  async getEmailLogs(limit = 50): Promise<EmailLog[]> {
    return db.select().from(emailLogs).orderBy(desc(emailLogs.createdAt)).limit(limit);
  }

  async getStats(): Promise<{ total: number; replied: number; forwarded: number; sms_sent: number }> {
    const all = await db.select().from(emailLogs);
    return {
      total: all.length,
      replied: all.filter((r) => r.action === "replied").length,
      forwarded: all.filter((r) => r.action === "forwarded").length,
      sms_sent: all.filter((r) => r.action === "sms_sent").length,
    };
  }
}

export const storage = new DatabaseStorage();
