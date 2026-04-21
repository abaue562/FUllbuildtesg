// STREET VIEW — Mapillary API (MIT license, free, open source street photos)
// github.com/mapillary/mapillary-js
//
// Mapillary is a community-driven street-level photo platform.
// Coverage in the US is excellent in suburbs and residential areas.
// API is free with a free account. No per-load cost.
//
// How it works:
//  1. Rep taps a door pin on the map
//  2. We call Mapillary's Images API with the door's lat/lng
//  3. Mapillary returns the closest street-level photo(s)
//  4. We show the photo in the door detail drawer so the rep can
//     visually confirm they're at the right house before knocking
//  5. On the web admin, managers can browse the street view alongside
//     the door's knock history and transcript data

const MAPILLARY_BASE = "https://graph.mapillary.com";

export type StreetPhoto = {
  id: string;
  thumb_url: string;      // 320px thumbnail
  full_url: string;       // 1024px full image
  captured_at: string;    // when the photo was taken
  lat: number;
  lng: number;
  compass_angle: number;  // direction the camera was facing
};

export async function getStreetPhotos(
  lat: number,
  lng: number,
  radiusM = 50,
): Promise<StreetPhoto[]> {
  const token = process.env.EXPO_PUBLIC_MAPILLARY_TOKEN;
  if (!token) return [];

  try {
    const bbox = latLngToBbox(lat, lng, radiusM);
    const url = new URL(`${MAPILLARY_BASE}/images`);
    url.searchParams.set("fields", "id,thumb_1024_url,thumb_320_url,captured_at,geometry,compass_angle");
    url.searchParams.set("bbox", bbox);
    url.searchParams.set("limit", "5");
    url.searchParams.set("access_token", token);

    const res = await fetch(url.toString());
    const json = await res.json();

    return (json.data ?? []).map((img: any) => ({
      id: img.id,
      thumb_url: img.thumb_320_url,
      full_url: img.thumb_1024_url,
      captured_at: img.captured_at,
      lat: img.geometry?.coordinates?.[1] ?? lat,
      lng: img.geometry?.coordinates?.[0] ?? lng,
      compass_angle: img.compass_angle ?? 0,
    }));
  } catch {
    return [];
  }
}

// Convert lat/lng + radius to bounding box string for Mapillary API
function latLngToBbox(lat: number, lng: number, radiusM: number): string {
  const degPerMeter = 1 / 111320;
  const delta = radiusM * degPerMeter;
  const west  = lng - delta;
  const south = lat - delta;
  const east  = lng + delta;
  const north = lat + delta;
  return `${west},${south},${east},${north}`;
}
