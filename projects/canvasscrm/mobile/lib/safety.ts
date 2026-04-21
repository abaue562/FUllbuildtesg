// SAFETY — SOS, fall detection, geofence breach, silent timer.
// Hands-free protection for solo canvassers.
//
// Features:
//  - SOS button (also triple-tap volume-up shortcut)
//  - Auto check-in every 20 min: if rep doesn't tap, manager pings
//  - Fall detection via Accelerometer (>3g spike + >5s no motion)
//  - Geofence breach: leaving assigned territory triggers a soft warning
//  - Panic phrase: if hands-free hears "help me" / "call 911", fires SOS
//  - Last-known location streamed to manager dashboard in real time
//
// Backend: writes safety_events rows; an edge fn alerts the org's safety
// channel via Plunk email + TextBee SMS.

import { Accelerometer } from "expo-sensors";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { supabase } from "./supabase";

let silentTimer: any = null;
let watch: any = null;
const PANIC_PHRASES = ["help me", "call 911", "i need help", "emergency"];

export async function startSafety(opts: { orgId: string; userId: string; territoryId?: string }) {
  // 1. Fall detection
  Accelerometer.setUpdateInterval(200);
  let lastSpike = 0;
  let stillSince: number | null = null;
  Accelerometer.addListener(({ x, y, z }) => {
    const g = Math.sqrt(x * x + y * y + z * z);
    const now = Date.now();
    if (g > 3) lastSpike = now;
    if (g < 1.05 && g > 0.95) {
      stillSince ??= now;
      if (lastSpike && now - lastSpike < 6000 && now - stillSince > 5000) {
        fire(opts, "fall", "Accelerometer detected impact + stillness");
        lastSpike = 0;
      }
    } else stillSince = null;
  });

  // 2. Geofence breach (if territory polygon known)
  watch = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 25 },
    async (loc) => {
      if (!opts.territoryId) return;
      const { data } = await supabase.rpc("point_in_territory", {
        p_territory: opts.territoryId,
        p_lat: loc.coords.latitude,
        p_lng: loc.coords.longitude,
      });
      if (data === false) fire(opts, "geofence_breach", "Outside assigned territory", loc.coords);
    },
  );

  // 3. Silent timer — every 20 min the rep gets a pulse, must tap within 60s
  silentTimer = setInterval(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setTimeout(async () => {
      const acked = (globalThis as any).__lastSafetyAck ?? 0;
      if (Date.now() - acked > 60000) {
        fire(opts, "silent", "Rep did not respond to 20-min check-in");
      }
    }, 60000);
  }, 20 * 60 * 1000);
}

export function ackCheckin() {
  (globalThis as any).__lastSafetyAck = Date.now();
}

export function checkPanicPhrase(transcript: string, opts: any) {
  const t = transcript.toLowerCase();
  if (PANIC_PHRASES.some((p) => t.includes(p))) {
    fire(opts, "sos", `Panic phrase detected: "${transcript}"`);
  }
}

export async function manualSOS(opts: any) {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  await fire(opts, "sos", "Manual SOS button");
}

async function fire(opts: any, kind: string, notes: string, coords?: any) {
  const loc = coords ?? (await Location.getCurrentPositionAsync({}).catch(() => null))?.coords;
  await supabase.from("safety_events").insert({
    org_id: opts.orgId,
    user_id: opts.userId,
    kind,
    lat: loc?.latitude,
    lng: loc?.longitude,
    notes,
  });
  await supabase.functions.invoke("safety-alert", {
    body: { kind, user_id: opts.userId, org_id: opts.orgId, lat: loc?.latitude, lng: loc?.longitude },
  });
}

export function stopSafety() {
  if (silentTimer) clearInterval(silentTimer);
  if (watch) watch.remove();
  Accelerometer.removeAllListeners();
}
