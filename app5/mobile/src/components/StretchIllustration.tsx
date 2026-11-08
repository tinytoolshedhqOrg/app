import Svg, { Circle, Path } from "react-native-svg";
import { palette } from "../theme/studio";

export default function StretchIllustration({ size = 160 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160" accessible={false}>
      <Circle cx={84} cy={78} r={62} fill={palette.onBlue} opacity={0.08} />
      <Circle cx={84} cy={44} r={11} fill="#B7D4FF" />
      <Path
        d="M83 65 73 96 57 127M74 95 98 124M82 68 57 77 38 62M83 67 107 52 119 27"
        fill="none"
        stroke="#B7D4FF"
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="m125 39 4-11m1 19 11-5" stroke="#B7D4FF" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
