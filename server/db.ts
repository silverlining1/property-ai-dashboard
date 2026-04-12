import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@shared/schema";

const client = createClient({
  url: process.env.DATABASE_URL ?? "file:./data.db",
});

export const db = drizzle(client, { schema });

export async function initDb(): Promise<void> {
  await client.execute(`
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
    )
  `);
}
