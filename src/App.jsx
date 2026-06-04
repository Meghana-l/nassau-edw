import { useState, useMemo, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

const MOCK_POLICIES = Array.from({ length: 120 }, (_, i) => {
  const productTypes = ["Fixed Annuity", "Fixed Indexed Annuity", "Life - Term", "Life - UL", "Medicare Supplement", "Accident & Health"];
  const statuses = ["Active", "Active", "Active", "Active", "Lapsed", "Surrendered", "Pending"];
  const states = ["CT", "NY", "FL", "TX", "CA", "OH", "PA", "MA", "NJ", "GA"];
  const platforms = ["AnnuityPro", "LifeCore", "MedSup360", "PolicyBridge", "AHConnect"];

  const product = productTypes[i % productTypes.length];
  const issueYear = 2018 + (i % 7);
  const age = 45 + (i % 35);
  const premium = product.includes("Annuity") ? 50000 + (i * 3127 % 200000) : 1200 + (i * 487 % 8000);
  const status = statuses[i % statuses.length];
  const hasMissingDob = i % 17 === 0;
  const hasBadPremium = i % 23 === 0;
  const hasMissingState = i % 31 === 0;

  return {
    policy_id: `NFG-${String(i + 1001).padStart(6, "0")}`,
    insured_name: ["James Harmon", "Patricia Cole", "Marcus Webb", "Sandra Liu", "Robert Osei", "Diane Carter", "Thomas Reyes", "Angela Moss", "William Park", "Karen Singh"][i % 10],
    dob: hasMissingDob ? null : `${1990 - age}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    state: hasMissingState ? null : states[i % states.length],
    product_type: product,
    issue_date: `${issueYear}-${String((i % 12) + 1).padStart(2, "0")}-01`,
    annual_premium: hasBadPremium ? -999 : premium,
    status,
    platform: platforms[i % platforms.length],
    coverage_amount: product.includes("Annuity") ? premium * 1.05 : premium * 150,
    beneficiary_on_file: i % 9 !== 0,
    risk_class: ["Standard", "Preferred", "Preferred Plus", "Substandard"][i % 4],
  };
});

const PREMIUM_TREND = [
  { month: "Jan", inforce: 18.2, new_business: 2.1, lapsed: 0.4 },
  { month: "Feb", inforce: 19.8, new_business: 2.4, lapsed: 0.5 },
  { month: "Mar", inforce: 21.1, new_business: 2.8, lapsed: 0.3 },
  { month: "Apr", inforce: 22.4, new_business: 1.9, lapsed: 0.6 },
  { month: "May", inforce: 23.0, new_business: 2.2, lapsed: 0.4 },
  { month: "Jun", inforce: 24.4, new_business: 3.1, lapsed: 0.5 },
];

const DATA_DICTIONARY = [
  { field: "policy_id", table: "POLICY_MASTER", type: "VARCHAR(12)", nullable: false, source: "AnnuityPro / LifeCore / MedSup360", business_rule: "Unique identifier. Format: NFG-XXXXXX. Generated at policy issuance. Must not be reused on surrender.", owner: "Actuarial Data Mgmt", last_updated: "2026-03-15", pii: false },
  { field: "insured_name", table: "POLICY_MASTER", type: "VARCHAR(100)", nullable: false, source: "All platforms", business_rule: "Full legal name of primary insured. Must match state-filed application. Stored as LAST, FIRST MI.", owner: "Policy Admin", last_updated: "2026-01-10", pii: true },
  { field: "dob", table: "POLICY_MASTER", type: "DATE", nullable: false, source: "All platforms", business_rule: "Date of birth of primary insured. Required for age-based premium calculation. Must be >= 18 and <= 85 at issue.", owner: "Actuarial Data Mgmt", last_updated: "2026-03-15", pii: true },
  { field: "state", table: "POLICY_MASTER", type: "CHAR(2)", nullable: false, source: "All platforms", business_rule: "State of policy situs. Must be a valid US state abbreviation. Drives regulatory compliance and reserve calculations.", owner: "Compliance", last_updated: "2026-02-01", pii: false },
  { field: "product_type", table: "POLICY_MASTER", type: "VARCHAR(50)", nullable: false, source: "All platforms", business_rule: "Allowed values: Fixed Annuity, Fixed Indexed Annuity, Life - Term, Life - UL, Medicare Supplement, Accident & Health. Controls downstream EDW routing.", owner: "Product Dev", last_updated: "2026-04-01", pii: false },
  { field: "issue_date", table: "POLICY_MASTER", type: "DATE", nullable: false, source: "All platforms", business_rule: "Date policy contract was issued. Cannot be in the future. Used as anchor for reserve calculation start.", owner: "Actuarial Data Mgmt", last_updated: "2026-03-15", pii: false },
  { field: "annual_premium", table: "POLICY_MASTER", type: "DECIMAL(18,2)", nullable: false, source: "All platforms", business_rule: "Annual premium in USD. Must be > 0. For annuities: minimum $5,000. For life: minimum $500. Negative values indicate data error.", owner: "Finance", last_updated: "2026-05-01", pii: false },
  { field: "status", table: "POLICY_MASTER", type: "VARCHAR(20)", nullable: false, source: "All platforms", business_rule: "Allowed values: Active, Lapsed, Surrendered, Pending, Deceased. Lapsed = >90 days non-payment. Drives inclusion in reserve and lapse-rate calculations.", owner: "Policy Admin", last_updated: "2026-01-10", pii: false },
  { field: "coverage_amount", table: "POLICY_MASTER", type: "DECIMAL(18,2)", nullable: true, business_rule: "Face amount for life products. Account value for annuities. Not applicable for A&H. Must be > annual_premium.", source: "LifeCore / AnnuityPro", owner: "Actuarial Data Mgmt", last_updated: "2026-03-15", pii: false },
  { field: "beneficiary_on_file", table: "POLICY_MASTER", type: "BOOLEAN", nullable: false, source: "All platforms", business_rule: "TRUE if at least one beneficiary designation is on file. Required for life products. Warning threshold < 95% for active life policies.", owner: "Policy Admin", last_updated: "2026-02-20", pii: false },
  { field: "platform", table: "POLICY_MASTER", type: "VARCHAR(30)", nullable: false, source: "System", business_rule: "Source platform that originated this record. Allowed: AnnuityPro, LifeCore, MedSup360, PolicyBridge, AHConnect. Used for data lineage tracking.", owner: "Actuarial Data Mgmt", last_updated: "2026-04-15", pii: false },
  { field: "risk_class", table: "POLICY_MASTER", type: "VARCHAR(20)", nullable: true, source: "LifeCore", business_rule: "Underwriting risk classification. Allowed: Standard, Preferred, Preferred Plus, Substandard. Life products only.", owner: "Underwriting", last_updated: "2026-01-10", pii: false },
];

// ─── QUALITY ENGINE ───────────────────────────────────────────────────────────

function runQualityChecks(policies) {
  const issues = [];
  policies.forEach((p) => {
    if (!p.dob) issues.push({ policy_id: p.policy_id, field: "dob", rule: "Null check", severity: "Critical", message: "Date of birth is missing. Required for age-based premium calculation." });
    if (!p.state) issues.push({ policy_id: p.policy_id, field: "state", rule: "Null check", severity: "Critical", message: "State of situs is missing. Required for reserve and compliance routing." });
    if (p.annual_premium <= 0) issues.push({ policy_id: p.policy_id, field: "annual_premium", rule: "Range check", severity: "Critical", message: `Annual premium ${p.annual_premium} is invalid. Must be > 0.` });
    if (!p.beneficiary_on_file && (p.product_type.includes("Life"))) issues.push({ policy_id: p.policy_id, field: "beneficiary_on_file", rule: "Business rule", severity: "Warning", message: "No beneficiary on file for life product. Required per policy admin standards." });
    if (p.coverage_amount && p.annual_premium > 0 && p.coverage_amount <= p.annual_premium) issues.push({ policy_id: p.policy_id, field: "coverage_amount", rule: "Referential check", severity: "Warning", message: "Coverage amount must exceed annual premium." });
  });
  const passed = policies.length * 6 - issues.length;
  const total = policies.length * 6;
  const score = Math.round((passed / total) * 100);
  return { issues, score, passed, total };
}

// ─── COLORS ───────────────────────────────────────────────────────────────────

const CHART_COLORS = ["#1A5FA8", "#0F8A5F", "#C8701A", "#A8291A", "#6B48B8", "#1A8AA8"];

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [uploadedPolicies, setUploadedPolicies] = useState(MOCK_POLICIES);
  const [dqFilter, setDqFilter] = useState("All");
  const [dictSearch, setDictSearch] = useState("");
  const [ingestionStep, setIngestionStep] = useState(0);
  const [ingestionPlatform, setIngestionPlatform] = useState("AnnuityPro");
  const [ingestionRunning, setIngestionRunning] = useState(false);
  const [ingestionDone, setIngestionDone] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);

  const qcResult = useMemo(() => runQualityChecks(uploadedPolicies), [uploadedPolicies]);

  const productBreakdown = useMemo(() => {
    const counts = {};
    uploadedPolicies.forEach((p) => { counts[p.product_type] = (counts[p.product_type] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [uploadedPolicies]);

  const statusBreakdown = useMemo(() => {
    const counts = {};
    uploadedPolicies.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [uploadedPolicies]);

  const platformBreakdown = useMemo(() => {
    const counts = {};
    uploadedPolicies.forEach((p) => { counts[p.platform] = (counts[p.platform] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [uploadedPolicies]);

  const totalPremium = useMemo(() =>
    uploadedPolicies.filter(p => p.annual_premium > 0).reduce((s, p) => s + p.annual_premium, 0),
    [uploadedPolicies]);

  const lapseRate = useMemo(() => {
    const lapsed = uploadedPolicies.filter(p => p.status === "Lapsed").length;
    return ((lapsed / uploadedPolicies.length) * 100).toFixed(1);
  }, [uploadedPolicies]);

  const activePolicies = useMemo(() => uploadedPolicies.filter(p => p.status === "Active").length, [uploadedPolicies]);

  const filteredIssues = useMemo(() =>
    dqFilter === "All" ? qcResult.issues : qcResult.issues.filter(i => i.severity === dqFilter),
    [qcResult.issues, dqFilter]);

  const filteredDict = useMemo(() =>
    DATA_DICTIONARY.filter(d =>
      d.field.toLowerCase().includes(dictSearch.toLowerCase()) ||
      d.business_rule.toLowerCase().includes(dictSearch.toLowerCase()) ||
      d.owner.toLowerCase().includes(dictSearch.toLowerCase())
    ), [dictSearch]);

  const runIngestion = useCallback(() => {
    setIngestionRunning(true);
    setIngestionStep(0);
    setIngestionDone(false);
    const steps = [1, 2, 3, 4];
    steps.forEach((s, idx) => {
      setTimeout(() => {
        setIngestionStep(s);
        if (s === 4) { setIngestionRunning(false); setIngestionDone(true); }
      }, (idx + 1) * 900);
    });
  }, []);

  const scoreColor = qcResult.score >= 90 ? "#0F8A5F" : qcResult.score >= 75 ? "#C8701A" : "#A8291A";

  const tabs = [
    { id: "dashboard", label: "KPI Dashboard", icon: "ti-chart-bar" },
    { id: "quality", label: "Data Quality", icon: "ti-shield-check" },
    { id: "ingestion", label: "Data Ingestion", icon: "ti-database-import" },
    { id: "dictionary", label: "Data Dictionary", icon: "ti-book" },
  ];

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif", background: "#F4F6F9", minHeight: "100vh", color: "#1A2333" }}>

      {/* HEADER */}
      <div style={{ background: "#0C2340", padding: "0 2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 8, height: 28, background: "#C8922A", borderRadius: 2 }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", letterSpacing: "0.01em" }}>Nassau Financial Group</div>
              <div style={{ fontSize: 11, color: "#7A9BBE", letterSpacing: "0.08em", textTransform: "uppercase" }}>Enterprise Data Warehouse — Actuarial Data Management</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
            <span style={{ fontSize: 11, color: "#7A9BBE" }}>EDW Live · {uploadedPolicies.length} policies loaded</span>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: 2, paddingTop: 4 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              background: activeTab === t.id ? "#fff" : "transparent",
              color: activeTab === t.id ? "#0C2340" : "#7A9BBE",
              border: "none", cursor: "pointer",
              padding: "8px 16px", fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400,
              borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.15s",
            }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 14 }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ padding: "1.5rem 2rem 3rem" }}>

        {/* ── DASHBOARD ── */}
        {activeTab === "dashboard" && (
          <div>
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ fontSize: 11, color: "#6B7A8D", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Actuarial KPI Overview · Q2 2026</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#0C2340" }}>Policy Portfolio Summary</div>
            </div>

            {/* STAT CARDS */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Total policies", value: uploadedPolicies.length.toLocaleString(), sub: "across all lines", icon: "ti-file-text", color: "#1A5FA8" },
                { label: "Active in-force", value: activePolicies.toLocaleString(), sub: `${Math.round(activePolicies / uploadedPolicies.length * 100)}% of book`, icon: "ti-check", color: "#0F8A5F" },
                { label: "Total annual premium", value: `$${(totalPremium / 1e6).toFixed(1)}M`, sub: "in-force book", icon: "ti-currency-dollar", color: "#0C2340" },
                { label: "Lapse rate", value: `${lapseRate}%`, sub: "trailing 12 months", icon: "ti-trending-down", color: "#C8701A" },
                { label: "Data quality score", value: `${qcResult.score}%`, sub: `${qcResult.issues.length} issues flagged`, icon: "ti-shield-check", color: scoreColor },
                { label: "Source platforms", value: "5", sub: "active integrations", icon: "ti-server", color: "#6B48B8" },
              ].map((s, i) => (
                <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "1rem 1.1rem", border: "1px solid #E2E8F0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: "#6B7A8D", fontWeight: 500 }}>{s.label}</div>
                    <i className={`ti ${s.icon}`} style={{ fontSize: 16, color: s.color }} />
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color, marginBottom: 2 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "#9AA5B4" }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* CHARTS ROW 1 */}
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: "#fff", borderRadius: 10, padding: "1.25rem", border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0C2340", marginBottom: 4 }}>Premium trend — in-force vs new business</div>
                <div style={{ fontSize: 11, color: "#9AA5B4", marginBottom: 16 }}>Monthly premium ($M) · YTD 2026</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={PREMIUM_TREND}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F4F8" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9AA5B4" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#9AA5B4" }} unit="M" />
                    <Tooltip formatter={(v) => [`$${v}M`]} contentStyle={{ fontSize: 12, border: "1px solid #E2E8F0", borderRadius: 6 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="inforce" stroke="#1A5FA8" strokeWidth={2} dot={false} name="In-force" />
                    <Line type="monotone" dataKey="new_business" stroke="#0F8A5F" strokeWidth={2} dot={false} name="New business" />
                    <Line type="monotone" dataKey="lapsed" stroke="#C8701A" strokeWidth={2} dot={false} name="Lapsed" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: "#fff", borderRadius: 10, padding: "1.25rem", border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0C2340", marginBottom: 4 }}>Product mix</div>
                <div style={{ fontSize: 11, color: "#9AA5B4", marginBottom: 8 }}>By policy count</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={productBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72} innerRadius={36}>
                      {productBreakdown.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, border: "1px solid #E2E8F0", borderRadius: 6 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* CHARTS ROW 2 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "#fff", borderRadius: 10, padding: "1.25rem", border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0C2340", marginBottom: 4 }}>Policy status distribution</div>
                <div style={{ fontSize: 11, color: "#9AA5B4", marginBottom: 16 }}>All products combined</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={statusBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F4F8" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#9AA5B4" }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#6B7A8D" }} width={80} />
                    <Tooltip contentStyle={{ fontSize: 11, border: "1px solid #E2E8F0", borderRadius: 6 }} />
                    <Bar dataKey="value" name="Policies" radius={[0, 4, 4, 0]}>
                      {statusBreakdown.map((entry, idx) => (
                        <Cell key={idx} fill={entry.name === "Active" ? "#1A5FA8" : entry.name === "Lapsed" ? "#C8701A" : entry.name === "Surrendered" ? "#A8291A" : "#9AA5B4"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: "#fff", borderRadius: 10, padding: "1.25rem", border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0C2340", marginBottom: 4 }}>Platform ingestion volume</div>
                <div style={{ fontSize: 11, color: "#9AA5B4", marginBottom: 16 }}>Policies by source system</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={platformBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F4F8" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9AA5B4" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#9AA5B4" }} />
                    <Tooltip contentStyle={{ fontSize: 11, border: "1px solid #E2E8F0", borderRadius: 6 }} />
                    <Bar dataKey="value" fill="#1A5FA8" name="Policies" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* POLICY TABLE PREVIEW */}
            <div style={{ background: "#fff", borderRadius: 10, padding: "1.25rem", border: "1px solid #E2E8F0", marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0C2340" }}>Policy master — recent records</div>
                  <div style={{ fontSize: 11, color: "#9AA5B4" }}>Click a row to inspect</div>
                </div>
                <div style={{ fontSize: 11, color: "#6B7A8D", background: "#F4F6F9", padding: "4px 10px", borderRadius: 6 }}>Showing 10 of {uploadedPolicies.length}</div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#F8FAFC" }}>
                      {["Policy ID", "Insured", "Product", "Status", "Platform", "Annual Premium", "State"].map(h => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#6B7A8D", fontWeight: 600, fontSize: 11, borderBottom: "1px solid #E2E8F0", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uploadedPolicies.slice(0, 10).map((p, i) => {
                      const hasIssue = qcResult.issues.some(iss => iss.policy_id === p.policy_id);
                      return (
                        <tr key={i} onClick={() => setSelectedPolicy(p)} style={{ cursor: "pointer", background: selectedPolicy?.policy_id === p.policy_id ? "#EEF4FF" : "transparent", borderBottom: "1px solid #F0F4F8" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
                          onMouseLeave={e => e.currentTarget.style.background = selectedPolicy?.policy_id === p.policy_id ? "#EEF4FF" : "transparent"}>
                          <td style={{ padding: "9px 10px", fontFamily: "monospace", color: "#1A5FA8", fontWeight: 600 }}>{p.policy_id}</td>
                          <td style={{ padding: "9px 10px", color: "#1A2333" }}>{p.insured_name}</td>
                          <td style={{ padding: "9px 10px", color: "#4A5568" }}>{p.product_type}</td>
                          <td style={{ padding: "9px 10px" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: p.status === "Active" ? "#D1FAE5" : p.status === "Lapsed" ? "#FEF3C7" : "#FEE2E2", color: p.status === "Active" ? "#065F46" : p.status === "Lapsed" ? "#92400E" : "#991B1B" }}>{p.status}</span>
                          </td>
                          <td style={{ padding: "9px 10px", color: "#6B7A8D" }}>{p.platform}</td>
                          <td style={{ padding: "9px 10px", fontFamily: "monospace", color: p.annual_premium < 0 ? "#A8291A" : "#1A2333" }}>
                            {p.annual_premium < 0 ? <span style={{ color: "#A8291A", fontWeight: 700 }}>ERR: {p.annual_premium}</span> : `$${p.annual_premium.toLocaleString()}`}
                          </td>
                          <td style={{ padding: "9px 10px", color: p.state ? "#4A5568" : "#A8291A" }}>{p.state ?? <span style={{ fontWeight: 700 }}>NULL</span>}</td>
                          {hasIssue && <td style={{ padding: "9px 10px" }}><i className="ti ti-alert-triangle" style={{ color: "#C8701A", fontSize: 14 }} /></td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* POLICY DETAIL PANEL */}
            {selectedPolicy && (
              <div style={{ background: "#fff", borderRadius: 10, padding: "1.25rem", border: "1px solid #1A5FA8", marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0C2340" }}>Policy detail — {selectedPolicy.policy_id}</div>
                  <button onClick={() => setSelectedPolicy(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "#9AA5B4", fontSize: 18 }}>
                    <i className="ti ti-x" />
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                  {Object.entries(selectedPolicy).map(([k, v]) => (
                    <div key={k} style={{ background: "#F8FAFC", borderRadius: 6, padding: "8px 10px" }}>
                      <div style={{ fontSize: 10, color: "#9AA5B4", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{k.replace(/_/g, " ")}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: v === null ? "#A8291A" : v === false ? "#C8701A" : "#1A2333", fontFamily: typeof v === "number" || (typeof v === "string" && v.match(/^\d/)) ? "monospace" : "inherit" }}>
                        {v === null ? "NULL" : v === true ? "Yes" : v === false ? "No" : typeof v === "number" && k.includes("premium") ? `$${v.toLocaleString()}` : String(v)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DATA QUALITY ── */}
        {activeTab === "quality" && (
          <div>
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ fontSize: 11, color: "#6B7A8D", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Data Quality Engine · POLICY_MASTER table</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#0C2340" }}>Automated Quality Control Report</div>
            </div>

            {/* SCORE BANNER */}
            <div style={{ background: "#0C2340", borderRadius: 12, padding: "1.5rem 2rem", marginBottom: 20, display: "flex", alignItems: "center", gap: 32 }}>
              <div>
                <div style={{ fontSize: 52, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{qcResult.score}<span style={{ fontSize: 24 }}>%</span></div>
                <div style={{ fontSize: 13, color: "#7A9BBE", marginTop: 4 }}>Overall data quality score</div>
              </div>
              <div style={{ width: 1, height: 60, background: "#1A3A5C" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 32px" }}>
                {[
                  ["Records checked", uploadedPolicies.length],
                  ["Rules evaluated", `${qcResult.total.toLocaleString()} checks`],
                  ["Checks passed", qcResult.passed.toLocaleString()],
                  ["Issues flagged", qcResult.issues.length],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize: 11, color: "#7A9BBE" }}>{l}</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginLeft: "auto" }}>
                <div style={{ fontSize: 11, color: "#7A9BBE", marginBottom: 8 }}>Rule categories run</div>
                {["Null check", "Range check", "Referential check", "Business rule"].map(r => {
                  const n = qcResult.issues.filter(i => i.rule === r).length;
                  return (
                    <div key={r} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 11, color: "#9AA5B4", width: 120 }}>{r}</div>
                      <div style={{ width: 80, height: 4, background: "#1A3A5C", borderRadius: 2 }}>
                        <div style={{ width: `${Math.min(100, n * 8)}%`, height: "100%", background: n > 0 ? "#C8701A" : "#0F8A5F", borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 11, color: n > 0 ? "#C8701A" : "#0F8A5F", fontFamily: "monospace" }}>{n}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* FILTER */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {["All", "Critical", "Warning"].map(f => (
                <button key={f} onClick={() => setDqFilter(f)} style={{
                  padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: "1px solid",
                  background: dqFilter === f ? (f === "Critical" ? "#A8291A" : f === "Warning" ? "#C8701A" : "#0C2340") : "#fff",
                  color: dqFilter === f ? "#fff" : (f === "Critical" ? "#A8291A" : f === "Warning" ? "#C8701A" : "#6B7A8D"),
                  borderColor: f === "Critical" ? "#A8291A" : f === "Warning" ? "#C8701A" : "#CBD5E0",
                }}>
                  {f} {f !== "All" ? `(${qcResult.issues.filter(i => i.severity === f).length})` : `(${qcResult.issues.length})`}
                </button>
              ))}
              <div style={{ marginLeft: "auto", fontSize: 11, color: "#9AA5B4", alignSelf: "center" }}>
                Showing {filteredIssues.length} of {qcResult.issues.length} issues
              </div>
            </div>

            {/* ISSUES TABLE */}
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F8FAFC" }}>
                    {["Severity", "Policy ID", "Field", "Rule type", "Issue description"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#6B7A8D", fontWeight: 600, fontSize: 11, borderBottom: "1px solid #E2E8F0" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.map((iss, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #F0F4F8" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: iss.severity === "Critical" ? "#FEE2E2" : "#FEF3C7", color: iss.severity === "Critical" ? "#991B1B" : "#92400E" }}>
                          {iss.severity === "Critical" ? <i className="ti ti-alert-circle" style={{ marginRight: 4, fontSize: 11 }} /> : <i className="ti ti-alert-triangle" style={{ marginRight: 4, fontSize: 11 }} />}
                          {iss.severity}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#1A5FA8", fontWeight: 600 }}>{iss.policy_id}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#4A5568" }}>{iss.field}</td>
                      <td style={{ padding: "10px 12px", color: "#6B7A8D" }}>{iss.rule}</td>
                      <td style={{ padding: "10px 12px", color: "#1A2333" }}>{iss.message}</td>
                    </tr>
                  ))}
                  {filteredIssues.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "#9AA5B4" }}>No issues found for this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* FIELD SUMMARY */}
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E2E8F0", padding: "1.25rem", marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0C2340", marginBottom: 12 }}>Issue count by field</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                {["dob", "state", "annual_premium", "beneficiary_on_file", "coverage_amount"].map(field => {
                  const count = qcResult.issues.filter(i => i.field === field).length;
                  const pct = Math.round((count / uploadedPolicies.length) * 100);
                  return (
                    <div key={field} style={{ background: "#F8FAFC", borderRadius: 8, padding: "0.75rem" }}>
                      <div style={{ fontFamily: "monospace", fontSize: 12, color: "#4A5568", marginBottom: 6 }}>{field}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: count > 0 ? "#C8701A" : "#0F8A5F" }}>{count}</div>
                      <div style={{ fontSize: 10, color: "#9AA5B4" }}>{pct}% of records</div>
                      <div style={{ height: 3, background: "#E2E8F0", borderRadius: 2, marginTop: 6 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: count > 0 ? "#C8701A" : "#0F8A5F", borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── INGESTION ── */}
        {activeTab === "ingestion" && (
          <div>
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ fontSize: 11, color: "#6B7A8D", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Data Ingestion · Platform Onboarding</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#0C2340" }}>New Platform Intake Pipeline</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
              {/* LEFT: CONFIG */}
              <div>
                <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E2E8F0", padding: "1.25rem", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0C2340", marginBottom: 14 }}>Pipeline configuration</div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#4A5568", display: "block", marginBottom: 5 }}>Source platform</label>
                    <select value={ingestionPlatform} onChange={e => setIngestionPlatform(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid #CBD5E0", borderRadius: 6, fontSize: 13, color: "#1A2333" }}>
                      {["AnnuityPro", "LifeCore", "MedSup360", "PolicyBridge", "AHConnect"].map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#4A5568", display: "block", marginBottom: 5 }}>Target EDW table</label>
                    <input value="POLICY_MASTER" readOnly style={{ width: "100%", padding: "8px 10px", border: "1px solid #CBD5E0", borderRadius: 6, fontSize: 13, color: "#6B7A8D", background: "#F8FAFC" }} />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#4A5568", display: "block", marginBottom: 5 }}>AWS S3 source path</label>
                    <input value={`s3://nassau-edw-raw/${ingestionPlatform.toLowerCase()}/policy_feed/`} readOnly style={{ width: "100%", padding: "8px 10px", border: "1px solid #CBD5E0", borderRadius: 6, fontSize: 12, fontFamily: "monospace", color: "#6B7A8D", background: "#F8FAFC" }} />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#4A5568", display: "block", marginBottom: 8 }}>Field mapping</label>
                    <div style={{ borderRadius: 6, border: "1px solid #E2E8F0", overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead><tr style={{ background: "#F8FAFC" }}>
                          <th style={{ padding: "6px 10px", textAlign: "left", color: "#6B7A8D", borderBottom: "1px solid #E2E8F0" }}>Source field</th>
                          <th style={{ padding: "6px 10px", textAlign: "center", color: "#6B7A8D", borderBottom: "1px solid #E2E8F0" }}></th>
                          <th style={{ padding: "6px 10px", textAlign: "left", color: "#6B7A8D", borderBottom: "1px solid #E2E8F0" }}>EDW field</th>
                          <th style={{ padding: "6px 10px", textAlign: "left", color: "#6B7A8D", borderBottom: "1px solid #E2E8F0" }}>Status</th>
                        </tr></thead>
                        <tbody>
                          {[
                            ["pol_number", "policy_id", "mapped"],
                            ["client_name", "insured_name", "mapped"],
                            ["birth_dt", "dob", "mapped"],
                            ["state_cd", "state", "mapped"],
                            ["prod_desc", "product_type", "transform"],
                            ["prem_amt", "annual_premium", "mapped"],
                            ["pol_stat", "status", "transform"],
                            ["src_system", "platform", "derived"],
                          ].map(([src, edw, status]) => (
                            <tr key={src} style={{ borderBottom: "1px solid #F0F4F8" }}>
                              <td style={{ padding: "6px 10px", fontFamily: "monospace", color: "#4A5568" }}>{src}</td>
                              <td style={{ padding: "6px 10px", textAlign: "center", color: "#9AA5B4" }}><i className="ti ti-arrow-right" style={{ fontSize: 12 }} /></td>
                              <td style={{ padding: "6px 10px", fontFamily: "monospace", color: "#1A5FA8" }}>{edw}</td>
                              <td style={{ padding: "6px 10px" }}>
                                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, fontWeight: 600, background: status === "mapped" ? "#D1FAE5" : status === "transform" ? "#FEF3C7" : "#EDE9FE", color: status === "mapped" ? "#065F46" : status === "transform" ? "#92400E" : "#4C1D95" }}>
                                  {status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <button onClick={runIngestion} disabled={ingestionRunning} style={{
                    width: "100%", padding: "10px", borderRadius: 8, border: "none", cursor: ingestionRunning ? "not-allowed" : "pointer",
                    background: ingestionRunning ? "#9AA5B4" : "#0C2340", color: "#fff", fontSize: 13, fontWeight: 600,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                    <i className={`ti ${ingestionRunning ? "ti-loader" : "ti-player-play"}`} style={{ fontSize: 15 }} />
                    {ingestionRunning ? "Running pipeline..." : "Run ingestion pipeline"}
                  </button>
                </div>
              </div>

              {/* RIGHT: PIPELINE STATUS */}
              <div>
                <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E2E8F0", padding: "1.25rem", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0C2340", marginBottom: 14 }}>Pipeline execution log</div>
                  {[
                    { step: 1, icon: "ti-cloud-download", label: "Extract from S3 source bucket", detail: `Reading from s3://nassau-edw-raw/${ingestionPlatform.toLowerCase()}/policy_feed/` },
                    { step: 2, icon: "ti-transform", label: "Apply field mapping & transformations", detail: "Normalizing product codes, status flags, and date formats" },
                    { step: 3, icon: "ti-shield-check", label: "Run pre-load data quality checks", detail: "Null checks, range validation, referential integrity" },
                    { step: 4, icon: "ti-database-import", label: "Load to EDW — POLICY_MASTER", detail: "Committing validated records to production table" },
                  ].map(s => {
                    const done = ingestionStep >= s.step;
                    const active = ingestionStep === s.step - 1 && ingestionRunning;
                    return (
                      <div key={s.step} style={{ display: "flex", gap: 12, marginBottom: 12, opacity: (!ingestionRunning && !ingestionDone && ingestionStep === 0) ? 0.4 : 1 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: done ? "#0F8A5F" : active ? "#1A5FA8" : "#F0F4F8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <i className={`ti ${done ? "ti-check" : s.icon}`} style={{ fontSize: 14, color: done ? "#fff" : active ? "#fff" : "#9AA5B4" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: done ? "#0F8A5F" : active ? "#1A5FA8" : "#4A5568" }}>{s.label}</div>
                          <div style={{ fontSize: 11, color: "#9AA5B4" }}>{s.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                  {ingestionDone && (
                    <div style={{ background: "#D1FAE5", borderRadius: 8, padding: "0.75rem 1rem", marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
                      <i className="ti ti-check" style={{ color: "#065F46", fontSize: 18 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#065F46" }}>Pipeline completed successfully</div>
                        <div style={{ fontSize: 11, color: "#047857" }}>{Math.floor(Math.random() * 40) + 60} records ingested · 0 rejected · Audit log written to S3</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* PLATFORM STATUS */}
                <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E2E8F0", padding: "1.25rem" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0C2340", marginBottom: 12 }}>Active platform integrations</div>
                  {[
                    { name: "AnnuityPro", product: "Fixed & FIA", records: 24, status: "healthy", last: "2h ago" },
                    { name: "LifeCore", product: "Life - Term & UL", records: 24, status: "healthy", last: "2h ago" },
                    { name: "MedSup360", product: "Medicare Supplement", records: 24, status: "warning", last: "6h ago" },
                    { name: "PolicyBridge", product: "Multi-line", records: 24, status: "healthy", last: "2h ago" },
                    { name: "AHConnect", product: "Accident & Health", records: 24, status: "healthy", last: "2h ago" },
                  ].map(p => (
                    <div key={p.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F0F4F8" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.status === "healthy" ? "#22C55E" : "#EAB308" }} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#1A2333" }}>{p.name}</div>
                          <div style={{ fontSize: 10, color: "#9AA5B4" }}>{p.product}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontFamily: "monospace", color: "#4A5568" }}>{p.records} records</div>
                        <div style={{ fontSize: 10, color: "#9AA5B4" }}>Last: {p.last}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── DATA DICTIONARY ── */}
        {activeTab === "dictionary" && (
          <div>
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ fontSize: 11, color: "#6B7A8D", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Metadata Repository · EDW Data Dictionary</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#0C2340" }}>POLICY_MASTER — Field Definitions</div>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9AA5B4", fontSize: 15 }} />
                <input
                  placeholder="Search fields, rules, owners..."
                  value={dictSearch}
                  onChange={e => setDictSearch(e.target.value)}
                  style={{ width: "100%", padding: "9px 10px 9px 34px", border: "1px solid #CBD5E0", borderRadius: 8, fontSize: 13, color: "#1A2333", background: "#fff" }}
                />
              </div>
              <div style={{ fontSize: 12, color: "#6B7A8D", whiteSpace: "nowrap" }}>{filteredDict.length} of {DATA_DICTIONARY.length} fields</div>
            </div>

            {filteredDict.map((d, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 10, border: "1px solid #E2E8F0", padding: "1rem 1.25rem", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#1A5FA8" }}>{d.field}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "#9AA5B4", background: "#F8FAFC", padding: "2px 6px", borderRadius: 4, border: "1px solid #E2E8F0" }}>{d.type}</span>
                    {d.pii && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#FEE2E2", color: "#991B1B" }}>PII</span>}
                    {!d.nullable && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#FEF3C7", color: "#92400E" }}>NOT NULL</span>}
                  </div>
                  <span style={{ fontSize: 11, color: "#9AA5B4" }}>Updated {d.last_updated}</span>
                </div>
                <div style={{ fontSize: 13, color: "#1A2333", marginBottom: 10, lineHeight: 1.6 }}>
                  <i className="ti ti-lock" style={{ fontSize: 12, color: "#9AA5B4", marginRight: 4 }} />
                  <strong>Business rule:</strong> {d.business_rule}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                  <div style={{ background: "#F8FAFC", borderRadius: 6, padding: "6px 8px" }}>
                    <div style={{ fontSize: 10, color: "#9AA5B4", marginBottom: 2 }}>Source system</div>
                    <div style={{ fontSize: 12, color: "#4A5568" }}>{d.source}</div>
                  </div>
                  <div style={{ background: "#F8FAFC", borderRadius: 6, padding: "6px 8px" }}>
                    <div style={{ fontSize: 10, color: "#9AA5B4", marginBottom: 2 }}>Table</div>
                    <div style={{ fontSize: 12, fontFamily: "monospace", color: "#4A5568" }}>{d.table}</div>
                  </div>
                  <div style={{ background: "#F8FAFC", borderRadius: 6, padding: "6px 8px" }}>
                    <div style={{ fontSize: 10, color: "#9AA5B4", marginBottom: 2 }}>Data owner</div>
                    <div style={{ fontSize: 12, color: "#4A5568" }}>{d.owner}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
