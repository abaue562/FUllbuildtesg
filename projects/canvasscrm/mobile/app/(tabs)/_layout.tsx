// 5-tab bottom navigation matching the Jobber app shell.
// Home / Schedule / Timesheet / Search / More — thin line icons + label.
import { Tabs } from "expo-router";
import { theme } from "@/lib/theme";
import { Home, Calendar, Clock, Search, MoreHorizontal } from "lucide-react-native";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.border,
          height: 84,
          paddingTop: 8,
          paddingBottom: 24,
        },
        tabBarActiveTintColor: theme.color.text,
        tabBarInactiveTintColor: theme.color.text,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "500" },
      }}
    >
      <Tabs.Screen name="index"     options={{ title: "Home",      tabBarIcon: ({ color }) => <Home strokeWidth={1.6} color={color} size={26} /> }} />
      <Tabs.Screen name="schedule"  options={{ title: "Schedule",  tabBarIcon: ({ color }) => <Calendar strokeWidth={1.6} color={color} size={26} /> }} />
      <Tabs.Screen name="timesheet" options={{ title: "Timesheet", tabBarIcon: ({ color }) => <Clock strokeWidth={1.6} color={color} size={26} /> }} />
      <Tabs.Screen name="search"    options={{ title: "Search",    tabBarIcon: ({ color }) => <Search strokeWidth={1.6} color={color} size={26} /> }} />
      <Tabs.Screen name="more"      options={{ title: "More",      tabBarIcon: ({ color }) => <MoreHorizontal strokeWidth={1.6} color={color} size={26} /> }} />
    </Tabs>
  );
}
