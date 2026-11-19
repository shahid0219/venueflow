import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

/* --------------------------------- icons -------------------------------- */

const ICONS = {
  dashboard: 'M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z',
  calendar: 'M7 3v3M17 3v3M3.5 9.5h17M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5Z',
  building: 'M4 20.5h16M6.5 20.5V4.5h8v16M14.5 9.5h3v11M9 8h3M9 11.5h3M9 15h3',
  users: 'M16 19.5v-1.7a3.8 3.8 0 0 0-3.8-3.8H6.8A3.8 3.8 0 0 0 3 17.8v1.7M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 19.5v-1.7a3.8 3.8 0 0 0-2.8-3.7M15.5 3.7a3.5 3.5 0 0 1 0 6.8',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 1.8',
  check: 'M20 6.5 9.5 17 4 11.5',
  'check-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 12.2l2.4 2.4 4.6-4.8',
  clipboard:
    'M9 4.5H7.5A1.5 1.5 0 0 0 6 6v13.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15M9 4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5v1H9v-1ZM9 11h6M9 15h4',
  alert:
    'M10.3 4.3 2.9 17a1.7 1.7 0 0 0 1.5 2.5h15.2a1.7 1.7 0 0 0 1.5-2.5L13.7 4.3a1.7 1.7 0 0 0-3 0ZM12 9v4M12 16.5h.01',
  chart: 'M4.5 20.5V10M10.5 20.5V4.5M16.5 20.5v-7M22 20.5H2.5',
  settings:
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-2.7-1.2l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1A1.6 1.6 0 0 0 3.9 15a1.9 1.9 0 0 1-1.6-1.9v-.2A1.9 1.9 0 0 1 3.9 11a1.6 1.6 0 0 0 1.1-2.7l-.1-.1A1.9 1.9 0 1 1 7.6 5.5l.1.1A1.6 1.6 0 0 0 10.4 4.4a1.9 1.9 0 0 1 1.9-1.6h.2a1.9 1.9 0 0 1 1.9 1.6 1.6 1.6 0 0 0 2.7 1.2l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0 1.1 2.7 1.9 1.9 0 0 1 1.6 1.9v.2a1.9 1.9 0 0 1-1.6 1.9Z',
  search: 'M10.8 18.1a7.3 7.3 0 1 0 0-14.6 7.3 7.3 0 0 0 0 14.6ZM16.4 16.4 21 21',
  plus: 'M12 5v14M5 12h14',
  edit: 'M16.5 3.9a2 2 0 0 1 2.8 2.8L7.5 18.5l-4 1.1 1.1-4L16.5 3.9Z',
  trash: 'M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.8 12.3a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10.5 11v6M13.5 11v6',
  x: 'M18 6 6 18M6 6l12 12',
  menu: 'M3.5 6.5h17M3.5 12h17M3.5 17.5h17',
  download: 'M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4 20.5h16',
  logout: 'M15 17l5-5-5-5M20 12H9M12 3.5H6.5A2 2 0 0 0 4.5 5.5v13a2 2 0 0 0 2 2H12',
  shield: 'M12 21s7.5-3.4 7.5-9V5.8L12 3 4.5 5.8V12c0 5.6 7.5 9 7.5 9Z',
  mail: 'M3.5 6.5h17v11h-17v-11Zm0 .8 8.5 6.2 8.5-6.2',
  pin: 'M12 21s6.5-5.7 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.3 12 21 12 21ZM12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  refresh: 'M20.5 12a8.5 8.5 0 1 1-2.6-6.1M20.5 4.5V10h-5.5',
  'user-plus': 'M15.5 20v-1.7a3.8 3.8 0 0 0-3.8-3.8H6.3A3.8 3.8 0 0 0 2.5 18.3V20M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 8v6M22 11h-6',
  play: 'M8 4.5l11 7.5-11 7.5v-15Z',
  arrow: 'M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12S18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.9-5.2 2.9 1-5.9L3.5 9.7l5.9-.8L12 3.5Z',
  bell: 'M18 15.5V10a6 6 0 1 0-12 0v5.5L4.5 18h15L18 15.5ZM10 21h4',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8',
  filter: 'M3.5 5.5h17l-6.5 7.6v6.4l-4-2.2v-4.2L3.5 5.5Z',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={`icon ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/* -------------------------------- toasts -------------------------------- */

type Toast = { id: number; message: string; tone: 'success' | 'error' };
type ToastContextValue = { push: (message: string, tone?: Toast['tone']) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    counter.current += 1;
    const id = counter.current;
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 4200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            <Icon name={toast.tone === 'success' ? 'check-circle' : 'alert'} size={15} />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

/* -------------------------------- badges -------------------------------- */

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'violet';

const STATUS_TONES: Record<string, Tone> = {
  active: 'success',
  published: 'accent',
  live: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  draft: 'neutral',
  maintenance: 'warning',
  inactive: 'neutral',
  confirmed: 'success',
  assigned: 'info',
  declined: 'danger',
  present: 'success',
  late: 'warning',
  absent: 'danger',
  todo: 'neutral',
  in_progress: 'info',
  blocked: 'warning',
  done: 'success',
  open: 'danger',
  investigating: 'warning',
  resolved: 'success',
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
  critical: 'danger',
};

export function toneFor(value: string | null | undefined): Tone {
  if (!value) return 'neutral';
  return STATUS_TONES[value] ?? 'neutral';
}

export function Badge({
  children,
  tone,
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  const resolved = tone ?? toneFor(typeof children === 'string' ? children : '');
  return <span className={`badge badge-${resolved}${dot ? ' badge-dot' : ''}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="subtle">—</span>;
  return <Badge tone={toneFor(status)} dot>{status.replace(/_/g, ' ')}</Badge>;
}

/* -------------------------------- layout -------------------------------- */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className,
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`card ${className ?? ''}`}>
      {title ? (
        <div className="card-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  tone?: 'positive' | 'negative';
}) {
  return (
    <div className="card stat-card">
      {icon ? (
        <span className="stat-icon">
          <Icon name={icon} size={17} />
        </span>
      ) : null}
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint ? <span className={`stat-hint ${tone ?? ''}`}>{hint}</span> : null}
    </div>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const tone = clamped >= 100 ? '' : clamped >= 60 ? '' : clamped >= 30 ? 'warn' : 'danger';
  return (
    <div className="row-tight" style={{ minWidth: 110 }}>
      <div className={`progress ${tone}`} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${clamped}%` }} />
      </div>
      <span className="tiny subtle numeric">{label ?? `${clamped}%`}</span>
    </div>
  );
}

/* -------------------------------- states -------------------------------- */

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-block" role="status">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  icon = 'clipboard',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={26} />
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <span className="row-tight">
        <Icon name="alert" size={15} />
        {message}
      </span>
      {onRetry ? (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

/* --------------------------------- forms -------------------------------- */

export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${className ?? ''}`}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="required" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {hint && !error ? <span className="field-hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ''}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`textarea ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`select ${props.className ?? ''}`} />;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="search-input">
      <Icon name="search" size={15} />
      <label className="sr-only" htmlFor={id}>
        {placeholder}
      </label>
      <input
        id={id}
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function Button({
  variant = 'default',
  size,
  icon,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm';
  icon?: IconName;
}) {
  const classes = [
    'btn',
    variant !== 'default' ? `btn-${variant}` : '',
    size === 'sm' ? 'btn-sm' : '',
    rest.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button {...rest} className={classes}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  );
}

/* --------------------------------- modal -------------------------------- */

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = ref.current?.querySelector<HTMLElement>('input, select, textarea, button');
    focusable?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="modal-head">
          <div style={{ minWidth: 0 }}>
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog" style={{ marginLeft: 'auto' }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="muted small">{message}</p>
    </Modal>
  );
}

/* ------------------------------- form error ------------------------------ */

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="form-error" role="alert">
      <Icon name="alert" size={15} />
      <span>{message}</span>
    </div>
  );
}
