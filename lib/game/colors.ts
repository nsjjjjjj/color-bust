import type { CardColor } from "./types";

export const COLOR_IDENTITIES: Readonly<
  Record<
    CardColor,
    {
      readonly name: "RAGE" | "GLITCH" | "VENOM" | "VOLT";
      readonly short: "RG" | "GL" | "VN" | "VT";
      readonly koreanColor: "빨강" | "파랑" | "초록" | "노랑";
    }
  >
> = {
  red: { name: "RAGE", short: "RG", koreanColor: "빨강" },
  blue: { name: "GLITCH", short: "GL", koreanColor: "파랑" },
  green: { name: "VENOM", short: "VN", koreanColor: "초록" },
  yellow: { name: "VOLT", short: "VT", koreanColor: "노랑" },
};

export const COLOR_LABELS: Readonly<Record<CardColor, string>> = {
  red: COLOR_IDENTITIES.red.name,
  blue: COLOR_IDENTITIES.blue.name,
  green: COLOR_IDENTITIES.green.name,
  yellow: COLOR_IDENTITIES.yellow.name,
};
