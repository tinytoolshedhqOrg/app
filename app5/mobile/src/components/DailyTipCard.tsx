import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  getDailyTip,
  getDailyTipSource,
  tipSentences,
  type DailyTip,
} from "../content/dailyTips";
import { SUPPORTED_UI_LOCALES, t } from "../i18n";
import { showDailyTip } from "../knowledge/storage";
import { font, palette } from "../theme/studio";

export default function DailyTipCard() {
  const [tipId, setTipId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    void showDailyTip()
      .then(({ tipId: id }) => {
        if (active) setTipId(id);
      })
      .catch(() => {
        if (active) setTipId(null);
      });
    return () => {
      active = false;
    };
  }, []);
  const tip = tipId ? getDailyTip(tipId) : undefined;
  if (!tip) return null;
  const heading = t("knowledge.heading");
  return (
    <View style={s.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={heading}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={s.header}
      >
        <Text style={s.heading}>{heading}</Text>
        <Text style={s.indicator}>{expanded ? "−" : "+"}</Text>
      </Pressable>
      {expanded && <DailyTipBody tip={tip} />}
    </View>
  );
}

export function DailyTipBody({ tip }: { tip: DailyTip }) {
  const locale = SUPPORTED_UI_LOCALES[0];
  const sentences = tipSentences(tip.id, locale);
  const source = getDailyTipSource(tip.sourceId);
  if (!sentences || !source) return null;
  const strength = tip.context.includes("strength_training");
  const general = tip.category === "general_physical_activity" && !strength;
  return (
    <View style={s.body}>
      <Text style={s.category}>{t(`knowledge.category.${tip.category}`)}</Text>
      <Text style={s.title}>{tip.title}</Text>
      {strength ? <Text style={s.note}>{t("knowledge.strength")}</Text> : null}
      {general ? <Text style={s.note}>{t("knowledge.activity")}</Text> : null}
      <Text style={s.sentence}>{sentences[0]}</Text>
      <Text style={s.sourceLabel}>{t("knowledge.source")}</Text>
      <Text style={s.sourceName}>
        {source.institution}
        {" · "}
        {source.title}
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${t("knowledge.open")} ${source.title}`}
        onPress={() => {
          if (source.url.startsWith("https://")) void Linking.openURL(source.url);
        }}
      >
        <Text style={s.link}>{t("knowledge.open")}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  header: {
    minHeight: 48,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: {
    fontFamily: font.medium,
    fontSize: 14,
    color: palette.blue,
  },
  indicator: { fontSize: 20, color: palette.blue },
  body: { paddingHorizontal: 20, paddingBottom: 20 },
  category: {
    fontFamily: font.medium,
    fontSize: 12,
    lineHeight: 18,
    color: palette.muted,
  },
  title: {
    marginTop: 4,
    fontFamily: font.bold,
    fontSize: 18,
    lineHeight: 28,
    color: palette.ink,
  },
  note: {
    marginTop: 8,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
  sentence: {
    marginTop: 8,
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 24,
    color: palette.ink,
  },
  sourceLabel: {
    marginTop: 14,
    fontFamily: font.medium,
    fontSize: 12,
    lineHeight: 18,
    color: palette.muted,
  },
  sourceName: {
    marginTop: 2,
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    color: palette.ink,
  },
  link: {
    marginTop: 8,
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 20,
    color: palette.blue,
  },
});
