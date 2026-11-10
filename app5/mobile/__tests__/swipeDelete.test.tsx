/**
 * Source-level coverage for swipe-to-reveal deletion.
 * Gestures are invoked through PanResponder callbacks in react-test-renderer.
 * This file does not run on a device, simulator, or EAS build.
 */
import React from "react";
import { PanResponder, ScrollView, type PanResponderCallbacks } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ReorderableExerciseList from "../src/components/ReorderableExerciseList";
import PreviewScreen from "../src/screens/PreviewScreen";
import ActionButton from "../src/components/ActionButton";
import { loadBundledContent } from "../src/content";
import {
  bodyParts,
  getBodySelection,
  getCombinations,
  resolveSelection,
  type Selection,
} from "../src/content/catalog";
import { setProUnlocked } from "../src/iap";
import { getCurrentRoutine } from "../src/storage";
import {
  getSelection,
  readLastStarted,
  setSelection,
} from "../src/storage/selection";

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() };
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (callback: () => void) =>
    require("react").useEffect(callback, [callback]),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

function isDragHandle(config: PanResponderCallbacks) {
  return config.onStartShouldSetPanResponder?.({} as never, {} as never) === true;
}
function isSwipe(config: PanResponderCallbacks) {
  return typeof config.onMoveShouldSetPanResponderCapture === "function";
}
const event = (pageY = 0) => ({ nativeEvent: { pageY } }) as never;
const pan = (dx: number, dy = 0, vx = 0) => ({ dx, dy, vx, vy: 0 }) as never;

function catalogSnapshot() {
  return {
    combos: getCombinations().map((combo) => [combo.id, combo.exerciseIds.join(",")]),
    bodies: bodyParts.map((part) => [
      part.name,
      getBodySelection(part.name).exerciseIds.join(","),
    ]),
    library: loadBundledContent().exercises.map((exercise) => exercise.id),
  };
}

describe("swipe-left delete gesture", () => {
  let rendered: ReactTestRenderer;
  let responders: PanResponderCallbacks[];
  const changed = jest.fn();
  const removed = jest.fn();
  const opened = jest.fn();
  const swiping = jest.fn();
  const items = resolveSelection(getCombinations()[0]);

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    responders = [];
    jest.spyOn(PanResponder, "create").mockImplementation((config) => {
      responders.push(config);
      return { panHandlers: {} };
    });
    await mount(items);
  });
  afterEach(async () => {
    await act(async () => rendered.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function mount(next: typeof items) {
    await act(async () => {
      rendered = create(
        <ReorderableExerciseList
          items={next}
          onChange={changed}
          onDelete={removed}
          onOpen={opened}
          onDragStateChange={jest.fn()}
          onSwipeActive={swiping}
          scrollRef={{ current: null }}
          viewportRef={{ current: null }}
          scrollMetrics={{
            current: { offset: 0, top: 0, viewportHeight: 600, contentHeight: 1000 },
          }}
        />,
      );
    });
  }
  function swipes() {
    return responders.filter(isSwipe);
  }
  function visibleDelete(name: string) {
    return rendered.root.findAll(
      (node) =>
        node.props.accessibilityLabel === `刪除${name}` &&
        node.props.accessibilityElementsHidden === false &&
        typeof node.props.onPress === "function",
    );
  }
  async function swipeRelease(config: PanResponderCallbacks, dx: number, vx = 0) {
    await act(async () => {
      config.onPanResponderGrant?.(event(), pan(0));
      config.onPanResponderMove?.(event(), pan(dx, 1, vx));
      config.onPanResponderRelease?.(event(), pan(dx, 1, vx));
    });
  }

  it("reveals one delete button on a left swipe and deletes only after the tap", async () => {
    const first = swipes()[0];
    const second = swipes()[1];
    expect(first.onStartShouldSetPanResponder?.(event(), pan(0))).toBe(false);
    expect(first.onMoveShouldSetPanResponderCapture?.(event(), pan(-24, 2))).toBe(true);
    expect(first.onMoveShouldSetPanResponder?.(event(), pan(-24, 30))).toBe(false);
    expect(first.onPanResponderTerminationRequest?.({} as never, pan(0))).toBe(false);
    expect(first.onShouldBlockNativeResponder?.({} as never, pan(0))).toBe(true);

    await swipeRelease(first, -16, 0);
    expect(visibleDelete(items[0].name)).toHaveLength(0);
    expect(removed).not.toHaveBeenCalled();

    await swipeRelease(first, -70, 0);
    expect(swiping).toHaveBeenNthCalledWith(1, true);
    expect(swiping).toHaveBeenLastCalledWith(false);
    expect(visibleDelete(items[0].name)).toHaveLength(1);
    expect(visibleDelete(items[1].name)).toHaveLength(0);
    expect(removed).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();

    await swipeRelease(second, -70, 0);
    expect(visibleDelete(items[0].name)).toHaveLength(0);
    expect(visibleDelete(items[1].name)).toHaveLength(1);

    await act(async () => {
      visibleDelete(items[1].name)[0].props.onPress();
    });
    expect(removed).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledWith(1);
    expect(opened).not.toHaveBeenCalled();
  });

  it("keeps tap-to-open, closes an open row on tap, and still reorders after a deletion", async () => {
    const opener = rendered.root.findAll(
      (node) =>
        node.props.accessibilityLabel === `動作 1，${items[0].name}，查看說明` &&
        typeof node.props.onPress === "function",
    )[0];
    await act(async () => opener.props.onPress());
    expect(opened).toHaveBeenCalledWith(items[0]);

    await swipeRelease(swipes()[0], -70);
    await act(async () => opener.props.onPress());
    expect(opened).toHaveBeenCalledTimes(1);
    expect(visibleDelete(items[0].name)).toHaveLength(0);

    await swipeRelease(swipes()[0], -70);
    await act(async () => visibleDelete(items[0].name)[0].props.onPress());
    const remaining = items.slice(1);
    await act(async () => {
      rendered.update(
        <ReorderableExerciseList
          items={remaining}
          onChange={changed}
          onDelete={removed}
          onOpen={opened}
          onDragStateChange={jest.fn()}
          onSwipeActive={swiping}
          scrollRef={{ current: null }}
          viewportRef={{ current: null }}
          scrollMetrics={{
            current: { offset: 0, top: 0, viewportHeight: 600, contentHeight: 1000 },
          }}
        />,
      );
    });
    const handle = responders.filter(isDragHandle).slice(-remaining.length)[0];
    await act(async () => {
      handle.onPanResponderGrant?.(event(100), {} as never);
      jest.advanceTimersByTime(300);
    });
    await act(async () => handle.onPanResponderMove?.(event(268), { dy: 168, dx: 0 } as never));
    await act(async () => handle.onPanResponderRelease?.(event(268), {} as never));
    const expected = [...remaining];
    expected.splice(2, 0, expected.splice(0, 1)[0]);
    expect(changed).toHaveBeenCalledWith(expected);
  });

  it("does not reveal or delete when one action remains", async () => {
    await act(async () => rendered.unmount());
    responders = [];
    await mount(items.slice(0, 1));
    const swipe = swipes()[0];
    expect(swipe.onMoveShouldSetPanResponderCapture?.(event(), pan(-40, 0))).toBe(false);
    await swipeRelease(swipe, -80, -2);
    expect(
      rendered.root.findAll((node) => String(node.props.accessibilityLabel ?? "").startsWith("刪除")),
    ).toHaveLength(0);
    expect(removed).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
});

describe("preview deletion stays inside the current routine", () => {
  let rendered: ReactTestRenderer | undefined;
  let responders: PanResponderCallbacks[];
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await setProUnlocked(true);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    responders = [];
    jest.spyOn(PanResponder, "create").mockImplementation((config) => {
      responders.push(config);
      return { panHandlers: {} };
    });
  });
  afterEach(async () => {
    if (rendered) await act(async () => rendered!.unmount());
    rendered = undefined;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const textOf = (value: string) =>
    rendered!.root.findAllByType(require("react-native").Text).some((node) => node.props.children === value);
  function swipes() {
    return responders.filter(isSwipe);
  }
  async function open(selection: Selection) {
    responders = [];
    setSelection(selection);
    await act(async () => {
      rendered = create(<PreviewScreen />);
    });
  }
  async function reveal(index: number) {
    const swipe = swipes()[index];
    await act(async () => {
      swipe.onPanResponderGrant?.(event(), pan(0));
      swipe.onPanResponderMove?.(event(), pan(-70, 1));
      swipe.onPanResponderRelease?.(event(), pan(-70, 1));
    });
  }
  function visibleDelete(name: string) {
    return rendered!.root.findAll(
      (node) =>
        node.props.accessibilityLabel === `刪除${name}` &&
        node.props.accessibilityElementsHidden === false &&
        typeof node.props.onPress === "function",
    );
  }
  async function deleteVisible(name: string) {
    await act(async () => visibleDelete(name)[0].props.onPress());
  }
  function scroll() {
    return rendered!.root.findAllByType(ScrollView).find((node) => "directionalLockEnabled" in node.props)!;
  }

  it("deletes one action, keeps every other group, and persists the shorter session on start", async () => {
    const before = catalogSnapshot();
    const office = getCombinations().find((combo) => combo.id === "office")!;
    const standing = getCombinations().find((combo) => combo.id === "standing")!;
    const officeIds = office.exerciseIds;
    const standingIds = standing.exerciseIds;
    const removed = resolveSelection(office)[0];
    await open(office);
    expect(textOf("04:00")).toBe(true);
    expect(textOf("08")).toBe(true);
    expect(scroll().props.scrollEnabled).toBe(true);

    const swipe = swipes()[0];
    await act(async () => swipe.onPanResponderGrant?.(event(), pan(0)));
    expect(scroll().props.scrollEnabled).toBe(false);
    await act(async () => {
      swipe.onPanResponderMove?.(event(), pan(-70, 1));
      swipe.onPanResponderRelease?.(event(), pan(-70, 1));
    });
    expect(scroll().props.scrollEnabled).toBe(true);
    expect(scroll().props.directionalLockEnabled).toBe(true);
    expect(await readLastStarted()).toBeNull();
    expect(getSelection()?.exerciseIds).toBe(officeIds);

    await act(async () => {
      rendered!.root
        .findAll(
          (node) =>
            node.props.accessibilityLabel === `動作 1，${removed.name}，查看說明` &&
            typeof node.props.onPress === "function",
        )[0]
        .props.onPress();
    });
    expect(visibleDelete(removed.name)).toHaveLength(0);

    await reveal(0);
    await deleteVisible(removed.name);
    const kept = officeIds.slice(1);
    expect(textOf("03:30")).toBe(true);
    expect(textOf("07")).toBe(true);
    expect(textOf("04:00")).toBe(false);
    expect(office.exerciseIds).toBe(officeIds);
    expect(officeIds[0]).toBe(removed.id);
    expect(await readLastStarted()).toBeNull();
    expect(catalogSnapshot()).toEqual(before);

    await act(async () => rendered!.root.findByType(ActionButton).props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith("Player");
    expect(getCurrentRoutine()?.units.map((exercise) => exercise.id)).toEqual([...kept]);
    expect(getCurrentRoutine()?.units.reduce((sum, exercise) => sum + exercise.duration_seconds, 0)).toBe(kept.length * 30);
    expect((await readLastStarted())?.id).toBe("office");
    expect((await readLastStarted())?.exerciseIds).toEqual([...kept]);
    expect(getSelection()?.exerciseIds).toEqual([...kept]);
    expect(getSelection()?.exerciseIds).not.toBe(officeIds);
    expect(getCombinations().find((combo) => combo.id === "office")!.exerciseIds).toBe(officeIds);
    expect(getCombinations().find((combo) => combo.id === "standing")!.exerciseIds).toBe(standingIds);
    expect(catalogSnapshot()).toEqual(before);

    await act(async () => rendered!.unmount());
    rendered = undefined;
    await open(standing);
    expect(textOf("04:00")).toBe(true);
    expect(textOf(String(standing.exerciseIds.length).padStart(2, "0"))).toBe(true);
    expect(resolveSelection(getSelection()!).map((exercise) => exercise.id)).toEqual([...standingIds]);
  });

  it("stops at one action, then persists a reorder of the actions that remain", async () => {
    const before = catalogSnapshot();
    const hands = getCombinations().find((combo) => combo.id === "hands")!;
    const ids = [...hands.exerciseIds];
    await open({ ...hands, exerciseIds: ids.slice(0, 2) });
    const first = resolveSelection({ ...hands, exerciseIds: ids.slice(0, 2) })[0];
    await reveal(0);
    await deleteVisible(first.name);
    expect(textOf("00:30")).toBe(true);
    expect(textOf("01")).toBe(true);
    expect(
      rendered!.root.findAll((node) => String(node.props.accessibilityLabel ?? "").startsWith("刪除")),
    ).toHaveLength(0);
    expect(swipes()[1].onMoveShouldSetPanResponderCapture?.(event(), pan(-50, 0))).toBe(false);
    await act(async () => {
      swipes()[1].onPanResponderRelease?.(event(), pan(-80, 0, -2));
    });
    expect(textOf("01")).toBe(true);
    expect(hands.exerciseIds).toEqual(ids);

    await act(async () => rendered!.unmount());
    rendered = undefined;
    await open(hands);
    const names = resolveSelection(hands).map((exercise) => exercise.name);
    await reveal(0);
    await deleteVisible(names[0]);
    await act(async () => {
      rendered!.root
        .findAll(
          (node) =>
            node.props.accessibilityLabel === `調整${names[1]}的順序` &&
            typeof node.props.onAccessibilityAction === "function",
        )[0]
        .props.onAccessibilityAction({ nativeEvent: { actionName: "increment" } });
    });
    await act(async () => rendered!.root.findByType(ActionButton).props.onPress());
    const expected = [ids[2], ids[1], ids[3]];
    expect(getCurrentRoutine()?.units.map((exercise) => exercise.id)).toEqual(expected);
    expect((await readLastStarted())?.exerciseIds).toEqual(expected);
    expect(getCurrentRoutine()?.units.reduce((sum, exercise) => sum + exercise.duration_seconds, 0)).toBe(90);
    expect(textOf("01:30")).toBe(true);
    expect(hands.exerciseIds).toEqual(ids);
    expect(catalogSnapshot()).toEqual(before);
  });

  async function pressLabel(label: string) {
    await act(async () => {
      const target = rendered!.root.findAll(
        (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === "function",
      )[0];
      if (!target) throw new Error(`Missing control: ${label}`);
      target.props.onPress();
    });
  }

  it("cycles matching replacements once, and skip keeps the deletion", async () => {
    const before = catalogSnapshot();
    const hands = getCombinations().find((combo) => combo.id === "hands")!;
    const ids = [...hands.exerciseIds];
    await open(hands);
    const removed = resolveSelection(hands)[1];
    await reveal(1);
    await deleteVisible(removed.name);
    expect(textOf("站姿手腕活動")).toBe(true);
    expect(textOf("同一個活動，姿勢相近")).toBe(true);
    expect(textOf("01:30")).toBe(true);
    await pressLabel("換一個");
    expect(textOf("仰躺手腕勾放")).toBe(true);
    expect(textOf("站姿手腕活動")).toBe(false);
    expect(textOf("同一個活動，另一個姿勢")).toBe(true);
    const next = rendered!.root.findAll(
      (node) => node.props.accessibilityLabel === "換一個" && typeof node.props.onPress === "function",
    )[0];
    expect(next.props.accessibilityState).toEqual({ disabled: true });
    await act(async () => next.props.onPress());
    expect(textOf("仰躺手腕勾放")).toBe(true);
    await pressLabel("不用替代");
    expect(textOf("仰躺手腕勾放")).toBe(false);
    expect(textOf("站姿手腕活動")).toBe(false);
    expect(textOf("01:30")).toBe(true);
    await act(async () => rendered!.root.findByType(ActionButton).props.onPress());
    const kept = [ids[0], ids[2], ids[3]];
    expect(getCurrentRoutine()?.units.map((exercise) => exercise.id)).toEqual(kept);
    expect((await readLastStarted())?.exerciseIds).toEqual(kept);
    expect(hands.exerciseIds).toEqual(ids);
    expect(catalogSnapshot()).toEqual(before);
  });

  it("inserts an accepted replacement at the deleted position and persists that list", async () => {
    const before = catalogSnapshot();
    const hands = getCombinations().find((combo) => combo.id === "hands")!;
    const standing = getCombinations().find((combo) => combo.id === "standing")!;
    const handsIds = hands.exerciseIds;
    const standingIds = standing.exerciseIds;
    await open(hands);
    const removed = resolveSelection(hands)[1];
    await reveal(1);
    await deleteVisible(removed.name);
    await pressLabel("加入替代");
    expect(
      rendered!.root.findAll(
        (node) => node.props.accessibilityLabel === "動作 2，站姿手腕活動，查看說明",
      ).length,
    ).toBeGreaterThan(0);
    expect(textOf("要加入相近的動作嗎？")).toBe(false);
    expect(textOf("02:00")).toBe(true);
    expect(textOf("04")).toBe(true);
    await act(async () => {
      rendered!.root
        .findAll(
          (node) =>
            node.props.accessibilityLabel === "調整站姿手腕活動的順序" &&
            typeof node.props.onAccessibilityAction === "function",
        )[0]
        .props.onAccessibilityAction({ nativeEvent: { actionName: "increment" } });
    });
    expect(textOf("要加入相近的動作嗎？")).toBe(false);
    await act(async () => rendered!.root.findByType(ActionButton).props.onPress());
    const expected = [handsIds[0], handsIds[2], "stand_wrist_flex", handsIds[3]];
    expect(getCurrentRoutine()?.units.map((exercise) => exercise.id)).toEqual([...expected]);
    expect(getCurrentRoutine()?.units.reduce((sum, exercise) => sum + exercise.duration_seconds, 0)).toBe(120);
    expect((await readLastStarted())?.exerciseIds).toEqual([...expected]);
    expect(hands.exerciseIds).toBe(handsIds);
    expect(standing.exerciseIds).toBe(standingIds);
    expect(catalogSnapshot()).toEqual(before);
  });

  it("offers no replacement for an unmatched action or the final remaining action", async () => {
    const source = getCombinations().find((combo) => combo.id === "office")!;
    const turn = resolveSelection(source).find((exercise) => exercise.id === "sit_upper_back_turn");
    const side = resolveSelection(source).find((exercise) => exercise.id === "sit_neck_side");
    if (!turn || !side) throw new Error("fixture exercises missing");
    await open({ ...source, exerciseIds: [turn.id, side.id] });
    await reveal(0);
    await deleteVisible(turn.name);
    expect(textOf("肩胛輕收放")).toBe(false);
    expect(
      rendered!.root.findAll((node) => node.props.accessibilityLabel === "加入替代"),
    ).toHaveLength(0);
    expect(textOf("00:30")).toBe(true);
    expect(
      rendered!.root.findAll((node) => String(node.props.accessibilityLabel ?? "").startsWith("刪除")),
    ).toHaveLength(0);

    await act(async () => rendered!.unmount());
    rendered = undefined;
    await open({ ...source, exerciseIds: [side.id] });
    expect(
      rendered!.root.findAll((node) => node.props.accessibilityLabel === "加入替代"),
    ).toHaveLength(0);
    expect(
      rendered!.root.findAll((node) => String(node.props.accessibilityLabel ?? "").startsWith("刪除")),
    ).toHaveLength(0);
  });
});
