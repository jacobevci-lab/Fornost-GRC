export const paletteIds = ["default", "nar", "carbon-saffron", "traverten"] as const;
export type Palette = typeof paletteIds[number];

export function isPalette(value: unknown): value is Palette {
  return paletteIds.some(id => id === value);
}

export function paletteName(id: Palette, tr: boolean) {
  switch (id) {
    case "default": return tr ? "Fornost (varsayılan)" : "Fornost (default)";
    case "nar": return "Nar";
    case "carbon-saffron": return "Karbon & Safran";
    case "traverten": return "Traverten";
  }
}
