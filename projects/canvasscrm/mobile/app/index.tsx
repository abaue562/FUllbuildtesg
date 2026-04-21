// HOME SCREEN — the only screen reps see most of the day.
// Goal: open phone, see map, tap a door, log outcome in <2 seconds.
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import MapLibreGL from "@maplibre/maplibre-react-native";
import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { useDoorsNearMe } from "@/lib/hooks";
import { DoorPin } from "@/components/DoorPin";
import { QuickLogBar } from "@/components/QuickLogBar";
import { TodayBadge } from "@/components/TodayBadge";

MapLibreGL.setAccessToken(null); // self-hosted tiles, no token

export default function Home() {
  const router = useRouter();
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const doors = useDoorsNearMe(coords, 200); // 200m radius

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({});
      setCoords([loc.coords.longitude, loc.coords.latitude]);
    })();
  }, []);

  return (
    <View className="flex-1 bg-black">
      {/* MAP — the entire background */}
      <MapLibreGL.MapView
        style={{ flex: 1 }}
        styleURL="https://tiles.canvasscrm.app/styles/streets/style.json"
        compassEnabled
        logoEnabled={false}
      >
        <MapLibreGL.UserLocation visible androidRenderMode="gps" />
        {coords && (
          <MapLibreGL.Camera
            zoomLevel={18}
            centerCoordinate={coords}
            followUserLocation
            followUserMode="compass"
          />
        )}
        {doors.map((d) => (
          <DoorPin key={d.id} door={d} onPress={() => router.push(`/door/${d.id}`)} />
        ))}
      </MapLibreGL.MapView>

      {/* TOP — today's count, single tap to open stats */}
      <Pressable onPress={() => router.push("/stats")} className="absolute top-12 left-4 right-4">
        <TodayBadge />
      </Pressable>

      {/* BOTTOM — quick log bar for the door rep is currently at */}
      <QuickLogBar coords={coords} />
    </View>
  );
}
