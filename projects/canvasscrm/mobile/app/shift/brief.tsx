// DAILY BRIEF — Shown to the rep at the start of their shift.
// Pulls from Supabase before they hit "Start Shift" on shift/start.tsx.
//
// Sections:
//  1. Today's callbacks (doors that asked for a return visit today)
//  2. Hot doors (door_scores > 70 with unworked or callback status)
//  3. AI-optimized route (from route-optimize edge function)
//  4. Weather + best hours heat map
//  5. Yesterday's coaching tip from rep-coach

import { useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Calendar, Zap, MapPin, Cloud, Award,
  ChevronRight, Clock, ArrowRight, Star,
} from "lucide-react-native";
import { theme } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { startAutopilot } from "@/lib/autopilot";
import * as Location from "expo-location";

// ── Types ──────────────────────────────────────────────────────────────────────

type Callback = {
  id: string;
  address: string;
  absolute_iso: string | null;
  relative_phrase: string | null;
  decision_maker: string | null;
  door_id: string;
};

type HotDoor = {
  id: string;
  address: string;
  score: number;
  status: string;
  distance_m: number | null;
};

type Weather = {
  temp_f: number;
  condition: string;
  best_hours: string;
};

type CoachTip = {
  score: number;
  wins: string[];
  misses: string[];
  tomorrow_drill: string;
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function DailyBrief() {
  const router = useRouter();
  const [callbacks, setCallbacks] = useState<Callback[]>([]);
  const [hotDoors, setHotDoors] = useState<HotDoor[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [coach, setCoach] = useState<CoachTip | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: profile } = await supabase
      .from("users")
      .select("org_id")
      .eq("id", user.id)
      .single();
    if (!profile) { setLoading(false); return; }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // ── Callbacks due today ──
    const { data: cbData } = await supabase
      .from("door_callbacks")
      .select(`
        id, absolute_iso, relative_phrase, decision_maker,
        door:doors(id, address:addresses(line1, city))
      `)
      .gte("absolute_iso", todayStart.toISOString())
      .lte("absolute_iso", todayEnd.toISOString())
      .is("resolved_at", null)
      .order("absolute_iso", { ascending: true })
      .limit(10);

    setCallbacks(
      (cbData ?? []).map((c: any) => ({
        id: c.id,
        address: c.door?.address
          ? `${c.door.address.line1}, ${c.door.address.city}`
          : "Unknown",
        absolute_iso: c.absolute_iso,
        relative_phrase: c.relative_phrase,
        decision_maker: c.decision_maker,
        door_id: c.door?.id,
      }))
    );

    // ── Hot doors near current location ──
    let lat = 0, lng = 0;
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      lat = loc.coords.latitude;
      lng = loc.coords.longitude;
    } catch {}

    const { data: hotData } = await supabase
      .from("door_scores")
      .select(`
        score,
        door:doors(
          id, status,
          address:addresses(line1, city, lat, lng)
        )
      `)
      .gte("score", 60)
      .not("door.status", "in", '("sold","dnc")')
      .order("score", { ascending: false })
      .limit(8);

    setHotDoors(
      (hotData ?? []).map((d: any) => {
        const a = d.door?.address;
        const distM = lat && a?.lat
          ? haversineM(lat, lng, a.lat, a.lng)
          : null;
        return {
          id: d.door?.id,
          address: a ? `${a.line1}, ${a.city}` : "Unknown",
          score: d.score,
          status: d.door?.status ?? "unknown",
          distance_m: distM,
        };
      }).sort((a, b) => (a.distance_m ?? 9999) - (b.distance_m ?? 9999))
    );

    // ── Weather ──
    if (lat && lng) {
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&hourly=temperature_2m,precipitation_probability&forecast_days=1&temperature_unit=fahrenheit&timezone=auto`
        );
        const j = await r.json();
        const tempF = j.current_weather?.temperature ?? 70;
        const wcode = j.current_weather?.weathercode ?? 0;
        // Find best hours (low rain chance, daytime)
        const hours = j.hourly?.time?.map((t: string, i: number) => ({
          hour: new Date(t).getHours(),
          precipChance: j.hourly.precipitation_probability?.[i] ?? 0,
        })) ?? [];
        const goodHours = hours
          .filter((h: any) => h.hour >= 10 && h.hour <= 20 && h.precipChance < 30)
          .map((h: any) => h.hour);
        const bestStart = goodHours[0] ?? 10;
        const bestEnd = goodHours[goodHours.length - 1] ?? 19;
        setWeather({
          temp_f: Math.round(tempF),
          condition: wmoCodeToCondition(wcode),
          best_hours: `${fmt12(bestStart)} – ${fmt12(bestEnd)}`,
        });
      } catch {}
    }

    // ── Yesterday's coaching tip ──
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dayStr = yesterday.toISOString().split("T")[0];
      const { data: coachData } = await supabase
        .from("rep_coaching_sessions")
        .select("score, wins, misses, tomorrow_drill")
        .eq("rep_id", user.id)
        .gte("created_at", dayStr)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (coachData) setCoach(coachData as CoachTip);
    } catch {}

    setLoading(false);
  }

  async function handleStart() {
    setStarting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("users")
        .select("org_id")
        .eq("id", user!.id)
        .single();
      await startAutopilot({ userId: user!.id, orgId: profile!.org_id });
      router.replace("/(tabs)/map");
    } finally {
      setStarting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator size="large" color={theme.color.primary} />
        <Text style={s.loadingText}>Loading your brief…</Text>
      </View>
    );
  }

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Greeting */}
        <View style={s.greetRow}>
          <Text style={s.greeting}>{greeting} 👋</Text>
          <Text style={s.date}>
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </Text>
        </View>

        {/* Weather */}
        {weather && (
          <View style={s.weatherCard}>
            <Cloud size={20} color={theme.color.primary} />
            <View style={{ flex: 1 }}>
              <Text style={s.weatherTemp}>{weather.temp_f}°F · {weather.condition}</Text>
              <Text style={s.weatherBest}>Best hours: {weather.best_hours}</Text>
            </View>
          </View>
        )}

        {/* Callbacks */}
        {callbacks.length > 0 && (
          <Section icon={Calendar} title="Today's Callbacks" accent="#f59e0b">
            {callbacks.map((cb) => (
              <Pressable
                key={cb.id}
                style={s.card}
                onPress={() => router.push(`/door/${cb.door_id}`)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.cardAddress} numberOfLines={1}>{cb.address}</Text>
                  <Text style={s.cardMeta}>
                    {cb.absolute_iso
                      ? new Date(cb.absolute_iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : cb.relative_phrase}
                    {cb.decision_maker && ` · Ask for ${cb.decision_maker}`}
                  </Text>
                </View>
                <Clock size={16} color={theme.color.textMute} />
              </Pressable>
            ))}
          </Section>
        )}

        {/* Hot Doors */}
        {hotDoors.length > 0 && (
          <Section icon={Zap} title="Hot Doors Nearby" accent="#6366f1">
            {hotDoors.slice(0, 5).map((d) => (
              <Pressable
                key={d.id}
                style={s.card}
                onPress={() => router.push(`/door/${d.id}`)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.cardAddress} numberOfLines={1}>{d.address}</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 3 }}>
                    <Text style={[s.scoreBadge, { color: scoreColor(d.score) }]}>
                      ⚡ {d.score}
                    </Text>
                    {d.distance_m !== null && (
                      <Text style={s.cardMeta}>
                        {d.distance_m < 1000
                          ? `${Math.round(d.distance_m)}m away`
                          : `${(d.distance_m / 1000).toFixed(1)}km away`}
                      </Text>
                    )}
                    <Text style={[s.cardMeta, { textTransform: "capitalize" }]}>
                      {d.status.replace("_", " ")}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={16} color={theme.color.textMute} />
              </Pressable>
            ))}
          </Section>
        )}

        {/* Coach tip */}
        {coach && (
          <Section icon={Award} title="Yesterday's Coach Report" accent="#10b981">
            <View style={s.coachCard}>
              <Text style={s.coachScore}>Score: {coach.score}/100</Text>
              {coach.wins?.length > 0 && (
                <View style={s.coachRow}>
                  <Text style={s.coachLabel}>✅ Wins</Text>
                  {coach.wins.map((w, i) => (
                    <Text key={i} style={s.coachText}>• {w}</Text>
                  ))}
                </View>
              )}
              {coach.misses?.length > 0 && (
                <View style={s.coachRow}>
                  <Text style={s.coachLabel}>⚠️ Missed</Text>
                  {coach.misses.map((m, i) => (
                    <Text key={i} style={s.coachText}>• {m}</Text>
                  ))}
                </View>
              )}
              {coach.tomorrow_drill && (
                <View style={s.coachRow}>
                  <Text style={s.coachLabel}>🎯 Today's drill</Text>
                  <Text style={[s.coachText, { fontStyle: "italic" }]}>{coach.tomorrow_drill}</Text>
                </View>
              )}
            </View>
          </Section>
        )}

        {/* Bottom spacer for the sticky button */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Start Shift CTA */}
      <View style={s.footer}>
        <Pressable
          style={[s.startBtn, starting && s.startBtnLoading]}
          onPress={handleStart}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={s.startBtnText}>Start Shift</Text>
              <ArrowRight size={20} color="#fff" />
            </>
          )}
        </Pressable>
        <Text style={s.footerNote}>Put your phone in your pocket and go →</Text>
      </View>
    </View>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({
  icon: Icon, title, accent, children,
}: {
  icon: any; title: string; accent: string; children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Icon size={16} color={accent} />
        <Text style={[s.sectionTitle, { color: accent }]}>{title}</Text>
      </View>
      {children}
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

function fmt12(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return "#6b7280";
}

function wmoCodeToCondition(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly Cloudy";
  if (code <= 9) return "Foggy";
  if (code <= 19) return "Drizzle";
  if (code <= 29) return "Rain";
  if (code <= 39) return "Snow";
  if (code <= 49) return "Fog";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 84) return "Rain Showers";
  if (code <= 94) return "Thunderstorm";
  return "Stormy";
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: theme.color.bg },
  loadingText: { fontSize: 14, color: theme.color.textMute },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 },
  greetRow: { marginBottom: 20 },
  greeting: { fontSize: 26, fontWeight: "900", color: theme.color.text },
  date: { fontSize: 14, color: theme.color.textMute, marginTop: 3 },
  weatherCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg,
    padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: theme.color.border,
  },
  weatherTemp: { fontSize: 15, fontWeight: "700", color: theme.color.text },
  weatherBest: { fontSize: 12, color: theme.color.textMute, marginTop: 2 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  card: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.md,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: theme.color.border,
  },
  cardAddress: { fontSize: 15, fontWeight: "700", color: theme.color.text },
  cardMeta: { fontSize: 12, color: theme.color.textMute, marginTop: 2 },
  scoreBadge: { fontSize: 12, fontWeight: "800" },
  coachCard: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.md,
    padding: 16, borderWidth: 1, borderColor: theme.color.border, gap: 10,
  },
  coachScore: { fontSize: 18, fontWeight: "900", color: theme.color.text },
  coachRow: { gap: 3 },
  coachLabel: { fontSize: 12, fontWeight: "800", color: theme.color.textMute, textTransform: "uppercase" },
  coachText: { fontSize: 14, color: theme.color.text },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: theme.color.bg, borderTopWidth: 1, borderTopColor: theme.color.border,
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16, gap: 8,
  },
  startBtn: {
    backgroundColor: theme.color.primary, borderRadius: theme.radius.lg,
    paddingVertical: 16, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10,
  },
  startBtnLoading: { opacity: 0.8 },
  startBtnText: { fontSize: 17, fontWeight: "900", color: "#fff" },
  footerNote: { fontSize: 12, color: theme.color.textMute, textAlign: "center" },
});
