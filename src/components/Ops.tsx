import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../ui';

/**
 * Operational layout primitives.
 * These compose the dense, information-first patterns used across the product
 * (metric strips, panels, coverage rows, risk rails). They render real data only.
 */

export function MetricStrip({ children }: { children: ReactNode }) {
  return <div className="metric-strip">{children}</div>;
}

export function Metric({
  label,
  value,
  unit,
  icon,
  foot,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  icon?: IconName;
  foot?: ReactNode;
}) {
  return (
    <div className="metric">
      <span className="metric-label">
        {icon ? <Icon name={icon} size={12} /> : null}
        {label}
      </span>
      <span className="metric-value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
      {foot ? <span className="metric-foot">{foot}</span> : null}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className ?? ''}`}>
      <div className="panel-head">
        <div className="row-tight">
          <h3>{title}</h3>
          {subtitle ? <span className="tiny subtle">{subtitle}</span> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Split({
  children,
  even = false,
}: {
  children: ReactNode;
  even?: boolean;
}) {
  return <div className={`split ${even ? 'split-even' : ''}`}>{children}</div>;
}

export function CoverageRow({
  name,
  meta,
  filled,
  capacity,
}: {
  name: string;
  meta?: ReactNode;
  filled: number;
  capacity: number;
}) {
  const safeCapacity = Math.max(1, capacity);
  const pct = Math.round((filled / safeCapacity) * 100);
  const tone = pct >= 100 ? '' : pct >= 60 ? 'warn' : 'danger';
  return (
    <div className="coverage-row">
      <div className="coverage-name">
        <strong>{name}</strong>
        {meta ? <span>{meta}</span> : null}
      </div>
      <div className="coverage-bar">
        <div
          className={`progress ${tone}`}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${name} staffing`}
        >
          <span style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <span className="tiny subtle numeric">{pct}% staffed</span>
      </div>
      <span className="coverage-count">
        {filled}/{capacity}
      </span>
    </div>
  );
}

export function RailItem({
  to,
  title,
  sub,
  count,
  tone = 'neutral',
}: {
  to: string;
  title: string;
  sub: string;
  count: number;
  tone?: 'danger' | 'warning' | 'info' | 'neutral';
}) {
  return (
    <Link className={`rail-item is-${tone}`} to={to}>
      <span className="rail-body">
        <span className="rail-title">{title}</span>
        <span className="rail-sub">{sub}</span>
      </span>
      <span className="rail-count">{count}</span>
      <Icon name="arrow" size={13} className="subtle" />
    </Link>
  );
}

export function ModuleTile({
  to,
  icon,
  label,
  meta,
}: {
  to: string;
  icon: IconName;
  label: string;
  meta: string;
}) {
  return (
    <Link className="module-tile" to={to}>
      <Icon name={icon} size={15} />
      <span className="module-tile-text">
        <strong>{label}</strong>
        <span>{meta}</span>
      </span>
    </Link>
  );
}

export function Gauge({
  percent,
  value,
  label,
  caption,
}: {
  percent: number;
  value: string;
  label: string;
  caption?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="gauge">
      <div
        className="gauge-ring"
        style={{ ['--pct' as string]: clamped }}
        role="img"
        aria-label={`${label}: ${clamped}%`}
      >
        <span className="gauge-value">{value}</span>
      </div>
      <div className="gauge-meta">
        <strong>{label}</strong>
        {caption ? <span>{caption}</span> : null}
      </div>
    </div>
  );
}

export function BarChart({
  points,
  label,
}: {
  points: { label: string; value: number }[];
  label: string;
}) {
  const max = Math.max(1, ...points.map((point) => point.value));
  return (
    <div className="bar-chart" role="img" aria-label={label}>
      {points.map((point, index) => (
        <div className="bar-col" key={`${point.label}-${index}`} title={`${point.label}: ${point.value}`}>
          <div className="bar" style={{ height: `${Math.max(2, (point.value / max) * 100)}%` }} />
          <span className="bar-label">{point.label}</span>
        </div>
      ))}
    </div>
  );
}
