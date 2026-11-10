import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Alert,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeepAwake } from "expo-keep-awake";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import ExerciseDiagram from "../components/ExerciseDiagram";
import { ExerciseDetails } from "../components/ExerciseDetails";
import Completion from "../components/Completion";
import Icon from "../components/Icon";
import ActionButton from "../components/ActionButton";
import { createCueAudioService } from "../audio/cues";
import { PlayerController, type PlayerSnapshot } from "../player";
import { getCurrentRoutine, getPrefs, subscribePrefs } from "../storage";
import { getSelection, readMusic, saveMusic } from "../storage/selection";
import type { RootStackParamList } from "../navigation/types";
import { font, palette, ui } from "../theme/studio";

const congratulations = require("../../assets/completion/congratulations.mp3");
const yay = require("../../assets/completion/yay.mp3");

function timerText(snap: PlayerSnapshot): string {
  if (snap.countdownBlank) return "";
  if (snap.countdownLabel) return snap.countdownLabel;
  if (snap.phase !== "unit") return "";
  return `0:${String(Math.ceil(snap.unitRemaining)).padStart(2, "0")}`;
}

export default function PlayerScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>(),
    insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const panelHeight = Math.max(180, Math.min(300, height - 590));
  const routine = getCurrentRoutine(),
    selection = getSelection();
  const [audioError, setAudioError] = useState(false),
    [detail, setDetail] = useState(false),
    [musicEnabled, setMusicEnabled] = useState(true),
    [musicReady, setMusicReady] = useState(false),
    [announcementFinished, setAnnouncementFinished] = useState(false);
  const music = useAudioPlayer(
    require("../../assets/music/stretch-background.mp3"),
  );
  const voice = useAudioPlayer(null);
  const celebration = useAudioPlayer(congratulations);
  const audio = useMemo(
    () => createCueAudioService(voice, () => setAudioError(true)),
    [voice],
  );
  const player = useMemo(
    () => new PlayerController(routine?.units ?? [], audio),
    [routine, audio],
  );
  const [snap, setSnap] = useState(() => player.snapshot());
  const routineComplete = snap.phase === "complete" && snap.unitCount > 0;
  const voiceEnabled = useSyncExternalStore(subscribePrefs, () => getPrefs().voiceEnabled);
  const showCompletion = routineComplete && (!voiceEnabled || announcementFinished);
  useKeepAwake();
  useEffect(() => {
    audio.setMuted(!voiceEnabled);
  }, [audio, voiceEnabled]);
  useEffect(() => {
    let active = true;
    void Promise.all([
      setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: "doNotMix",
      }),
      readMusic(),
    ])
      .then(([, enabled]) => {
        if (active) {
          music.loop = true;
          music.volume = 0.25;
          setMusicEnabled(enabled);
          setMusicReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setAudioError(true);
          // Keep text guidance available if audio configuration fails.
          setMusicReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [music]);
  useEffect(() => {
    if (!musicReady) return;
    player.start();
    player.tick();
    const interval = setInterval(() => setSnap(player.tick()), 100);
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        player.pause();
        music.pause();
        celebration.pause();
        setSnap(player.snapshot());
      }
    });
    return () => {
      clearInterval(interval);
      listener.remove();
      audio.dispose();
    };
  }, [player, audio, music, celebration, musicReady]);
  useEffect(() => {
    if (!musicReady) return;
    void Promise.resolve()
      .then(() => {
        if (musicEnabled && !snap.paused && snap.phase !== "complete" && !detail)
          music.play();
        else music.pause();
      })
      .catch(() => setAudioError(true));
  }, [music, musicReady, musicEnabled, snap.paused, snap.phase, detail]);
  useEffect(() => {
    if (!routineComplete || showCompletion) return;
    let active = true;
    const finish = () => {
      if (active) setAnnouncementFinished(true);
    };
    const playback = celebration.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish || status.error) finish();
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state !== "active") finish();
    });
    // Keep the completion screen reachable if audio never reports an ending.
    const timeout = setTimeout(() => {
      finish();
    }, 4000);
    void Promise.resolve()
      .then(() => {
        if (!active) return;
        if (AppState.currentState === "background") {
          finish();
          return;
        }
        celebration.replace(congratulations);
        celebration.play();
      })
      .catch(finish);
    return () => {
      active = false;
      clearTimeout(timeout);
      playback.remove();
      appState.remove();
    };
  }, [celebration, routineComplete, showCompletion]);
  useEffect(() => {
    if (!showCompletion) return;
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return;
        celebration.pause();
        if (!musicEnabled || AppState.currentState === "background") return;
        celebration.replace(yay);
        celebration.play();
      })
      .catch(() => setAudioError(true));
    return () => { active = false; };
  }, [celebration, musicEnabled, showCompletion]);
  function togglePause() {
    if (snap.paused) player.resume();
    else player.pause();
    setSnap(player.tick());
  }
  function exit() {
    player.pause();
    setSnap(player.snapshot());
    Alert.alert("先休息一下？", "離開後會從組合預覽重新開始。", [
      { text: "留在這裡", style: "cancel" },
      { text: "結束跟練", style: "destructive", onPress: () => nav.goBack() },
    ]);
  }
  const gap = snap.phase === "gap";
  const shown = gap ? (snap.next ?? snap.current) : snap.current;
  const cue =
    snap.phase === "unit"
      ? snap.current?.voice_cues
          .filter((c) => c.at_seconds <= 30 - snap.unitRemaining)
          .at(-1)
      : undefined;
  if (!shown)
    return (
      <View
        style={[ui.root, { padding: 24, justifyContent: "center", gap: 24 }]}
      >
        <Text style={ui.heading}>先選一組伸展吧</Text>
        <ActionButton label="返回首頁" onPress={() => nav.popToTop()} />
      </View>
    );
  if (showCompletion)
    return (
      <Completion
        name={selection?.name ?? "伸展組合"}
        unitCount={snap.unitCount}
        onHome={() => nav.popToTop()}
        onAgain={() => {
          celebration.pause();
          setAnnouncementFinished(false);
          player.start();
          setSnap(player.tick());
        }}
      />
    );
  const status =
    snap.phase === "lead"
      ? "準備開始"
      : gap
        ? "準備下一個動作"
        : routineComplete
          ? "恭喜！完成了一組動作"
          : snap.paused
            ? null
            : "保持自然呼吸";
  return (
    <View
      pointerEvents={routineComplete ? "none" : "auto"}
      style={[ui.root, { paddingTop: insets.top + 8 }]}
    >
      <View style={s.nav}>
        <Pressable
          style={s.navClose}
          onPress={exit}
          accessibilityRole="button"
          accessibilityLabel="結束跟練"
        >
          <Icon name="close" />
        </Pressable>
        <Text style={s.navTitle}>{selection?.name}</Text>
        <Pressable
          style={s.detailsButton}
          onPress={() => {
            player.pause();
            setSnap(player.snapshot());
            setDetail(true);
          }}
          accessibilityRole="button"
        >
          <Text style={s.detailsLabel}>動作說明</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={[
          ui.content,
          { paddingTop: 16, paddingBottom: 12 },
        ]}
      >
        <Text style={s.step}>
          {String(snap.unitIndex + 1).padStart(2, "0")} /{" "}
          {String(snap.unitCount).padStart(2, "0")}
        </Text>
        <View style={[s.demonstration, { height: panelHeight }]}>
          <ExerciseDiagram
            exercise={shown}
            size={Math.min(260, panelHeight - 8)}
            background="transparent"
          />
        </View>
        <Text style={s.name}>{shown.name}</Text>
        <Text style={ui.small}>{shown.library?.muscle}</Text>
        <View style={s.timerRow}>
          <Text
            accessibilityLiveRegion="none"
            accessibilityLabel={
              snap.countdownLabel ? `倒數 ${snap.countdownLabel}` : undefined
            }
            style={s.countdown}
          >
            {timerText(snap)}
          </Text>
          {status && <Text style={ui.small}>{status}</Text>}
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: snap.unitCount,
            now: snap.unitIndex + (gap ? 1 : 1 - snap.unitRemaining / 30),
            text: `第 ${snap.unitIndex + 1} 個，共 ${snap.unitCount} 個動作`,
          }}
          style={s.progress}
        >
          {routine?.units.map((unit, index) => (
            <View key={`${unit.id}-${index}`} style={s.segment}>
              <View
                style={[
                  s.segmentFill,
                  {
                    width: `${index < snap.unitIndex || (index === snap.unitIndex && gap) ? 100 : index === snap.unitIndex ? (1 - snap.unitRemaining / 30) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={s.prompt}>
          <Text style={s.promptText}>
            {snap.phase === "lead"
              ? snap.current?.setup
              : gap
                ? (snap.next?.setup ?? "放鬆雙手，保持自然呼吸。")
                : (cue?.text ?? snap.instruction)}
          </Text>
        </View>
      </ScrollView>
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={s.controls}>
          <Pressable
            style={s.control}
            onPress={() => {
              player.previous();
              setSnap(player.tick());
            }}
            accessibilityRole="button"
            accessibilityLabel="上一個動作"
          >
            <Icon name="previous" />
          </Pressable>
          <Pressable
            style={[s.control, s.mainControl]}
            onPress={togglePause}
            accessibilityRole="button"
            accessibilityLabel={snap.paused ? "繼續跟練" : "暫停跟練"}
          >
            <Icon name={snap.paused ? "play" : "pause"} color="#FFFFFF" />
          </Pressable>
          <Pressable
            style={s.control}
            onPress={() => {
              player.skip();
              setSnap(player.tick());
            }}
            accessibilityRole="button"
            accessibilityLabel="下一個動作"
          >
            <Icon name="next" />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: musicEnabled }}
          accessibilityLabel="背景音樂"
          style={s.music}
          onPress={() => {
            const enabled = !musicEnabled;
            setMusicEnabled(enabled);
            void saveMusic(enabled).catch(() => setAudioError(true));
          }}
        >
          <Icon name="music" color={palette.muted} size={17} />
          <Text style={ui.small}>背景音樂</Text>
          <Text style={s.musicState}>{musicEnabled ? "開啟" : "關閉"}</Text>
        </Pressable>
        {audioError && (
          <Text style={[ui.small, { textAlign: "center" }]}>
            音訊目前無法使用，可繼續文字跟練。
          </Text>
        )}
      </View>
      <Modal
        visible={detail}
        animationType="slide"
        onRequestClose={() => setDetail(false)}
      >
        <ExerciseDetails exercise={shown} onClose={() => setDetail(false)} />
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  nav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    minHeight: 44,
    gap: 12,
  },
  navClose: { minHeight: 44, minWidth: 44, borderRadius: 12, backgroundColor: palette.card, alignItems: "center", justifyContent: "center" },
  navTitle: {
    flex: 1,
    fontSize: 14,
    color: palette.ink,
    fontFamily: font.medium,
  },
  detailsButton: { minHeight: 44, justifyContent: "center" },
  detailsLabel: { color: palette.blue, fontFamily: font.medium, fontSize: 12 },
  step: {
    fontFamily: font.bold,
    color: palette.blue,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    marginBottom: 12,
  },
  demonstration: {
    borderRadius: 20,
    backgroundColor: palette.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontFamily: font.bold,
    color: palette.ink,
    fontSize: 26,
    lineHeight: 38,
    marginTop: 16,
    marginBottom: 2,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 10,
  },
  countdown: {
    fontFamily: font.bold,
    fontSize: 57,
    lineHeight: 83,
    minHeight: 83,
    color: palette.blue,
    fontVariant: ["tabular-nums"],
  },
  progress: { flexDirection: "row", gap: 5, marginBottom: 20 },
  segment: {
    flex: 1,
    height: 6,
    backgroundColor: palette.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  segmentFill: { backgroundColor: palette.blue, height: 6, borderRadius: 2 },
  prompt: {
    backgroundColor: palette.card,
    padding: 16,
    minHeight: 63,
    borderRadius: 14,
    justifyContent: "center",
  },
  promptText: {
    color: palette.ink,
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 23,
  },
  footer: { backgroundColor: palette.bg, paddingHorizontal: 24, paddingTop: 8 },
  controls: { flexDirection: "row", justifyContent: "center", gap: 18 },
  control: {
    height: 56,
    width: 64,
    borderRadius: 12,
    backgroundColor: palette.card,
    alignItems: "center",
    justifyContent: "center",
  },
  mainControl: { width: 94, backgroundColor: palette.blue },
  music: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    marginTop: 8,
  },
  musicState: { color: palette.blue, fontFamily: font.medium, fontSize: 12 },
});
