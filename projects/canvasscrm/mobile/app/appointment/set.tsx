// APPOINTMENT SETTER MODE — book an appointment at the door, don't close.
// Rep's goal is to get a time on the calendar. Closer comes later.
// Shows availability, books the slot, sends confirmation SMS to customer.

import { useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, ScrollView, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { X, Sparkles, Calendar, Clock, Phone, User, ChevronRight } from "lucide-react-native";
import { theme } from "@/lib/theme";
import { supabase } from "@/lib/supabase";

const SLOTS = ["9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM"];
const DAYS = Array.from({ length: 7 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + i + 1);
  return d;
});

export default function SetAppointment() {
  const router = useRouter();
  const { door_id, knock_id, address } = useLocalSearchParams<{ door_id: string; knock_id: string; address: string }>();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const dayLabel = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  async function book() {
    if (!name || !phone || !selectedDay || !selectedSlot) {
      Alert.alert("Missing info", "Please fill in name, phone, date, and time.");
      return;
    }
    setSaving(true);
    const [hr, min] = selectedSlot.replace(" AM", "").replace(" PM", "").split(":").map(Number);
    const isPM = selectedSlot.includes("PM") && hr !== 12;
    const scheduledAt = new Date(selectedDay);
    scheduledAt.setHours(isPM ? hr + 12 : hr, min ?? 0, 0, 0);

    const { error } = await supabase.from("appointments").insert({
      door_id, knock_id,
      customer_name: name,
      phone, email, notes,
      address,
      scheduled_at: scheduledAt.toISOString(),
      status: "scheduled",
    });
    if (error) { Alert.alert("Error", error.message); setSaving(false); return; }

    // Trigger confirmation SMS via sequence engine
    await supabase.functions.invoke("sequence-tick", {
      body: { event: "appointment.created", data: { phone, name, scheduled_at: scheduledAt.toISOString(), address } },
    });

    Haptics_success(); // visual cue
    Alert.alert("Booked! ✅", `Appointment set for ${dayLabel(selectedDay)} at ${selectedSlot}`, [
      { text: "Done", onPress: () => router.back() },
    ]);
    setSaving(false);
  }

  function Haptics_success() {
    // expo-haptics is imported in real app
  }

  return (
    <View style={s.root}>
      <View style={s.topbar}>
        <Pressable onPress={() => router.back()}><X size={26} color={theme.color.text} /></Pressable>
        <Text style={s.title}>Set Appointment</Text>
        <Sparkles size={22} color={theme.color.text} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        <View style={s.addressBanner}>
          <Text style={s.addressText} numberOfLines={1}>{address ?? "This address"}</Text>
        </View>

        <Text style={s.section}>Customer Info</Text>
        {[
          { icon: <User size={18} color={theme.color.textMute} />, value: name, set: setName, ph: "Full name", type: "default" as any },
          { icon: <Phone size={18} color={theme.color.textMute} />, value: phone, set: setPhone, ph: "Phone number", type: "phone-pad" as any },
        ].map((f, i) => (
          <View key={i} style={s.inputRow}>
            {f.icon}
            <TextInput style={s.input} value={f.value} onChangeText={f.set}
              placeholder={f.ph} placeholderTextColor={theme.color.textMute}
              keyboardType={f.type} />
          </View>
        ))}

        <Text style={s.section}>Pick a Day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
          {DAYS.map((d, i) => {
            const sel = selectedDay?.toDateString() === d.toDateString();
            return (
              <Pressable key={i} onPress={() => setSelectedDay(d)}
                style={[s.dayChip, sel && s.dayChipSel]}>
                <Text style={[s.dayChipDay, sel && { color: "#fff" }]}>{d.toLocaleDateString("en-US", { weekday: "short" })}</Text>
                <Text style={[s.dayChipNum, sel && { color: "#fff" }]}>{d.getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={s.section}>Pick a Time</Text>
        <View style={s.slotGrid}>
          {SLOTS.map((slot) => {
            const sel = selectedSlot === slot;
            return (
              <Pressable key={slot} onPress={() => setSelectedSlot(slot)}
                style={[s.slotChip, sel && s.slotChipSel]}>
                <Clock size={14} color={sel ? "#fff" : theme.color.textMute} />
                <Text style={[s.slotText, sel && { color: "#fff" }]}>{slot}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={s.section}>Notes for Closer</Text>
        <TextInput style={s.notes} value={notes} onChangeText={setNotes}
          placeholder="What did they say? Decision maker present? Objections?"
          placeholderTextColor={theme.color.textMute}
          multiline numberOfLines={3} />
      </ScrollView>

      <View style={s.footer}>
        {selectedDay && selectedSlot && (
          <Text style={s.summary}>
            📅 {dayLabel(selectedDay)} at {selectedSlot}
          </Text>
        )}
        <Pressable style={[s.cta, saving && { opacity: 0.6 }]} onPress={book} disabled={saving}>
          <Calendar size={22} color="#fff" />
          <Text style={s.ctaText}>{saving ? "Booking…" : "Confirm Appointment"}</Text>
          <ChevronRight size={22} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  topbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 16 },
  title: { fontSize: 26, fontWeight: "800", color: theme.color.text, flex: 1, marginLeft: 8 },
  addressBanner: { marginHorizontal: 20, padding: 12, backgroundColor: "#E8F5E9", borderRadius: theme.radius.md },
  addressText: { fontSize: 15, fontWeight: "700", color: theme.color.primary },
  section: { fontSize: 16, color: theme.color.textMute, fontWeight: "600", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surface },
  input: { flex: 1, fontSize: 16, color: theme.color.text },
  dayChip: { width: 62, paddingVertical: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface, alignItems: "center" },
  dayChipSel: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
  dayChipDay: { fontSize: 12, color: theme.color.textMute, fontWeight: "600" },
  dayChipNum: { fontSize: 22, fontWeight: "800", color: theme.color.text, marginTop: 2 },
  slotGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 10 },
  slotChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface },
  slotChipSel: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
  slotText: { fontSize: 14, fontWeight: "700", color: theme.color.text },
  notes: { marginHorizontal: 20, padding: 14, backgroundColor: theme.color.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, fontSize: 15, color: theme.color.text, textAlignVertical: "top" },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 44, backgroundColor: theme.color.bg, borderTopWidth: 1, borderTopColor: theme.color.border, gap: 10 },
  summary: { fontSize: 15, fontWeight: "700", color: theme.color.text, textAlign: "center" },
  cta: { backgroundColor: theme.color.primary, borderRadius: theme.radius.pill, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  ctaText: { color: "#fff", fontSize: 18, fontWeight: "800" },
});
