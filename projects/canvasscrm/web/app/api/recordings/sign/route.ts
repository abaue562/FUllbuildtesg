// API — Sign a Supabase Storage recording URL (60-minute expiry).
// Managers need this to play audio from the door detail page.
// The path comes from the recordings table storage_path column.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "missing path" }, { status: 400 });

  const supabase = createClient();

  // Verify the user is authenticated and in an org that owns this recording
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Check the path belongs to the user's org (path format: recordings/{orgId}/{filename})
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) return NextResponse.json({ error: "no org" }, { status: 403 });

  // Verify path is scoped to the org
  if (!path.includes(profile.org_id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.storage
    .from("recordings")
    .createSignedUrl(path, 3600); // 1-hour expiry

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "could not sign url" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
