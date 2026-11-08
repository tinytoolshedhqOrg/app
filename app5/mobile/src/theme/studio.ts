import { StyleSheet } from "react-native";

export const palette = {
  bg: "#F5F7FC",
  ink: "#172D4F",
  muted: "#63768D",
  blue: "#225CE0",
  card: "#FFFFFF",
  border: "#DBE3F2",
  wash: "#EDF2FC",
  pale: "#E1EAFF",
  onBlue: "#FFFFFF",
  onBlueMuted: "#DCE6FF",
};
export const font = {
  regular: "NotoSansTC_400Regular",
  medium: "NotoSansTC_500Medium",
  bold: "NotoSansTC_700Bold",
};
export const ui = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  content: { paddingHorizontal: 24, paddingBottom: 24 },
  heading: {
    color: palette.ink,
    fontSize: 34,
    lineHeight: 48,
    fontFamily: font.bold,
  },
  subtitle: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: font.regular,
    marginTop: 4,
  },
  section: {
    color: palette.ink,
    fontSize: 17,
    lineHeight: 26,
    fontFamily: font.bold,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  link: { color: palette.blue, fontSize: 14, fontFamily: font.medium },
  small: {
    fontSize: 12,
    color: palette.muted,
    lineHeight: 19,
    fontFamily: font.regular,
  },
  number: { fontVariant: ["tabular-nums"], fontFamily: font.bold },
  button: {
    backgroundColor: palette.blue,
    borderRadius: 12,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: font.bold,
    textAlign: "center",
  },
});
