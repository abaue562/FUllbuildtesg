"use client";
// DOOR DETAIL CLIENT — interactive audio playback, accordion knock cards,
// transcript bubbles, tab navigation.

import { useState, useRef } from "react";
import {
  MapPin, Phone, Home, AlertTriangle, Clock, Mic,
  ChevronDown, ChevronUp, Play, Pause, User, Calendar,
  ThumbsUp, ThumbsDown, HelpCircle, Tag, Star, Zap,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Knock = {
  id: string;
  created_at: string;
  status: string;
  sentiment: string | null;
  buying_signal: string | null;
  decision_maker_present: boolean | null;
  language: string | null;
  summary: string | null;
  auto: boolean;
  lat: number | null;
  lng: number | null;
  weather_temp_f: number | null;
  weather_condition: string | null;
  rep: { full_name: string; avatar_url: string | null } | null;
  knock_transcripts: { id: string; text: string; created_at: string }[];
  recordings: { id: string; storage_path: string; duration_ms: number; created_at: string }[];
  door_callbacks: {
    absolute_iso: string | null;
    relative_phrase: string | null;
    reason: string | null;
    decision_maker: string | null;
    confidence: number | null;
    resolved_at: string | null;
  }[];
};

type Door = {
  id: string;
  status: string;
  notes: string | null;
  no_solicit_ordinance: boolean | null;
  hoa: boolean | null;
  property_type: string | null;
  address: {
    line1: string; city: string; state: string; zip: string;
    lat: number | null; lng: number | null;
  } | null;
  score: { score: number; updated_at: string }[] | null;
  facts: { key: string; value: string; confidence: number; created_at: string }[];
  objections: { text: string; category: string; created_at: string }[];
  questions: { text: string; category: string; created_at: string }[];
  callbacks: {
    absolute_iso: string | null;
    relative_phrase: string | null;
    window_start: string | null;
    window_end: string | null;
    reason: string | null;
    decision_maker: string | null;
    confidence: number | null;
    resolved_at: string | null;
  }[];
};

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  not_home: "bg-gray-100 text-gray-700",
  answered: "bg-blue-100 text-blue-800",
  interested: "bg-green-100 text-green-800",
  not_interested: "bg-red-100 text-red-800",
  callback: "bg-yellow-100 text-yellow-800",
  sold: "bg-emerald-600 text-white",
  dnc: "bg-red-700 text-white",
};

const STATUS_LABELS: Record<string, string> = {
  not_home: "Not Home",
  answered: "Answered",
  interested: "Interested",
  not_interested: "Not Interested",
  callback: "Callback",
  sold: "Sold",
  dnc: "Do Not Contact",
};

const OBJECTION_COLORS: Record<string, string> = {
  price: "bg-red-100 text-red-700",
  timing: "bg-orange-100 text-orange-700",
  trust: "bg-purple-100 text-purple-700",
  competitor: "bg-blue-100 text-blue-700",
  need: "bg-gray-100 text-gray-700",
  decision_maker: "bg-yellow-100 text-yellow-800",
};

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DoorDetailClient({
  door,
  knocks,
  streetPhotoUrl,
}: {
  door: Door;
  knocks: Knock[];
  streetPhotoUrl: string | null;
}) {
  const [activeTab, setActiveTab] = useState<"history" | "facts" | "objections" | "questions">("history");

  const address = door.address;
  const addressLine = address
    ? `${address.line1}, ${address.city}, ${address.state} ${address.zip}`
    : "Unknown address";
  const score = door.score?.[0]?.score ?? null;
  const pendingCallback = door.callbacks?.find((c) => !c.resolved_at);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <MapPin size={18} className="text-gray-400 shrink-0" />
              <h1 className="text-xl font-bold text-gray-900 truncate">{addressLine}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[door.status] ?? "bg-gray-100 text-gray-700"}`}>
                {STATUS_LABELS[door.status] ?? door.status}
              </span>
              {score !== null && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                  <Zap size={11} /> {score}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {door.hoa && (
                <span className="text-xs text-orange-600 font-medium flex items-center gap-1">
                  <Home size={12} /> HOA
                </span>
              )}
              {door.no_solicit_ordinance && (
                <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                  <AlertTriangle size={12} /> No-Solicit Ordinance
                </span>
              )}
              {door.property_type && door.property_type !== "residential" && (
                <span className="text-xs text-gray-500 capitalize">{door.property_type}</span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm text-gray-500">{knocks.length} knock{knocks.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* ── Street View ── */}
        {streetPhotoUrl ? (
          <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-200 bg-black">
            <img
              src={streetPhotoUrl}
              alt="Street view"
              className="w-full h-64 object-cover"
            />
            <div className="px-4 py-2 bg-black/60 flex items-center gap-2">
              <MapPin size={13} className="text-gray-400" />
              <span className="text-xs text-gray-400">Mapillary street-level photo</span>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 h-48 flex items-center justify-center bg-white">
            <div className="text-center">
              <MapPin size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No street photo available</p>
              <p className="text-xs text-gray-300 mt-1">Set MAPILLARY_TOKEN in .env to enable</p>
            </div>
          </div>
        )}

        {/* ── Callback Banner ── */}
        {pendingCallback && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <Clock size={18} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Callback Scheduled
                {pendingCallback.decision_maker && ` · Ask for ${pendingCallback.decision_maker}`}
              </p>
              <p className="text-sm text-amber-700 mt-0.5">
                {pendingCallback.absolute_iso
                  ? new Date(pendingCallback.absolute_iso).toLocaleString()
                  : pendingCallback.relative_phrase}
                {pendingCallback.reason && ` — ${pendingCallback.reason}`}
              </p>
              {pendingCallback.confidence && (
                <div className="mt-1 flex items-center gap-1.5">
                  <div className="h-1.5 w-24 bg-amber-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{ width: `${pendingCallback.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-amber-600">
                    {Math.round((pendingCallback.confidence ?? 0) * 100)}% confidence
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Dog Warning ── */}
        {door.facts?.some((f) => f.key === "dog_warning") && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle size={18} className="text-orange-500 shrink-0" />
            <p className="text-sm font-semibold text-orange-800">
              Dog on property — be cautious approaching
            </p>
          </div>
        )}

        {/* ── Tab Nav ── */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {(["history", "facts", "objections", "questions"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold capitalize transition-all ${
                activeTab === tab
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
              {tab === "history" && knocks.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5">
                  {knocks.length}
                </span>
              )}
              {tab === "objections" && door.objections?.length > 0 && (
                <span className="ml-1.5 text-xs bg-red-100 text-red-600 rounded-full px-1.5 py-0.5">
                  {door.objections.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── History Tab ── */}
        {activeTab === "history" && (
          <div className="space-y-4">
            {knocks.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Home size={36} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">No knocks recorded yet</p>
              </div>
            ) : (
              knocks.map((knock) => (
                <KnockCard key={knock.id} knock={knock} />
              ))
            )}
          </div>
        )}

        {/* ── Facts Tab ── */}
        {activeTab === "facts" && (
          <div>
            {!door.facts?.length ? (
              <EmptyState icon={Tag} message="No facts captured yet" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {door.facts.map((fact, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                      {fact.key.replace(/_/g, " ")}
                    </p>
                    <p className="text-sm font-medium text-gray-900">{fact.value}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="h-1 w-16 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${fact.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">{Math.round(fact.confidence * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Objections Tab ── */}
        {activeTab === "objections" && (
          <div className="space-y-3">
            {!door.objections?.length ? (
              <EmptyState icon={ThumbsDown} message="No objections captured yet" />
            ) : (
              door.objections.map((obj, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-start gap-3">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${OBJECTION_COLORS[obj.category] ?? "bg-gray-100 text-gray-600"}`}>
                    {obj.category}
                  </span>
                  <p className="text-sm text-gray-800 pt-0.5">{obj.text}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Questions Tab ── */}
        {activeTab === "questions" && (
          <div className="space-y-3">
            {!door.questions?.length ? (
              <EmptyState icon={HelpCircle} message="No questions captured yet" />
            ) : (
              door.questions.map((q, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-start gap-3">
                  <HelpCircle size={16} className="text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-800">{q.text}</p>
                    <p className="text-xs text-gray-400 mt-1 capitalize">{q.category}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Knock Card ─────────────────────────────────────────────────────────────────

function KnockCard({ knock }: { knock: Knock }) {
  const [expanded, setExpanded] = useState(false);

  const callbackFromKnock = knock.door_callbacks?.[0];
  const transcript = knock.knock_transcripts?.[0]?.text ?? null;
  const recording = knock.recordings?.[0] ?? null;

  const statusColor: Record<string, string> = {
    sold: "bg-emerald-500",
    interested: "bg-blue-500",
    callback: "bg-yellow-500",
    not_interested: "bg-red-500",
    not_home: "bg-gray-400",
    answered: "bg-indigo-500",
    dnc: "bg-red-800",
  };

  const buyingSignalEmoji: Record<string, string> = {
    strong: "🔥",
    moderate: "👍",
    mild: "🤔",
    none: "❌",
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* ── Summary row (always visible) ── */}
      <div
        className="flex items-start gap-4 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Status dot */}
        <div className="mt-1 shrink-0">
          <div className={`w-3 h-3 rounded-full ${statusColor[knock.status] ?? "bg-gray-300"}`} />
        </div>

        <div className="flex-1 min-w-0">
          {/* First row: status, time, rep */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 capitalize">
              {STATUS_LABELS[knock.status] ?? knock.status}
            </span>
            {knock.buying_signal && knock.buying_signal !== "none" && (
              <span className="text-base" title={`Buying signal: ${knock.buying_signal}`}>
                {buyingSignalEmoji[knock.buying_signal] ?? ""}
              </span>
            )}
            {knock.decision_maker_present && (
              <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 font-semibold">
                DM Present
              </span>
            )}
            {knock.auto && (
              <span className="text-xs bg-indigo-50 text-indigo-500 rounded-full px-2 py-0.5">Auto</span>
            )}
          </div>

          {/* Summary */}
          {knock.summary && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{knock.summary}</p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-xs text-gray-400">
              {new Date(knock.created_at).toLocaleString()}
            </span>
            {knock.rep?.full_name && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <User size={11} /> {knock.rep.full_name}
              </span>
            )}
            {knock.weather_temp_f !== null && (
              <span className="text-xs text-gray-400">
                {knock.weather_temp_f}°F {knock.weather_condition}
              </span>
            )}
            {knock.language && knock.language !== "en" && (
              <span className="text-xs bg-blue-50 text-blue-600 rounded px-1.5">
                {knock.language.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 ml-2">
          {expanded ? (
            <ChevronUp size={18} className="text-gray-400" />
          ) : (
            <ChevronDown size={18} className="text-gray-400" />
          )}
        </div>
      </div>

      {/* ── Expandable detail ── */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">
          {/* Callback from this knock */}
          {callbackFromKnock && !callbackFromKnock.resolved_at && (
            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
              <Clock size={14} className="mt-0.5 shrink-0 text-amber-600" />
              <span>
                Callback:{" "}
                <strong>
                  {callbackFromKnock.absolute_iso
                    ? new Date(callbackFromKnock.absolute_iso).toLocaleString()
                    : callbackFromKnock.relative_phrase}
                </strong>
                {callbackFromKnock.reason && ` — ${callbackFromKnock.reason}`}
                {callbackFromKnock.decision_maker && ` (ask for ${callbackFromKnock.decision_maker})`}
              </span>
            </div>
          )}

          {/* Audio player */}
          {recording && (
            <AudioPlayer storagePath={recording.storage_path} durationMs={recording.duration_ms} />
          )}

          {/* Transcript */}
          {transcript ? (
            <TranscriptView text={transcript} />
          ) : (
            <div className="text-xs text-gray-400 italic flex items-center gap-1.5">
              <Mic size={13} /> No transcript available for this visit
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Audio Player ───────────────────────────────────────────────────────────────

function AudioPlayer({
  storagePath,
  durationMs,
}: {
  storagePath: string;
  durationMs: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadAndPlay() {
    if (signedUrl) {
      toggle();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/recordings/sign?path=${encodeURIComponent(storagePath)}`);
      const { url } = await res.json();
      setSignedUrl(url);
      setTimeout(() => {
        audioRef.current?.play().then(() => setPlaying(true));
      }, 100);
    } catch {}
    setLoading(false);
  }

  function toggle() {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().then(() => setPlaying(true));
    }
  }

  const durationSec = Math.round(durationMs / 1000);
  const progressSec = Math.round((progress / 100) * durationSec);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3">
      <button
        onClick={loadAndPlay}
        disabled={loading}
        className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 hover:bg-indigo-700 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : playing ? (
          <Pause size={16} />
        ) : (
          <Play size={16} className="ml-0.5" />
        )}
      </button>

      <div className="flex-1 space-y-1.5">
        <div className="relative h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{fmt(progressSec)}</span>
          <span>{fmt(durationSec)}</span>
        </div>
      </div>

      {signedUrl && (
        <audio
          ref={audioRef}
          src={signedUrl}
          onTimeUpdate={() => {
            if (audioRef.current) {
              setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
            }
          }}
          onEnded={() => { setPlaying(false); setProgress(0); }}
        />
      )}
    </div>
  );
}

// ── Transcript View ────────────────────────────────────────────────────────────

function TranscriptView({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const repMatch = l.match(/^\[REP\]\s+(.+)/);
      const custMatch = l.match(/^\[CUSTOMER\]\s+(.+)/);
      if (repMatch)  return { speaker: "REP"      as const, text: repMatch[1] };
      if (custMatch) return { speaker: "CUSTOMER" as const, text: custMatch[1] };
      return           { speaker: "UNKNOWN"   as const, text: l.trim() };
    });

  if (!lines.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
        <Mic size={12} /> Transcript
      </p>
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {lines.map((line, i) => {
          const isRep = line.speaker === "REP";
          return (
            <div
              key={i}
              className={`flex ${isRep ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  isRep
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : line.speaker === "CUSTOMER"
                    ? "bg-gray-100 text-gray-900 rounded-bl-sm"
                    : "bg-gray-50 text-gray-500 italic rounded-bl-sm"
                }`}
              >
                <p className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${
                  isRep ? "text-indigo-200" : "text-gray-400"
                }`}>
                  {isRep ? "Rep" : line.speaker === "CUSTOMER" ? "Customer" : "Unknown"}
                </p>
                {line.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <Icon size={36} className="mx-auto mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
