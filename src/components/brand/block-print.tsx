"use client";

import { useId } from "react";

/**
 * A repeating marigold motif in the style of Indian hand block printing (Sanganeri / Bagru buttis):
 * a six-petal flower on a grid, with small dots between. Pure SVG, so it is sharp and costs nothing to load.
 */
export function BlockPrint({ className }: { className?: string }) {
  // useId can contain characters that break `url(#…)`, so keep only the safe ones.
  const id = `print${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const petals = [0, 60, 120, 180, 240, 300];
  return (
    <svg aria-hidden className={className} width="100%" height="100%">
      <defs>
        <pattern id={id} width="56" height="56" patternUnits="userSpaceOnUse">
          <g transform="translate(28 28)" fill="currentColor">
            {petals.map((deg) => (
              <ellipse
                key={deg}
                rx="3.2"
                ry="8"
                cy="-8"
                transform={`rotate(${deg})`}
                opacity="0.9"
              />
            ))}
            <circle r="3.4" />
          </g>
          <g fill="currentColor" opacity="0.7">
            <circle cx="0" cy="0" r="1.6" />
            <circle cx="56" cy="0" r="1.6" />
            <circle cx="0" cy="56" r="1.6" />
            <circle cx="56" cy="56" r="1.6" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
