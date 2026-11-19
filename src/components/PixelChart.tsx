// A small line chart in the arcade style: square points, the best value in
// yellow, the latest in pink. Plain SVG; no chart library needed for one line.
import type { ChartPoint } from '../lib/stats.ts';
import { formatMonth } from '../lib/dates.ts';

type Props = {
  points: ChartPoint[];
  unit: string;
  lowerIsBetter?: boolean;
  label: string;
};

const W = 340;
const H = 120;
const PAD = 10;

export function PixelChart({ points, unit, lowerIsBetter = false, label }: Props) {
  if (points.length < 2) {
    return <p className="muted">Log this in two different months to see a trend.</p>;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (points.length - 1);
  // Higher on the chart always means better, so assistance is drawn upside down.
  const y = (v: number) => {
    const t = (v - min) / span;
    return PAD + (lowerIsBetter ? t : 1 - t) * (H - 2 * PAD - 8);
  };
  const best = lowerIsBetter ? min : max;
  const bestIndex = values.indexOf(best);
  const last = points.length - 1;

  return (
    <figure className="pixel-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
        <line x1={PAD} y1={H - 4} x2={W - PAD} y2={H - 4} className="chart-axis" />
        <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} className="chart-line" />
        {points.map((p, i) => {
          const s = i === last ? 12 : 8;
          const cls = i === last ? 'chart-dot last' : i === bestIndex ? 'chart-dot best' : 'chart-dot';
          return <rect key={p.label} x={x(i) - s / 2} y={y(p.value) - s / 2} width={s} height={s} className={cls} />;
        })}
      </svg>
      <figcaption className="chart-legend">
        <span>
          {formatMonth(points[0].label)} · {points[0].value}
          {unit}
        </span>
        <span className="best">
          {lowerIsBetter ? 'Least' : 'Top'} {best}
          {unit}
        </span>
        <span>
          Now · {points[last].value}
          {unit}
        </span>
      </figcaption>
    </figure>
  );
}
