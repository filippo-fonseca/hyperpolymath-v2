export interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

const namedColors: Record<string, string> = {
  red: "#ff0000",
  green: "#00ff00",
  blue: "#0000ff",
  white: "#ffffff",
  warmwhite: "#ffd7a0",
  yellow: "#ffff00",
  orange: "#ff8000",
  purple: "#8000ff",
  pink: "#ff1493",
  cyan: "#00ffff",
};

function channel(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
    throw new Error(`RGB channels must be whole numbers from 0 to 255; got "${value}".`);
  }
  return parsed;
}

export function parseColor(input: string): RgbColor {
  const normalized = namedColors[input.toLowerCase()] ?? input;
  const hex = normalized.match(/^#?([\da-f]{6})$/i)?.[1];
  if (hex) {
    return {
      red: Number.parseInt(hex.slice(0, 2), 16),
      green: Number.parseInt(hex.slice(2, 4), 16),
      blue: Number.parseInt(hex.slice(4, 6), 16),
    };
  }

  const rgb = normalized.split(",").map((value) => value.trim());
  if (rgb.length === 3) {
    return { red: channel(rgb[0]), green: channel(rgb[1]), blue: channel(rgb[2]) };
  }

  throw new Error(
    `Invalid color "${input}". Use a name (red, blue, warmwhite), #RRGGBB, or R,G,B.`,
  );
}

export function rgbToInteger(color: RgbColor): number {
  return (color.red << 16) | (color.green << 8) | color.blue;
}
