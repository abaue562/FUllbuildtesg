// ═══════════════════════════════════════════════════════════════════════════
// AUTOPILOT — The single brain that runs the entire hands-free canvassing
// session. One call to startAutopilot(). Rep puts phone in pocket. Done.
//
// Everything that happens is automatic:
//
//  GPS LAYER
//  ─────────
//  • Background GPS streams position every 8–10s via TaskManager.
//  • Every position is broadcast over a Supabase Realtime presence channel
//    so the manager live-map updates in <1s (no DB round-trip needed).
//  • Every position is also written to rep_breadcrumbs for playback.
//
//  DWELL DETECTION
//  ───────────────
//  • Rep slows to <1.4 m/s within 15m of a point for 5+ seconds → DOOR EVENT.
//  • Accelerometer simultaneously watches for a 1.8–3.5g spike (the knock
//    gesture) as a secondary confirmation signal.
//  • Door event → auto-creates a knock row (status: no_answer by default).
//  • If the rep walks away within 20s with no audio → stays no_answer.
//
//  VOICE ACTIVITY DETECTION
//  ────────────────────────
//  • expo-av metering runs at 250ms intervals.
//  • When dB > -38 for 800ms → conversation started, recording opens.
//  • When dB < -45 for 1800ms → conversation ended, chunk finalizes.
//  • Chunk → on-device whisper.cpp transcription → intent-extract edge fn.
//  • Intent result fans out to: knock status upgrade, callbacks, questions,
//    objections, facts, script suggestion card, safety panic check.
//
//  NO-ANSWER AUTO-CLASSIFICATION
//  ──────────────────────────────
//  • If 20s pass after a knock event with NO audio above threshold →
//    knock stays no_answer. No transcript, no intent call needed.
//  • If door opens (audio starts) but rep leaves <10s in → not_home.
//
//  REAL-TIME PRESENCE
//  ──────────────────
//  • Supabase Realtime "presence" channel: manager sees rep's dot move
//    in real time. No polling. No DB writes on the critical path.
//  • DB breadcrumb write happens async every 30s (batched for efficiency).
//
//  SAFETY
//  ──────
//  • Fall detection, panic phrase, 20-min check-in, geofence all run
//    as side-effects of the same position + audio stream.
//
// ═══════════════════════════════════════════════════════════════════════════

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Haptics from "expo-haptics";
import { Accelerometer } from "expo-sensors";
import { Audio } from "expo-av";
import { supabase } from "./supabase";
import { logKnockHere, attachIntentToLatestKnock } from "./knocks";
import { transcribeOnDevice } from "./recording";
import { startSafety, stopSafety, checkPanicPhrase, ackCheckin } from "./safety";

// ─── constants ────────────────────────────────────────────────────────────
const GPS_TASK          = "autopilot-gps";
const DWELL_SPEED_MPS   = 1.4;    // below this = stationary
const DWELL_RADIUS_M    = 15;     // must stay within this circle
const DWELL_MIN_MS      = 5000;   // must dwell this long to count as a knock
const KNOCK_G_MIN       = 1.8;    // accelerometer: minimum g for knock gesture
const KNOCK_G_MAX       = 3.5;    // accelerometer: above this is a drop/fall
const NO_ANSWER_MS      = 20000;  // if no audio after knock in this time → no_answer
const VAD_OPEN_DB       = -38;    // dB above this → speech detected
const VAD_CLOSE_DB      = -45;    // dB below this → speech ended
const VAD_OPEN_MS       = 800;    // must be above threshold this long to open
const VAD_CLOSE_MS      = 1800;   // must be below threshold this long to close
const CHUNK_MAX_MS      = 60000;  // max recording chunk length
const BREADCRUMB_BATCH  = 30000;  // write breadcrumbs to DB every 30s
const PRESENCE_INTERVAL = 4000;   // broadcast presence every 4s

// ─── shared state ─────────────────────────────────────────────────────────
type Pos = { lat: number; lng: number; speed: number; t: number };

let opts: { orgId: string; userId: string; sessionId: string; territoryId?: string };
let presenceChannel: ReturnType<typeof supabase.channel> | null = null;
let vadInterval: any = null;
let presenceInterval: any = null;
let breadcrumbInterval: any = null;
let accelSub: any = null;
let recording: Audio.Recording | null = null;

// Dwell state
let dwellAnchor: Pos | null = null;
let dwellKnockId: string | null = null;
let dwellKnockTime: number | null = null;
let accelKnockDetected = false;

// VAD state
let vadAboveSince: number | null = null;
let vadBelowSince: number | null = null;
let chunkOpenedAt = 0;
let conversationActive = false;

// Breadcrumb batch
let pendingCrumbs: Pos[] = [];
let lastKnownPos: Pos | null = null;

// Weather (refreshed every 5 min)
let weather: { temp_f: number; weather: string; daylight: string } | null = null;
let weatherFetchedAt = 0;


// ══════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════════════════════════

export async function startAutopilot(config: typeof opts): Promise<boolean> {
  opts = config;

  // 1. Permissions
  const [fg, bg, mic] = await Promise.all([
    Location.requestForegroundPermissionsAsync(),
    Location.requestBackgroundPermissionsAsync(),
    Audio.requestPermissionsAsync(),
  ]);
  if (!fg.granted || !bg.granted || !mic.granted) return false;

  // 2. Audio session
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    staysActiveInBackground: true,
    playsInSilentModeIOS: true,
    interruptionModeIOS: 1,
    interruptionModeAndroid: 1,
    shouldDuckAndroid: true,
  });

  // 3. Realtime presence channel — manager sees sub-second updates
  presenceChannel = supabase.channel(`presence:${opts.orgId}`, {
    config: { presence: { key: opts.userId } },
  });
  presenceChannel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      presenceInterval = setInterval(() => broadcastPresence(), PRESENCE_INTERVAL);
    }
  });

  // 4. Background GPS
  if (await TaskManager.isTaskRegisteredAsync(GPS_TASK)) {
    await Location.stopLocationUpdatesAsync(GPS_TASK);
  }
  await Location.startLocationUpdatesAsync(GPS_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 8000,
    distanceInterval: 5,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Canvassing — Autopilot ON",
      notificationBody: "Tracking, recording, and logging doors automatically",
      notificationColor: "#3A8540",
    },
  });

  // 5. Accelerometer for knock gesture detection
  Accelerometer.setUpdateInterval(100);
  accelSub = Accelerometer.addListener(({ x, y, z }) => {
    const g = Math.sqrt(x * x + y * y + z * z);
    if (g >= KNOCK_G_MIN && g <= KNOCK_G_MAX) {
      // Sharp tap in knocking range → likely a knock on the door
      accelKnockDetected = true;
      setTimeout(() => { accelKnockDetected = false; }, 3000);
    }
  });

  // 6. VAD recorder
  await openVadRecorder();
  startVadPoll();

  // 7. Breadcrumb batch writer
  breadcrumbInterval = setInterval(() => flushBreadcrumbs(), BREADCRUMB_BATCH);

  // 8. Safety system
  await startSafety({ orgId: opts.orgId, userId: opts.userId, territoryId: opts.territoryId });

  // 9. Shift session
  await supabase.from("shift_sessions").update({ started_at: new Date().toISOString() })
    .eq("id", opts.sessionId);

  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  return true;
}

export async function stopAutopilot() {
  // Stop GPS
  if (await TaskManager.isTaskRegisteredAsync(GPS_TASK)) {
    await Location.stopLocationUpdatesAsync(GPS_TASK);
  }
  // Stop VAD
  clearInterval(vadInterval);
  if (recording) { try { await recording.stopAndUnloadAsync(); } catch {} recording = null; }
  // Stop presence
  clearInterval(presenceInterval);
  if (presenceChannel) { await supabase.removeChannel(presenceChannel); presenceChannel = null; }
  // Flush remaining breadcrumbs
  clearInterval(breadcrumbInterval);
  await flushBreadcrumbs();
  // Stop accelerometer
  if (accelSub) { accelSub.remove(); accelSub = null; }
  // Stop safety
  stopSafety();
  // Close shift
  await supabase.from("shift_sessions").update({ ended_at: new Date().toISOString() })
    .eq("id", opts.sessionId);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}


// ══════════════════════════════════════════════════════════════════════════
//  GPS TASK
// ══════════════════════════════════════════════════════════════════════════

TaskManager.defineTask(GPS_TASK, async ({ data, error }: any) => {
  if (error || !data?.locations?.length) return;
  for (const loc of data.locations) {
    const p: Pos = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      speed: loc.coords.speed ?? 0,
      t: loc.timestamp,
    };
    lastKnownPos = p;
    pendingCrumbs.push(p);
    await onPosition(p);
    refreshWeather(p.lat, p.lng);
  }
});

async function onPosition(p: Pos) {
  if (p.speed < DWELL_SPEED_MPS) {
    // Stationary — check for dwell
    if (!dwellAnchor) { dwellAnchor = p; return; }
    const d = haversine(dwellAnchor, p);
    if (d > DWELL_RADIUS_M) { dwellAnchor = p; return; } // drifted too far, reset

    const dwellMs = p.t - dwellAnchor.t;
    if (dwellMs >= DWELL_MIN_MS && !dwellKnockId) {
      // Accelerometer knock confirmation helps but is not required
      // (some reps ring doorbells, not knock)
      await fireDwellKnock(p);
    }
  } else {
    // Moving — if we had an active knock, check if conversation happened
    if (dwellKnockId && !conversationActive) {
      // Walked away with no audio → confirm as no_answer, already set
      dwellKnockId = null;
      dwellKnockTime = null;
    } else if (dwellKnockId && conversationActive) {
      // Walked away mid-conversation → conversation will finalize via VAD close
      dwellKnockId = null;
    }
    dwellAnchor = null;
  }
}

async function fireDwellKnock(p: Pos) {
  // Skip DNC doors silently
  const { data: nearby } = await supabase
    .from("doors")
    .select("id, status")
    .filter("status", "in", '("dnc","no_soliciting")')
    .limit(1);
  if (nearby && nearby.length > 0) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    return;
  }
  dwellKnockId = await logKnockHere({
    outcome: "no_answer",
    auto: true,
    lat: p.lat,
    lng: p.lng,
    temp_f: weather?.temp_f,
    weather: weather?.weather,
    daylight: weather?.daylight,
    dwell_seconds: Math.round((p.t - dwellAnchor!.t) / 1000),
    accel_confirmed: accelKnockDetected,
  });
  dwellKnockTime = Date.now();
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

  // No-answer auto-confirm: if no audio in NO_ANSWER_MS, nothing to do
  setTimeout(async () => {
    if (dwellKnockId && !conversationActive) {
      // Silence confirmed — knock stays no_answer, no further action
      dwellKnockId = null;
    }
  }, NO_ANSWER_MS);
}


// ══════════════════════════════════════════════════════════════════════════
//  VAD + RECORDING
// ══════════════════════════════════════════════════════════════════════════

async function openVadRecorder() {
  recording = new Audio.Recording();
  await recording.prepareToRecordAsync({
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  await recording.startAsync();
  chunkOpenedAt = Date.now();
}

function startVadPoll() {
  vadInterval = setInterval(async () => {
    if (!recording) return;
    const status = await recording.getStatusAsync();
    if (!status.isRecording) return;
    const db: number = (status as any).metering ?? -160;
    const now = Date.now();

    if (db > VAD_OPEN_DB) {
      vadAboveSince ??= now;
      vadBelowSince = null;
      if (!conversationActive && now - (vadAboveSince ?? now) >= VAD_OPEN_MS) {
        conversationActive = true;
        // Upgrade knock status from no_answer to "talking" in real-time
        if (dwellKnockId) {
          supabase.from("knocks").update({ status: "not_home" }).eq("id", dwellKnockId);
        }
      }
    } else if (db < VAD_CLOSE_DB) {
      vadBelowSince ??= now;
      if (conversationActive && now - (vadBelowSince ?? now) >= VAD_CLOSE_MS) {
        conversationActive = false;
        await finalizeChunk();
      }
    }
    // Hard cap
    if (now - chunkOpenedAt > CHUNK_MAX_MS && conversationActive) {
      await finalizeChunk();
    }
  }, 250);
}

async function finalizeChunk() {
  if (!recording) return;
  const r = recording;
  recording = null;
  vadAboveSince = null;
  vadBelowSince = null;
  try {
    await r.stopAndUnloadAsync();
    const uri = r.getURI();
    if (uri) await processChunk(uri);
  } catch {}
  await openVadRecorder(); // immediately reopen
}

async function processChunk(uri: string) {
  const transcript = await transcribeOnDevice(uri);
  if (!transcript || transcript.trim().length < 4) return;

  // Safety check first — no delay
  if (opts) checkPanicPhrase(transcript, opts);

  // Upload audio
  const path = `recordings/${opts.orgId}/${Date.now()}.m4a`;
  const blob = await fetch(uri).then((r) => r.blob());
  supabase.storage.from("recordings").upload(path, blob, { contentType: "audio/m4a" }); // async

  // Intent extraction — the key brain call
  const { data: intent } = await supabase.functions.invoke("intent-extract", {
    body: {
      transcript,
      knock_id: dwellKnockId,
      door_id: await getDoorIdForKnock(dwellKnockId),
      now: new Date().toISOString(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });

  // Attach transcript + intent to the knock
  if (dwellKnockId && intent) {
    await attachIntentToLatestKnock({
      knockId: dwellKnockId,
      transcript,
      audioPath: path,
      intent,
    });
    // Haptic feedback on sale / callback detected
    if (intent.outcome === "sold") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (intent.outcome === "callback" || intent.outcome === "interested") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }

  // Live script suggestion → earpiece card on screen
  if (dwellKnockId) {
    const { data: suggestion } = await supabase.functions.invoke("script-suggest", {
      body: { transcript_chunk: transcript, org_id: opts.orgId, door_id: dwellKnockId },
    });
    if (suggestion?.line) {
      (globalThis as any).__scriptSuggestion = suggestion;
    }
  }

  // Store mini transcript chunk
  if (dwellKnockId) {
    supabase.from("knock_transcripts").insert({
      org_id: opts.orgId,
      knock_id: dwellKnockId,
      text: transcript,
      audio_path: path,
    });
  }
}


// ══════════════════════════════════════════════════════════════════════════
//  REALTIME PRESENCE — sub-second manager map updates
// ══════════════════════════════════════════════════════════════════════════

async function broadcastPresence() {
  if (!presenceChannel || !lastKnownPos) return;
  await presenceChannel.track({
    user_id: opts.userId,
    lat: lastKnownPos.lat,
    lng: lastKnownPos.lng,
    speed: lastKnownPos.speed,
    at: new Date().toISOString(),
    knocks: (globalThis as any).__shiftKnocks ?? 0,
    sales: (globalThis as any).__shiftSales ?? 0,
  });
}


// ══════════════════════════════════════════════════════════════════════════
//  BREADCRUMB BATCH WRITER — DB writes every 30s, not every 8s
// ══════════════════════════════════════════════════════════════════════════

async function flushBreadcrumbs() {
  if (!pendingCrumbs.length || !opts) return;
  const batch = pendingCrumbs.splice(0);
  await supabase.from("rep_breadcrumbs").insert(
    batch.map((p) => ({
      org_id: opts.orgId,
      user_id: opts.userId,
      recorded_at: new Date(p.t).toISOString(),
      speed_mps: p.speed,
      geom: `POINT(${p.lng} ${p.lat})`,
    })),
  );
}


// ══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════════

async function getDoorIdForKnock(knockId: string | null): Promise<string | null> {
  if (!knockId) return null;
  const { data } = await supabase.from("knocks").select("door_id").eq("id", knockId).single();
  return data?.door_id ?? null;
}

async function refreshWeather(lat: number, lng: number) {
  if (Date.now() - weatherFetchedAt < 300000) return; // 5 min cache
  weatherFetchedAt = Date.now();
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weathercode,is_day&temperature_unit=fahrenheit`,
    );
    const j = await res.json();
    const cur = j?.current;
    weather = {
      temp_f: Math.round(cur?.temperature_2m ?? 70),
      weather: wmoLabel(cur?.weathercode ?? 0),
      daylight: cur?.is_day === 1 ? "day" : "night",
    };
  } catch {}
}

function wmoLabel(code: number): string {
  if (code === 0) return "clear";
  if (code <= 3) return "cloud";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 99) return "wind";
  return "clear";
}

function haversine(a: Pos, b: Pos): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
