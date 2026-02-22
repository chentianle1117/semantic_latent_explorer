import React from "react";

export interface PillDef {
  text: string;
  color: string; // e.g. "#00d2ff"
}

/**
 * Split text on known pill strings and wrap matches in colored <span> elements.
 * Longest pills are matched first to avoid partial overlaps.
 *
 * @param mode  "bordered" (default) — pill with border/padding for suggestion panels
 *              "inline"  — lightweight highlight only (same char width, for textarea overlay)
 */
export function renderWithPills(
  text: string,
  pills: PillDef[],
  mode: "bordered" | "inline" = "bordered"
): React.ReactNode[] {
  if (!pills.length || !text) return [<span key={0}>{text}</span>];

  // Sort by length desc to avoid partial matches (e.g. "white" vs "white leather")
  const sorted = [...pills].sort((a, b) => b.text.length - a.text.length);

  // Build a case-insensitive regex that matches any pill text
  const escaped = sorted.map((p) =>
    p.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const re = new RegExp(`(${escaped.join("|")})`, "gi");

  // Build a color lookup (case-insensitive)
  const colorMap = new Map<string, string>();
  for (const p of sorted) {
    colorMap.set(p.text.toLowerCase(), p.color);
  }

  const className = mode === "inline" ? "prompt-pill-inline" : "prompt-pill";

  const parts = text.split(re);
  return parts.map((part, i) => {
    const color = colorMap.get(part.toLowerCase());
    if (color) {
      return (
        <span
          key={i}
          className={className}
          style={
            {
              "--pill-color": color,
            } as React.CSSProperties
          }
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
