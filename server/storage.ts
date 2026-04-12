import { db } from "./db";
import { emailLogs, type EmailLog, type InsertEmailLog } from "@shared/schema";
import { desc } from "drizzle-orm";

export interface IStorage {
  insertEmailLog(log: InsertEmailLog): EmailLog;
  getEmailLogs(limit?: number): EmailLog[];
  getStats(): { total: number; replied: number; forwarded: number; sms_sent: number };
}

export class DatabaseStorage implements IStorage {
  insertEmailLog(log: InsertEmailLog): EmailLog {
    return db.insert(emailLogs).values(log).returning().get();
  }

  getEmailLogs(limit = 50): EmailLog[] {
    return db.select().from(emailLogs).orderBy(desc(emailLogs.createdAt)).limit(limit).all();
  }

  getStats(): { total: number; replied: number; forwarded: number; sms_sent: number } {
    const all = db.select().from(emailLogs).all();
    return {
      total: all.length,
      replied: all.filter((r) => r.action === "replied").length,
      forwarded: all.filter((r) => r.action === "forwarded").length,
      sms_sent: all.filter((r) => r.action === "sms_sent").length,
    };
  }
}

export const storage = new DatabaseStorage();
