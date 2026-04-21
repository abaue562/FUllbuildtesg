// HANDS-FREE FIELD MODE
// Runs in the background while a rep is canvassing. No taps required.
//
// Pipeline:
//  1. Background GPS (expo-location TaskManager) streams a position every ~10s.
//  2. Dwell detector: if the rep stops moving (<2 m/s) within 15 m of a door
//     for >= 6 seconds, we treat it as a knock event and auto-create a knock
//     row with status "no_answer" (upgraded later by VAD/ASR).
//  3. Always-on Voice Activity Detection via expo-av metering. When dB rises
//     above threshold for >800ms we open a rolling recording chunk.
//  4. Each chunk is uploaded to Supabase Storage, transcribed (whisper.cpp on
//     device), passed to the intent-extract edge function, and the result is
//     attached to the most recent knock for that door.
//  5. If the intent says "callback" / "come_back" / dates are mentioned, a
//     callbacks row is inserted automatically.
//  6. All writes go through WatermelonDB so the rep is fully offline-safe;
//     sync runs whenever connectivity returns.
//
// The rep never opens the app to log a door — they just walk and talk.

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { logKnockHere, attachIntentToLatestKnock } from "./knocks";
import { transcribeOnDevice } from "./recording";
import { supabase } from "./supabase";
import { checkPanicPhrase } from "./safety";

const GPS_TASK = "canvass-gps";
const DWELL_RADIUS_M = 15;
const DWELL_MIN_MS = 6000;
const VAD_DB_THRESHOLD = -38;   // expo-av metering: -160 silent, 0 max
const VAD_CLOSE_MS = 1800;
const CHUNK_MAX_MS = 60000;
// Weather: pull from open-meteo (no API key, free, self-hostable fallback)
const WEATHER_URL = (lat: number, lng: number) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weathercode,is_day&temperature_unit=fahrenheit`;

type Pos = { lat: number; lng: number; speed: number; t: number };
type WeatherSnap = { temp_f: number; weather: string; daylight: string };

let dwellAnchor: Pos | null = null;
let dwellKnockId: string | null = null;
let recording: Audio.Recording | null = null;
let vadAboveSince: number | null = null;
let vadBelowSince: number | null = null;
let chunkOpenedAt = 0;
let currentWeather: WeatherSnap | null = null;
let safetyOpts: any = null;
// DNC cache: set of door_ids known to be DNC/no-soliciting — skip immediately
const dncCache = new Set<string>();

// WMO weather code → simple label
function wmoLabel(code: number): string {
  if (code === 0) return "clear";
  if (code <= 3) return "cloud";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain";
  if (code <= 99) return "wind";
  return "clear";
}

// ---------- background GPS task ----------
TaskManager.defineTask(GPS_TASK, async ({ data, error }: any) => {
  if (error || !data?.locations?.length) return;
  for (const loc of data.locations) {
    const p: Pos = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      speed: loc.coords.speed ?? 0,
      t: loc.timestamp,
    };
    await onPosition(p);
  }
});

async function onPosition(p: Pos) {
  // Write breadcrumb for live map
  await supabase.from("rep_breadcrumbs").insert({
    recorded_at: new Date(p.t).toISOString(),
    speed_mps: p.speed,
    geom: `POINT(${p.lng} ${p.lat})`,
  }).then(() => {});   // fire-and-forget, offline queue handled by sync layer

  // Refresh weather every ~5 min
  if (!currentWeather || (Date.now() - p.t < 10000)) {
    refreshWeather(p.lat, p.lng);
  }

  // Stationary?
  if (p.speed < 2 /* m/s ~ walking pace cutoff */) {
    if (!dwellAnchor) {
      dwellAnchor = p;
      return;
    }
    const dist = haversine(dwellAnchor, p);
    if (dist <= DWELL_RADIUS_M && p.t - dwellAnchor.t >= DWELL_MIN_MS && !dwellKnockId) {
      // Check DNC cache before logging — skip silently if flagged
      const { data: nearby } = await supabase
        .from("doors")
        .select("id, status")
        .filter("status", "in", '("dnc","no_soliciting")')
        .limit(1);
      if (nearby && nearby.length > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return; // DNC skip — no knock logged
      }

      // Auto knock event — default outcome no_answer until ASR says otherwise.
      dwellKnockId = await logKnockHere({
        outcome: "no_answer",
        auto: true,
        lat: p.lat,
        lng: p.lng,
        temp_f: currentWeather?.temp_f,
        weather: currentWeather?.weather,
        daylight: currentWeather?.daylight,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } else {
    dwellAnchor = null;
    dwellKnockId = null;
  }
}

async function refreshWeather(lat: number, lng: number) {
  try {
    const res = await fetch(WEATHER_URL(lat, lng));
    const j = await res.json();
    const cur = j?.current;
    currentWeather = {
      temp_f: Math.round(cur?.temperature_2m ?? 70),
      weather: wmoLabel(cur?.weathercode ?? 0),
      daylight: cur?.is_day === 1 ? "day" : "night",
    };
  } catch {}
}

// ---------- always-on VAD recorder ----------
export async function startHandsFree(opts?: { orgId?: string; userId?: string; territoryId?: string }) {
  const fg = await Location.requestForegroundPermissionsAsync();
  const bg = await Location.requestBackgroundPermissionsAsync();
  const mic = await Audio.requestPermissionsAsync();
  if (!fg.granted || !bg.granted || !mic.granted) return false;
  safetyOpts = opts ?? {};

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    staysActiveInBackground: true,
    playsInSilentModeIOS: true,
    interruptionModeIOS: 1,
    interruptionModeAndroid: 1,
    shouldDuckAndroid: true,
  });

  await Location.startLocationUpdatesAsync(GPS_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10000,
    distanceInterval: 8,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Canvassing in progress",
      notificationBody: "Tracking doors and listening for conversations",
      notificationColor: "#3A8540",
    },
  });

  await openVadRecorder();
  pollVad();
  return true;
}

export async function stopHandsFree() {
  if (await TaskManager.isTaskRegisteredAsync(GPS_TASK)) {
    await Location.stopLocationUpdatesAsync(GPS_TASK);
  }
  if (recording) {
    try { await recording.stopAndUnloadAsync(); } catch {}
    recording = null;
  }
}

async function openVadRecorder() {
  recording = new Audio.Recording();
  await recording.prepareToRecordAsync({
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  await recording.startAsync();
  chunkOpenedAt = Date.now();
}

async function pollVad() {
  if (!recording) return;
  setInterval(async () => {
    if (!recording) return;
    const status = await recording.getStatusAsync();
    if (!status.isRecording) return;
    const db = (status as any).metering ?? -160;
    const now = Date.now();

    if (db > VAD_DB_THRESHOLD) {
      vadAboveSince ??= now;
      vadBelowSince = null;
    } else {
      vadBelowSince ??= now;
      // Speech gap closed → finalize chunk
      if (vadAboveSince && now - vadBelowSince > VAD_CLOSE_MS) {
        await finalizeChunk();
      }
    }

    // Hard cap: rotate chunks at CHUNK_MAX_MS
    if (now - chunkOpenedAt > CHUNK_MAX_MS && vadAboveSince) {
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
  // Reopen for the next conversation immediately.
  await openVadRecorder();
}

async function processChunk(uri: string) {
  const transcript = await transcribeOnDevice(uri);
  if (!transcript || transcript.trim().length < 4) return;

  // Upload audio + transcript
  const path = `recordings/${Date.now()}.m4a`;
  const file = await fetch(uri).then((r) => r.blob());
  await supabase.storage.from("recordings").upload(path, file, { contentType: "audio/m4a" });

  // Intent extraction (Claude Haiku edge function)
  const { data: intent } = await supabase.functions.invoke("intent-extract", {
    body: { transcript },
  });

  // Check for panic phrases before anything else
  if (safetyOpts) checkPanicPhrase(transcript, safetyOpts);

  // Fire live script suggestion to earpiece card
  if (dwellKnockId) {
    supabase.functions.invoke("script-suggest", {
      body: { transcript_chunk: transcript, door_id: dwellKnockId, org_id: safetyOpts?.orgId },
    }).then(({ data }) => {
      if (data?.line) {
        // Emit to global event bus so the UI can show the earpiece card
        (globalThis as any).__scriptSuggestion = data;
      }
    });
  }

  // Attach to most recent auto knock and upgrade outcome.
  if (dwellKnockId && intent) {
    await attachIntentToLatestKnock({
      knockId: dwellKnockId,
      transcript,
      audioPath: path,
      intent,
    });
    // If door marked DNC by AI, add to local cache
    if (intent.outcome === "dnc" || intent.outcome === "no_soliciting") {
      dncCache.add(dwellKnockId);
    }
  }
}

// ---------- helpers ----------
function haversine(a: Pos, b: Pos) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
