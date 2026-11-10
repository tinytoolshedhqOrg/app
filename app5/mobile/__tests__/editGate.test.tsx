import React from "react";
import { PanResponder, Text, type PanResponderCallbacks } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PreviewScreen from "../src/screens/PreviewScreen";
import ActionButton from "../src/components/ActionButton";
import { clearProUnlocked, setProUnlocked } from "../src/iap";
import { t } from "../src/i18n";
import { getCombinations, resolveSelection } from "../src/content/catalog";
import { getCurrentRoutine } from "../src/storage";
import { setSelection } from "../src/storage/selection";

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

describe("preview editing follows the one-time unlock", () => {
  let rendered: ReactTestRenderer | undefined;
  let responders: PanResponderCallbacks[];
  const routine = getCombinations().find((combo) => combo.id === "hands")!;
  const units = resolveSelection(routine);

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await clearProUnlocked();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    responders = [];
    jest.spyOn(PanResponder, "create").mockImplementation((config) => {
      responders.push(config);
      return { panHandlers: {} };
    });
    setSelection(routine);
    await act(async () => {
      rendered = create(<PreviewScreen />);
    });
  });
  afterEach(async () => {
    if (rendered) await act(async () => rendered!.unmount());
    rendered = undefined;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const textOf = (value: string) =>
    rendered!.root.findAllByType(Text).some((node) => node.props.children === value);
  function swipes() {
    return responders.filter(isSwipe);
  }
  function hint() {
    return rendered!.root.findAll(
      (node) =>
        node.props.accessibilityLabel === t("preview.unlock") &&
        typeof node.props.onPress === "function",
    );
  }
  function orderHandle(label: string) {
    return rendered!.root.findAll(
      (node) =>
        node.props.accessibilityLabel === label &&
        typeof node.props.onAccessibilityAction === "function",
    );
  }

  it("blocks swipe, reorder, and replacement until the paywall is opened", async () => {
    expect(hint()).toHaveLength(1);
    expect(textOf("02:00")).toBe(true);
    expect(textOf("要加入相近的動作嗎？")).toBe(false);

    const swipe = swipes()[0];
    expect(swipe.onMoveShouldSetPanResponderCapture?.(event(), pan(-24, 2))).toBe(true);
    await act(async () => {
      swipe.onPanResponderGrant?.(event(), pan(0));
      swipe.onPanResponderMove?.(event(), pan(-70, 1));
      swipe.onPanResponderRelease?.(event(), pan(-70, 1));
    });
    expect(mockNavigation.navigate).toHaveBeenCalledWith("Paywall", { reason: "edit_routine" });
    expect(
      rendered!.root.findAll(
        (node) =>
          node.props.accessibilityLabel === `刪除${units[0].name}` &&
          node.props.accessibilityElementsHidden === false,
      ),
    ).toHaveLength(0);
    expect(textOf("02:00")).toBe(true);
    expect(textOf("要加入相近的動作嗎？")).toBe(false);

    mockNavigation.navigate.mockClear();
    const handle = responders.filter(isDragHandle)[0];
    await act(async () => {
      handle.onPanResponderGrant?.(event(100), {} as never);
      jest.advanceTimersByTime(400);
      handle.onPanResponderMove?.(event(268), { dy: 168, dx: 0 } as never);
      handle.onPanResponderRelease?.(event(268), {} as never);
    });
    expect(mockNavigation.navigate).toHaveBeenCalledWith("Paywall", { reason: "edit_routine" });
    expect(orderHandle(`解鎖後才能調整${units[0].name}的順序`).length).toBeGreaterThan(0);
    await act(async () => {
      orderHandle(`解鎖後才能調整${units[0].name}的順序`)[0].props.onAccessibilityAction({
        nativeEvent: { actionName: "increment" },
      });
    });
    expect(
      rendered!.root.findAll(
        (node) => node.props.accessibilityLabel === `動作 1，${units[0].name}，查看說明`,
      ).length,
    ).toBeGreaterThan(0);

    mockNavigation.navigate.mockClear();
    await act(async () => hint()[0].props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith("Paywall", { reason: "edit_routine" });

    await act(async () => rendered!.root.findByType(ActionButton).props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith("Player");
    expect(getCurrentRoutine()?.units.map((exercise) => exercise.id)).toEqual([...routine.exerciseIds]);
  });

  it("edits immediately after subscribePro reports the unlock", async () => {
    expect(hint()).toHaveLength(1);
    await act(async () => {
      await setProUnlocked(true);
    });
    expect(hint()).toHaveLength(0);
    expect(orderHandle(`調整${units[0].name}的順序`).length).toBeGreaterThan(0);
    await act(async () => {
      orderHandle(`調整${units[0].name}的順序`)[0].props.onAccessibilityAction({
        nativeEvent: { actionName: "increment" },
      });
    });
    expect(
      rendered!.root.findAll(
        (node) => node.props.accessibilityLabel === `動作 1，${units[1].name}，查看說明`,
      ).length,
    ).toBeGreaterThan(0);
    expect(mockNavigation.navigate).not.toHaveBeenCalledWith("Paywall", { reason: "edit_routine" });

    const swipe = swipes()[1];
    await act(async () => {
      swipe.onPanResponderGrant?.(event(), pan(0));
      swipe.onPanResponderMove?.(event(), pan(-70, 1));
      swipe.onPanResponderRelease?.(event(), pan(-70, 1));
    });
    const deleteButton = rendered!.root.findAll(
      (node) =>
        node.props.accessibilityLabel === `刪除${units[1].name}` &&
        node.props.accessibilityElementsHidden === false &&
        typeof node.props.onPress === "function",
    );
    expect(deleteButton).toHaveLength(1);
    await act(async () => deleteButton[0].props.onPress());
    expect(textOf("要加入相近的動作嗎？")).toBe(true);
    expect(textOf("站姿手腕活動")).toBe(true);
    expect(textOf("01:30")).toBe(true);
  });
});
