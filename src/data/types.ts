// Domain schemas for the SupplyChain AI dashboard.
// Every component receives typed props from these models; mock-data.ts implements them.

export type Tone = "ok" | "bad" | "warn" | "info" | "cyan" | "purple" | "orange";

export type RoleId =
  | "scm"
  | "inventory"
  | "procurement"
  | "logistics"
  | "oms"
  | "finance"
  | "executive";

export interface Role {
  id: RoleId;
  label: string;
  /** KPI ids shown in the 6-card summary row, in order */
  kpis: KpiId[];
  /** Workflow stages highlighted for this persona */
  focusStages: StageId[];
  /** Agents this persona owns (highlighted in the tray) */
  focusAgents: AgentId[];
  /** Exception categories this persona is accountable for; empty = all */
  exceptionScope: ExceptionId[];
}

/* ---------- KPIs ---------- */

export type KpiId =
  | "totalOrders"
  | "fillRate"
  | "otd"
  | "invTurnover"
  | "scCost"
  | "exceptions"
  | "daysOfSupply"
  | "stockouts"
  | "openPOs"
  | "supplierOTD"
  | "freightCost"
  | "carrierOTP"
  | "otif"
  | "costPerOrder"
  | "workingCapital"
  | "revenueAtRisk";

export interface Kpi {
  id: KpiId;
  title: string;
  /** Pre-formatted display value, e.g. "96.2%" */
  value: string;
  /** Change vs. prior period, in percent */
  changePct: number;
  /** Whether an increase is good for this metric (cost ↑ is bad) */
  higherIsBetter: boolean;
  /** 12-point trend for the sparkline */
  trend: number[];
  /** Period label shown under the value */
  period: string;
}

/* ---------- Workflow ---------- */

export type StageId =
  | "customerOrder"
  | "oms"
  | "inventory"
  | "procurement"
  | "warehouse"
  | "transportation"
  | "customer";

export type StageStatus = "active" | "inProgress" | "needsApproval" | "idle";
export type ActorKind = "agent" | "human" | "automated";

export interface WorkflowStage {
  id: StageId;
  title: string;
  description: string;
  status: StageStatus;
  actor: ActorKind;
  /** Throughput / queue figure shown on the node */
  metric: { value: string; label: string };
  /** Decisions waiting on a human (shown as the amber approval marker) */
  pendingApprovals?: number;
  /** Detail shown when a stage is selected */
  detail: { label: string; value: string }[];
}

/* ---------- OMS ---------- */

export interface OmsMetric {
  id: string;
  label: string;
  value: number;
  changePct: number;
  higherIsBetter: boolean;
  trend: number[];
}

export interface StatusSegment {
  id: "delivered" | "inTransit" | "processing" | "backordered" | "cancelled";
  label: string;
  pct: number;
  count: number;
  tone: Tone;
}

/* ---------- Exceptions ---------- */

export type ExceptionId = "delayed" | "partial" | "slaRisk" | "backordered" | "addressPayment";

export interface ExceptionOrder {
  orderId: string;
  customer: string;
  reason: string;
  recommendation: string;
  value: number;
}

export interface ExceptionCategory {
  id: ExceptionId;
  label: string;
  count: number;
  tone: Tone;
  owner: string;
  orders: ExceptionOrder[];
}

/* ---------- Network ---------- */

export type NodeKind = "factory" | "warehouse" | "dc" | "retailer";

export interface NetworkNode {
  id: string;
  kind: NodeKind;
  name: string;
  city: string;
  coords: [lon: number, lat: number];
}

export interface Shipment {
  id: string;
  from: string;
  to: string;
  mode: "Ocean" | "Air" | "Road" | "Rail";
  atRisk: boolean;
  eta: string;
  riskReason?: string;
}

/* ---------- Volume trend ---------- */

export interface VolumePoint {
  month: string;
  volumeK: number;
  otif: number;
}

/* ---------- Agents ---------- */

export type AgentId =
  | "demand"
  | "inventory"
  | "procurement"
  | "supplierRisk"
  | "warehouse"
  | "transportation"
  | "oms"
  | "analytics";

export type AgentHealth = "active" | "degraded" | "paused";

export interface Agent {
  id: AgentId;
  name: string;
  scope: string;
  health: AgentHealth;
  actionsToday: number;
  pendingApprovals: number;
  lastAction: string;
}

/* ---------- Copilot ---------- */

export type RiskTag = "Port congestion" | "Out of stock" | "Weather delay" | "Address validation" | "Carrier capacity";

export interface RiskOrder {
  orderId: string;
  customer: string;
  tag: RiskTag;
  detail: string;
  riskScore: number;
}

export type ChatBlock =
  | { kind: "text"; text: string }
  | { kind: "riskOrders"; orders: RiskOrder[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "actions"; actions: string[] };

export interface ChatMessage {
  id: string;
  from: "user" | "agent";
  time: string;
  blocks: ChatBlock[];
}

/* ---------- Navigation ---------- */

export type NavId =
  | "home"
  | "agents"
  | "ask"
  | "demand"
  | "orders"
  | "inventory"
  | "procurement"
  | "suppliers"
  | "manufacturing"
  | "transportation"
  | "warehousing"
  | "customers"
  | "exceptions"
  | "analytics"
  | "reports"
  | "settings";

export interface NavItem {
  id: NavId;
  label: string;
  badge?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}
