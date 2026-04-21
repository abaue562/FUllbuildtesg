// Logging a knock = upsert door + append knock + audit. Works offline via WatermelonDB.
import { db } from "@/db";
import { Q } from "@nozbe/watermelondb";

export async function logKnockHere({ outcome, lng, lat, recordingId }: any) {
  const doors = db.get("doors");
  const knocks = db.get("knocks");

  // Find nearest door within 15m, else create new
  const nearby = await doors.query(
    Q.where("lat", Q.between(lat - 0.0002, lat + 0.0002)),
    Q.where("lng", Q.between(lng - 0.0002, lng + 0.0002)),
  ).fetch();

  await db.write(async () => {
    let door = nearby[0];
    if (!door) {
      door = await doors.create((d: any) => {
        d.lng = lng; d.lat = lat; d.status = outcome; d.synced = false;
      });
    } else {
      await door.update((d: any) => { d.status = outcome; d.synced = false; });
    }
    await knocks.create((k: any) => {
      k.doorId = door.id; k.outcome = outcome;
      k.lng = lng; k.lat = lat;
      k.recordingId = recordingId;
      k.occurredAt = Date.now();
      k.synced = false;
    });
  });
}
