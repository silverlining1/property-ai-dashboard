import type { Express } from "express";
import type { Server } from "http";
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import { simulateEmailSchema } from "@shared/schema";

// ─── Mock fallback when Anthropic API is unavailable ─────────────────────────
function mockClassify(email: { subject: string; body: string }) {
  const text = (email.subject + " " + email.body).toLowerCase();
  if (/heat|ac|hvac|leak|flood|broken|fix|repair|plumb|electric|pest|mold/.test(text)) {
    const urgency = /emergency|flood|gas|no heat|freezing|no water|no power/.test(text) ? "emergency"
      : /urgent|asap|immediately|bad/.test(text) ? "high" : "normal";
    return { intent: "maintenance_request", confidence: 0.91, maintenance: {
      description: "Maintenance issue reported — " + email.subject,
      urgency, location: /bedroom|kitchen|bath|living|unit/.exec(text)?.[0] ?? ""
    }};
  }
  if (/rent|pay|fee|deposit|late|charge|balance/.test(text))
    return { intent: "payment_question", confidence: 0.88 };
  if (/mov|vacate|lease end|keys|walk.through|check.out/.test(text))
    return { intent: "move_in_out", confidence: 0.85 };
  if (/noise|neighbor|parking|smell|dirty|unsafe/.test(text))
    return { intent: "complaint", confidence: 0.82 };
  if (/lawyer|attorney|legal|sue|violation|court/.test(text))
    return { intent: "needs_human_review", confidence: 0.95, reason: "Potential legal matter" };
  return { intent: "general_inquiry", confidence: 0.78 };
}

function mockReply(intent: string, email: { from: string; subject: string }) {
  const name = email.from.split("@")[0].split(".")[0];
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  const replies: Record<string, string> = {
    maintenance_request: `Hi ${cap},\n\nThank you for letting me know. I've logged the issue and we'll have someone out to take a look within 24–48 hours. I'll follow up with a specific time once it's scheduled — please let me know if there's a time that works best for you.\n\nEarnest | MySmartRoom`,
    payment_question: `Hi ${cap},\n\nThanks for reaching out. I'll look into this and get back to you within 1 business day with a clear answer. If there's been an error on our end, we'll get it corrected right away.\n\nEarnest | MySmartRoom`,
    move_in_out: `Hi ${cap},\n\nGot it — noted on your move-out. I'll send over the move-out checklist and we'll coordinate a walk-through date that works for you. Please give at least 48 hours notice for scheduling.\n\nEarnest | MySmartRoom`,
    complaint: `Hi ${cap},\n\nI hear you and I take this seriously. I'll look into the situation right away and follow up with next steps. Thank you for bringing this to my attention.\n\nEarnest | MySmartRoom`,
    general_inquiry: `Hi ${cap},\n\nGreat question — let me look into this and get back to you shortly. Don't hesitate to reach out if you need anything else in the meantime.\n\nEarnest | MySmartRoom`,
  };
  return replies[intent] ?? replies.general_inquiry;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const INTENTS = [
  "maintenance_request",
  "payment_question",
  "general_inquiry",
  "move_in_out",
  "complaint",
  "needs_human_review",
] as const;

type Intent = (typeof INTENTS)[number];

async function classifyEmail(email: { from: string; subject: string; body: string }) {
  const prompt = `Classify the email below into exactly one intent:

  maintenance_request  – broken/damaged item, plumbing, electrical, HVAC, pests, leak, etc.
  payment_question     – rent, fees, deposits, late charges
  general_inquiry      – lease terms, rules, amenities, general questions
  move_in_out          – move-in/move-out scheduling, keys, walk-through, lease end
  complaint            – noise, neighbor dispute, parking, property condition
  needs_human_review   – legal threat, aggressive tone, unusual/unclear request

Rate your confidence 0.0–1.0.

If intent is maintenance_request, also extract:
  description  – concise summary of what needs fixing
  urgency      – "emergency" | "high" | "normal"
  location     – room/area in the unit if mentioned, else ""

Return ONLY this JSON:
{
  "intent": "...",
  "confidence": 0.0,
  "maintenance": {
    "description": "...",
    "urgency": "...",
    "location": "..."
  }
}

Email:
From: ${email.from}
Subject: ${email.subject}

${email.body.slice(0, 2500)}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 400,
    system: "You are an email classifier for a residential property management company. Respond ONLY with valid JSON — no markdown, no explanation.",
    messages: [{ role: "user", content: prompt }],
  });

  return JSON.parse((response.content[0] as { type: string; text: string }).text.trim());
}

async function generateReply(email: { from: string; subject: string; body: string; date: string }, intent: Intent) {
  const hints: Record<string, string> = {
    payment_question: "Acknowledge the question, give a clear factual answer or direct them to check their portal.",
    general_inquiry: "Answer helpfully. If you don't have the specific info, say you'll follow up.",
    move_in_out: "Confirm details, mention any checklist steps or what they need to prepare.",
    complaint: "Take the concern seriously, acknowledge the inconvenience, state what action you'll take.",
    maintenance_request:
      "Thank them for letting you know. Confirm the issue, give an estimated timeline (e.g., 'We'll have someone out within 24–48 hours'), and ask for a good time if needed.",
  };

  const hint = hints[intent] ?? "Reply helpfully and professionally.";

  const prompt = `Reply to the following tenant email as Earnest.

Detected intent: ${intent}
Response guidance: ${hint}

--- Incoming Email ---
From:    ${email.from}
Subject: ${email.subject}
Date:    ${email.date}

${email.body.slice(0, 2000)}
---

Write the reply email body now:`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 800,
    system: `You are Earnest, a property manager at MySmartRoom.

Your communication style:
• Warm but professional — you care about your tenants
• Acknowledge the tenant's concern right away
• Be clear about next steps and timelines
• Keep replies concise — no fluff
• Always sign off as:  Earnest | MySmartRoom

IMPORTANT: Write only the email body. No subject line. No meta-commentary.`,
    messages: [{ role: "user", content: prompt }],
  });

  return (response.content[0] as { type: string; text: string }).text.trim();
}

export async function registerRoutes(httpServer: Server, app: Express) {
  // Simulate an email through the agent pipeline
  app.post("/api/simulate", async (req, res) => {
    const parsed = simulateEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors });
    }

    const email = parsed.data;
    const dateStr = new Date().toISOString();

    let usedMock = false;
    try {
      // 1. Classify
      let classification: Record<string, any>;
      try {
        classification = await classifyEmail(email);
      } catch (apiErr: any) {
        // Anthropic unavailable / no credits — fall back to mock
        console.warn("Anthropic API unavailable, using mock classifier:", apiErr?.message);
        classification = mockClassify(email);
        usedMock = true;
      }

      const intent: Intent = classification.intent ?? "needs_human_review";
      const confidence: number = parseFloat(classification.confidence ?? 0);
      const maintenance = classification.maintenance ?? null;

      // 2. Determine action
      let action: string;
      let reply: string | null = null;

      const CONFIDENCE_THRESHOLD = 0.72;

      if (intent === "needs_human_review" || confidence < CONFIDENCE_THRESHOLD) {
        action = "forwarded";
      } else if (intent === "maintenance_request") {
        action = "sms_sent";
        reply = usedMock
          ? mockReply(intent, email)
          : await generateReply({ ...email, date: dateStr }, intent);
      } else {
        action = "replied";
        reply = usedMock
          ? mockReply(intent, email)
          : await generateReply({ ...email, date: dateStr }, intent);
      }

      // 3. Log to DB
      const log = await storage.insertEmailLog({
        from: email.from,
        subject: email.subject,
        body: email.body,
        intent,
        confidence: confidence.toFixed(2),
        urgency: maintenance?.urgency ?? null,
        maintenanceDescription: maintenance?.description ?? null,
        maintenanceLocation: maintenance?.location ?? null,
        reply,
        action,
        createdAt: Date.now(),
      });

      res.json({
        log,
        classification,
        reply,
        action,
        mock: usedMock,
      });
    } catch (err: any) {
      console.error("Simulate error:", err);
      // Surface auth errors clearly to the client
      if (err?.status === 401 || err?.type === "authentication_error") {
        return res.status(500).json({ error: "Anthropic API key is missing or invalid. Set ANTHROPIC_API_KEY in your environment variables." });
      }
      res.status(500).json({ error: err?.message ?? "Agent processing failed. Check server logs." });
    }
  });

  // Get recent activity
  app.get("/api/logs", async (_req, res) => {
    const logs = await storage.getEmailLogs(50);
    res.json(logs);
  });

  // Stats
  app.get("/api/stats", async (_req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });
}
