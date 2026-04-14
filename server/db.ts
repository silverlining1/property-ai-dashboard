import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@shared/schema";

const client = createClient({
  url: process.env.DATABASE_URL ?? "file:./data.db",
});

export const db = drizzle(client, { schema });

export async function initDb(): Promise<void> {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      "from" TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
      intent TEXT NOT NULL, confidence TEXT NOT NULL, urgency TEXT,
      maintenance_description TEXT, maintenance_location TEXT,
      reply TEXT, action TEXT NOT NULL, created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, unit TEXT NOT NULL, email TEXT NOT NULL,
      avatar TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 85,
      score_history TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'good',
      joined_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL, last_message TEXT NOT NULL,
      last_at INTEGER NOT NULL, unread INTEGER NOT NULL DEFAULT 0,
      intent TEXT, status TEXT NOT NULL DEFAULT 'open'
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL, role TEXT NOT NULL,
      body TEXT NOT NULL, created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, specialty TEXT NOT NULL,
      phone TEXT NOT NULL, available INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER, member_id INTEGER NOT NULL,
      unit TEXT NOT NULL, issue_type TEXT NOT NULL,
      description TEXT NOT NULL, urgency TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'new', vendor_id INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sms_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      "to" TEXT NOT NULL, to_name TEXT NOT NULL, body TEXT NOT NULL,
      type TEXT NOT NULL, ticket_id INTEGER, created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      house TEXT NOT NULL, body TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      deliveries TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS activity_feed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, label TEXT NOT NULL,
      detail TEXT, ref_id INTEGER, ref_type TEXT,
      urgent INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
    )`,
  ];
  for (const sql of stmts) {
    await client.execute(sql);
  }
  // Seed vendors if empty
  const existing = await client.execute("SELECT COUNT(*) as c FROM vendors");
  if ((existing.rows[0] as any).c === 0) {
    await client.executeMultiple(`
      INSERT INTO vendors (name, specialty, phone, available) VALUES
        ('Mike''s Plumbing', 'plumbing', '(404) 555-0181', 1);
      INSERT INTO vendors (name, specialty, phone, available) VALUES
        ('Bright Electric Co.', 'electrical', '(404) 555-0192', 1);
      INSERT INTO vendors (name, specialty, phone, available) VALUES
        ('CoolBreeze HVAC', 'hvac', '(404) 555-0247', 1);
      INSERT INTO vendors (name, specialty, phone, available) VALUES
        ('PestAway Pro', 'pest', '(404) 555-0318', 1);
      INSERT INTO vendors (name, specialty, phone, available) VALUES
        ('Handy Solutions', 'general', '(404) 555-0423', 1);
    `);
  }
  // Seed members if empty
  const mems = await client.execute("SELECT COUNT(*) as c FROM members");
  if ((mems.rows[0] as any).c === 0) {
    const now = Date.now();
    const seedMembers = [
      { name: "Marcus Johnson", unit: "Unit 2A", email: "marcus.j@gmail.com", avatar: "MJ", score: 92, status: "good" },
      { name: "Priya Sharma", unit: "Unit 2B", email: "priya.s@gmail.com", avatar: "PS", score: 78, status: "watch" },
      { name: "Carlos Rivera", unit: "Unit 3A", email: "carlos.r@gmail.com", avatar: "CR", score: 88, status: "good" },
      { name: "Aisha Thompson", unit: "Unit 3B", email: "aisha.t@gmail.com", avatar: "AT", score: 65, status: "at_risk" },
      { name: "Tyler Brooks", unit: "Unit 4B", email: "tyler.b@gmail.com", avatar: "TB", score: 95, status: "good" },
    ];
    for (const m of seedMembers) {
      const hist = JSON.stringify(
        Array.from({ length: 14 }, (_, i) => Math.max(50, m.score - Math.floor(Math.random() * 15) + i))
      );
      await client.execute({
        sql: `INSERT INTO members (name, unit, email, avatar, score, score_history, status, joined_at) VALUES (?,?,?,?,?,?,?,?)`,
        args: [m.name, m.unit, m.email, m.avatar, m.score, hist, m.status, now],
      });
    }
  }
  // Seed a couple threads if empty
  const thr = await client.execute("SELECT COUNT(*) as c FROM threads");
  if ((thr.rows[0] as any).c === 0) {
    const now = Date.now();
    const memberRows = await client.execute("SELECT id, unit FROM members LIMIT 2");
    for (const row of memberRows.rows as any[]) {
      const res = await client.execute({
        sql: `INSERT INTO threads (member_id, last_message, last_at, unread, intent, status) VALUES (?,?,?,?,?,?) RETURNING id`,
        args: [row.id, "Hey, just wanted to check in about my unit.", now - 3600000, 0, "general_inquiry", "open"],
      });
      const tid = (res.rows[0] as any).id;
      await client.execute({
        sql: `INSERT INTO messages (thread_id, role, body, created_at) VALUES (?,?,?,?)`,
        args: [tid, "tenant", "Hey, just wanted to check in about my unit.", now - 3600000],
      });
    }
  }
  // Seed some tickets if empty
  const tkt = await client.execute("SELECT COUNT(*) as c FROM tickets");
  if ((tkt.rows[0] as any).c === 0) {
    const now = Date.now();
    const memberRows = await client.execute("SELECT id, unit FROM members LIMIT 3");
    const rows = memberRows.rows as any[];
    const seeds = [
      { memberId: rows[0]?.id, unit: rows[0]?.unit, issueType: "plumbing", desc: "Leaking faucet in bathroom sink", urgency: "normal", status: "in_progress", vendorId: 1 },
      { memberId: rows[1]?.id, unit: rows[1]?.unit, issueType: "hvac", desc: "AC not cooling properly", urgency: "high", status: "assigned", vendorId: 3 },
      { memberId: rows[2]?.id, unit: rows[2]?.unit, issueType: "general", desc: "Broken cabinet door hinge", urgency: "normal", status: "new", vendorId: null },
    ];
    for (const s of seeds) {
      if (!s.memberId) continue;
      await client.execute({
        sql: `INSERT INTO tickets (member_id, unit, issue_type, description, urgency, status, vendor_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        args: [s.memberId, s.unit, s.issueType, s.desc, s.urgency, s.status, s.vendorId, now - 86400000, now - 7200000],
      });
    }
  }
}
