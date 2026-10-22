// Strongly typed mock data service. Swap these exports for API calls later —
// components only depend on the types in ./types.

import type {
  Agent,
  ChatMessage,
  ExceptionCategory,
  Kpi,
  KpiId,
  NavGroup,
  NetworkNode,
  OmsMetric,
  Role,
  RoleId,
  RiskOrder,
  Shipment,
  StatusSegment,
  VolumePoint,
  WorkflowStage,
} from "./types.js";

/** Deterministic 12-point trend that ends at `end` and moved `changePct` over the window. */
export function makeTrend(end: number, changePct: number, seed = 1): number[] {
  const start = end / (1 + changePct / 100);
  return Array.from({ length: 12 }, (_, i) => {
    const t = i / 11;
    const wiggle = i === 11 ? 0 : Math.sin(i * 1.7 + seed) * Math.abs(end - start) * 0.35;
    return +(start + (end - start) * t + wiggle).toFixed(3);
  });
}

/* ---------------- Persona user ---------------- */

export const currentUser = { firstName: "Simhadri", org: "Global Supply Chain" };

/* ---------------- KPIs ---------------- */

const kpi = (
  id: KpiId,
  title: string,
  value: string,
  raw: number,
  changePct: number,
  higherIsBetter: boolean,
  seed: number,
  period = "vs. last month",
): Kpi => ({ id, title, value, changePct, higherIsBetter, trend: makeTrend(raw, changePct, seed), period });

export const kpiCatalog: Record<KpiId, Kpi> = {
  totalOrders: kpi("totalOrders", "Total Orders", "12,480", 12480, 8, true, 1),
  fillRate: kpi("fillRate", "Order Fill Rate", "96.2%", 96.2, 2.4, true, 2),
  otd: kpi("otd", "On-Time Delivery (OTD)", "87.4%", 87.4, -3.6, true, 3),
  invTurnover: kpi("invTurnover", "Inventory Turnover", "6.2", 6.2, 8.4, true, 4),
  scCost: kpi("scCost", "Supply Chain Cost", "$2.4M", 2.4, 6.3, false, 5),
  exceptions: kpi("exceptions", "Order Exceptions", "142", 142, 22, false, 6),
  daysOfSupply: kpi("daysOfSupply", "Days of Supply", "38.5", 38.5, -4.1, false, 7),
  stockouts: kpi("stockouts", "Stockout SKUs", "64", 64, 12.3, false, 8),
  openPOs: kpi("openPOs", "Open Purchase Orders", "1,284", 1284, 5.2, true, 9),
  supplierOTD: kpi("supplierOTD", "Supplier On-Time", "91.8%", 91.8, -1.9, true, 10),
  freightCost: kpi("freightCost", "Freight Cost", "$812K", 812, 9.7, false, 11),
  carrierOTP: kpi("carrierOTP", "Carrier On-Time Pickup", "93.1%", 93.1, -2.2, true, 12),
  otif: kpi("otif", "OTIF", "86.1%", 86.1, -3.9, true, 13),
  costPerOrder: kpi("costPerOrder", "Cost per Order", "$192", 192, -1.6, false, 14),
  workingCapital: kpi("workingCapital", "Inventory Value", "$18.6M", 18.6, -2.8, false, 15),
  revenueAtRisk: kpi("revenueAtRisk", "Revenue at Risk", "$1.3M", 1.3, 18.5, false, 16),
};

/* ---------------- Roles ---------------- */

export const roles: Role[] = [
  {
    id: "scm",
    label: "Supply Chain Manager",
    kpis: ["totalOrders", "fillRate", "otd", "invTurnover", "scCost", "exceptions"],
    focusStages: [],
    focusAgents: [],
    exceptionScope: [],
  },
  {
    id: "inventory",
    label: "Inventory Planner",
    kpis: ["invTurnover", "daysOfSupply", "stockouts", "fillRate", "workingCapital", "exceptions"],
    focusStages: ["inventory", "procurement"],
    focusAgents: ["demand", "inventory"],
    exceptionScope: ["partial", "backordered"],
  },
  {
    id: "procurement",
    label: "Procurement Manager",
    kpis: ["openPOs", "supplierOTD", "scCost", "stockouts", "fillRate", "exceptions"],
    focusStages: ["procurement"],
    focusAgents: ["procurement", "supplierRisk"],
    exceptionScope: ["backordered", "partial"],
  },
  {
    id: "logistics",
    label: "Logistics Manager",
    kpis: ["otd", "carrierOTP", "freightCost", "otif", "scCost", "exceptions"],
    focusStages: ["warehouse", "transportation"],
    focusAgents: ["warehouse", "transportation"],
    exceptionScope: ["delayed", "slaRisk"],
  },
  {
    id: "oms",
    label: "OMS Manager",
    kpis: ["totalOrders", "fillRate", "otif", "exceptions", "otd", "costPerOrder"],
    focusStages: ["customerOrder", "oms", "customer"],
    focusAgents: ["oms"],
    exceptionScope: ["partial", "slaRisk", "addressPayment"],
  },
  {
    id: "finance",
    label: "Finance",
    kpis: ["scCost", "costPerOrder", "workingCapital", "freightCost", "revenueAtRisk", "invTurnover"],
    focusStages: ["procurement", "transportation"],
    focusAgents: ["analytics", "procurement"],
    exceptionScope: ["addressPayment", "backordered"],
  },
  {
    id: "executive",
    label: "Executive",
    kpis: ["totalOrders", "otif", "scCost", "revenueAtRisk", "invTurnover", "fillRate"],
    focusStages: [],
    focusAgents: ["analytics"],
    exceptionScope: [],
  },
];

export const roleById = (id: RoleId) => roles.find((r) => r.id === id)!;

/* ---------------- Workflow ---------------- */

export const workflowStages: WorkflowStage[] = [
  {
    id: "customerOrder",
    title: "Customer Order",
    description: "Orders captured across channels",
    status: "active",
    actor: "automated",
    metric: { value: "12,480", label: "This month" },
    detail: [
      { label: "EDI / API", value: "61%" },
      { label: "Web portal", value: "27%" },
      { label: "Sales reps", value: "12%" },
    ],
  },
  {
    id: "oms",
    title: "OMS Agent",
    description: "Order orchestration, ATP fulfillment",
    status: "active",
    actor: "agent",
    metric: { value: "418", label: "Orchestrated / hr" },
    detail: [
      { label: "Auto-promised (ATP)", value: "94.6%" },
      { label: "Split shipments", value: "312" },
      { label: "Avg. decision time", value: "1.8 s" },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    description: "Stock check & allocation",
    status: "active",
    actor: "agent",
    metric: { value: "11,962", label: "Allocated" },
    detail: [
      { label: "Re-allocations today", value: "57" },
      { label: "Safety stock breaches", value: "9" },
      { label: "Stockout SKUs", value: "64" },
    ],
  },
  {
    id: "procurement",
    title: "Procurement",
    description: "Replenishment & PO creation",
    status: "active",
    actor: "agent",
    metric: { value: "148", label: "POs created" },
    pendingApprovals: 6,
    detail: [
      { label: "POs auto-created", value: "148" },
      { label: "Awaiting approval", value: "6 ($214K)" },
      { label: "Supplier on-time", value: "91.8%" },
    ],
  },
  {
    id: "warehouse",
    title: "Warehouse",
    description: "Pick, pack & ship",
    status: "active",
    actor: "agent",
    metric: { value: "3,240", label: "Lines picked today" },
    detail: [
      { label: "Pick accuracy", value: "99.7%" },
      { label: "Dock utilization", value: "82%" },
      { label: "Waves released", value: "38" },
    ],
  },
  {
    id: "transportation",
    title: "Transportation",
    description: "Route & track",
    status: "active",
    actor: "agent",
    metric: { value: "26", label: "Lanes in transit" },
    detail: [
      { label: "Shipments at risk", value: "4" },
      { label: "Carrier on-time pickup", value: "93.1%" },
      { label: "Re-routes today", value: "3" },
    ],
  },
  {
    id: "customer",
    title: "Customer",
    description: "Delivery & satisfaction",
    status: "inProgress",
    actor: "automated",
    metric: { value: "4.6 / 5", label: "CSAT" },
    detail: [
      { label: "Delivered this month", value: "9,734" },
      { label: "Proactive delay notices", value: "212" },
      { label: "Claims opened", value: "18" },
    ],
  },
];

/* ---------------- OMS ---------------- */

export const omsMetrics: OmsMetric[] = [
  { id: "total", label: "Total Orders", value: 12480, changePct: 8, higherIsBetter: true, trend: makeTrend(12480, 8, 21) },
  { id: "fulfilled", label: "Fulfilled Orders", value: 12018, changePct: 10, higherIsBetter: true, trend: makeTrend(12018, 10, 22) },
  { id: "open", label: "Open Orders", value: 320, changePct: -12, higherIsBetter: false, trend: makeTrend(320, -12, 23) },
  { id: "backorders", label: "Backorders", value: 86, changePct: 28, higherIsBetter: false, trend: makeTrend(86, 28, 24) },
];

export const statusDistribution: StatusSegment[] = [
  { id: "delivered", label: "Delivered", pct: 78, count: 9734, tone: "ok" },
  { id: "inTransit", label: "In Transit", pct: 12, count: 1498, tone: "info" },
  { id: "processing", label: "Processing", pct: 5, count: 624, tone: "cyan" },
  { id: "backordered", label: "Backordered", pct: 3, count: 374, tone: "warn" },
  { id: "cancelled", label: "Cancelled", pct: 2, count: 250, tone: "bad" },
];

/* ---------------- Exceptions ---------------- */

export const exceptionCategories: ExceptionCategory[] = [
  {
    id: "delayed",
    label: "Delayed Shipments (ETA > 48 hrs)",
    count: 42,
    tone: "bad",
    owner: "Transportation Agent",
    orders: [
      { orderId: "SO-45821", customer: "Northwind Retail", reason: "Vessel held at Port of Los Angeles, 3-day berth queue", recommendation: "Expedite 40% of units by air from Shenzhen", value: 128400 },
      { orderId: "SO-45633", customer: "Bluebird Pharmacy", reason: "Carrier missed pickup window at Chicago DC", recommendation: "Re-tender to backup carrier for same-day pickup", value: 42150 },
      { orderId: "SO-45702", customer: "Atlas Home", reason: "Rail congestion on LA → Dallas corridor", recommendation: "Switch final leg to truckload", value: 66900 },
    ],
  },
  {
    id: "partial",
    label: "Partial Fulfillments",
    count: 28,
    tone: "orange",
    owner: "Inventory Agent",
    orders: [
      { orderId: "SO-45876", customer: "Contoso Outdoor", reason: "SKU TX-2210 short 340 units at Dallas DC", recommendation: "Transfer stock from Atlanta DC (1,120 on hand)", value: 54300 },
      { orderId: "SO-45690", customer: "Fabrikam Foods", reason: "Pallet damage found during pick", recommendation: "Ship available lines, backorder 2 lines", value: 18700 },
      { orderId: "SO-45755", customer: "Lumen Electronics", reason: "Allocation split across two DCs", recommendation: "Consolidate at Newark DC before ship", value: 37250 },
    ],
  },
  {
    id: "slaRisk",
    label: "At Risk of Missing SLA",
    count: 26,
    tone: "warn",
    owner: "Order Management Agent",
    orders: [
      { orderId: "SO-45901", customer: "Harbor Hardware AU", reason: "Tropical cyclone warning on Singapore → Sydney lane", recommendation: "Notify customer, hold 2 days, reroute via Brisbane", value: 73800 },
      { orderId: "SO-45812", customer: "Kestrel Apparel", reason: "Pick wave backlog at Rotterdam", recommendation: "Prioritize in next wave release", value: 22400 },
      { orderId: "SO-45867", customer: "Orion Medical", reason: "Customs documents incomplete", recommendation: "Auto-generate commercial invoice and resubmit", value: 91200 },
    ],
  },
  {
    id: "backordered",
    label: "Backordered Orders",
    count: 18,
    tone: "purple",
    owner: "Procurement Agent",
    orders: [
      { orderId: "SO-45720", customer: "Summit Sports", reason: "Supplier lead time extended 10 days", recommendation: "Approve alternate supplier PO-88213", value: 48600 },
      { orderId: "SO-45781", customer: "Verde Living", reason: "Component shortage at Monterrey plant", recommendation: "Pull forward production slot on Line 2", value: 29900 },
      { orderId: "SO-45799", customer: "Pinnacle Office", reason: "Demand spike 2.3× forecast", recommendation: "Raise safety stock and place spot buy", value: 35100 },
    ],
  },
  {
    id: "addressPayment",
    label: "Address / Payment Issues",
    count: 14,
    tone: "info",
    owner: "Order Management Agent",
    orders: [
      { orderId: "SO-45944", customer: "Riverside Clinic", reason: "Ship-to address failed postal validation", recommendation: "Send address confirmation to customer contact", value: 12800 },
      { orderId: "SO-45918", customer: "Maple & Co.", reason: "Credit hold, invoice 30 days overdue", recommendation: "Route to Finance for release decision", value: 26400 },
      { orderId: "SO-45930", customer: "Granite Builders", reason: "Card authorization declined", recommendation: "Request updated payment method", value: 9100 },
    ],
  },
];

/* ---------------- Network ---------------- */

export const networkNodes: NetworkNode[] = [
  // Factories (3)
  { id: "f-shenzhen", kind: "factory", name: "Shenzhen Plant", city: "Shenzhen", coords: [114.06, 22.54] },
  { id: "f-monterrey", kind: "factory", name: "Monterrey Plant", city: "Monterrey", coords: [-100.31, 25.67] },
  { id: "f-pune", kind: "factory", name: "Pune Plant", city: "Pune", coords: [73.86, 18.52] },
  // Warehouses (8)
  { id: "w-la", kind: "warehouse", name: "LA Gateway", city: "Los Angeles", coords: [-118.24, 34.05] },
  { id: "w-rotterdam", kind: "warehouse", name: "Rotterdam Hub", city: "Rotterdam", coords: [4.48, 51.92] },
  { id: "w-singapore", kind: "warehouse", name: "Singapore Hub", city: "Singapore", coords: [103.82, 1.35] },
  { id: "w-shanghai", kind: "warehouse", name: "Shanghai Port WH", city: "Shanghai", coords: [121.47, 31.23] },
  { id: "w-dubai", kind: "warehouse", name: "Jebel Ali WH", city: "Dubai", coords: [55.27, 25.2] },
  { id: "w-chicago", kind: "warehouse", name: "Chicago WH", city: "Chicago", coords: [-87.63, 41.88] },
  { id: "w-saopaulo", kind: "warehouse", name: "São Paulo WH", city: "São Paulo", coords: [-46.63, -23.55] },
  { id: "w-bangkok", kind: "warehouse", name: "Bangkok WH", city: "Bangkok", coords: [100.5, 13.75] },
  // Distribution centers (12)
  { id: "dc-dallas", kind: "dc", name: "Dallas DC", city: "Dallas", coords: [-96.8, 32.78] },
  { id: "dc-atlanta", kind: "dc", name: "Atlanta DC", city: "Atlanta", coords: [-84.39, 33.75] },
  { id: "dc-newark", kind: "dc", name: "Newark DC", city: "Newark", coords: [-74.17, 40.73] },
  { id: "dc-toronto", kind: "dc", name: "Toronto DC", city: "Toronto", coords: [-79.38, 43.65] },
  { id: "dc-frankfurt", kind: "dc", name: "Frankfurt DC", city: "Frankfurt", coords: [8.68, 50.11] },
  { id: "dc-madrid", kind: "dc", name: "Madrid DC", city: "Madrid", coords: [-3.7, 40.42] },
  { id: "dc-warsaw", kind: "dc", name: "Warsaw DC", city: "Warsaw", coords: [21.01, 52.23] },
  { id: "dc-tokyo", kind: "dc", name: "Tokyo DC", city: "Tokyo", coords: [139.69, 35.69] },
  { id: "dc-sydney", kind: "dc", name: "Sydney DC", city: "Sydney", coords: [151.21, -33.87] },
  { id: "dc-mumbai", kind: "dc", name: "Mumbai DC", city: "Mumbai", coords: [72.88, 19.08] },
  { id: "dc-johannesburg", kind: "dc", name: "Johannesburg DC", city: "Johannesburg", coords: [28.05, -26.2] },
  { id: "dc-mexico", kind: "dc", name: "Mexico City DC", city: "Mexico City", coords: [-99.13, 19.43] },
  // Retailers (18)
  { id: "r-seattle", kind: "retailer", name: "Seattle stores", city: "Seattle", coords: [-122.33, 47.61] },
  { id: "r-denver", kind: "retailer", name: "Denver stores", city: "Denver", coords: [-104.99, 39.74] },
  { id: "r-miami", kind: "retailer", name: "Miami stores", city: "Miami", coords: [-80.19, 25.76] },
  { id: "r-boston", kind: "retailer", name: "Boston stores", city: "Boston", coords: [-71.06, 42.36] },
  { id: "r-vancouver", kind: "retailer", name: "Vancouver stores", city: "Vancouver", coords: [-123.12, 49.28] },
  { id: "r-london", kind: "retailer", name: "London stores", city: "London", coords: [-0.13, 51.51] },
  { id: "r-paris", kind: "retailer", name: "Paris stores", city: "Paris", coords: [2.35, 48.86] },
  { id: "r-milan", kind: "retailer", name: "Milan stores", city: "Milan", coords: [9.19, 45.46] },
  { id: "r-stockholm", kind: "retailer", name: "Stockholm stores", city: "Stockholm", coords: [18.07, 59.33] },
  { id: "r-istanbul", kind: "retailer", name: "Istanbul stores", city: "Istanbul", coords: [28.98, 41.01] },
  { id: "r-seoul", kind: "retailer", name: "Seoul stores", city: "Seoul", coords: [126.98, 37.57] },
  { id: "r-osaka", kind: "retailer", name: "Osaka stores", city: "Osaka", coords: [135.5, 34.69] },
  { id: "r-jakarta", kind: "retailer", name: "Jakarta stores", city: "Jakarta", coords: [106.85, -6.21] },
  { id: "r-melbourne", kind: "retailer", name: "Melbourne stores", city: "Melbourne", coords: [144.96, -37.81] },
  { id: "r-delhi", kind: "retailer", name: "Delhi stores", city: "Delhi", coords: [77.21, 28.61] },
  { id: "r-lagos", kind: "retailer", name: "Lagos stores", city: "Lagos", coords: [3.38, 6.52] },
  { id: "r-buenosaires", kind: "retailer", name: "Buenos Aires stores", city: "Buenos Aires", coords: [-58.38, -34.6] },
  { id: "r-hcmc", kind: "retailer", name: "Ho Chi Minh City stores", city: "Ho Chi Minh City", coords: [106.66, 10.82] },
];

const lane = (n: number, from: string, to: string, mode: Shipment["mode"], eta: string, riskReason?: string): Shipment => ({
  id: `SH-${String(70100 + n)}`,
  from,
  to,
  mode,
  eta,
  atRisk: Boolean(riskReason),
  riskReason,
});

export const shipments: Shipment[] = [
  lane(1, "f-shenzhen", "w-shanghai", "Road", "Oct 24"),
  lane(2, "f-shenzhen", "w-singapore", "Ocean", "Oct 29"),
  lane(3, "w-shanghai", "w-la", "Ocean", "Nov 6 (+3d)", "Port congestion at Los Angeles"),
  lane(4, "f-shenzhen", "w-rotterdam", "Ocean", "Nov 18 (+9d)", "Rerouted around Cape of Good Hope"),
  lane(5, "f-monterrey", "dc-dallas", "Road", "Oct 23"),
  lane(6, "f-monterrey", "dc-mexico", "Road", "Oct 23"),
  lane(7, "f-pune", "dc-mumbai", "Road", "Oct 23"),
  lane(8, "f-pune", "w-dubai", "Ocean", "Oct 30"),
  lane(9, "w-la", "dc-dallas", "Rail", "Oct 26"),
  lane(10, "w-chicago", "dc-newark", "Rail", "Oct 25"),
  lane(11, "w-chicago", "dc-toronto", "Road", "Oct 25 (+2d)", "Customs hold at Detroit crossing"),
  lane(12, "w-rotterdam", "dc-frankfurt", "Road", "Oct 24"),
  lane(13, "w-rotterdam", "dc-madrid", "Road", "Oct 26"),
  lane(14, "w-rotterdam", "dc-warsaw", "Rail", "Oct 27"),
  lane(15, "w-singapore", "dc-sydney", "Ocean", "Nov 4 (+2d)", "Tropical cyclone warning on route"),
  lane(16, "w-shanghai", "dc-tokyo", "Ocean", "Oct 27"),
  lane(17, "w-dubai", "dc-johannesburg", "Air", "Oct 23"),
  lane(18, "w-saopaulo", "r-buenosaires", "Road", "Oct 25"),
  lane(19, "dc-atlanta", "r-miami", "Road", "Oct 23"),
  lane(20, "dc-newark", "r-boston", "Road", "Oct 23"),
  lane(21, "dc-frankfurt", "r-paris", "Road", "Oct 24"),
  lane(22, "dc-frankfurt", "r-milan", "Road", "Oct 24"),
  lane(23, "dc-tokyo", "r-seoul", "Air", "Oct 23"),
  lane(24, "w-bangkok", "r-hcmc", "Road", "Oct 25"),
  lane(25, "dc-mumbai", "r-delhi", "Rail", "Oct 24"),
  lane(26, "w-la", "r-seattle", "Road", "Oct 24"),
];

/* ---------------- Volume trend ---------------- */

export const volumeTrend: VolumePoint[] = [
  { month: "Jan", volumeK: 96, otif: 91.2 },
  { month: "Feb", volumeK: 99, otif: 90.8 },
  { month: "Mar", volumeK: 108, otif: 92.1 },
  { month: "Apr", volumeK: 105, otif: 91.5 },
  { month: "May", volumeK: 112, otif: 92.6 },
  { month: "Jun", volumeK: 117, otif: 93.0 },
  { month: "Jul", volumeK: 114, otif: 91.8 },
  { month: "Aug", volumeK: 121, otif: 90.9 },
  { month: "Sep", volumeK: 127, otif: 89.6 },
  { month: "Oct", volumeK: 124, otif: 86.1 },
];

/* ---------------- Agents ---------------- */

export const agents: Agent[] = [
  { id: "demand", name: "Demand Agent", scope: "Forecast & demand signals", health: "active", actionsToday: 86, pendingApprovals: 0, lastAction: "Raised Q4 forecast for TX-2210 by 18%" },
  { id: "inventory", name: "Inventory Agent", scope: "Stock & allocation", health: "active", actionsToday: 214, pendingApprovals: 2, lastAction: "Transferred 1,120 units Atlanta → Dallas" },
  { id: "procurement", name: "Procurement Agent", scope: "POs & supplier management", health: "active", actionsToday: 148, pendingApprovals: 6, lastAction: "Drafted alternate-supplier PO-88213" },
  { id: "supplierRisk", name: "Supplier Risk Agent", scope: "Supplier performance", health: "active", actionsToday: 37, pendingApprovals: 1, lastAction: "Flagged lead-time drift at Kessler Components" },
  { id: "warehouse", name: "Warehouse Agent", scope: "Picking, packing, capacity", health: "active", actionsToday: 392, pendingApprovals: 0, lastAction: "Released wave 38 at Rotterdam Hub" },
  { id: "transportation", name: "Transportation Agent", scope: "Route, carrier & ETA", health: "active", actionsToday: 171, pendingApprovals: 3, lastAction: "Re-tendered SH-70111 to backup carrier" },
  { id: "oms", name: "Order Management Agent", scope: "Order orchestration, ATP, exceptions", health: "active", actionsToday: 1046, pendingApprovals: 4, lastAction: "Split SO-45876 across two DCs" },
  { id: "analytics", name: "Analytics Agent", scope: "Insights & reporting", health: "active", actionsToday: 24, pendingApprovals: 0, lastAction: "Published weekly OTIF variance brief" },
];

/* ---------------- Copilot ---------------- */

export const highRiskOrders: RiskOrder[] = [
  { orderId: "#SO-45821", customer: "Northwind Retail", tag: "Port congestion", detail: "Shanghai → LA vessel in 3-day berth queue", riskScore: 92 },
  { orderId: "#SO-45876", customer: "Contoso Outdoor", tag: "Out of stock", detail: "TX-2210 short 340 units at Dallas DC", riskScore: 88 },
  { orderId: "#SO-45901", customer: "Harbor Hardware AU", tag: "Weather delay", detail: "Cyclone warning on Singapore → Sydney lane", riskScore: 81 },
  { orderId: "#SO-45944", customer: "Riverside Clinic", tag: "Address validation", detail: "Ship-to failed postal validation", riskScore: 74 },
  { orderId: "#SO-45978", customer: "Kestrel Apparel EU", tag: "Port congestion", detail: "Shenzhen → Rotterdam rerouted, +9 days", riskScore: 71 },
];

export const quickActions = ["Show detailed analysis", "Recommend actions", "Create a report"];
export const contextChips = ["Orders", "Inventory", "Procurement", "Logistics", "Suppliers"];

export const initialChat: ChatMessage[] = [
  {
    id: "m1",
    from: "agent",
    time: "10:20 AM",
    blocks: [{ kind: "text", text: "Good morning. Overnight I resolved 61 exceptions automatically. 142 are still open and 16 need your approval." }],
  },
  {
    id: "m2",
    from: "user",
    time: "10:22 AM",
    blocks: [{ kind: "text", text: "Show me high risk orders and reason." }],
  },
  {
    id: "m3",
    from: "agent",
    time: "10:22 AM",
    blocks: [
      { kind: "text", text: "5 open orders have a risk score above 70, worth $382K combined. The top reasons:" },
      { kind: "riskOrders", orders: highRiskOrders },
      { kind: "actions", actions: quickActions },
    ],
  },
];

/** Canned agent replies keyed off the prompt. Replace with a real LLM / agent endpoint. */
export function mockAgentReply(prompt: string): ChatMessage["blocks"] {
  const p = prompt.toLowerCase();
  const agent = p.startsWith("what has the") ? agents.find((a) => p.includes(a.name.toLowerCase())) : undefined;
  if (agent) {
    return [
      { kind: "text", text: `${agent.name} (${agent.scope.toLowerCase()}) has taken ${agent.actionsToday.toLocaleString("en-US")} actions today.` },
      {
        kind: "bullets",
        items: [
          `Latest: ${agent.lastAction}.`,
          agent.pendingApprovals > 0 ? `${agent.pendingApprovals} decisions are waiting for your approval.` : "Nothing is waiting for approval.",
          "Health: active, all data feeds current.",
        ],
      },
      ...(agent.pendingApprovals > 0 ? [{ kind: "actions" as const, actions: ["Recommend actions"] }] : []),
    ];
  }
  if (p.includes("detailed analysis") || p.includes("analysis")) {
    return [
      { kind: "text", text: "Root-cause breakdown for the 5 high-risk orders:" },
      {
        kind: "bullets",
        items: [
          "2 of 5 are ocean lanes out of China. Transit variance on those lanes is up 41% this month.",
          "TX-2210 demand ran 2.3× forecast for 3 weeks, so Dallas DC fell below safety stock.",
          "The cyclone risk window on Singapore → Sydney closes in about 48 hours.",
          "The address failure is a data-entry error on a new customer account.",
        ],
      },
      { kind: "actions", actions: ["Recommend actions", "Create a report"] },
    ];
  }
  if (p.includes("recommend")) {
    return [
      { kind: "text", text: "Recommended actions, ranked by revenue protected:" },
      {
        kind: "bullets",
        items: [
          "Air-freight 40% of SO-45821 from Shenzhen: protects $128K, costs $9.4K. Needs your approval.",
          "Transfer 1,120 units Atlanta → Dallas for SO-45876. Inventory Agent can run it now.",
          "Notify Harbor Hardware AU of a 2-day hold and reroute via Brisbane.",
          "Send an address confirmation request for SO-45944.",
        ],
      },
      { kind: "actions", actions: ["Approve all 4 actions", "Create a report"] },
    ];
  }
  if (p.includes("approve")) {
    return [{ kind: "text", text: "Done. 4 actions queued. The Transportation, Inventory and Order Management agents will report back in this thread as each one completes." }];
  }
  if (p.includes("report")) {
    return [{ kind: "text", text: "Drafted the report \"High-risk orders, Oct 22\" with root causes, actions and $382K exposure. It's saved under Reports, ready to share." }];
  }
  if (p.includes("inventory") || p.includes("stock")) {
    return [
      { kind: "text", text: "Inventory snapshot across 12 DCs:" },
      { kind: "bullets", items: ["64 SKUs are below safety stock, 9 of them A-class.", "Days of supply: 38.5, down 4.1% vs. last month.", "57 re-allocations ran today with no human touch."] },
    ];
  }
  if (p.includes("procure") || p.includes("po")) {
    return [
      { kind: "text", text: "Procurement queue:" },
      { kind: "bullets", items: ["6 POs worth $214K are waiting for your approval.", "148 POs were auto-created this week.", "Supplier on-time is 91.8%, down 1.9 points."] },
      { kind: "actions", actions: ["Show POs awaiting approval"] },
    ];
  }
  if (p.includes("logistic") || p.includes("ship") || p.includes("transport")) {
    return [
      { kind: "text", text: "26 lanes are in transit and 4 are at risk:" },
      { kind: "bullets", items: ["Shanghai → Los Angeles: port congestion, +3 days.", "Shenzhen → Rotterdam: Cape reroute, +9 days.", "Chicago → Toronto: customs hold, +2 days.", "Singapore → Sydney: cyclone warning, +2 days."] },
    ];
  }
  if (p.includes("supplier")) {
    return [
      { kind: "text", text: "Supplier Risk Agent flags 3 suppliers this week. Kessler Components has the largest lead-time drift (+10 days) and affects 18 backorders." },
      { kind: "actions", actions: ["Recommend actions"] },
    ];
  }
  if (p.includes("order")) {
    return [
      { kind: "text", text: "Orders this month: 12,480 total, 12,018 fulfilled, 320 open and 86 backordered. Fill rate is 96.2%." },
      { kind: "actions", actions: ["Show me high risk orders and reason."] },
    ];
  }
  if (p.includes("high risk") || p.includes("risk")) {
    return initialChat[2].blocks;
  }
  return [
    { kind: "text", text: "I can look into orders, inventory, procurement, logistics or suppliers. Try one of the chips below, or ask about a specific order number." },
  ];
}

/* ---------------- Navigation ---------------- */

export const navGroups: NavGroup[] = [
  {
    label: "Core",
    items: [
      { id: "home", label: "Home" },
      { id: "agents", label: "Agents" },
      { id: "ask", label: "Ask AI" },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "demand", label: "Demand Planning" },
      { id: "orders", label: "Order Management", badge: "NEW" },
      { id: "inventory", label: "Inventory" },
      { id: "procurement", label: "Procurement" },
      { id: "suppliers", label: "Suppliers" },
      { id: "manufacturing", label: "Manufacturing" },
      { id: "transportation", label: "Transportation" },
      { id: "warehousing", label: "Warehousing" },
      { id: "customers", label: "Customers" },
    ],
  },
  {
    label: "Governance",
    items: [
      { id: "exceptions", label: "Exceptions" },
      { id: "analytics", label: "Analytics" },
      { id: "reports", label: "Reports" },
      { id: "settings", label: "Settings" },
    ],
  },
];
