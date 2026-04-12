import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@shared/schema";

const sqlite = new Database("./data.db");
export const db = drizzle(sqlite, { schema });

// Auto-create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    "from" TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    intent TEXT NOT NULL,
    confidence TEXT NOT NULL,
    urgency TEXT,
    maintenance_description TEXT,
    maintenance_location TEXT,
    reply TEXT,
    action TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);
