import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Exercise } from "../content";
import { colors } from "../theme/colors";
import { font, palette } from "../theme/studio";
import {
  nextSwipeOffset,
  SWIPE_DELETE_WIDTH,
  swipeShouldClaim,
  swipeShouldReveal,
} from "./exerciseSwipe";
import Icon from "./Icon";
import ExerciseDiagram from "./ExerciseDiagram";

const ROW_HEIGHT = 84;
const HOLD_MS = 300;
export type SortScrollMetrics = {
  offset: number;
  contentHeight: number;
  viewportHeight: number;
  top: number;
};
type Props = {
  items: Exercise[];
  onChange: (items: Exercise[]) => void;
  onDelete: (index: number) => void;
  onOpen: (exercise: Exercise) => void;
  onDragStateChange: (dragging: boolean) => void;
  onSwipeActive?: (active: boolean) => void;
  scrollRef: RefObject<ScrollView | null>;
  viewportRef: RefObject<View | null>;
  scrollMetrics: RefObject<SortScrollMetrics>;
};

function DragHandle({
  name,
  position,
  count,
  onBegin,
  onMove,
  onFinish,
  onCancel,
  onStep,
}: {
  name: string;
  position: number;
  count: number;
  onBegin: (pageY: number) => void;
  onMove: (pageY: number) => void;
  onFinish: () => void;
  onCancel: () => void;
  onStep: (delta: number) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  const clearHold = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => clearHold, [clearHold]);
  // PanResponder registers these callbacks; refs are read only when a gesture fires.
  const responder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- callbacks run on gestures only
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          clearHold();
          const pageY = event.nativeEvent.pageY;
          timer.current = setTimeout(() => {
            active.current = true;
            onBegin(pageY);
          }, HOLD_MS);
        },
        onPanResponderMove: (event, gesture) => {
          if (active.current) onMove(event.nativeEvent.pageY);
          else if (Math.abs(gesture.dy) > 8 || Math.abs(gesture.dx) > 8)
            clearHold();
        },
        onPanResponderRelease: () => {
          clearHold();
          if (active.current) onFinish();
          active.current = false;
        },
        onPanResponderTerminate: () => {
          clearHold();
          if (active.current) onCancel();
          active.current = false;
        },
        onPanResponderTerminationRequest: () => !active.current,
        onShouldBlockNativeResponder: () => active.current,
      }),
    [clearHold, onBegin, onMove, onFinish, onCancel],
  );
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`調整${name}的順序`}
      accessibilityHint="長按後上下拖曳，也可使用向上或向下調整動作"
      accessibilityValue={{ min: 1, max: count, now: position + 1 }}
      accessibilityActions={[
        { name: "decrement", label: "向上移動" },
        { name: "increment", label: "向下移動" },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "decrement") onStep(-1);
        if (event.nativeEvent.actionName === "increment") onStep(1);
      }}
      style={s.handle}
    >
      <Icon name="grip" color={palette.muted} size={20} />
    </View>
  );
}

function useSwipeDelete({
  revealed,
  canDelete,
  sorting,
  onReveal,
  onCollapse,
  onSwipeActive,
}: {
  revealed: boolean;
  canDelete: boolean;
  sorting: boolean;
  onReveal: () => void;
  onCollapse: () => void;
  onSwipeActive: (active: boolean) => void;
}) {
  const [translate] = useState(() => new Animated.Value(0));
  const offset = useRef(0);
  const start = useRef(0);
  const gesture = useRef({ revealed, canDelete, sorting });
  const reveal = useRef(onReveal);
  const collapse = useRef(onCollapse);
  const swipeActive = useRef(onSwipeActive);
  useEffect(() => {
    gesture.current = { revealed, canDelete, sorting };
    reveal.current = onReveal;
    collapse.current = onCollapse;
    swipeActive.current = onSwipeActive;
  }, [revealed, canDelete, sorting, onReveal, onCollapse, onSwipeActive]);
  useEffect(() => {
    const to = revealed && canDelete ? -SWIPE_DELETE_WIDTH : 0;
    offset.current = to;
    translate.setValue(to);
  }, [revealed, canDelete, translate]);
  const responder = useMemo(
    () =>
      // Callbacks run on gestures only; refs hold the latest row state.
      // eslint-disable-next-line react-hooks/refs -- callbacks run on gestures only
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, pan) =>
          swipeShouldClaim(pan.dx, pan.dy, gesture.current),
        onMoveShouldSetPanResponderCapture: (_event, pan) =>
          swipeShouldClaim(pan.dx, pan.dy, gesture.current),
        onPanResponderGrant: () => {
          start.current = offset.current;
          swipeActive.current(true);
        },
        onPanResponderMove: (_event, pan) => {
          const next = nextSwipeOffset(
            start.current,
            pan.dx,
            gesture.current.canDelete && !gesture.current.sorting,
          );
          offset.current = next;
          translate.setValue(next);
        },
        onPanResponderRelease: (_event, pan) => {
          swipeActive.current(false);
          const allowed = gesture.current.canDelete && !gesture.current.sorting;
          const next = nextSwipeOffset(start.current, pan.dx, allowed);
          if (swipeShouldReveal(next, pan.vx, allowed)) {
            offset.current = -SWIPE_DELETE_WIDTH;
            translate.setValue(-SWIPE_DELETE_WIDTH);
            reveal.current();
          } else {
            offset.current = 0;
            translate.setValue(0);
            collapse.current();
          }
        },
        onPanResponderTerminate: () => {
          swipeActive.current(false);
          offset.current = 0;
          translate.setValue(0);
          collapse.current();
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    [translate],
  );
  return { responder, translate };
}

function ExerciseRow({
  exercise,
  index,
  count,
  revealed,
  sorting,
  lifted,
  onReveal,
  onCollapse,
  onDelete,
  onOpen,
  onSwipeActive,
  onBegin,
  onMove,
  onFinish,
  onCancel,
  onStep,
}: {
  exercise: Exercise;
  index: number;
  count: number;
  revealed: boolean;
  sorting: boolean;
  lifted: boolean;
  onReveal: () => void;
  onCollapse: () => void;
  onDelete: () => void;
  onOpen: () => void;
  onSwipeActive: (active: boolean) => void;
  onBegin: (pageY: number) => void;
  onMove: (pageY: number) => void;
  onFinish: () => void;
  onCancel: () => void;
  onStep: (delta: number) => void;
}) {
  const canDelete = count > 1 && !sorting;
  const { responder, translate } = useSwipeDelete({
    revealed: revealed && canDelete,
    canDelete,
    sorting,
    onReveal,
    onCollapse,
    onSwipeActive,
  });
  return (
    <View style={s.clip}>
      {count > 1 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`刪除${exercise.name}`}
          accessibilityElementsHidden={!revealed || sorting}
          importantForAccessibility={
            revealed && !sorting ? "auto" : "no-hide-descendants"
          }
          disabled={!revealed || sorting}
          pointerEvents={revealed && !sorting ? "auto" : "none"}
          onPress={() => {
            if (!revealed || sorting || count <= 1) return;
            onDelete();
          }}
          style={[s.delete, revealed && !sorting && s.deleteRaised]}
        >
          <Text style={s.deleteText}>刪除</Text>
        </Pressable>
      ) : null}
      <Animated.View
        style={[s.row, lifted && s.rowLifted, { transform: [{ translateX: translate }] }]}
      >
        <View style={s.swipeArea} {...responder.panHandlers}>
          {/* Horizontal swipes stay on the row body so the grip keeps long-press reorder. */}
          <Pressable
            disabled={sorting}
            onPress={() => {
              if (sorting) return;
              if (revealed) onCollapse();
              else onOpen();
            }}
            accessibilityRole="button"
            accessibilityLabel={`動作 ${index + 1}，${exercise.name}，查看說明`}
            accessibilityHint={
              sorting
                ? undefined
                : revealed
                  ? "點一下關閉刪除"
                  : count > 1
                    ? "向左滑顯示刪除"
                    : undefined
            }
            style={s.details}
          >
            <View
              style={s.thumbnail}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <ExerciseDiagram exercise={exercise} size={50} background="transparent" />
            </View>
            <View style={s.copy}>
              <Text numberOfLines={2} style={s.title}>
                {String(index + 1).padStart(2, "0")} · {exercise.name}
              </Text>
              <Text style={s.seconds}>30 秒</Text>
            </View>
          </Pressable>
        </View>
        <DragHandle
          name={exercise.name}
          position={index}
          count={count}
          onBegin={onBegin}
          onMove={onMove}
          onFinish={onFinish}
          onCancel={onCancel}
          onStep={onStep}
        />
      </Animated.View>
    </View>
  );
}

export default function ReorderableExerciseList({
  items,
  onChange,
  onDelete,
  onOpen,
  onDragStateChange,
  onSwipeActive = () => {},
  scrollRef,
  viewportRef,
  scrollMetrics,
}: Props) {
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const signature = items.map((item) => item.id).join("\0");
  const [reveal, setReveal] = useState<{ signature: string; index: number | null }>({
    signature,
    index: null,
  });
  if (reveal.signature !== signature) setReveal({ signature, index: null });
  const openIndex = reveal.signature === signature ? reveal.index : null;
  const [motion] = useState(() => new Animated.Value(0));
  const active = useRef<{
    from: number;
    to: number;
    startY: number;
    fingerY: number;
    startOffset: number;
  } | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbacks = useRef({ items, onChange, onDragStateChange });
  useEffect(() => {
    callbacks.current = { items, onChange, onDragStateChange };
  }, [items, onChange, onDragStateChange]);
  const update = useCallback(
    (pageY: number) => {
      const current = active.current;
      if (!current) return;
      current.fingerY = pageY;
      const dy = Math.max(
        -current.from * ROW_HEIGHT,
        Math.min(
          (callbacks.current.items.length - 1 - current.from) * ROW_HEIGHT,
          pageY -
            current.startY +
            scrollMetrics.current.offset -
            current.startOffset,
        ),
      );
      motion.setValue(dy);
      const to = Math.max(
        0,
        Math.min(
          callbacks.current.items.length - 1,
          Math.round(current.from + dy / ROW_HEIGHT),
        ),
      );
      if (to !== current.to) {
        current.to = to;
        setDrag({ from: current.from, to });
      }
    },
    [motion, scrollMetrics],
  );
  const finish = useCallback(
    (commit: boolean) => {
      const current = active.current;
      active.current = null;
      if (interval.current) clearInterval(interval.current);
      interval.current = null;
      if (commit && current && current.from !== current.to) {
        const next = [...callbacks.current.items];
        const [moved] = next.splice(current.from, 1);
        next.splice(current.to, 0, moved);
        callbacks.current.onChange(next);
      }
      motion.setValue(0);
      setDrag(null);
      callbacks.current.onDragStateChange(false);
    },
    [motion],
  );
  useEffect(
    () => () => {
      if (interval.current) clearInterval(interval.current);
    },
    [],
  );
  function begin(from: number, pageY: number) {
    setReveal({ signature, index: null });
    active.current = {
      from,
      to: from,
      startY: pageY,
      fingerY: pageY,
      startOffset: scrollMetrics.current.offset,
    };
    viewportRef.current?.measureInWindow((_x, top, _width, height) => {
      scrollMetrics.current.top = top;
      scrollMetrics.current.viewportHeight = height;
    });
    setDrag({ from, to: from });
    callbacks.current.onDragStateChange(true);
    interval.current = setInterval(() => {
      const current = active.current,
        metrics = scrollMetrics.current;
      if (!current || !metrics.viewportHeight) return;
      const edge = 56,
        bottom = metrics.top + metrics.viewportHeight;
      const speed =
        current.fingerY < metrics.top + edge
          ? -Math.min(12, ((metrics.top + edge - current.fingerY) / edge) * 12)
          : current.fingerY > bottom - edge
            ? Math.min(12, ((current.fingerY - bottom + edge) / edge) * 12)
            : 0;
      const offset = Math.max(
        0,
        Math.min(
          Math.max(0, metrics.contentHeight - metrics.viewportHeight),
          metrics.offset + speed,
        ),
      );
      if (offset !== metrics.offset) {
        metrics.offset = offset;
        scrollRef.current?.scrollTo({ y: offset, animated: false });
      }
      update(current.fingerY);
    }, 32);
  }
  function step(from: number, delta: number) {
    const to = Math.max(0, Math.min(items.length - 1, from + delta));
    if (from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }
  return (
    <View>
      {items.map((exercise, index) => {
        const selected = drag?.from === index;
        const shifted =
          drag && !selected
            ? drag.to > drag.from && index > drag.from && index <= drag.to
              ? -ROW_HEIGHT
              : drag.to < drag.from && index >= drag.to && index < drag.from
                ? ROW_HEIGHT
                : 0
            : 0;
        const revealed = openIndex === index && !drag && items.length > 1;
        return (
          <Animated.View
            key={exercise.id}
            style={[
              s.slot,
              {
                zIndex: selected ? 10 : revealed ? 2 : 0,
                transform: [{ translateY: selected ? motion : shifted }],
              },
              selected && s.dragging,
            ]}
          >
            <ExerciseRow
              exercise={exercise}
              index={index}
              count={items.length}
              revealed={revealed}
              sorting={drag !== null}
              lifted={selected}
              onReveal={() => {
                if (items.length <= 1 || drag) return;
                setReveal({ signature, index });
              }}
              onCollapse={() =>
                setReveal((current) =>
                  current.index === index ? { signature, index: null } : current,
                )
              }
              onDelete={() => {
                if (items.length <= 1 || drag) return;
                onDelete(index);
              }}
              onOpen={() => onOpen(exercise)}
              onSwipeActive={onSwipeActive}
              onBegin={(y) => begin(index, y)}
              onMove={update}
              onFinish={() => finish(true)}
              onCancel={() => finish(false)}
              onStep={(delta) => step(index, delta)}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  slot: {
    height: ROW_HEIGHT - 8,
    marginBottom: 8,
    borderRadius: 12,
  },
  clip: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.red,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.card,
  },
  rowLifted: { backgroundColor: palette.pale },
  dragging: {
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  delete: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: SWIPE_DELETE_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.red,
  },
  deleteRaised: { zIndex: 2 },
  deleteText: {
    color: palette.onBlue,
    fontFamily: font.bold,
    fontSize: 14,
  },
  swipeArea: { flex: 1, alignSelf: "stretch" },
  details: {
    flex: 1,
    height: ROW_HEIGHT - 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 10,
  },
  thumbnail: { width: 50, height: 50, borderRadius: 10, backgroundColor: palette.pale, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 4 },
  title: {
    fontFamily: font.bold,
    color: palette.ink,
    fontSize: 13,
    lineHeight: 21,
  },
  seconds: {
    color: palette.muted,
    fontFamily: font.regular,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  handle: {
    width: 44,
    height: ROW_HEIGHT - 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
