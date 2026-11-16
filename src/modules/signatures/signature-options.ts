export const SIGNATURE_INK_COLORS = [
  { id: "red", label: "Red", hex: "#DC2626" },
  { id: "green", label: "Green", hex: "#15803D" },
  { id: "black", label: "Black", hex: "#111111" },
  { id: "blue", label: "Blue", hex: "#2563EB" },
  { id: "purple", label: "Purple", hex: "#7E22CE" },
] as const;

export const SIGNATURE_INK_COLOR_IDS = [
  "red",
  "green",
  "black",
  "blue",
  "purple",
] as const;

export const SIGNATURE_PEN_SIZES = [
  { id: "fine", label: "Fine pen", widthMm: 1.5 },
  { id: "recommended", label: "Recommended default", widthMm: 2.5 },
  { id: "bold", label: "Bold marker", widthMm: 3.5 },
] as const;

export const SIGNATURE_PEN_WIDTHS_MM = [1.5, 2.5, 3.5] as const;
export const DEFAULT_SIGNATURE_INK_COLOR = "black" as const;
export const DEFAULT_SIGNATURE_PEN_WIDTH_MM = 2.5 as const;

export type SignatureInkColor = (typeof SIGNATURE_INK_COLOR_IDS)[number];
export type SignaturePenWidthMm = (typeof SIGNATURE_PEN_WIDTHS_MM)[number];

export function getSignaturePlaygroundOptions() {
  return {
    colors: SIGNATURE_INK_COLORS,
    penSizes: SIGNATURE_PEN_SIZES,
    defaults: {
      inkColor: DEFAULT_SIGNATURE_INK_COLOR,
      penWidthMm: DEFAULT_SIGNATURE_PEN_WIDTH_MM,
    },
  };
}
