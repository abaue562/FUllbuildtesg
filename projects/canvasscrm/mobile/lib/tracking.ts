// Background GPS — drops a breadcrumb every 15s while rep is on shift.
// Powers the "where has each canvasser been" map for managers.
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { db } from "@/db";

export const TASK = "canvasscrm-bg-location";

TaskManager.defineTask(TASK, async ({ data, error }: any) => {
  if (error || !data?.locations?.length) return;
  const breadcrumbs = db.get("breadcrumbs");
  await db.write(async () => {
    for (const loc of data.locations) {
      await breadcrumbs.create((b: any) => {
        b.lng = loc.coords.longitude;
        b.lat = loc.coords.latitude;
        b.accuracy = loc.coords.accuracy;
        b.recordedAt = loc.timestamp;
        b.synced = false;
      });
    }
  });
});

export async function startBackgroundTracking() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return;
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") return;

  const started = await Location.hasStartedLocationUpdatesAsync(TASK);
  if (started) return;
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15000,
    distanceInterval: 10,
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: "CanvassCRM tracking your route",
      notificationBody: "Tap to open",
    },
  });
}
