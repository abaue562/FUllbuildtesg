// DOOR DETAIL — Full data panel for a single door.
// Everything known about this address in one screen:
//
//  ┌────────────────────────────────────────┐
//  │  📍 123 Maple St   ●SOLD              │  ← address + status dot
//  │  Street View Photo (Mapillary)         │  ← real street photo
//  ├────────────────────────────────────────┤
//  │  VISIT HISTORY                         │
//  │  ┌──────────────────────────────────┐  │
//  │  │ Apr 8 · 4:32 PM · Callback      │  │  ← each knock
//  │  │ [CUSTOMER] Come back in 3 months │  │  ← transcript
//  │  │ [REP] Absolutely, I'll be back   │  │
//  │  │ 🎵 Play recording               │  │  ← audio playback
//  │  │ 📅 Callback: July 8 at 5:00 PM  │  │  ← resolved callback
//  │  └──────────────────────────────────┘  │
//  ├────────────────────────────────────────┤
//  │  WHAT WE KNOW                          │
//  │  Roof age: 12 yrs  Kids: 3  Dog: ⚠️   │  ← facts
//  │  Objections: "Too expensive"           │  ← objections
//  │  Questions: "Do you cover metal roofs?"│  ← questions
//  │  Decision maker: Wife                  │
//  ├────────────────────────────────────────┤
//  │  RE-KNOCK  [No ans][Callback][Sold]... │  ← outcome buttons
//  └────────────────────────────────────────┘

import { useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Image, ActivityIndicator, Animated,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Audio } from "expo-av";
import {
  X, Sparkles, MapPin, Play, Pause, Phone, Calendar,
  AlertTriangle, MessageSquare, User, HelpCircle,
  Check, XCircle, Clock, ChevronRight, Dog,
} from "lucide-react-native";
import { theme, doorColor } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { logKnockHere } from "@/lib/knocks";
import { getStreetPhotos, type StreetPhoto } from "@/lib/streetview";

type KnockFull = {
  id: string;
  captured_at: string;
  status: string;
  summary: string | null;
  sentiment: string | null;
  buying_signal: string | null;
  decision_maker_present: boolean | null;
  language: string | null;
  weather: string | null;
  temp_f: number | null;
  knock_transcripts: { text: string; audio_path: string | null }[];
  door_callbacks: { callback_at: string; reason: string | null; decision_maker: string | null }[];
};

type DoorFull = {
  id: string;
  status: string;
  addresses: { line1: string; city: string; state: string; lat: number; lng: number };
  knocks: KnockFull[];
  door_facts: { key: string; value: string }[];
  door_objections: { text: string; category: string }[];
  door_questions: { question: string; category: string }[];
  door_scores: { score: number }[];
};

const OUTCOMES = [
  { key: "no_answer",      label: "No answer",    Icon: XCircle,       color: theme.color.textMute },
  { key: "not_home",       label: "Not home",     Icon: Clock,         color: theme.color.textMute },
  { key: "callback",       label: "Come back",    Icon: AlertTriangle, color: theme.color.warning },
  { key: "interested",     label: "Interested",   Icon: MessageSquare, color: theme.color.info },
  { key: "sold",           label: "Sold",         Icon: Check,         color: theme.color.primary },
  { key: "not_interested", label: "Not int.",     Icon: XCircle,       color: theme.color.danger },
];

export default function DoorDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [door, setDoor] = useState<DoorFull | null>(null);
  const [photos, setPhotos] = useState<StreetPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("doors")
      .select(`
        id, status,
        addresses ( line1, city, state, lat, lng ),
        door_scores ( score ),
        door_facts ( key, value ),
        door_objections ( text, category ),
        door_questions ( question, category ),
        knocks (
          id, captured_at, status, summary,
          sentiment, buying_signal, decision_maker_present,
          language, weather, temp_f,
          knock_transcripts ( text, audio_path ),
          door_callbacks ( callback_at, reason, decision_maker )
        )
      `)
      .eq("id", id)
      .order("captured_at", { referencedTable: "knocks", ascending: false })
      .single();

    if (data) {
      setDoor(data as any);
      // Load street photos in parallel
      if (data.addresses?.lat && data.addresses?.lng) {
        getStreetPhotos(data.addresses.lat, data.addresses.lng).then(setPhotos);
      }
    }
    setLoading(false);
  }

  async function playAudio(path: string, knockId: string) {
    if (playingId === knockId) {
      await soundRef.current?.stopAsync();
      setPlayingId(null);
      return;
    }
    await soundRef.current?.unloadAsync();
    const { data } = await supabase.storage.from("recordings").createSignedUrl(path, 3600);
    if (!data?.signedUrl) return;
    const { sound } = await Audio.Sound.createAsync({ uri: data.signedUrl });
    soundRef.current = sound;
    setPlayingId(knockId);
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((s) => {
      if ((s as any).didJustFinish) setPlayingId(null);
    });
  }

  async function reKnock(outcome: string) {
    if (!door) return;
    await logKnockHere({ outcome, doorId: door.id, lat: door.addresses?.lat, lng: door.addresses?.lng });
    await load();
  }

  if (loading) return (
    <View style={[s.root, { justifyContent: "center", alignItems: "center" }]}>
      <ActivityIndicator size="large" color={theme.color.primary} />
    </View>
  );
  if (!door) return null;

  const addr = door.addresses;
  const dotColor = doorColor[door.status] ?? "#9CA3A3";
  const score = door.door_scores?.[0]?.score ?? 0;
  const pendingCb = door.knocks?.flatMap((k) => k.door_callbacks ?? []).find((c) => c.callback_at);
  const hasDog = door.door_facts?.some((f) => f.key === "dog_warning");

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()}><X size={26} color={theme.color.text} /></Pressable>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={s.address} numberOfLines={1}>{addr?.line1}</Text>
          <Text style={s.city}>{addr?.city}, {addr?.state}</Text>
        </View>
        <View style={s.scoreBadge}>
          <Text style={s.scoreText}>{Math.round(score)}</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: dotColor }]}>
          <Text style={s.statusPillText}>{door.status.replace(/_/g, " ")}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 180 }}>

        {/* Street View Photo */}
        {photos.length > 0 && (
          <View style={s.streetView}>
            <Image
              source={{ uri: photos[0].full_url }}
              style={s.streetPhoto}
              resizeMode="cover"
            />
            <View style={s.streetOverlay}>
              <MapPin size={12} color="#fff" />
              <Text style={s.streetOverlayText}>Street view · {new Date(photos[0].captured_at).getFullYear()}</Text>
            </View>
          </View>
        )}

        {/* Callback banner */}
        {pendingCb && (
          <View style={s.callbackBanner}>
            <Calendar size={18} color={theme.color.warning} />
            <View style={{ flex: 1 }}>
              <Text style={s.callbackTitle}>Callback scheduled</Text>
              <Text style={s.callbackTime}>
                {new Date(pendingCb.callback_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </Text>
              {pendingCb.reason && <Text style={s.callbackReason}>Reason: {pendingCb.reason}</Text>}
              {pendingCb.decision_maker && <Text style={s.callbackReason}>Decision maker: {pendingCb.decision_maker}</Text>}
            </View>
          </View>
        )}

        {/* Dog warning */}
        {hasDog && (
          <View style={s.dogWarning}>
            <Text style={s.dogText}>⚠️  Dog on property — approach carefully</Text>
          </View>
        )}

        {/* What we know */}
        {(door.door_facts?.length > 0 || door.door_objections?.length > 0 || door.door_questions?.length > 0) && (
          <>
            <SectionHeader title="What We Know" />
            {door.door_facts?.length > 0 && (
              <View style={s.factsRow}>
                {door.door_facts.map((f, i) => (
                  <View key={i} style={s.factChip}>
                    <Text style={s.factKey}>{f.key.replace(/_/g, " ")}</Text>
                    <Text style={s.factVal}>{f.value}</Text>
                  </View>
                ))}
              </View>
            )}
            {door.door_objections?.map((o, i) => (
              <View key={i} style={s.objRow}>
                <XCircle size={15} color={theme.color.danger} />
                <Text style={s.objText}>"{o.text}"</Text>
                <View style={[s.catBadge, { backgroundColor: "#FEE2E2" }]}>
                  <Text style={[s.catText, { color: theme.color.danger }]}>{o.category}</Text>
                </View>
              </View>
            ))}
            {door.door_questions?.map((q, i) => (
              <View key={i} style={s.objRow}>
                <HelpCircle size={15} color={theme.color.info} />
                <Text style={s.objText}>{q.question}</Text>
              </View>
            ))}
          </>
        )}

        {/* Re-knock */}
        <SectionHeader title="Log a Visit" />
        <View style={s.outcomeGrid}>
          {OUTCOMES.map(({ key, label, Icon, color }) => (
            <Pressable key={key} onPress={() => reKnock(key)} style={s.outcomeBtn}>
              <Icon size={20} color={color} />
              <Text style={s.outcomeBtnLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Full knock history */}
        <SectionHeader title={`Visit History (${door.knocks?.length ?? 0})`} />
        {(!door.knocks || door.knocks.length === 0) && (
          <Text style={s.empty}>No visits yet — this door has never been knocked.</Text>
        )}
        {door.knocks?.map((knock) => (
          <KnockCard
            key={knock.id}
            knock={knock}
            playing={playingId === knock.id}
            onPlayAudio={playAudio}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ── KnockCard ─────────────────────────────────────────────────────────────────

function KnockCard({ knock, playing, onPlayAudio }: {
  knock: KnockFull;
  playing: boolean;
  onPlayAudio: (path: string, id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = doorColor[knock.status] ?? "#9CA3A3";
  const audioPath = knock.knock_transcripts?.find((t) => t.audio_path)?.audio_path;
  const hasTranscript = knock.knock_transcripts?.some((t) => t.text);

  // Parse labeled transcript into speaker lines
  const lines = (knock.knock_transcripts ?? [])
    .flatMap((t) => t.text?.split("\n") ?? [])
    .filter(Boolean)
    .map((line) => {
      const rep = line.match(/^\[REP\]\s+(.+)/);
      const cust = line.match(/^\[CUSTOMER\]\s+(.+)/);
      if (rep)  return { speaker: "REP",      text: rep[1] };
      if (cust) return { speaker: "CUSTOMER", text: cust[1] };
      return           { speaker: "UNKNOWN",  text: line };
    });

  return (
    <View style={s.knockCard}>
      {/* Top row */}
      <Pressable onPress={() => setExpanded((e) => !e)} style={s.knockTop}>
        <View style={[s.knockDot, { backgroundColor: color }]} />
        <View style={{ flex: 1 }}>
          <Text style={s.knockStatus}>{knock.status.replace(/_/g, " ")}</Text>
          <Text style={s.knockTime}>
            {new Date(knock.captured_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            {" · "}
            {new Date(knock.captured_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            {knock.weather ? ` · ${knock.temp_f}°F ${knock.weather}` : ""}
          </Text>
        </View>
        {/* Signals */}
        <View style={s.signalRow}>
          {knock.buying_signal === "hot"  && <Text style={s.signalHot}>🔥</Text>}
          {knock.buying_signal === "warm" && <Text style={s.signalWarm}>⚡</Text>}
          {knock.decision_maker_present   && <Text style={s.signalDM}>DM</Text>}
          {knock.sentiment === "pos"      && <Text style={s.signalPos}>+</Text>}
        </View>
        <Text style={s.expandChev}>{expanded ? "▲" : "▼"}</Text>
      </Pressable>

      {/* Summary always visible */}
      {knock.summary && (
        <View style={s.summaryRow}>
          <Sparkles size={13} color={theme.color.primary} />
          <Text style={s.summaryText}>{knock.summary}</Text>
        </View>
      )}

      {/* Expanded content */}
      {expanded && (
        <View style={s.knockExpanded}>
          {/* Audio playback */}
          {audioPath && (
            <Pressable onPress={() => onPlayAudio(audioPath, knock.id)} style={s.audioBtn}>
              {playing ? <Pause size={18} color="#fff" /> : <Play size={18} color="#fff" />}
              <Text style={s.audioBtnText}>{playing ? "Pause recording" : "Play recording"}</Text>
            </Pressable>
          )}

          {/* Transcript bubbles */}
          {lines.length > 0 && (
            <View style={s.transcript}>
              {lines.map((line, i) => {
                const isRep = line.speaker === "REP";
                return (
                  <View key={i} style={[s.bubble, isRep ? s.bubbleRep : s.bubbleCust]}>
                    <Text style={s.bubbleLabel}>{isRep ? "Rep" : "Customer"}</Text>
                    <Text style={[s.bubbleText, isRep && { color: "#fff" }]}>{line.text}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Callback from this visit */}
          {knock.door_callbacks?.map((cb, i) => (
            <View key={i} style={s.cbRow}>
              <Calendar size={14} color={theme.color.warning} />
              <Text style={s.cbText}>
                Callback: {new Date(cb.callback_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {cb.reason ? ` — ${cb.reason}` : ""}
                {cb.decision_maker ? ` (${cb.decision_maker})` : ""}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, backgroundColor: theme.color.surface, borderBottomWidth: 1, borderBottomColor: theme.color.border, gap: 8, flexWrap: "wrap" },
  address: { fontSize: 18, fontWeight: "800", color: theme.color.text },
  city: { fontSize: 13, color: theme.color.textMute, marginTop: 1 },
  scoreBadge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: theme.color.primary, borderRadius: 99 },
  scoreText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  statusPillText: { color: "#fff", fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  streetView: { position: "relative", height: 200 },
  streetPhoto: { width: "100%", height: 200 },
  streetOverlay: { position: "absolute", bottom: 8, left: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  streetOverlayText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  callbackBanner: { flexDirection: "row", alignItems: "flex-start", gap: 12, margin: 14, padding: 14, backgroundColor: "#FFF8E1", borderRadius: theme.radius.md, borderWidth: 1, borderColor: "#FFE082" },
  callbackTitle: { fontSize: 14, fontWeight: "800", color: "#6D4C00" },
  callbackTime: { fontSize: 15, fontWeight: "700", color: theme.color.text, marginTop: 2 },
  callbackReason: { fontSize: 13, color: theme.color.textMute, marginTop: 2 },
  dogWarning: { marginHorizontal: 14, marginBottom: 8, padding: 10, backgroundColor: "#FEE2E2", borderRadius: theme.radius.md, borderWidth: 1, borderColor: "#FCA5A5" },
  dogText: { fontSize: 14, fontWeight: "700", color: theme.color.danger },
  sectionHeader: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: theme.color.textMute, textTransform: "uppercase", letterSpacing: 1 },
  factsRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  factChip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.color.surface, borderRadius: 99, borderWidth: 1, borderColor: theme.color.border },
  factKey: { fontSize: 11, color: theme.color.textMute, fontWeight: "600", textTransform: "capitalize" },
  factVal: { fontSize: 13, fontWeight: "800", color: theme.color.text },
  objRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  objText: { flex: 1, fontSize: 14, color: theme.color.text },
  catBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  catText: { fontSize: 11, fontWeight: "700" },
  outcomeGrid: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 8 },
  outcomeBtn: { flexBasis: "30%", flexGrow: 1, alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface },
  outcomeBtnLabel: { fontSize: 12, fontWeight: "700", color: theme.color.text, textAlign: "center" },
  empty: { padding: 20, color: theme.color.textMute, fontStyle: "italic" },
  knockCard: { marginHorizontal: 14, marginTop: 10, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface, overflow: "hidden" },
  knockTop: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  knockDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  knockStatus: { fontSize: 15, fontWeight: "800", color: theme.color.text, textTransform: "capitalize" },
  knockTime: { fontSize: 12, color: theme.color.textMute, marginTop: 1 },
  signalRow: { flexDirection: "row", gap: 4, alignItems: "center" },
  signalHot: { fontSize: 14 },
  signalWarm: { fontSize: 14 },
  signalDM: { fontSize: 10, fontWeight: "800", color: theme.color.info, backgroundColor: "#DBEAFE", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 99 },
  signalPos: { fontSize: 13, fontWeight: "800", color: theme.color.primary, backgroundColor: "#D1FAE5", width: 18, height: 18, borderRadius: 9, textAlign: "center", lineHeight: 18 },
  expandChev: { fontSize: 10, color: theme.color.textMute },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 14, paddingBottom: 10, paddingTop: 0 },
  summaryText: { flex: 1, fontSize: 13, color: theme.color.textMute, lineHeight: 18, fontStyle: "italic" },
  knockExpanded: { borderTopWidth: 1, borderTopColor: theme.color.border, padding: 14, gap: 10 },
  audioBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.color.info, borderRadius: theme.radius.pill, paddingVertical: 10, paddingHorizontal: 16, alignSelf: "flex-start" },
  audioBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  transcript: { gap: 6 },
  bubble: { padding: 10, borderRadius: 12, maxWidth: "85%", borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.bg },
  bubbleRep: { backgroundColor: theme.color.primary, borderColor: theme.color.primary, alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleCust: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  bubbleLabel: { fontSize: 10, fontWeight: "800", color: "rgba(255,255,255,0.6)", marginBottom: 2, textTransform: "uppercase" },
  bubbleText: { fontSize: 14, color: theme.color.text, lineHeight: 20 },
  cbRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cbText: { fontSize: 13, color: theme.color.text },
});
