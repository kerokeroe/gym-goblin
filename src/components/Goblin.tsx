// The pixel goblin. A 12x12 grid drawn as SVG rects; `crispEdges` keeps the
// pixels sharp at any size. The mood changes the eyes, the mouth and the prop.
export type GoblinMood = 'cheer' | 'idle' | 'sleepy';

const SKIN = '#5FD12E';
const SHADE = '#4AB01F';
const INK = '#0E0B16';

type Px = [x: number, y: number, w: number, h: number, fill: string];

const HEAD: Px[] = [
  [0, 0, 1, 1, SKIN], [11, 0, 1, 1, SKIN],
  [0, 1, 2, 1, SKIN], [3, 1, 6, 1, SKIN], [10, 1, 2, 1, SKIN],
  [1, 2, 10, 1, SKIN],
  [2, 3, 8, 1, SKIN],
  [2, 4, 8, 1, SKIN],
  [2, 5, 8, 1, SHADE],
  [2, 6, 8, 1, SKIN],
  [3, 7, 6, 1, SKIN],
  [4, 8, 4, 1, SHADE],
];

const FACES: Record<GoblinMood, Px[]> = {
  cheer: [
    [4, 3, 1, 1, '#FFE14D'], [7, 3, 1, 1, '#FFE14D'],
    [4, 4, 1, 1, INK], [7, 4, 1, 1, INK],
    [3, 6, 6, 1, INK], [4, 6, 1, 1, '#FFFFFF'], [7, 6, 1, 1, '#FFFFFF'],
  ],
  idle: [
    [4, 4, 1, 1, INK], [7, 4, 1, 1, INK],
    [4, 6, 4, 1, INK],
  ],
  sleepy: [
    [4, 4, 2, 1, INK], [7, 4, 2, 1, INK],
    [5, 6, 2, 1, INK],
  ],
};

const PROPS: Record<GoblinMood, Px[]> = {
  // barbell overhead-ish: bar across, plates at the ends
  cheer: [[0, 9, 12, 1, '#9A9A9A'], [0, 8, 1, 3, '#C9C9C9'], [11, 8, 1, 3, '#C9C9C9'], [3, 10, 6, 2, '#FF4FD8']],
  idle: [[3, 9, 6, 3, '#FF4FD8']],
  sleepy: [[3, 9, 6, 3, '#7A3A72'], [10, 1, 1, 1, '#C9BEE0'], [11, 0, 1, 1, '#C9BEE0']],
};

const LABEL: Record<GoblinMood, string> = {
  cheer: 'Goblin cheering with a barbell',
  idle: 'Goblin waiting',
  sleepy: 'Goblin dozing',
};

export function Goblin({ mood = 'idle', size = 96 }: { mood?: GoblinMood; size?: number }) {
  const pixels = [...HEAD, ...FACES[mood], ...PROPS[mood]];
  return (
    <svg
      className={`goblin goblin-${mood}`}
      width={size}
      height={size}
      viewBox="0 0 12 12"
      role="img"
      aria-label={LABEL[mood]}
      shapeRendering="crispEdges"
    >
      {pixels.map(([x, y, w, h, fill], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
      ))}
    </svg>
  );
}
