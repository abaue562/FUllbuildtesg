// SHIFT SUMMARY — Shown automatically when the rep ends their shift.
// Displays: doors knocked, contacts made, sales, commission earned,
// top moment (highest buying signal knock), coaching card from AI coach.
// Autopilot calls router.push("/shift/summary?shift_id=xxx") after stopAutopilot().

import { useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable, Share,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Home, Mic, DollarSign, Award, MapPin, Star,
  TrendingUp, Share2, CheckCircle,
} from "lucide-react-native";
import { theme } from "@/lib/theme";
import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────────────

type ShiftStats = {
  knocks: number;
  contacts: number;
  sales: number;
  revenue: number;
  commission: number;
  streets_covered: number;
  distance_km: number;
  top_knock: { address: string; summary: string; buying_signal: string } | null;
  coach: {
    score: number;
    wins: string[];
    misses: string[];
    unhandled_objection: string | null;
    rebuttal: string | null;
    tomorrow_drill: string;
  } | null;
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function ShiftSummary() {
  const { shift_id } = useLocalSearchParams<{ shift_id: string }>();
  const router = useRouter();
  const [stats, setStats] = useState<ShiftStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (shift_id) loadStats(shift_id);
  }, [shift_id]);

  async function loadStats(sid: string) {
    setLoading(true);
    try {
      // Load shift session
      const { data: shift } = await supabase
        .from("shift_sessions")
        .select("started_at, ended_at, rep_id, org_id")
        .eq("id", sid)
        .single();

      if (!shift) return;

      const start = shift.started_at;
      const end = shift.ended_at ?? new Date().toISOString();

      // Knocks during shift
      const { data: knocks } = await supabase
        .from("knocks")
        .select(`
          id, status, buying_signal, summary,
          door:doors(address:addresses(line1, city))
        `)
        .eq("rep_id", shift.rep_id)
        .gte("created_at", start)
        .lte("created_at", end);

      const total = knocks?.length ?? 0;
      const contacts = knocks?.filter((k: any) => k.status !== "not_home").length ?? 0;
      const sales = knocks?.filter((k: any) => k.status === "sold").length ?? 0;

      // Top knock (highest buying signal)
      const signalOrder: Record<string, number> = { strong: 3, moderate: 2, mild: 1, none: 0 };
      const topKnock = knocks
        ?.filter((k: any) => k.buying_signal && k.buying_signal !== "none" && k.summary)
        .sort((a: any, b: any) =>
          (signalOrder[b.buying_signal] ?? 0) - (signalOrder[a.buying_signal] ?? 0)
        )[0];

      // Commission
      const { data: commissions } = await supabase
        .from("commission_ledger")
        .select("amount")
        .eq("rep_id", shift.rep_id)
        .gte("created_at", start)
        .lte("created_at", end);

      const commission = (commissions ?? []).reduce((s: number, c: any) => s + (c.amount ?? 0), 0);

      // Sales revenue
      const { data: salesData } = await supabase
        .from("sales")
        .select("amount")
        .eq("rep_id", shift.rep_id)
        .gte("created_at", start)
        .lte("created_at", end);

      const revenue = (salesData ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

      // Breadcrumb distance
      const { data: crumbs } = await supabase
        .from("rep_breadcrumbs")
        .select("lat, lng")
        .eq("rep_id", shift.rep_id)
        .gte("recorded_at", start)
        .lte("recorded_at", end)
        .order("recorded_at");

      let distanceM = 0;
      if (crumbs && crumbs.length > 1) {
        for (let i = 1; i < crumbs.length; i++) {
          distanceM += haversineM(
            crumbs[i - 1].lat, crumbs[i - 1].lng,
            crumbs[i].lat, crumbs[i].lng,
          );
        }
      }

      // Load coach session (may have been written by end-of-shift trigger)
      const { data: coachData } = await supabase
        .from("rep_coaching_sessions")
        .select("score, wins, misses, unhandled_objection, rebuttal, tomorrow_drill")
        .eq("shift_id", sid)
        .single();

      setStats({
        knocks: total,
        contacts,
        sales,
        revenue,
        commission,
        streets_covered: 0,   // could compute from address streets if needed
        distance_km: Math.round(distanceM / 100) / 10,
        top_knock: topKnock
          ? {
              address: topKnock.door?.address
                ? `${topKnock.door.address.line1}, ${topKnock.door.address.city}`
                : "Unknown",
              summary: topKnock.summary,
              buying_signal: topKnock.buying_signal,
            }
          : null,
        coach: coachData ?? null,
      });
    } finally {
      setLoading(false);
    }
  }

  async function shareResults() {
    if (!stats) return;
    const msg = `Today's shift: ${stats.knocks} doors knocked, ${stats.contacts} contacts, ${stats.sales} sales, $${stats.revenue.toFixed(0)} revenue, $${stats.commission.toFixed(0)} earned.`;
    Share.share({ message: msg });
  }

  if (loading) {
    return (
      <View style={s.loading}>
        <Text style={s.loadingTitle}>Wrapping up your shift…</Text>
        <Text style={s.loadingSubtitle}>Calculating stats & coaching report</Text>
      </View>
    );
  }

  if (!stats) {
    return (
      <View style={s.loading}>
        <Text style={s.loadingTitle}>Shift complete</Text>
        <Pressable onPress={() => router.replace("/(tabs)/map")} style={s.doneBtn}>
          <Text style={s.doneBtnText}>Go to Map</Text>
        </Pressable>
      </View>
    );
  }

  const contactRate = stats.knocks ? ((stats.contacts / stats.knocks) * 100).toFixed(0) : "0";
  const closeRate = stats.contacts ? ((stats.sales / stats.contacts) * 100).toFixed(0) : "0";

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.hero}>
          <CheckCircle size={40} color={theme.color.primary} />
          <Text style={s.heroTitle}>Shift Complete</Text>
          <Text style={s.heroSub}>Great work today</Text>
        </View>

        {/* Stat grid */}
        <View style={s.grid}>
          <StatBox icon={Home} label="Doors" value={String(stats.knocks)} color={theme.color.primary} />
          <StatBox icon={Mic} label="Contacts" value={`${stats.contacts} (${contactRate}%)`} color="#3b82f6" />
          <StatBox icon={CheckCircle} label="Sales" value={`${stats.sales} (${closeRate}%)`} color="#10b981" />
          <StatBox icon={DollarSign} label="Revenue" value={`$${stats.revenue.toFixed(0)}`} color="#f59e0b" />
          <StatBox icon={Award} label="Commission" value={`$${stats.commission.toFixed(2)}`} color="#10b981" />
          <StatBox icon={MapPin} label="Distance" value={`${stats.distance_km} km`} color="#8b5cf6" />
        </View>

        {/* Top moment */}
        {stats.top_knock && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>⭐ Best Moment</Text>
            <View style={s.topKnockCard}>
              <Text style={s.topKnockAddr} numberOfLines={1}>{stats.top_knock.address}</Text>
              <Text style={s.topKnockSig}>
                {stats.top_knock.buying_signal === "strong" ? "🔥 Strong buying signal" :
                 stats.top_knock.buying_signal === "moderate" ? "👍 Moderate interest" :
                 "🤔 Mild interest"}
              </Text>
              <Text style={s.topKnockSummary}>{stats.top_knock.summary}</Text>
            </View>
          </View>
        )}

        {/* Coach report */}
        {stats.coach && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>🤖 AI Coach Report</Text>
            <View style={s.coachCard}>
              {/* Score */}
              <View style={s.coachScoreRow}>
                <Text style={s.coachScoreLabel}>Performance Score</Text>
                <Text style={[s.coachScore, { color: scoreColor(stats.coach.score) }]}>
                  {stats.coach.score}/100
                </Text>
              </View>
              <View style={s.scoreBar}>
                <View style={[s.scoreBarFill, {
                  width: `${stats.coach.score}%` as any,
                  backgroundColor: scoreColor(stats.coach.score),
                }]} />
              </View>

              {/* Wins */}
              {stats.coach.wins?.length > 0 && (
                <View style={s.coachSection}>
                  <Text style={s.coachSectionLabel}>✅ What you did well</Text>
                  {stats.coach.wins.map((w, i) => (
                    <Text key={i} style={s.coachItem}>• {w}</Text>
                  ))}
                </View>
              )}

              {/* Misses */}
              {stats.coach.misses?.length > 0 && (
                <View style={s.coachSection}>
                  <Text style={s.coachSectionLabel}>⚠️ Opportunities missed</Text>
                  {stats.coach.misses.map((m, i) => (
                    <Text key={i} style={s.coachItem}>• {m}</Text>
                  ))}
                </View>
              )}

              {/* Unhandled objection + rebuttal */}
              {stats.coach.unhandled_objection && (
                <View style={s.rebuttalCard}>
                  <Text style={s.rebuttalObjLabel}>Most common objection you struggled with:</Text>
                  <Text style={s.rebuttalObj}>"{stats.coach.unhandled_objection}"</Text>
                  {stats.coach.rebuttal && (
                    <>
                      <Text style={s.rebuttalLabel}>Try saying this next time:</Text>
                      <Text style={s.rebuttalText}>"{stats.coach.rebuttal}"</Text>
                    </>
                  )}
                </View>
              )}

              {/* Tomorrow's drill */}
              {stats.coach.tomorrow_drill && (
                <View style={s.coachSection}>
                  <Text style={s.coachSectionLabel}>🎯 Tomorrow's drill</Text>
                  <Text style={[s.coachItem, { fontStyle: "italic" }]}>{stats.coach.tomorrow_drill}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Footer */}
      <View style={s.footer}>
        <Pressable style={s.shareBtn} onPress={shareResults}>
          <Share2 size={16} color={theme.color.primary} />
          <Text style={s.shareBtnText}>Share Results</Text>
        </Pressable>
        <Pressable style={s.doneBtn} onPress={() => router.replace("/(tabs)/map")}>
          <Text style={s.doneBtnText}>Back to Map</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Stat Box ───────────────────────────────────────────────────────────────────

function StatBox({
  icon: Icon, label, value, color,
}: {
  icon: any; label: string; value: string; color: string;
}) {
  return (
    <View style={s.statBox}>
      <Icon size={18} color={color} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: theme.color.bg, padding: 32 },
  loadingTitle: { fontSize: 22, fontWeight: "800", color: theme.color.text, textAlign: "center" },
  loadingSubtitle: { fontSize: 14, color: theme.color.textMute, textAlign: "center" },
  content: { paddingHorizontal: 20, paddingTop: 60 },
  hero: { alignItems: "center", gap: 10, marginBottom: 28 },
  heroTitle: { fontSize: 28, fontWeight: "900", color: theme.color.text },
  heroSub: { fontSize: 15, color: theme.color.textMute },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 28 },
  statBox: {
    flex: 1, minWidth: "46%",
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg,
    padding: 16, borderWidth: 1, borderColor: theme.color.border,
    alignItems: "center", gap: 6,
  },
  statValue: { fontSize: 18, fontWeight: "900", color: theme.color.text, textAlign: "center" },
  statLabel: { fontSize: 11, color: theme.color.textMute, textTransform: "uppercase", fontWeight: "700", letterSpacing: 0.5 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: theme.color.text, marginBottom: 10 },
  topKnockCard: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg,
    padding: 16, borderWidth: 1, borderColor: theme.color.border, gap: 6,
  },
  topKnockAddr: { fontSize: 15, fontWeight: "700", color: theme.color.text },
  topKnockSig: { fontSize: 13, color: theme.color.textMute },
  topKnockSummary: { fontSize: 14, color: theme.color.text, lineHeight: 20 },
  coachCard: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg,
    padding: 16, borderWidth: 1, borderColor: theme.color.border, gap: 14,
  },
  coachScoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  coachScoreLabel: { fontSize: 13, color: theme.color.textMute, fontWeight: "700" },
  coachScore: { fontSize: 22, fontWeight: "900" },
  scoreBar: {
    height: 8, backgroundColor: theme.color.border, borderRadius: 4, overflow: "hidden",
    marginTop: -8,
  },
  scoreBarFill: { height: "100%", borderRadius: 4 },
  coachSection: { gap: 4 },
  coachSectionLabel: { fontSize: 11, fontWeight: "800", color: theme.color.textMute, textTransform: "uppercase", letterSpacing: 0.5 },
  coachItem: { fontSize: 14, color: theme.color.text, lineHeight: 20 },
  rebuttalCard: {
    backgroundColor: "#0F2A28", borderRadius: theme.radius.md,
    padding: 14, gap: 6,
  },
  rebuttalObjLabel: { fontSize: 11, fontWeight: "800", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" },
  rebuttalObj: { fontSize: 14, color: "#fff", fontStyle: "italic", lineHeight: 20 },
  rebuttalLabel: { fontSize: 11, fontWeight: "800", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginTop: 4 },
  rebuttalText: { fontSize: 15, color: "#6EE7B7", fontWeight: "700", lineHeight: 22, fontStyle: "italic" },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: theme.color.bg, borderTopWidth: 1, borderTopColor: theme.color.border,
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16, gap: 10,
    flexDirection: "row",
  },
  shareBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderWidth: 1.5, borderColor: theme.color.primary,
    borderRadius: theme.radius.lg, paddingVertical: 14,
  },
  shareBtnText: { fontSize: 15, fontWeight: "700", color: theme.color.primary },
  doneBtn: {
    flex: 2, backgroundColor: theme.color.primary,
    borderRadius: theme.radius.lg, paddingVertical: 14,
    alignItems: "center", justifyContent: "center",
  },
  doneBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});
