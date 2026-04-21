// E-SIGNATURE SCREEN — customer signs on the rep's phone at the door.
// Uses react-native-svg + PanResponder to capture a finger drawing.
// Stores SVG path + sha256 hash + GPS + timestamp to signatures table.
// Generates a signed PDF receipt via the sign-pdf edge function.

import { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, PanResponder, Platform, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import { Check, RotateCcw, X } from "lucide-react-native";
import { theme } from "@/lib/theme";
import { supabase } from "@/lib/supabase";

export default function SignScreen() {
  const router = useRouter();
  const { door_id, knock_id, sale_id, signer_name, document_key } = useLocalSearchParams<{
    door_id: string; knock_id: string; sale_id: string; signer_name: string; document_key: string;
  }>();

  const [paths, setPaths] = useState<string[]>([]);
  const currentPath = useRef("");
  const [saving, setSaving] = useState(false);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      currentPath.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
    },
    onPanResponderMove: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      currentPath.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
    },
    onPanResponderRelease: () => {
      setPaths((p) => [...p, currentPath.current]);
      currentPath.current = "";
    },
  });

  function clear() { setPaths([]); currentPath.current = ""; }

  async function save() {
    if (paths.length === 0) return Alert.alert("Signature required", "Please sign before continuing.");
    setSaving(true);
    try {
      const svgData = paths.join("|");
      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, svgData);
      const loc = await Location.getCurrentPositionAsync({}).catch(() => null);
      await supabase.from("signatures").insert({
        door_id, knock_id, sale_id,
        signer_name,
        signer_type: "customer",
        svg_data: svgData,
        svg_hash: hash,
        lat: loc?.coords.latitude,
        lng: loc?.coords.longitude,
        document_key: document_key ?? "contract",
        signed_at: new Date().toISOString(),
      });
      // Kick off async PDF generation
      supabase.functions.invoke("sign-pdf", {
        body: { svg_data: svgData, sale_id, signer_name, document_key },
      });
      router.back();
    } catch (e) {
      Alert.alert("Error", "Could not save signature. Please try again.");
    } finally { setSaving(false); }
  }

  return (
    <View style={s.root}>
      <View style={s.topbar}>
        <Pressable onPress={() => router.back()}><X size={26} color={theme.color.text} /></Pressable>
        <Text style={s.title}>Sign Here</Text>
        <Pressable onPress={clear}><RotateCcw size={22} color={theme.color.textMute} /></Pressable>
      </View>

      <View style={s.docInfo}>
        <Text style={s.docLabel}>{document_key ?? "Service Agreement"}</Text>
        <Text style={s.signerLabel}>Signing as: <Text style={{ fontWeight: "800" }}>{signer_name}</Text></Text>
      </View>

      <View style={s.canvas} {...panResponder.panHandlers}>
        <Svg style={StyleSheet.absoluteFill}>
          {paths.map((d, i) => (
            <Path key={i} d={d} stroke={theme.color.text} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
        {paths.length === 0 && (
          <Text style={s.placeholder}>↑ Sign above with your finger</Text>
        )}
        <View style={s.signLine} />
        <Text style={s.signLabel}>x ___________________________</Text>
      </View>

      <View style={s.footer}>
        <Text style={s.legal}>
          By signing above you agree to the terms of the {document_key ?? "service agreement"}.
          Signed {new Date().toLocaleDateString()} at this location.
        </Text>
        <Pressable style={[s.cta, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
          <Check size={22} color="#fff" />
          <Text style={s.ctaText}>{saving ? "Saving…" : "Confirm & Submit"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  topbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 16 },
  title: { fontSize: 26, fontWeight: "800", color: theme.color.text, flex: 1, marginLeft: 8 },
  docInfo: { paddingHorizontal: 20, paddingBottom: 12 },
  docLabel: { fontSize: 17, fontWeight: "700", color: theme.color.text },
  signerLabel: { fontSize: 14, color: theme.color.textMute, marginTop: 2 },
  canvas: { flex: 1, marginHorizontal: 20, backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, overflow: "hidden", justifyContent: "flex-end" },
  placeholder: { position: "absolute", top: "40%", alignSelf: "center", fontSize: 16, color: theme.color.border, fontStyle: "italic" },
  signLine: { height: 1, backgroundColor: theme.color.border, marginHorizontal: 24, marginBottom: 32 },
  signLabel: { fontSize: 14, color: theme.color.textMute, paddingHorizontal: 24, paddingBottom: 16 },
  footer: { padding: 20, paddingBottom: 36, gap: 12 },
  legal: { fontSize: 12, color: theme.color.textMute, textAlign: "center", lineHeight: 18 },
  cta: { backgroundColor: theme.color.primary, borderRadius: theme.radius.pill, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  ctaText: { color: "#fff", fontSize: 18, fontWeight: "800" },
});
