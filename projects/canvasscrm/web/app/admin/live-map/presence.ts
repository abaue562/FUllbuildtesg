// MANAGER PRESENCE RECEIVER
// Listens to the Supabase Realtime presence channel and calls back
// with sub-second rep location updates. Used by the live-map page
// to move pins without any DB polling.

import { createClient } from "@supabase/supabase-js";

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export type RepPresence = {
  user_id: string;
  lat: number;
  lng: number;
  speed: number;
  at: string;
  knocks: number;
  sales: number;
};

export function subscribeToPresence(
  orgId: string,
  onUpdate: (reps: Record<string, RepPresence>) => void,
) {
  const channel = supa.channel(`presence:${orgId}`, {
    config: { presence: { key: "manager" } },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<RepPresence>();
      const flat: Record<string, RepPresence> = {};
      for (const [key, presences] of Object.entries(state)) {
        // Each key is a user_id — take the most recent presence
        const sorted = (presences as RepPresence[]).sort(
          (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
        );
        flat[key] = sorted[0];
      }
      onUpdate(flat);
    })
    .on("presence", { event: "join" }, ({ newPresences }) => {
      // Trigger a sync to get the full updated state
      const state = channel.presenceState<RepPresence>();
      const flat: Record<string, RepPresence> = {};
      for (const [key, presences] of Object.entries(state)) {
        const sorted = (presences as RepPresence[]).sort(
          (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
        );
        flat[key] = sorted[0];
      }
      onUpdate(flat);
    })
    .on("presence", { event: "leave" }, ({ leftPresences }) => {
      const state = channel.presenceState<RepPresence>();
      const flat: Record<string, RepPresence> = {};
      for (const [key, presences] of Object.entries(state)) {
        const sorted = (presences as RepPresence[]).sort(
          (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
        );
        flat[key] = sorted[0];
      }
      onUpdate(flat);
    })
    .subscribe();

  return () => supa.removeChannel(channel);
}
