import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Mascot from "../components/Mascot";
import Icon, { type IconName } from "../components/Icon";
import {
  activityLabel,
  bodyParts,
  getBodySelection,
  getCombinations,
  type Selection,
} from "../content/catalog";
import { readLastStarted, setSelection } from "../storage/selection";
import type { RootStackParamList } from "../navigation/types";
import { font, palette, ui } from "../theme/studio";

export default function HomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [last, setLast] = useState<Selection | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void readLastStarted().then((value) => {
        if (active) setLast(value);
      });
      return () => {
        active = false;
      };
    }, []),
  );
  function open(selection: Selection) {
    setSelection(selection);
    nav.navigate("Preview");
  }
  const combos = getCombinations();
  const combinationIcons: Record<string, IconName> = {
    standing: "standing", office: "office", morning: "sun",
    bedtime: "moon", hands: "hands", floor: "floor",
  };
  return (
    <ScrollView
      style={ui.root}
      contentContainerStyle={[
        ui.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={s.brandRow}>
        <Text style={s.brand}>伸展 STRETCH</Text>
        <View style={s.brandMark}><Icon name="standing" color={palette.blue} size={20} /></View>
      </View>
      <Text style={s.eyebrow}>MOVE A LITTLE, FEEL BETTER</Text>
      <View style={s.welcome}>
        <Text style={s.heading}>伸展一下。</Text>
        {!last && <Mascot size={78} />}
      </View>
      {last && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`上次使用，${last.name}`}
          onPress={() => open(last)}
          style={({ pressed }) => [s.recent, pressed && s.pressed]}
        >
          <View pointerEvents="none" style={s.heroArt}><Mascot size={100} /></View>
          <View style={s.heroCopy}>
            <Text style={s.lastLabel}>上次使用</Text>
            <Text style={s.lastTitle}>{last.name}</Text>
            <Text style={s.lastMeta}>{last.exerciseIds.length} 個動作 · {activityLabel(last.exerciseIds.length)}</Text>
          </View>
          <View style={s.heroArrow}><Icon name="arrow" color={palette.blue} size={19} /></View>
        </Pressable>
      )}
      <View style={s.sectionHeading}>
        <Text style={ui.section}>伸展組合</Text>
        <Text style={s.sectionMeta}>共 {combos.length} 組</Text>
      </View>
      <View style={s.combinations}>
        {combos.map((combo) => (
          <Pressable
            key={combo.id}
            accessibilityRole="button"
            accessibilityLabel={combo.name}
            onPress={() => open(combo)}
            style={({ pressed }) => [s.combination, pressed && s.pressed]}
          >
            <Icon name={combinationIcons[combo.id] ?? "standing"} size={23} color={palette.blue} />
            <Text style={s.combinationName}>{combo.name}</Text>
            <Text style={s.meta}>{combo.exerciseIds.length} 個動作 · {activityLabel(combo.exerciseIds.length)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.sectionHeading}>
        <Text style={ui.section}>依部位</Text>
      </View>
      <View style={s.parts}>
        {bodyParts.map((part) => (
          <Pressable
            key={part.name}
            accessibilityRole="button"
            accessibilityLabel={part.label}
            onPress={() => open(getBodySelection(part.name))}
            style={({ pressed }) => [s.part, pressed && s.pressed]}
          >
            <Text style={s.partName}>
              {(
                { 手: "手／腕", 髖臀: "髖臀", 腿: "腿部" } as Record<
                  string,
                  string
                >
              )[part.name] ?? part.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
  brand: { fontFamily: font.bold, color: palette.ink, fontSize: 14, letterSpacing: 1.8 },
  brandMark: { width: 36, height: 36, borderRadius: 12, backgroundColor: palette.pale, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontFamily: font.medium, color: palette.muted, fontSize: 10, letterSpacing: 1.6, marginBottom: 8 },
  welcome: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 22 },
  heading: { flexShrink: 1, fontFamily: font.bold, color: palette.ink, fontSize: 36, lineHeight: 52 },
  recent: { minHeight: 174, borderRadius: 14, padding: 22, backgroundColor: palette.blue, overflow: "hidden", justifyContent: "center" },
  heroArt: { position: "absolute", right: 16, top: 10 },
  heroCopy: { alignSelf: "flex-start", maxWidth: "72%" },
  lastLabel: { color: palette.onBlueMuted, fontSize: 11, fontFamily: font.medium, marginBottom: 12 },
  lastTitle: { fontFamily: font.bold, fontSize: 26, lineHeight: 38, color: palette.onBlue, marginBottom: 5 },
  lastMeta: { fontFamily: font.regular, fontSize: 11, lineHeight: 19, color: palette.onBlueMuted },
  heroArrow: { position: "absolute", bottom: 18, right: 18, width: 34, height: 34, borderRadius: 10, backgroundColor: palette.card, alignItems: "center", justifyContent: "center" },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 26, marginBottom: 12, gap: 12 },
  sectionMeta: { color: palette.muted, fontFamily: font.regular, fontSize: 11 },
  combinations: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  combination: { flexGrow: 1, flexBasis: "45%", minWidth: 130, backgroundColor: palette.card, minHeight: 122, borderRadius: 14, padding: 16, alignItems: "flex-start" },
  combinationName: { color: palette.ink, fontFamily: font.bold, fontSize: 15, lineHeight: 24, marginTop: 10, marginBottom: 5 },
  meta: { fontFamily: font.regular, color: palette.muted, fontSize: 11, lineHeight: 18 },
  parts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  part: { minHeight: 44, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 9, backgroundColor: palette.card, alignItems: "center", justifyContent: "center" },
  partName: { fontFamily: font.medium, fontSize: 12, color: palette.ink },
  pressed: { opacity: 0.7 },
});
