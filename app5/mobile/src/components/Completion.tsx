import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Mascot from "./Mascot";
import ActionButton from "./ActionButton";
import { activityLabel } from "../content/catalog";
import { font, palette, ui } from "../theme/studio";

export default function Completion({
  name,
  unitCount,
  onHome,
  onAgain,
}: {
  name: string;
  unitCount: number;
  onHome: () => void;
  onAgain: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={ui.root}
      contentContainerStyle={[
        ui.content,
        {
          flexGrow: 1,
          justifyContent: "center",
          paddingTop: insets.top + 32,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <Text style={s.eyebrow}>A LITTLE BETTER, EVERY DAY</Text>
      <Text style={s.title}>這一小段，完成了。</Text>
      <View style={s.art}>
        <Mascot size={230} mood="cheer" />
      </View>
      <View style={s.summary}>
        <Text style={ui.section}>{name}</Text>
        <Text style={[ui.small, { marginTop: 6 }]}>
          {unitCount} 個動作 · 活動 {activityLabel(unitCount)}
        </Text>
      </View>
      <ActionButton
        label="回到首頁"
        onPress={onHome}
        style={{ marginTop: 24 }}
      />
      <Pressable onPress={onAgain} accessibilityRole="button" style={s.again}>
        <Text style={ui.link}>再伸展一次</Text>
      </Pressable>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  eyebrow: { fontFamily: font.medium, fontSize: 10, letterSpacing: 1.5, color: palette.blue, marginBottom: 10 },
  summary: { padding: 20, borderRadius: 14, backgroundColor: palette.card },
  title: {
    fontFamily: font.bold,
    fontSize: 29,
    lineHeight: 43,
    color: palette.ink,
  },
  art: {
    minHeight: 260,
    backgroundColor: palette.pale,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    marginBottom: 16,
  },
  again: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
});
