// The 6 buttons reps actually use. Big targets, haptic feedback, < 200ms tap latency.
import { View, Pressable, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { logKnockHere } from "@/lib/knocks";
import { startRecording, stopRecording, isRecording } from "@/lib/recording";
import { useState } from "react";

const BUTTONS = [
  { key: "no_answer",      label: "No\nAnswer",  color: "bg-zinc-700" },
  { key: "not_home",       label: "Not\nHome",   color: "bg-zinc-600" },
  { key: "callback",       label: "Come\nBack",  color: "bg-amber-500" },
  { key: "interested",     label: "Interest",    color: "bg-sky-500" },
  { key: "sold",           label: "SOLD",        color: "bg-emerald-500" },
  { key: "not_interested", label: "Pass",        color: "bg-rose-500" },
];

export function QuickLogBar({ coords }: { coords: [number, number] | null }) {
  const [recId, setRecId] = useState<string | null>(null);

  async function handleTap(outcome: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!coords) return;
    await logKnockHere({ outcome, lng: coords[0], lat: coords[1], recordingId: recId });
    setRecId(null);
  }

  async function handleRecord() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isRecording()) {
      const id = await stopRecording();
      setRecId(id);
    } else {
      await startRecording();
    }
  }

  return (
    <View className="absolute bottom-0 left-0 right-0 bg-black/85 pt-3 pb-8 px-2">
      {/* Big record button */}
      <Pressable
        onPress={handleRecord}
        className={`mx-2 mb-3 h-14 rounded-2xl items-center justify-center ${isRecording() ? "bg-red-600" : "bg-zinc-800"}`}
      >
        <Text className="text-white text-lg font-bold">
          {isRecording() ? "● RECORDING — tap to stop" : "🎙  Start conversation"}
        </Text>
      </Pressable>

      {/* 6 outcome buttons in 2 rows of 3 */}
      <View className="flex-row flex-wrap">
        {BUTTONS.map((b) => (
          <View key={b.key} className="w-1/3 p-1">
            <Pressable
              onPress={() => handleTap(b.key)}
              className={`${b.color} h-20 rounded-2xl items-center justify-center active:opacity-70`}
            >
              <Text className="text-white text-base font-bold text-center leading-5">
                {b.label}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
