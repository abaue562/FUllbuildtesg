// LIVE TRANSCRIPT SCREEN — shows the conversation happening in real time.
// Rep can glance at their phone to see exactly what was said, who said it,
// and the AI earpiece suggestion at the bottom.
//
// Layout:
//   ┌─────────────────────────────────────┐
//   │  123 Maple St  · 🔴 Recording        │
//   ├─────────────────────────────────────┤
//   │                                     │
//   │  [REP]   Hi, how are you today?     │  ← right-aligned, green
//   │                                     │
//   │         What are you selling?[CUST] │  ← left-aligned, grey
//   │                                     │
//   │  [REP]   We help homeowners with…   │
//   │                                     │
//   │       Come back in 3 months. [CUST] │
//   │                                     │
//   ├─────────────────────────────────────┤
//   │  💬 Try saying: "I can actually     │  ← AI earpiece card
//   │     schedule that right now…"       │
//   └─────────────────────────────────────┘

import { useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  Animated, ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { X, Mic, Square, Sparkles, Volume2 } from "lucide-react-native";
import { theme } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import type { TranscriptLine } from "@/lib/recording";

type Suggestion = { line: string | null; why: string; stage: string };

export default function LiveTranscript() {
  const router = useRouter();
  const { address, door_id, knock_id } = useLocalSearchParams<{
    address: string; door_id: string; knock_id: string;
  }>();

  const scrollRef = useRef<ScrollView>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [recording, setRecording] = useState(true);
  const [connecting, setConnecting] = useState(true);
  const suggestionOpacity = useRef(new Animated.Value(0)).current;

  // Subscribe to live knock_transcripts inserts for this knock
  useEffect(() => {
    setConnecting(false);

    const ch = supabase
      .channel(`transcript:${knock_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "knock_transcripts",
          filter: `knock_id=eq.${knock_id}`,
        },
        (payload) => {
          const raw: string = payload.new?.text ?? "";
          // Parse labeled lines: "[REP] hello\n[CUSTOMER] hi"
          const parsed = parseLabeledTranscript(raw);
          setLines((prev) => mergeLinesDedup(prev, parsed));
          scrollRef.current?.scrollToEnd({ animated: true });
        },
      )
      .subscribe();

    // Subscribe to script suggestions
    const suggestionCh = supabase
      .channel(`suggestion:${knock_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "upsell_suggestions",
          filter: `knock_id=eq.${knock_id}` },
        (payload) => showSuggestion(payload.new as Suggestion),
      )
      .subscribe();

    // Poll globalThis for suggestions fired by autopilot
    const suggPoll = setInterval(() => {
      const s = (globalThis as any).__scriptSuggestion;
      if (s && s.line) { showSuggestion(s); (globalThis as any).__scriptSuggestion = null; }
    }, 500);

    return () => {
      supabase.removeChannel(ch);
      supabase.removeChannel(suggestionCh);
      clearInterval(suggPoll);
    };
  }, [knock_id]);

  function showSuggestion(s: Suggestion) {
    setSuggestion(s);
    Animated.sequence([
      Animated.timing(suggestionOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(8000),
      Animated.timing(suggestionOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => setSuggestion(null));
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.closeBtn}>
          <X size={24} color={theme.color.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.address} numberOfLines={1}>{address}</Text>
          <View style={s.recIndicator}>
            <View style={s.recDot} />
            <Text style={s.recLabel}>Live Transcript</Text>
          </View>
        </View>
        {connecting && <ActivityIndicator size="small" color={theme.color.primary} />}
      </View>

      {/* Conversation */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.convo}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {lines.length === 0 && (
          <View style={s.waiting}>
            <Volume2 size={32} color={theme.color.border} />
            <Text style={s.waitingText}>Listening for conversation…</Text>
            <Text style={s.waitingSubtext}>Speech will appear here in real time</Text>
          </View>
        )}
        {lines.map((line, i) => (
          <ChatBubble key={i} line={line} />
        ))}
      </ScrollView>

      {/* AI Earpiece Suggestion */}
      {suggestion?.line && (
        <Animated.View style={[s.earpiece, { opacity: suggestionOpacity }]}>
          <View style={s.earpieceInner}>
            <Sparkles size={16} color={theme.color.primary} />
            <View style={{ flex: 1 }}>
              <Text style={s.earpieceWhy}>{suggestion.why}</Text>
              <Text style={s.earpieceLine}>"{suggestion.line}"</Text>
            </View>
            <Pressable onPress={() => setSuggestion(null)}>
              <X size={16} color={theme.color.textMute} />
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function ChatBubble({ line }: { line: TranscriptLine }) {
  const isRep = line.speaker === "REP";
  const isUnknown = line.speaker === "UNKNOWN";
  return (
    <View style={[s.bubbleRow, isRep && s.bubbleRowRight]}>
      {!isRep && (
        <View style={s.avatarCust}>
          <Text style={s.avatarText}>C</Text>
        </View>
      )}
      <View style={[
        s.bubble,
        isRep && s.bubbleRep,
        isUnknown && s.bubbleUnknown,
      ]}>
        <Text style={[s.bubbleLabel, isRep && { color: "rgba(255,255,255,0.7)" }]}>
          {line.speaker === "REP" ? "You" : line.speaker === "CUSTOMER" ? "Customer" : "Unknown"}
        </Text>
        <Text style={[s.bubbleText, isRep && { color: "#fff" }]}>{line.text}</Text>
      </View>
      {isRep && (
        <View style={s.avatarRep}>
          <Text style={s.avatarText}>R</Text>
        </View>
      )}
    </View>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parseLabeledTranscript(raw: string): TranscriptLine[] {
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const repMatch = l.match(/^\[REP\]\s+(.+)/);
      const custMatch = l.match(/^\[CUSTOMER\]\s+(.+)/);
      if (repMatch)  return { speaker: "REP"      as const, text: repMatch[1],  ts: Date.now() };
      if (custMatch) return { speaker: "CUSTOMER" as const, text: custMatch[1], ts: Date.now() };
      return           { speaker: "UNKNOWN"   as const, text: l.trim(),     ts: Date.now() };
    });
}

function mergeLinesDedup(existing: TranscriptLine[], incoming: TranscriptLine[]): TranscriptLine[] {
  const existingTexts = new Set(existing.map((l) => l.text));
  const novel = incoming.filter((l) => !existingTexts.has(l.text));
  return [...existing, ...novel];
}

// ── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: theme.color.surface, borderBottomWidth: 1, borderBottomColor: theme.color.border, gap: 12 },
  closeBtn: { padding: 4 },
  address: { fontSize: 17, fontWeight: "800", color: theme.color.text },
  recIndicator: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.color.danger },
  recLabel: { fontSize: 12, color: theme.color.danger, fontWeight: "700" },
  convo: { padding: 16, gap: 12 },
  waiting: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  waitingText: { fontSize: 18, fontWeight: "700", color: theme.color.textMute },
  waitingSubtext: { fontSize: 14, color: theme.color.border },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "85%" },
  bubbleRowRight: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  bubble: { flex: 1, backgroundColor: theme.color.surface, borderRadius: 16, borderBottomLeftRadius: 4, padding: 12, borderWidth: 1, borderColor: theme.color.border },
  bubbleRep: { backgroundColor: theme.color.primary, borderColor: theme.color.primary, borderBottomLeftRadius: 16, borderBottomRightRadius: 4 },
  bubbleUnknown: { backgroundColor: theme.color.surfaceAlt },
  bubbleLabel: { fontSize: 11, fontWeight: "800", color: theme.color.textMute, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 },
  bubbleText: { fontSize: 15, color: theme.color.text, lineHeight: 21 },
  avatarCust: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#E5E5DF", alignItems: "center", justifyContent: "center" },
  avatarRep: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.color.primaryDark, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  earpiece: { position: "absolute", bottom: 24, left: 16, right: 16 },
  earpieceInner: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#0E2B2A", borderRadius: theme.radius.lg, padding: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
  earpieceWhy: { fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  earpieceLine: { fontSize: 15, color: "#fff", fontWeight: "700", lineHeight: 21, fontStyle: "italic" },
});
