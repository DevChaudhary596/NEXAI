"use client";

interface PixelIconProps {
  size?: number;
  className?: string;
}

/** Pixel-grid coordinates, drawn as 1x1 <rect>s on an integer grid so edges stay crisp at any scale. */
function PixelGrid({
  cells,
  cols,
  rows,
  size = 24,
  className,
}: {
  cells: [number, number][];
  cols: number;
  rows: number;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={(size * rows) / cols}
      viewBox={`0 0 ${cols} ${rows}`}
      shapeRendering="crispEdges"
      className={className}
      style={{ display: "block" }}
      aria-hidden="true"
    >
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  );
}

/** 15x9 pixel satellite: body + two solar panels on struts, antenna, and signal blips. */
export function PixelSatellite({ size = 24, className }: PixelIconProps) {
  const cells: [number, number][] = [
    // left panel
    [0, 2], [1, 2], [2, 2],
    [0, 3], [1, 3], [2, 3],
    [0, 4], [1, 4], [2, 4],
    [0, 5], [1, 5], [2, 5],
    [0, 6], [1, 6], [2, 6],
    // left strut
    [3, 4], [4, 4],
    // body
    [5, 2], [6, 2], [7, 2], [8, 2], [9, 2],
    [5, 3], [6, 3], [7, 3], [8, 3], [9, 3],
    [5, 4], [6, 4], [7, 4], [8, 4], [9, 4],
    [5, 5], [6, 5], [7, 5], [8, 5], [9, 5],
    [5, 6], [6, 6], [7, 6], [8, 6], [9, 6],
    // right strut
    [10, 4], [11, 4],
    // right panel
    [12, 2], [13, 2], [14, 2],
    [12, 3], [13, 3], [14, 3],
    [12, 4], [13, 4], [14, 4],
    [12, 5], [13, 5], [14, 5],
    [12, 6], [13, 6], [14, 6],
    // antenna
    [6, 1], [5, 0],
    // signal blips
    [3, 0], [1, 0],
  ];
  return <PixelGrid cells={cells} cols={15} rows={9} size={size} className={className} />;
}

/** 7x7 pixel robot head for the assistant avatar — eyes are punched-out cells. */
export function PixelBot({ size = 24, className }: PixelIconProps) {
  const cells: [number, number][] = [
    [3, 0], // antenna
    [1, 1], [2, 1], [3, 1], [4, 1], [5, 1],
    [1, 2], [2, 2],         [4, 2], [5, 2],
    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
    [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
    [1, 5], [2, 5], [3, 5], [4, 5], [5, 5],
  ];
  return <PixelGrid cells={cells} cols={7} rows={6} size={size} className={className} />;
}
