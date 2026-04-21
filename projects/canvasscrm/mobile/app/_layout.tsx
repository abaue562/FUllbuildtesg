import { Stack } from "expo-router";
import { useEffect } from "react";
import { startBackgroundTracking } from "@/lib/tracking";
import "../global.css";

export default function RootLayout() {
  useEffect(() => { startBackgroundTracking(); }, []);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="door/[id]" options={{ presentation: "modal" }} />
      <Stack.Screen name="stats" />
    </Stack>
  );
}
