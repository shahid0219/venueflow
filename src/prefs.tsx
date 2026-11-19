import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DateFormat, Prefs } from './format';

const STORAGE_KEY = 'venueflow.prefs';

const DEFAULTS: Prefs = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London',
  dateFormat: 'dmy',
  theme: 'dark',
};

function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      timezone: typeof parsed.timezone === 'string' ? parsed.timezone : DEFAULTS.timezone,
      dateFormat: (['dmy', 'mdy', 'iso'] as DateFormat[]).includes(parsed.dateFormat as DateFormat)
        ? (parsed.dateFormat as DateFormat)
        : DEFAULTS.dateFormat,
      theme: (['dark', 'midnight', 'daylight'] as Prefs['theme'][]).includes(parsed.theme as Prefs['theme'])
        ? (parsed.theme as Prefs['theme'])
        : DEFAULTS.theme,
    };
  } catch {
    return DEFAULTS;
  }
}

type PrefsContextValue = {
  prefs: Prefs;
  update: (patch: Partial<Prefs>) => void;
  reset: () => void;
};

const PrefsContext = createContext<PrefsContextValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.style.colorScheme = prefs.theme === 'daylight' ? 'light' : 'dark';
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable — preferences stay in memory for this session */
    }
  }, [prefs]);

  const update = useCallback((patch: Partial<Prefs>) => setPrefs((prev) => ({ ...prev, ...patch })), []);
  const reset = useCallback(() => setPrefs(DEFAULTS), []);

  const value = useMemo(() => ({ prefs, update, reset }), [prefs, update, reset]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsContextValue {
  const context = useContext(PrefsContext);
  if (!context) throw new Error('usePrefs must be used inside PrefsProvider');
  return context;
}
