import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: "首页" }} />
      <Tabs.Screen name="clients" options={{ title: "客户" }} />
      <Tabs.Screen name="tasks" options={{ title: "任务" }} />
      <Tabs.Screen name="profile" options={{ title: "我的" }} />
    </Tabs>
  );
}
