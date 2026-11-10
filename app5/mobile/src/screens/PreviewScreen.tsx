import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveSelection } from "../content/catalog";
import { loadBundledContent, type Exercise } from "../content";
import {
  advanceCandidate,
  insertReplacement,
  postureNote,
  rankReplacements,
} from "../content/replacements";
import {
  getSelection,
  rememberStarted,
  setSelection,
} from "../storage/selection";
import { setCurrentRoutine } from "../storage";
import { currentProUnlocked, isProUnlocked, subscribePro } from "../iap";
import { t } from "../i18n";
import { font, palette, ui } from "../theme/studio";
import type { RootStackParamList } from "../navigation/types";
import { ExerciseDetails } from "../components/ExerciseDetails";
import ActionButton from "../components/ActionButton";
import Icon from "../components/Icon";
import ReorderableExerciseList, {
  type SortScrollMetrics,
} from "../components/ReorderableExerciseList";
import { removeExerciseAt } from "../components/exerciseSwipe";

export default function PreviewScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const selection = getSelection();
  const [units, setUnits] = useState(() =>
    selection ? resolveSelection(selection) : [],
  );
  const [dragging, setDragging] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  const scrollMetrics = useRef<SortScrollMetrics>({
    offset: 0,
    contentHeight: 0,
    viewportHeight: 0,
    top: 0,
  });
  const [detail, setDetail] = useState<Exercise | null>(null),
    [starting, setStarting] = useState(false);
  const [pro, setPro] = useState(currentProUnlocked);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const unsub = subscribePro((value) => {
      generation += 1;
      if (active) setPro(value);
    });
    const request = ++generation;
    isProUnlocked().then((value) => {
      if (active && request === generation) setPro(value);
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);
  function openPaywall() {
    nav.navigate("Paywall", { reason: "edit_routine" });
  }
  const [suggestion, setSuggestion] = useState<{
    deletedIndex: number;
    removedPosition: string;
    candidateIds: string[];
    cursor: number;
  } | null>(null);
  function removeAt(index: number) {
    if (!pro) {
      openPaywall();
      return;
    }
    const removed = units[index];
    const next = removeExerciseAt(units, index);
    if (!removed || next === units) return;
    setUnits(next);
    const candidates = rankReplacements(
      removed,
      loadBundledContent().exercises,
      new Set(next.map((exercise) => exercise.id)),
    );
    setSuggestion(
      candidates.length
        ? {
            deletedIndex: index,
            removedPosition: removed.position,
            candidateIds: candidates.map((exercise) => exercise.id),
            cursor: 0,
          }
        : null,
    );
  }
  function commitOrder(next: Exercise[]) {
    if (!pro) {
      openPaywall();
      return;
    }
    setUnits(next);
    setSuggestion(null);
  }
  function acceptReplacement() {
    if (!pro) {
      openPaywall();
      return;
    }
    if (!suggestion) return;
    const chosenId = suggestion.candidateIds[suggestion.cursor];
    const candidate = loadBundledContent().exercises.find((exercise) => exercise.id === chosenId);
    const deletedIndex = suggestion.deletedIndex;
    setSuggestion(null);
    if (!candidate) return;
    setUnits((current) => insertReplacement(current, deletedIndex, candidate));
  }
  function showNextReplacement() {
    if (!pro) {
      openPaywall();
      return;
    }
    setSuggestion((current) => {
      if (!current) return current;
      const cursor = advanceCandidate(current.candidateIds.length, current.cursor);
      if (cursor == null) return current;
      return { ...current, cursor };
    });
  }
  const suggested = suggestion
    ? loadBundledContent().exercises.find(
        (exercise) => exercise.id === suggestion.candidateIds[suggestion.cursor],
      )
    : undefined;
  const hasNextCandidate = suggestion
    ? advanceCandidate(suggestion.candidateIds.length, suggestion.cursor) != null
    : false;
  async function start() {
    if (!selection || !units.length || starting) return;
    setStarting(true);
    try {
      const orderedSelection = {
        ...selection,
        exerciseIds: units.map((ex) => ex.id),
      };
      await rememberStarted(orderedSelection);
      setSelection(orderedSelection);
      setCurrentRoutine({ units, repeatsSomeMoves: false, empty: false });
      nav.navigate("Player");
    } catch {
      Alert.alert("尚未儲存", "無法記住這次的組合，請再試一次。");
    } finally {
      setStarting(false);
    }
  }
  const seconds = units.length * 30;
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <View style={[ui.root, { paddingTop: insets.top + 8 }]}>
      <View style={[ui.content, s.nav]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回首頁"
          onPress={() => nav.goBack()}
          style={s.back}
        >
          <Icon name="back" />
          <Text style={s.navTitle}>組合預覽</Text>
        </Pressable>
      </View>
      <View
        ref={viewportRef}
        style={{ flex: 1 }}
        onLayout={(event) => {
          scrollMetrics.current.viewportHeight =
            event.nativeEvent.layout.height;
        }}
      >
        <ScrollView
          ref={scrollRef}
          scrollEnabled={!dragging && !swiping}
          directionalLockEnabled
          removeClippedSubviews={false}
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollMetrics.current.offset = event.nativeEvent.contentOffset.y;
          }}
          onContentSizeChange={(_width, height) => {
            scrollMetrics.current.contentHeight = height;
          }}
          contentContainerStyle={[ui.content, { paddingBottom: 24 }]}
        >
          <Text style={[ui.heading, { marginTop: 22 }]}>
            {selection?.name ?? "請先選擇組合"}
          </Text>
          <View style={s.summary}>
            <View style={s.stat}>
              <Text style={s.time}>{time}</Text>
              <Text style={s.meta}>活動時間</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.stat}>
              <Text style={s.time}>{String(units.length).padStart(2, "0")}</Text>
              <Text style={s.meta}>動作 · 每個 30 秒</Text>
            </View>
          </View>
          <View style={s.listHeading}>
            <Text style={ui.section}>動作順序</Text>
            <Text style={s.meta}>{units.length} 個動作</Text>
          </View>
          {pro ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("preview.unlock")}
              onPress={openPaywall}
              style={s.lockHint}
            >
              <Text style={s.lockHintText}>{t("preview.unlock")}</Text>
            </Pressable>
          )}
          <ReorderableExerciseList
            items={units}
            editingEnabled={pro}
            onEditLocked={openPaywall}
            onChange={commitOrder}
            onOpen={setDetail}
            onDragStateChange={setDragging}
            onDelete={removeAt}
            onSwipeActive={setSwiping}
            scrollRef={scrollRef}
            viewportRef={viewportRef}
            scrollMetrics={scrollMetrics}
          />
        </ScrollView>
      </View>
      <View
        style={[
          ui.content,
          s.footer,
          { paddingTop: 12, paddingBottom: insets.bottom + 16 },
        ]}
      >
        {suggestion && suggested ? (
          <View style={s.suggestion}>
            <Text style={s.suggestionTitle}>要加入相近的動作嗎？</Text>
            <Text style={s.suggestionName}>{suggested.name}</Text>
            <Text style={s.suggestionNote}>
              {postureNote(suggestion.removedPosition, suggested.position)}
            </Text>
            <View style={s.suggestionActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="加入替代"
                onPress={acceptReplacement}
                style={s.suggestionPrimary}
              >
                <Text style={s.suggestionPrimaryText}>加入替代</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="換一個"
                accessibilityState={{ disabled: !hasNextCandidate }}
                disabled={!hasNextCandidate}
                onPress={showNextReplacement}
                style={[s.suggestionSecondary, !hasNextCandidate && s.suggestionDisabled]}
              >
                <Text style={s.suggestionSecondaryText}>換一個</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="不用替代"
                onPress={() => setSuggestion(null)}
                style={s.suggestionSecondary}
              >
                <Text style={s.suggestionSecondaryText}>不用替代</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <ActionButton
          label={starting ? "正在準備…" : "開始跟練"}
          onPress={() => void start()}
          disabled={!units.length || starting || dragging}
        />
      </View>
      <Modal
        visible={!!detail}
        animationType="slide"
        onRequestClose={() => setDetail(null)}
      >
        <ExerciseDetails exercise={detail} onClose={() => setDetail(null)} />
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  nav: { minHeight: 44, justifyContent: "center" },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
    minHeight: 44,
  },
  navTitle: { color: palette.ink, fontSize: 15, fontFamily: font.medium },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    padding: 22,
    minHeight: 112,
    borderRadius: 14,
    backgroundColor: palette.pale,
    marginTop: 18,
  },
  time: {
    color: palette.ink,
    fontFamily: font.bold,
    fontSize: 30,
    fontVariant: ["tabular-nums"],
  },
  stat: { flex: 1, gap: 5 },
  statDivider: { width: 1, height: 48, backgroundColor: "#C4D3F0" },
  footer: { backgroundColor: palette.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  suggestion: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: palette.pale,
    gap: 4,
  },
  suggestionTitle: { color: palette.ink, fontFamily: font.bold, fontSize: 15, lineHeight: 22 },
  suggestionName: { color: palette.ink, fontFamily: font.medium, fontSize: 14, lineHeight: 22 },
  suggestionNote: { color: palette.muted, fontFamily: font.regular, fontSize: 12, lineHeight: 18 },
  suggestionActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  suggestionPrimary: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: palette.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionPrimaryText: { color: palette.onBlue, fontFamily: font.bold, fontSize: 13 },
  suggestionSecondary: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: palette.card,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionSecondaryText: { color: palette.ink, fontFamily: font.medium, fontSize: 13 },
  suggestionDisabled: { opacity: 0.4 },
  meta: {
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 18,
    color: palette.muted,
  },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 22,
    marginBottom: 8,
  },
  lockHint: {
    alignSelf: "flex-start",
    marginBottom: 8,
    minHeight: 32,
    justifyContent: "center",
  },
  lockHintText: {
    color: palette.blue,
    fontFamily: font.medium,
    fontSize: 12,
    lineHeight: 18,
  },
});
