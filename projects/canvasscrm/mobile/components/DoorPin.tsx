// One pin per door. Color = status. Tap opens the door detail modal.
import MapLibreGL from "@maplibre/maplibre-react-native";
import { View } from "react-native";

const COLOR: Record<string, string> = {
  unknocked: "#52525b",
  no_answer: "#71717a",
  not_home: "#a1a1aa",
  callback: "#f59e0b",
  interested: "#0ea5e9",
  sold: "#10b981",
  not_interested: "#f43f5e",
  dnc: "#000",
  no_soliciting: "#7c3aed",
};

export function DoorPin({ door, onPress }: any) {
  return (
    <MapLibreGL.PointAnnotation
      id={door.id}
      coordinate={[door.lng, door.lat]}
      onSelected={onPress}
    >
      <View
        style={{
          width: 18, height: 18, borderRadius: 9,
          backgroundColor: COLOR[door.status] ?? "#52525b",
          borderWidth: 2, borderColor: "white",
        }}
      />
    </MapLibreGL.PointAnnotation>
  );
}
