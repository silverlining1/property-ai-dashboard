import type { Express, Request, Response } from "express";
import type { Server } from "http";
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import {
  simulateEmailSchema, sendTenantMessageSchema,
  broadcastSchema, triggerScoreDropSchema,
} from "@shared/schema";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── SSE clients ───────────────────────────────────────────────────────────────
const sseClients = new Set<Response>();
function broadcast(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => res.write(payload));
}

// ── Vendor routing ────────────────────────────────────────────────────────────
const SPECIALTY_MAP: Record<string, string> = {
  plumbing: "plumbing", leak: "plumbing", pipe: "plumbing", toilet: "plumbing", faucet: "plumbing", drain: "plumbing", water: "plumbing",
  electric: "electrical", power: "electrical", outlet: "electrical", wiring: "electrical", breaker: "electrical",
  heat: "hvac", hvac: "hvac", ac: "hvac", air: "hvac", heater: "hvac", cooling: "hvac", furnace: "hvac",
  pest: "pest", bug: "pest", roach: "pest", mouse: "pest", mice: "pest", rat: "pest", insect: "pest",
};
function detectIssueType(text: string): string {
  const lower = text.toLowerCase();
  for (const [kw, type] of Object.entries(SPECIALTY_MAP)) {
    if (lower.includes(kw)) return type;
  }
  return "general";
}
function detectUrgency(text: string): string {
  const lower = text.toLowerCase();
  if (/flood|gas leak|no power|no heat|fire|emergency|no water/.test(lower)) return "emergency";
  if (/urgent|asap|immediately|freezing|broken|not working|can't/.test(lower)) return "high";
  return "normal";
}

// ── Mock classifier ───────────────────────────────────────────────────────────
function mockClassify(text: string) {
  const lower = text.toLowerCase();
  if (/heat|ac|hvac|leak|flood|broken|fix|repair|plumb|electric|pest|mold|toilet|faucet|pipe/.test(lower)) {
    return { intent: "maintenance_request", confidence: 0.91, maintenance: {
      description: text.slice(0, 80),
      urgency: detectUrgency(text),
      location: /bedroom|kitchen|bath|living|unit/.exec(lower)?.[0] ?? "",
    }};
  }
  if (/rent|pay|fee|deposit|late|charge|balance/.test(lower))
    return { intent: "payment_question", confidence: 0.88 };
  if (/mov|vacate|lease end|keys|walk.through|check.out/.test(lower))
    return { intent: "move_in_out", confidence: 0.85 };
  if (/noise|neighbor|parking|smell|dirty|unsafe|loud/.test(lower))
    return { intent: "complaint", confidence: 0.82 };
  if (/lawyer|attorney|legal|sue|violation|court/.test(lower))
    return { intent: "needs_human_review", confidence: 0.95 };
  return { intent: "general_inquiry", confidence: 0.78 };
}

// ── Claude classifier ─────────────────────────────────────────────────────────
async function classifyMessage(body: string): Promise<any> {
  const prompt = `Classify this tenant message into exactly one intent:
  maintenance_request, payment_question, general_inquiry, move_in_out, complaint, needs_human_review

Rate confidence 0.0–1.0. If maintenance, extract: description, urgency (emergency|high|normal), location.

Return ONLY JSON: {"intent":"...","confidence":0.0,"maintenance":{"description":"...","urgency":"...","location":"..."}}

Message: ${body.slice(0, 1500)}`;
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-5", max_tokens: 300,
    system: "Property management email classifier. Respond ONLY with valid JSON.",
    messages: [{ role: "user", content: prompt }],
  });
  return JSON.parse((res.content[0] as any).text.trim());
}

// ── Claude reply generator ────────────────────────────────────────────────────
async function generateReply(body: string, intent: string, tenantName: string): Promise<string> {
  const hints: Record<string, string> = {
    payment_question: "Answer clearly and helpfully about the payment question.",
    general_inquiry: "Answer helpfully and warmly.",
    move_in_out: "Confirm details, mention checklist and walk-through scheduling.",
    complaint: "Take it seriously, acknowledge, state next steps.",
    maintenance_request: "Thank them, confirm the issue, give 24-48hr timeline.",
  };
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-5", max_tokens: 500,
    system: `You are Earnest, property manager at MySmartRoom. Reply warmly and professionally. Sign off as: Earnest | MySmartRoom. Write body only, no subject line.`,
    messages: [{ role: "user", content: `Reply to ${tenantName}'s message.\nGuidance: ${hints[intent] ?? "Be helpful."}\n\nMessage: ${body}` }],
  });
  return (res.content[0] as any).text.trim();
}

// ── Mock replies ──────────────────────────────────────────────────────────────
function mockReply(intent: string, tenantName: string): string {
  const first = tenantName.split(" ")[0];
  const replies: Record<string, string> = {
    maintenance_request: `Hi ${first},\n\nThank you for letting us know. I've logged this issue and we'll have someone out within 24–48 hours. I'll send you a follow-up with the scheduled time.\n\nEarnest | MySmartRoom`,
    payment_question: `Hi ${first},\n\nThanks for reaching out. I'll look into this and get back to you within 1 business day. If there's been an error on our end we'll correct it immediately.\n\nEarnest | MySmartRoom`,
    move_in_out: `Hi ${first},\n\nGot it — noted on your move-out. I'll send over the checklist and we'll coordinate a walk-through. Please give 48 hours notice for scheduling.\n\nEarnest | MySmartRoom`,
    complaint: `Hi ${first},\n\nI hear you and I take this seriously. I'll look into the situation right away and follow up with next steps.\n\nEarnest | MySmartRoom`,
    general_inquiry: `Hi ${first},\n\nGreat question — let me look into this and get back to you shortly. Don't hesitate to reach out in the meantime.\n\nEarnest | MySmartRoom`,
  };
  return replies[intent] ?? replies.general_inquiry;
}

// ── Core message pipeline ─────────────────────────────────────────────────────
async function processTenantMessage(memberId: number, body: string) {
  const now = Date.now();
  const member = await storage.getMember(memberId);
  if (!member) throw new Error("Member not found");

  // 1. Upsert thread + insert tenant message
  const thread = await storage.upsertThread(memberId, body);
  const tenantMsg = await storage.insertMessage({ threadId: thread.id, role: "tenant", body, createdAt: now });

  // 2. Classify
  let classification: any;
  let usedMock = false;
  try {
    classification = await classifyMessage(body);
  } catch {
    classification = mockClassify(body);
    usedMock = true;
  }

  const intent: string = classification.intent ?? "general_inquiry";
  const confidence: number = parseFloat(classification.confidence ?? 0.7);
  await storage.updateThreadIntent(thread.id, intent);

  await storage.logActivity({
    type: "MSG_RECEIVED", label: `Message from ${member.name}`,
    detail: body.slice(0, 80), refId: thread.id, refType: "thread",
    urgent: 0, createdAt: now,
  });

  const THRESHOLD = 0.72;
  let agentReply: string | null = null;
  let action = "forwarded";
  let ticket = null;
  const smsSent: any[] = [];

  if (intent === "needs_human_review" || confidence < THRESHOLD) {
    // Forward to owner
    action = "forwarded";
    await storage.logActivity({
      type: "FORWARDED_TO_OWNER", label: `Forwarded: ${member.name}`,
      detail: "Low confidence or legal flag — owner review required.",
      refId: thread.id, refType: "thread", urgent: 1, createdAt: now + 1,
    });
  } else if (intent === "maintenance_request") {
    // Create ticket
    const issueType = detectIssueType(body);
    const urgency = classification.maintenance?.urgency ?? detectUrgency(body);
    const isEmergency = urgency === "emergency";

    // Find vendor
    const vendorList = await storage.getVendors();
    const vendor = vendorList.find(v => v.specialty === issueType && v.available) ??
                   vendorList.find(v => v.specialty === "general" && v.available) ??
                   vendorList[0];

    ticket = await storage.insertTicket({
      threadId: thread.id, memberId, unit: member.unit,
      issueType, description: classification.maintenance?.description ?? body.slice(0, 120),
      urgency, status: vendor ? "assigned" : "new",
      vendorId: vendor?.id ?? null, createdAt: now, updatedAt: now,
    });

    await storage.logActivity({
      type: "TICKET_CREATED", label: `Ticket #${ticket.id}: ${issueType} — ${member.unit}`,
      detail: `${urgency.toUpperCase()} · ${ticket.description}`,
      refId: ticket.id, refType: "ticket",
      urgent: isEmergency ? 1 : 0, createdAt: now + 2,
    });

    // SMS to owner
    const ownerSms = await storage.insertSms({
      to: "earnest@mysmartroom.com", toName: "Earnest Walker",
      body: `🔧 ${isEmergency ? "🚨 EMERGENCY" : "Maintenance"} — ${member.unit} (${member.name}): ${ticket.description.slice(0, 100)}`,
      type: isEmergency ? "emergency" : "owner_alert",
      ticketId: ticket.id, createdAt: now + 3,
    });
    smsSent.push(ownerSms);
    await storage.logActivity({
      type: isEmergency ? "EMERGENCY_ESCALATED" : "SMS_SENT",
      label: `SMS → Earnest${isEmergency ? " (EMERGENCY)" : ""}`,
      detail: ownerSms.body, refId: ticket.id, refType: "ticket",
      urgent: isEmergency ? 1 : 0, createdAt: now + 4,
    });

    // SMS to vendor
    if (vendor) {
      const vendorSms = await storage.insertSms({
        to: vendor.phone, toName: vendor.name,
        body: `New job from MySmartRoom — ${member.unit}: ${ticket.description.slice(0, 80)}. Contact tenant: ${member.email}`,
        type: "vendor_dispatch", ticketId: ticket.id, createdAt: now + 5,
      });
      smsSent.push(vendorSms);
      await storage.logActivity({
        type: "VENDOR_DISPATCHED", label: `${vendor.name} dispatched`,
        detail: `Ticket #${ticket.id} · ${issueType}`, refId: ticket.id, refType: "ticket",
        urgent: 0, createdAt: now + 6,
      });
    }

    action = "sms_sent";
    // Auto-reply
    try {
      agentReply = usedMock ? mockReply(intent, member.name) : await generateReply(body, intent, member.name);
    } catch {
      agentReply = mockReply(intent, member.name);
    }
  } else {
    action = "replied";
    try {
      agentReply = usedMock ? mockReply(intent, member.name) : await generateReply(body, intent, member.name);
    } catch {
      agentReply = mockReply(intent, member.name);
    }
  }

  // Insert agent reply message
  let agentMsg = null;
  if (agentReply) {
    agentMsg = await storage.insertMessage({ threadId: thread.id, role: "agent", body: agentReply, createdAt: now + 10 });
    await storage.logActivity({
      type: "AUTO_REPLIED", label: `Auto-replied to ${member.name}`,
      detail: agentReply.slice(0, 80), refId: thread.id, refType: "thread",
      urgent: 0, createdAt: now + 11,
    });
  }

  const result = { thread, tenantMsg, agentMsg, intent, confidence, classification, action, ticket, smsSent, usedMock };
  broadcast("pipeline", result);
  return result;
}

// ══════════════════════════════════════════════════════════════════════════════
export async function registerRoutes(httpServer: Server, app: Express) {

  // ── SSE stream ──────────────────────────────────────────────────────────
  app.get("/api/v2/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    sseClients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => { clearInterval(ping); sseClients.delete(res); });
  });

  // ── Members ──────────────────────────────────────────────────────────────
  app.get("/api/members", async (_req, res) => {
    res.json(await storage.getMembers());
  });

  app.post("/api/members/:id/score-drop", async (req, res) => {
    const parsed = triggerScoreDropSchema.safeParse({ memberId: parseInt(req.params.id), drop: req.body.drop ?? 15 });
    if (!parsed.success) return res.status(400).json({ error: "Invalid" });
    const member = await storage.getMember(parsed.data.memberId);
    if (!member) return res.status(404).json({ error: "Not found" });
    const hist: number[] = JSON.parse(member.scoreHistory || "[]");
    const newScore = Math.max(0, member.score - parsed.data.drop);
    hist.push(newScore);
    if (hist.length > 30) hist.shift();
    await storage.updateMemberScore(parsed.data.memberId, newScore, hist);
    const activity = await storage.logActivity({
      type: "SCORE_ALERT", label: `Score alert: ${member.name}`,
      detail: `Score dropped to ${newScore} (was ${member.score})`,
      refId: parsed.data.memberId, refType: "member", urgent: newScore < 65 ? 1 : 0,
      createdAt: Date.now(),
    });
    broadcast("score_alert", { memberId: parsed.data.memberId, newScore, activity });
    res.json({ newScore });
  });

  // ── Threads ──────────────────────────────────────────────────────────────
  app.get("/api/threads", async (_req, res) => {
    res.json(await storage.getThreads());
  });

  app.get("/api/threads/:id/messages", async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.markThreadRead(id);
    res.json(await storage.getMessages(id));
  });

  // ── Send tenant message (main pipeline) ──────────────────────────────────
  app.post("/api/threads/message", async (req, res) => {
    const parsed = sendTenantMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });
    try {
      const result = await processTenantMessage(parsed.data.memberId, parsed.data.body);
      res.json(result);
    } catch (err: any) {
      console.error("Pipeline error:", err);
      res.status(500).json({ error: err?.message ?? "Pipeline failed" });
    }
  });

  // ── Vendors ──────────────────────────────────────────────────────────────
  app.get("/api/vendors", async (_req, res) => {
    res.json(await storage.getVendors());
  });

  app.patch("/api/vendors/:id/availability", async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.setVendorAvailability(id, !!req.body.available);
    res.json({ ok: true });
  });

  // ── Tickets ──────────────────────────────────────────────────────────────
  app.get("/api/tickets", async (_req, res) => {
    res.json(await storage.getTickets());
  });

  app.patch("/api/tickets/:id/status", async (req, res) => {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!["new","assigned","in_progress","resolved"].includes(status))
      return res.status(400).json({ error: "Invalid status" });
    const ticket = await storage.updateTicketStatus(id, status);
    await storage.logActivity({
      type: "TICKET_STATUS_CHANGED", label: `Ticket #${id} → ${status}`,
      detail: ticket.description.slice(0, 60), refId: id, refType: "ticket",
      urgent: 0, createdAt: Date.now(),
    });
    broadcast("ticket_update", ticket);
    res.json(ticket);
  });

  app.patch("/api/tickets/:id/vendor", async (req, res) => {
    const id = parseInt(req.params.id);
    const ticket = await storage.updateTicketVendor(id, req.body.vendorId);
    broadcast("ticket_update", ticket);
    res.json(ticket);
  });

  // ── SMS log ──────────────────────────────────────────────────────────────
  app.get("/api/sms", async (_req, res) => {
    res.json(await storage.getSmsLog());
  });

  // ── Notifications (broadcast) ─────────────────────────────────────────────
  app.get("/api/notifications", async (_req, res) => {
    res.json(await storage.getNotifications());
  });

  app.post("/api/notifications/broadcast", async (req, res) => {
    const parsed = broadcastSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });
    const memberList = await storage.getMembers();
    const deliveries = memberList.map(m => ({
      memberId: m.id, name: m.name, unit: m.unit,
      status: Math.random() > 0.05 ? "delivered" : "failed",
      at: Date.now(),
    }));
    const notif = await storage.insertNotification({
      ...parsed.data, deliveries: JSON.stringify(deliveries), createdAt: Date.now(),
    });
    await storage.logActivity({
      type: "BROADCAST_SENT", label: `Broadcast → ${parsed.data.house}`,
      detail: parsed.data.body.slice(0, 80), refId: notif.id, refType: "notification",
      urgent: parsed.data.severity === "emergency" ? 1 : 0, createdAt: Date.now(),
    });
    broadcast("broadcast", { notif, deliveries });
    res.json({ notif, deliveries });
  });

  // ── Activity feed ─────────────────────────────────────────────────────────
  app.get("/api/activity", async (_req, res) => {
    res.json(await storage.getActivity());
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  app.get("/api/stats", async (_req, res) => {
    res.json(await storage.getStats());
  });

  // ── Legacy email simulate (keep working) ──────────────────────────────────
  app.post("/api/simulate", async (req, res) => {
    const parsed = simulateEmailSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });
    const email = parsed.data;
    const dateStr = new Date().toISOString();
    let usedMock = false;
    try {
      let classification: any;
      try { classification = await classifyMessage(email.body); }
      catch { classification = mockClassify(email.body + " " + email.subject); usedMock = true; }

      const intent: string = classification.intent ?? "needs_human_review";
      const confidence: number = parseFloat(classification.confidence ?? 0);
      const maintenance = classification.maintenance ?? null;

      let action = "forwarded";
      let reply: string | null = null;
      if (intent !== "needs_human_review" && confidence >= 0.72) {
        action = intent === "maintenance_request" ? "sms_sent" : "replied";
        try { reply = await generateReply(email.body, intent, email.from.split("@")[0]); }
        catch { reply = mockReply(intent, email.from); }
      }

      const log = await storage.insertEmailLog({
        from: email.from, subject: email.subject, body: email.body,
        intent, confidence: confidence.toFixed(2),
        urgency: maintenance?.urgency ?? null,
        maintenanceDescription: maintenance?.description ?? null,
        maintenanceLocation: maintenance?.location ?? null,
        reply, action, createdAt: Date.now(),
      });
      res.json({ log, classification, reply, action, mock: usedMock });
    } catch (err: any) {
      console.error("Simulate error:", err);
      res.status(500).json({ error: err?.message ?? "Failed" });
    }
  });

  app.get("/api/logs", async (_req, res) => {
    res.json(await storage.getEmailLogs());
  });
}
