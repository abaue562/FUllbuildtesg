"use client";
// SALES DASHBOARD — Real-time revenue charts, conversion funnel, rep leaderboard,
// commission summary. Uses Supabase Realtime to update on every new sale.
//
// Charts: recharts (MIT) — pure-React, no canvas, SSR-safe
// Date range picker: native HTML date inputs

import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, FunnelChart, Funnel, LabelList, Cell,
} from "recharts";
import { TrendingUp, DollarSign, Users, MapPin, Zap, Award } from "lucide-react";
import { createClient } from "@/lib/supabase-client";

// ── Types ──────────────────────────────────────────────────────────────────────

type KPI = {
  total_revenue: number;
  total_sales: number;
  total_knocks: number;
  total_contacts: number;
  contact_rate: number;  // contacts / knocks
  close_rate: number;    // sales / contacts
};

type DayRevenue = { date: string; revenue: number; sales: number };
type RepLeaderboard = {
  rep_id: string;
  full_name: string;
  avatar_url: string | null;
  sales: number;
  revenue: number;
  commission: number;
  knocks: number;
  close_rate: number;
};
type FunnelRow = { stage: string; count: number; fill: string };

// ── Main ───────────────────────────────────────────────────────────────────────

export default function SalesDashboard() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const [kpi, setKpi] = useState<KPI | null>(null);
  const [daily, setDaily] = useState<DayRevenue[]>([]);
  const [leaderboard, setLeaderboard] = useState<RepLeaderboard[]>([]);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    load();
  }, [dateFrom, dateTo]);

  // Live: re-fetch when a new sale comes in
  useEffect(() => {
    const ch = supabase
      .channel("sales-dashboard")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "sales",
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    await Promise.all([loadKpi(), loadDaily(), loadLeaderboard(), loadFunnel()]);
    setLoading(false);
  }

  // ── KPI aggregation ──────────────────────────────────────────────────────

  async function loadKpi() {
    const { data: sales } = await supabase
      .from("sales")
      .select("amount")
      .gte("created_at", dateFrom)
      .lte("created_at", dateTo + "T23:59:59Z");

    const { count: knockCount } = await supabase
      .from("knocks")
      .select("*", { count: "exact", head: true })
      .gte("created_at", dateFrom)
      .lte("created_at", dateTo + "T23:59:59Z");

    const { count: contactCount } = await supabase
      .from("knocks")
      .select("*", { count: "exact", head: true })
      .eq("status", "answered")
      .gte("created_at", dateFrom)
      .lte("created_at", dateTo + "T23:59:59Z");

    const totalRevenue = (sales ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
    const totalSales = (sales ?? []).length;
    const knocks = knockCount ?? 0;
    const contacts = contactCount ?? 0;

    setKpi({
      total_revenue: totalRevenue,
      total_sales: totalSales,
      total_knocks: knocks,
      total_contacts: contacts,
      contact_rate: knocks ? contacts / knocks : 0,
      close_rate: contacts ? totalSales / contacts : 0,
    });
  }

  // ── Daily revenue chart ──────────────────────────────────────────────────

  async function loadDaily() {
    const { data } = await supabase
      .from("sales")
      .select("created_at, amount")
      .gte("created_at", dateFrom)
      .lte("created_at", dateTo + "T23:59:59Z")
      .order("created_at");

    const byDay: Record<string, DayRevenue> = {};
    (data ?? []).forEach((s: any) => {
      const day = s.created_at.split("T")[0];
      if (!byDay[day]) byDay[day] = { date: day, revenue: 0, sales: 0 };
      byDay[day].revenue += s.amount ?? 0;
      byDay[day].sales += 1;
    });
    setDaily(Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)));
  }

  // ── Rep leaderboard ──────────────────────────────────────────────────────

  async function loadLeaderboard() {
    const { data } = await supabase
      .from("rep_earnings")
      .select("*")
      .order("total_earned", { ascending: false })
      .limit(20);
    setLeaderboard(data ?? []);
  }

  // ── Conversion funnel ────────────────────────────────────────────────────

  async function loadFunnel() {
    const statuses = ["not_home", "answered", "interested", "callback", "sold"];
    const colors = ["#e2e8f0", "#a5b4fc", "#818cf8", "#fbbf24", "#10b981"];

    const rows = await Promise.all(
      statuses.map(async (status, i) => {
        const { count } = await supabase
          .from("knocks")
          .select("*", { count: "exact", head: true })
          .eq("status", status)
          .gte("created_at", dateFrom)
          .lte("created_at", dateTo + "T23:59:59Z");
        return { stage: statusLabel(status), count: count ?? 0, fill: colors[i] };
      })
    );
    setFunnel(rows);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const fmt$ = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* ── Page header + date range ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time revenue & performance</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <span className="text-gray-400 text-sm">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Revenue" value={kpi ? fmt$(kpi.total_revenue) : "—"} color="indigo" />
        <KpiCard icon={Award} label="Sales Closed" value={kpi ? String(kpi.total_sales) : "—"} color="emerald" />
        <KpiCard
          icon={MapPin}
          label="Contact Rate"
          value={kpi ? `${(kpi.contact_rate * 100).toFixed(1)}%` : "—"}
          color="blue"
        />
        <KpiCard
          icon={TrendingUp}
          label="Close Rate"
          value={kpi ? `${(kpi.close_rate * 100).toFixed(1)}%` : "—"}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Revenue chart ── */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Daily Revenue</h2>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Loading…</div>
          ) : daily.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">No sales in range</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={daily} margin={{ left: -20 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
                <Tooltip
                  formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue"]}
                  labelStyle={{ fontSize: 12 }}
                  itemStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]} fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Funnel ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-4">Conversion Funnel</h2>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Loading…</div>
          ) : (
            <div className="space-y-2">
              {funnel.map((row, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div
                    className="h-8 rounded-lg flex items-center justify-center text-xs font-semibold text-white px-3 shrink-0"
                    style={{
                      backgroundColor: row.fill,
                      width: `${Math.max(30, (row.count / (funnel[0]?.count || 1)) * 100)}%`,
                      color: i === 0 ? "#6b7280" : "#fff",
                    }}
                  >
                    {row.count.toLocaleString()}
                  </div>
                  <span className="text-xs text-gray-500 truncate">{row.stage}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Leaderboard ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">Rep Leaderboard</h2>
          <span className="text-xs text-gray-400">by earnings</span>
        </div>
        {loading ? (
          <div className="py-12 text-center text-gray-300 text-sm">Loading…</div>
        ) : leaderboard.length === 0 ? (
          <div className="py-12 text-center text-gray-300 text-sm">No data yet</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {leaderboard.map((rep, idx) => (
              <div key={rep.rep_id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50 transition-colors">
                {/* Rank */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  idx === 0 ? "bg-yellow-100 text-yellow-700" :
                  idx === 1 ? "bg-gray-100 text-gray-500" :
                  idx === 2 ? "bg-orange-100 text-orange-600" :
                  "bg-gray-50 text-gray-400"
                }`}>
                  {idx + 1}
                </div>

                {/* Avatar */}
                {rep.avatar_url ? (
                  <img src={rep.avatar_url} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-indigo-700">
                      {(rep.full_name ?? "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}

                {/* Name + stats */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{rep.full_name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-400">{rep.knocks ?? 0} knocks</span>
                    <span className="text-xs text-gray-400">{rep.sales ?? 0} sales</span>
                    <span className="text-xs text-gray-400">
                      {rep.knocks ? ((rep.sales / rep.knocks) * 100).toFixed(1) : 0}% close
                    </span>
                  </div>
                </div>

                {/* Revenue + commission */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-gray-900">{fmt$(rep.revenue ?? 0)}</p>
                  <p className="text-xs text-emerald-600 font-semibold">{fmt$(rep.commission ?? 0)} earned</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, color,
}: {
  icon: any; label: string; value: string; color: string;
}) {
  const colors: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon size={18} />
      </div>
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusLabel(s: string): string {
  return {
    not_home: "Not Home",
    answered: "Answered",
    interested: "Interested",
    callback: "Callback",
    sold: "Sold",
  }[s] ?? s;
}
