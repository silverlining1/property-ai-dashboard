import { db } from "./db";
import {
  emailLogs, members, threads, messages, vendors, tickets,
  smsLog, notifications, activityFeed,
  type EmailLog, type InsertEmailLog,
  type Member, type InsertMember,
  type Thread, type InsertThread,
  type Message, type InsertMessage,
  type Vendor, type InsertVendor,
  type Ticket, type InsertTicket,
  type Sms, type InsertSms,
  type Notification, type InsertNotification,
  type Activity, type InsertActivity,
} from "@shared/schema";
import { desc, eq, and } from "drizzle-orm";

export class Storage {
  // ── Email logs (legacy) ──────────────────────────────────────────────────
  async insertEmailLog(log: InsertEmailLog): Promise<EmailLog> {
    const rows = await db.insert(emailLogs).values(log).returning();
    return rows[0];
  }
  async getEmailLogs(limit = 50): Promise<EmailLog[]> {
    return db.select().from(emailLogs).orderBy(desc(emailLogs.createdAt)).limit(limit);
  }

  // ── Members ──────────────────────────────────────────────────────────────
  async getMembers(): Promise<Member[]> {
    return db.select().from(members).orderBy(members.unit);
  }
  async getMember(id: number): Promise<Member | undefined> {
    const rows = await db.select().from(members).where(eq(members.id, id));
    return rows[0];
  }
  async updateMemberScore(id: number, score: number, history: number[]): Promise<void> {
    const status = score >= 80 ? "good" : score >= 65 ? "watch" : "at_risk";
    await db.update(members)
      .set({ score, scoreHistory: JSON.stringify(history), status })
      .where(eq(members.id, id));
  }

  // ── Threads ──────────────────────────────────────────────────────────────
  async getThreads(): Promise<Thread[]> {
    return db.select().from(threads).orderBy(desc(threads.lastAt));
  }
  async getThread(id: number): Promise<Thread | undefined> {
    const rows = await db.select().from(threads).where(eq(threads.id, id));
    return rows[0];
  }
  async upsertThread(memberId: number, body: string, intent?: string): Promise<Thread> {
    const existing = await db.select().from(threads)
      .where(and(eq(threads.memberId, memberId), eq(threads.status, "open")));
    const now = Date.now();
    if (existing.length > 0) {
      const rows = await db.update(threads)
        .set({ lastMessage: body, lastAt: now, unread: existing[0].unread + 1, intent: intent ?? existing[0].intent })
        .where(eq(threads.id, existing[0].id))
        .returning();
      return rows[0];
    }
    const rows = await db.insert(threads).values({
      memberId, lastMessage: body, lastAt: now, unread: 1, intent, status: "open"
    }).returning();
    return rows[0];
  }
  async markThreadRead(threadId: number): Promise<void> {
    await db.update(threads).set({ unread: 0 }).where(eq(threads.id, threadId));
  }
  async updateThreadIntent(threadId: number, intent: string): Promise<void> {
    await db.update(threads).set({ intent }).where(eq(threads.id, threadId));
  }

  // ── Messages ─────────────────────────────────────────────────────────────
  async getMessages(threadId: number): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.threadId, threadId)).orderBy(messages.createdAt);
  }
  async insertMessage(msg: InsertMessage): Promise<Message> {
    const rows = await db.insert(messages).values(msg).returning();
    return rows[0];
  }

  // ── Vendors ──────────────────────────────────────────────────────────────
  async getVendors(): Promise<Vendor[]> {
    return db.select().from(vendors).orderBy(vendors.specialty);
  }
  async setVendorAvailability(id: number, available: boolean): Promise<void> {
    await db.update(vendors).set({ available: available ? 1 : 0 }).where(eq(vendors.id, id));
  }

  // ── Tickets ──────────────────────────────────────────────────────────────
  async getTickets(): Promise<Ticket[]> {
    return db.select().from(tickets).orderBy(desc(tickets.createdAt));
  }
  async insertTicket(t: InsertTicket): Promise<Ticket> {
    const rows = await db.insert(tickets).values(t).returning();
    return rows[0];
  }
  async updateTicketStatus(id: number, status: string): Promise<Ticket> {
    const rows = await db.update(tickets)
      .set({ status, updatedAt: Date.now() })
      .where(eq(tickets.id, id))
      .returning();
    return rows[0];
  }
  async updateTicketVendor(id: number, vendorId: number): Promise<Ticket> {
    const rows = await db.update(tickets)
      .set({ vendorId, status: "assigned", updatedAt: Date.now() })
      .where(eq(tickets.id, id))
      .returning();
    return rows[0];
  }

  // ── SMS ──────────────────────────────────────────────────────────────────
  async getSmsLog(limit = 50): Promise<Sms[]> {
    return db.select().from(smsLog).orderBy(desc(smsLog.createdAt)).limit(limit);
  }
  async insertSms(s: InsertSms): Promise<Sms> {
    const rows = await db.insert(smsLog).values(s).returning();
    return rows[0];
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  async getNotifications(limit = 20): Promise<Notification[]> {
    return db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit);
  }
  async insertNotification(n: InsertNotification): Promise<Notification> {
    const rows = await db.insert(notifications).values(n).returning();
    return rows[0];
  }

  // ── Activity feed ─────────────────────────────────────────────────────────
  async getActivity(limit = 80): Promise<Activity[]> {
    return db.select().from(activityFeed).orderBy(desc(activityFeed.createdAt)).limit(limit);
  }
  async logActivity(a: InsertActivity): Promise<Activity> {
    const rows = await db.insert(activityFeed).values(a).returning();
    return rows[0];
  }

  // ── Dashboard stats ───────────────────────────────────────────────────────
  async getStats() {
    const [allTickets, allSms, allThreads, allActivity] = await Promise.all([
      db.select().from(tickets),
      db.select().from(smsLog),
      db.select().from(threads),
      db.select().from(activityFeed),
    ]);
    return {
      tickets_open: allTickets.filter(t => t.status !== "resolved").length,
      tickets_resolved: allTickets.filter(t => t.status === "resolved").length,
      sms_sent: allSms.length,
      emergencies: allTickets.filter(t => t.urgency === "emergency").length,
      vendors_dispatched: allSms.filter(s => s.type === "vendor_dispatch").length,
      threads_total: allThreads.length,
      auto_replied: allActivity.filter(a => a.type === "AUTO_REPLIED").length,
      forwarded: allActivity.filter(a => a.type === "FORWARDED_TO_OWNER").length,
    };
  }
}

export const storage = new Storage();
