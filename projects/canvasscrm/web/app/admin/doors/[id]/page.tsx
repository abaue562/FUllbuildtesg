// WEB ADMIN — Door Detail Page
// Full door history visible to managers: street view, all knock cards,
// transcripts, audio playback, facts, objections, callbacks.
//
// Route: /admin/doors/[id]
// Mirrors mobile app/door/[id].tsx but runs in Next.js 15 with full history.

import { createClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import Image from "next/image";
import DoorDetailClient from "./client";

export const dynamic = "force-dynamic";

export default async function DoorDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  // ── Load door + address + all nested data ─────────────────────────────────
  const { data: door, error } = await supabase
    .from("doors")
    .select(`
      *,
      address:addresses(*),
      score:door_scores(score, updated_at),
      facts:door_facts(key, value, confidence, created_at),
      objections:door_objections(text, category, created_at),
      questions:door_questions(text, category, created_at),
      callbacks:door_callbacks(
        absolute_iso, relative_phrase, window_start, window_end,
        reason, decision_maker, confidence, resolved_at
      ),
      knocks(
        id, created_at, status, sentiment, buying_signal,
        decision_maker_present, language, summary, auto,
        lat, lng, weather_temp_f, weather_condition,
        rep_id, rep:users(full_name, avatar_url),
        knock_transcripts(id, text, created_at),
        recordings(id, storage_path, duration_ms, created_at),
        door_callbacks(
          absolute_iso, relative_phrase, reason, decision_maker,
          confidence, resolved_at
        )
      )
    `)
    .eq("id", params.id)
    .single();

  if (error || !door) notFound();

  // Sort knocks newest first
  const knocks = (door.knocks ?? []).sort(
    (a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // ── Street view (Mapillary) — server-side fetch ───────────────────────────
  let streetPhotoUrl: string | null = null;
  const mapillaryToken = process.env.MAPILLARY_TOKEN;
  if (mapillaryToken && door.address?.lat && door.address?.lng) {
    try {
      const degPerMeter = 1 / 111320;
      const delta = 50 * degPerMeter;
      const bbox = [
        door.address.lng - delta,
        door.address.lat - delta,
        door.address.lng + delta,
        door.address.lat + delta,
      ].join(",");
      const res = await fetch(
        `https://graph.mapillary.com/images?fields=id,thumb_1024_url&bbox=${bbox}&limit=1&access_token=${mapillaryToken}`,
        { next: { revalidate: 86400 } } // cache 24h — street photos rarely change
      );
      const json = await res.json();
      streetPhotoUrl = json?.data?.[0]?.thumb_1024_url ?? null;
    } catch {}
  }

  return (
    <DoorDetailClient
      door={door}
      knocks={knocks}
      streetPhotoUrl={streetPhotoUrl}
    />
  );
}
