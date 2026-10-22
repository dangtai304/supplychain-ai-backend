import Anthropic from "@anthropic-ai/sdk";
import type { ChatBlock, ChatMessage } from "./data/types.js";
import {
  agents,
  exceptionCategories,
  highRiskOrders,
  kpiCatalog,
  mockAgentReply,
  networkNodes,
  omsMetrics,
  shipments,
  statusDistribution,
  volumeTrend,
  workflowStages,
} from "./data/seed.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
const client = apiKey ? new Anthropic({ apiKey }) : null;

export const llmEnabled = () => Boolean(client);

/** Compact snapshot of the control tower the model reasons over. */
function snapshot(resolved: Record<string, string>) {
  const city = (id: string) => networkNodes.find((n) => n.id === id)?.city ?? id;
  return {
    kpis: Object.values(kpiCatalog).map((k) => ({ metric: k.title, value: k.value, change_vs_last_month_pct: k.changePct, higher_is_better: k.higherIsBetter })),
    order_flow: workflowStages.map((s) => ({ stage: s.title, status: s.status, metric: `${s.metric.value} ${s.metric.label}`, pending_approvals: s.pendingApprovals ?? 0, detail: s.detail })),
    oms: omsMetrics.map((m) => ({ metric: m.label, value: m.value, change_pct: m.changePct })),
    order_status_mix: statusDistribution.map((s) => ({ status: s.label, pct: s.pct, orders: s.count })),
    exceptions: exceptionCategories.map((c) => ({
      category: c.label,
      open_count: c.count,
      owner_agent: c.owner,
      sample_orders: c.orders.map((o) => ({ ...o, action_taken: resolved[o.orderId] ?? null })),
    })),
    high_risk_orders: highRiskOrders,
    lanes_at_risk: shipments.filter((s) => s.atRisk).map((s) => ({ id: s.id, lane: `${city(s.from)} → ${city(s.to)}`, mode: s.mode, eta: s.eta, reason: s.riskReason })),
    lanes_in_transit: shipments.length,
    monthly_volume_and_otif_2026: volumeTrend,
    agents: agents.map((a) => ({ name: a.name, scope: a.scope, actions_today: a.actionsToday, pending_approvals: a.pendingApprovals, last_action: a.lastAction })),
  };
}

const replyTool: Anthropic.Tool = {
  name: "reply",
  description: "Send the answer to the user in the copilot panel.",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Lead answer in 1 to 3 plain sentences. Use exact figures from the data." },
      bullets: { type: "array", items: { type: "string" }, maxItems: 6, description: "Optional supporting points, one short sentence each." },
      risk_order_ids: {
        type: "array",
        items: { type: "string" },
        description: "Optional. Order ids from high_risk_orders (e.g. '#SO-45821') to render as risk cards when the user asks about risky orders.",
      },
      actions: { type: "array", items: { type: "string" }, maxItems: 3, description: "Optional follow-up prompts the user can tap, phrased as the user would say them, max 5 words each." },
    },
    required: ["text"],
  },
};

function toText(m: ChatMessage) {
  return m.blocks
    .map((b) => {
      if (b.kind === "text") return b.text;
      if (b.kind === "bullets") return b.items.map((i) => `- ${i}`).join("\n");
      if (b.kind === "riskOrders") return b.orders.map((o) => `${o.orderId} ${o.tag}: ${o.detail}`).join("\n");
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Builds a valid alternating user/assistant history that starts with the user. */
function history(prev: ChatMessage[], prompt: string): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of [...prev.slice(-10), { id: "now", from: "user" as const, time: "", blocks: [{ kind: "text" as const, text: prompt }] }]) {
    const role = m.from === "user" ? "user" : "assistant";
    const text = toText(m);
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n\n${text}`;
    else out.push({ role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export async function copilotReply(args: {
  prompt: string;
  previous: ChatMessage[];
  role: string;
  resolved: Record<string, string>;
}): Promise<{ blocks: ChatBlock[]; source: "claude" | "canned" }> {
  if (!client) return { blocks: mockAgentReply(args.prompt), source: "canned" };

  const system = [
    "You are the Supply Chain AI Assistant inside an agentic supply chain control tower.",
    `The user is viewing the dashboard as: ${args.role}. Tailor emphasis to that role.`,
    "Answer only from the JSON snapshot below. If the data doesn't cover something, say so briefly and suggest what to check.",
    "Be concise and operational: lead with the answer, quote exact numbers, name orders/lanes/agents.",
    "You cannot execute actions yourself; when the user asks to approve or run something, say which agent would carry it out and that it needs approval in the Exceptions panel.",
    "Always respond by calling the reply tool.",
    "",
    "<control_tower_snapshot>",
    JSON.stringify(snapshot(args.resolved)),
    "</control_tower_snapshot>",
  ].join("\n");

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 900,
      system,
      tools: [replyTool],
      tool_choice: { type: "tool", name: "reply" },
      messages: history(args.previous, args.prompt),
    });
    const use = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    if (!use) throw new Error("no tool_use in response");
    const input = use.input as { text: string; bullets?: string[]; risk_order_ids?: string[]; actions?: string[] };
    const blocks: ChatBlock[] = [{ kind: "text", text: input.text }];
    const risk = (input.risk_order_ids ?? [])
      .map((id) => highRiskOrders.find((o) => o.orderId.replace("#", "") === id.replace("#", "")))
      .filter((o): o is (typeof highRiskOrders)[number] => Boolean(o));
    if (risk.length) blocks.push({ kind: "riskOrders", orders: risk });
    if (input.bullets?.length) blocks.push({ kind: "bullets", items: input.bullets });
    if (input.actions?.length) blocks.push({ kind: "actions", actions: input.actions });
    return { blocks, source: "claude" };
  } catch (err) {
    console.error("[copilot] Claude call failed, using canned reply:", (err as Error).message);
    return { blocks: mockAgentReply(args.prompt), source: "canned" };
  }
}
