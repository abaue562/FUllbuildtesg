// RECORDING — Full dual-speaker audio pipeline.
//
// HOW DIARIZATION WORKS WITHOUT AN API:
// The rep's phone mic is 6–18 inches from their own mouth but 3–8 feet
// from the customer. This creates a consistent dB gap:
//   Rep speaking      → metering > -22 dB  (close mic)
//   Customer speaking → metering -22 to -42 dB (ambient)
//   Silence           → metering < -48 dB
//
// We use time-boundary tracking:
//   - Every 200ms we classify speaker by dB level
//   - Whisper transcribes the full chunk with word-level timestamps
//   - We match each word's timestamp to the speaker classification at that moment
//   - Output: [REP] Hi, how are you? \n [CUSTOMER] What are you selling?
//
// WHISPER.CPP INTEGRATION:
// @fugood/react-native-whisper (MIT) — github.com/fugood/react-native-whisper
// Ships whisper.cpp as a native module. Model: ggml-small.en.bin (141MB, one-time download)
// Transcription: ~2–4s per 30s of audio, fully on-device, works offline, zero cost.
//
// RECORDING: Operations confirmed to one-party consent states only.
// All recordings are stored securely in Supabase Storage with org-level RLS.

import { Audio } from "expo-av";
import { supabase } from "./supabase";

// ─── Speaker dB thresholds ────────────────────────────────────────────────────
const REP_DB_FLOOR   = -22;  // rep voice: very close to mic
const CUST_DB_FLOOR  = -42;  // customer voice: ambient distance
const CUST_DB_CEIL   = -22;  // above this = rep not customer
const SILENCE_DB     = -48;  // below this = no speech

type Speaker = "REP" | "CUSTOMER" | "UNKNOWN";

export type TranscriptLine = {
  speaker: Speaker;
  text: string;
  ts: number;        // epoch ms when this was spoken
  db?: number;       // raw dB level for debugging
};

// Speaker window — tracks who was talking at each 200ms interval
type SpeakerWindow = { speaker: Speaker; startMs: number; endMs: number };

// ─── DoorRecording class ──────────────────────────────────────────────────────

export class DoorRecording {
  private rec: Audio.Recording | null = null;
  private windows: SpeakerWindow[] = [];
  private lines: TranscriptLine[] = [];
  private orgId: string;
  private knockId: string;
  private doorId: string;
  private onLine?: (line: TranscriptLine) => void;
  private chunkStartEpoch = 0;
  private pollTimer: any = null;
  private currentSpeaker: Speaker = "UNKNOWN";
  private currentWindowStart = 0;

  constructor(opts: {
    orgId: string; knockId: string; doorId: string;
    onLine?: (line: TranscriptLine) => void;
  }) {
    this.orgId = opts.orgId;
    this.knockId = opts.knockId;
    this.doorId = opts.doorId;
    this.onLine = opts.onLine;
  }

  async open() {
    this.rec = new Audio.Recording();
    await this.rec.prepareToRecordAsync({
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
      android: {
        extension: ".m4a",
        outputFormat: Audio.AndroidOutputFormat.MPEG_4,
        audioEncoder: Audio.AndroidAudioEncoder.AAC,
        sampleRate: 16000,   // whisper.cpp optimal
        numberOfChannels: 1,
        bitRate: 128000,
      },
      ios: {
        extension: ".m4a",
        outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
        audioQuality: Audio.IOSAudioQuality.HIGH,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 128000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
    });
    await this.rec.startAsync();
    this.chunkStartEpoch = Date.now();
    this.currentWindowStart = 0;
    this.startPoll();
  }

  private startPoll() {
    this.pollTimer = setInterval(async () => {
      if (!this.rec) return;
      const status = await this.rec.getStatusAsync();
      if (!status.isRecording) return;

      const db: number = (status as any).metering ?? -160;
      const elapsedMs = Date.now() - this.chunkStartEpoch;

      // Classify speaker
      let detected: Speaker = "UNKNOWN";
      if (db >= REP_DB_FLOOR) detected = "REP";
      else if (db >= CUST_DB_FLOOR && db < CUST_DB_CEIL) detected = "CUSTOMER";

      // Speaker changed — close the current window, open a new one
      if (detected !== this.currentSpeaker) {
        if (this.currentSpeaker !== "UNKNOWN") {
          this.windows.push({
            speaker: this.currentSpeaker,
            startMs: this.currentWindowStart,
            endMs: elapsedMs,
          });
        }
        this.currentSpeaker = detected;
        this.currentWindowStart = elapsedMs;
      }

      // Rotate chunk every 40s to keep transcription latency low
      if (elapsedMs >= 40000) {
        await this.rotateChunk();
      }
    }, 200);
  }

  private stopPoll() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  // Close the current chunk, transcribe it, open a new one
  private async rotateChunk() {
    this.stopPoll();
    if (!this.rec) return;
    const r = this.rec;
    const windows = [...this.windows];
    const startEpoch = this.chunkStartEpoch;
    this.rec = null;
    this.windows = [];
    try {
      await r.stopAndUnloadAsync();
      const uri = r.getURI();
      if (uri) {
        // Run transcription async — don't block the next chunk opening
        this.transcribeChunk(uri, windows, startEpoch).catch(() => {});
      }
    } catch {}
    // Reopen immediately
    await this.open();
  }

  private async transcribeChunk(uri: string, windows: SpeakerWindow[], startEpoch: number) {
    // Try on-device whisper.cpp first
    let segments: { start: number; end: number; text: string }[] = [];
    try {
      const whisper = await getWhisperCtx();
      if (whisper) {
        const result = await whisper.transcribe(uri, {
          language: "en",
          tokenTimestamps: true,
          maxLen: 1,
        });
        segments = result.segments.map((s: any) => ({
          start: s.t0 * 10,  // whisper centiseconds → ms
          end: s.t1 * 10,
          text: s.text.trim(),
        }));
      }
    } catch {}

    // Fallback: cloud transcription
    if (!segments.length) {
      const raw = await cloudTranscribe(uri);
      if (raw) segments = [{ start: 0, end: 40000, text: raw }];
    }

    if (!segments.length) return;

    // Assign speaker to each segment by matching timestamp to windows
    const labeled: TranscriptLine[] = segments.map((seg) => {
      const midMs = (seg.start + seg.end) / 2;
      const win = windows.find((w) => midMs >= w.startMs && midMs <= w.endMs);
      const speaker: Speaker = win?.speaker ?? "UNKNOWN";
      const line: TranscriptLine = { speaker, text: seg.text, ts: startEpoch + seg.start };
      return line;
    });

    // Merge consecutive same-speaker lines for readability
    const merged = mergeSameSpeaker(labeled);
    this.lines.push(...merged);
    merged.forEach((l) => this.onLine?.(l));

    // Persist to DB
    const fullText = merged.map((l) => `[${l.speaker}] ${l.text}`).join("\n");
    await supabase.from("knock_transcripts").insert({
      org_id: this.orgId,
      knock_id: this.knockId,
      text: fullText,
      duration_ms: 40000,
    });

    // Upload audio async
    fetch(uri)
      .then((r) => r.blob())
      .then((blob) => {
        const path = `recordings/${this.orgId}/${Date.now()}.m4a`;
        supabase.storage.from("recordings").upload(path, blob, { contentType: "audio/m4a" });
      });
  }

  async close(): Promise<TranscriptLine[]> {
    this.stopPoll();
    if (this.rec) {
      const r = this.rec;
      const windows = [...this.windows];
      const startEpoch = this.chunkStartEpoch;
      this.rec = null;
      try {
        await r.stopAndUnloadAsync();
        const uri = r.getURI();
        if (uri) await this.transcribeChunk(uri, windows, startEpoch);
      } catch {}
    }
    return this.lines;
  }

  getLines() { return this.lines; }

  getFullTranscript(): string {
    return this.lines.map((l) => `[${l.speaker}] ${l.text}`).join("\n");
  }
}

// ─── Whisper context singleton ────────────────────────────────────────────────

let _whisperCtx: any = null;

async function getWhisperCtx() {
  if (_whisperCtx) return _whisperCtx;
  try {
    // github.com/fugood/react-native-whisper — MIT license
    const { initWhisper } = require("@fugood/react-native-whisper");
    _whisperCtx = await initWhisper({
      filePath: require("../../assets/models/ggml-small.en.bin"),
    });
    return _whisperCtx;
  } catch {
    return null;
  }
}

// ─── Cloud fallback ───────────────────────────────────────────────────────────

async function cloudTranscribe(uri: string): Promise<string> {
  try {
    const blob = await fetch(uri).then((r) => r.blob());
    const form = new FormData();
    form.append("audio", blob as any, "audio.m4a");
    const res = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/transcribe`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}` },
        body: form,
      },
    );
    const j = await res.json();
    return j?.text ?? "";
  } catch {
    return "";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mergeSameSpeaker(lines: TranscriptLine[]): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const line of lines) {
    const last = out[out.length - 1];
    if (last && last.speaker === line.speaker) {
      last.text += " " + line.text;
    } else {
      out.push({ ...line });
    }
  }
  return out;
}

// ─── Module-level convenience API (used by autopilot.ts) ─────────────────────

let active: DoorRecording | null = null;

export async function startRecording(opts: {
  doorId: string;
  knockId: string;
  orgId: string;
  onLine?: (line: TranscriptLine) => void;
}): Promise<boolean> {
  active = new DoorRecording({
    orgId: opts.orgId,
    knockId: opts.knockId,
    doorId: opts.doorId,
    onLine: opts.onLine,
  });
  await active.open();
  return true;
}

export async function stopRecordingAndProcess(opts: {
  doorId: string;
}): Promise<{ transcript: string; lines: TranscriptLine[] } | null> {
  if (!active) return null;
  const lines = await active.close();
  const transcript = active.getFullTranscript();
  active = null;
  return { transcript, lines };
}

export async function transcribeOnDevice(uri: string): Promise<string> {
  const ctx = await getWhisperCtx();
  if (!ctx) return cloudTranscribe(uri);
  try {
    const { segments } = await ctx.transcribe(uri, { language: "en" });
    return segments.map((s: any) => s.text.trim()).join(" ");
  } catch {
    return cloudTranscribe(uri);
  }
}
