import { useId } from 'react';
import type { PricePoint } from '../../shared/types';

interface Props {
  points: PricePoint[];
  width?: number;
  height?: number;
  /** Show axis labels (min/max values and time span). */
  labels?: boolean;
  format?: (chaos: number) => string;
}

export function Sparkline({ points, width = 320, height = 80, labels = false, format = (c) => `${Math.round(c)}c` }: Props) {
  const gid = useId().replace(/:/g, '');
  if (points.length < 2) return <div className="spark-empty">Za mało danych do wykresu</div>;
  const values = points.map((p) => p.chaos);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = labels ? 18 : 4;
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.chaos).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;
  const up = values[values.length - 1] >= values[0];
  const color = up ? 'var(--good)' : 'var(--bad)';
  const hours = Math.round((Date.parse(points[points.length - 1].t) - Date.parse(points[0].t)) / 3_600_000);

  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Wykres ceny">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(values[values.length - 1])} r="3" fill={color} />
      {labels && (
        <>
          <text x={pad} y={12} className="spark-label">{format(max)}</text>
          <text x={pad} y={height - 4} className="spark-label">{format(min)}</text>
          <text x={width - pad} y={height - 4} textAnchor="end" className="spark-label">{hours > 0 ? `ostatnie ${hours} h` : 'teraz'}</text>
        </>
      )}
    </svg>
  );
}

export function TrendBadge({ change }: { change: number | null | undefined }) {
  if (change === null || change === undefined || !Number.isFinite(change)) return null;
  const cls = change > 2 ? 'up' : change < -2 ? 'down' : 'flat';
  const arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : '■';
  return <span className={`trend ${cls}`} title="Zmiana ceny">{arrow} {Math.abs(change).toFixed(change >= 10 || change <= -10 ? 0 : 1)}%</span>;
}
