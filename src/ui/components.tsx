import { useEffect, useRef, type ReactNode } from 'react';
import { FACTION_COLORS, HAIR, SKIN } from '../render/palette.ts';

const ICONS: Record<string, string> = {
  flame: 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3-1-3 0-6 1-9z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zm4 4a2 2 0 0 0 4 0',
  skull: 'M12 3a8 8 0 0 0-5 14v3h10v-3a8 8 0 0 0-5-14zM9 12h.01M15 12h.01M10 17v2m4-2v2',
  moon: 'M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z',
  wolf: 'M4 5l4 3h8l4-3-1 8-4 6h-6l-4-6-1-8zm5 8h.01M15 13h.01M12 16v1',
  wheat: 'M12 21V7m0 4c-3 0-4-2-4-4 3 0 4 2 4 4zm0 0c3 0 4-2 4-4-3 0-4 2-4 4zm0 5c-3 0-4-2-4-4 3 0 4 2 4 4zm0 0c3 0 4-2 4-4-3 0-4 2-4 4zM12 7c-1-1-1-3 0-4 1 1 1 3 0 4z',
  help: 'M12 18h.01M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  lens: 'M5 6a2.5 2.5 0 1 0 0 .01M19 8a2.5 2.5 0 1 0 0 .01M12 19a2.5 2.5 0 1 0 0 .01M7 7.5l9 .5M6.5 8.5l4.5 8.5M17.5 10l-4 6.5',
  flood: 'M3 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0M12 3v5m-3-3l3 3 3-3',
  sound: 'M4 10v4h4l5 4V6l-5 4H4zm13-1a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12',
  mute: 'M4 10v4h4l5 4V6l-5 4H4zm13 0l5 5m0-5l-5 5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  check: 'M5 12l5 5 9-10',
  warn: 'M12 4l10 17H2L12 4zm0 6v5m0 3h.01',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4v-9z',
  food: 'M7 3v8a3 3 0 0 0 3 3v7m0-18v6m4-6v6a3 3 0 0 1-3 3M17 3c-2 2-2 6 0 8v10',
  fuel: 'M12 3c3 3 6 6 6 10a6 6 0 0 1-12 0c0-4 3-7 6-10zm0 8v6',
  bridge: 'M2 16h20M4 16v-5a8 8 0 0 1 16 0v5M8 16v-5m4 5v-6m4 6v-5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  clock: 'M12 7v5l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zm2 14h13v2H6',
  close: 'M6 6l12 12M18 6L6 18',
  share: 'M12 15V3m0 0L8 7m4-4l4 4M5 12v8h14v-8',
  play: 'M8 5v14l11-7L8 5z',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3z',
  rain: 'M7 14a5 5 0 1 1 1.5-9.7A6 6 0 0 1 20 9a4 4 0 0 1-2 7M8 17l-1 3m5-3l-1 3m5-3l-1 3',
  scroll: 'M6 4h12v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4zm0 0a2 2 0 0 0-2 2v2h2M9 9h6M9 13h6',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm3-13l-2 5-5 2 2-5 5-2z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
};

export function Icon({ name, label, className = '' }: { name: string; label?: string; className?: string }) {
  const d = ICONS[name] ?? ICONS.help;
  return (
    <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={d} />
    </svg>
  );
}

export const CLAIM_ICON: Record<string, string> = { flame: 'flame', eye: 'eye', bell: 'bell', skull: 'skull', moon: 'moon', wolf: 'wolf', wheat: 'wheat', rain: 'rain' };

export function ClaimGlyph({ icon }: { icon: string }) {
  return (
    <span className="glyph-circle">
      <Icon name={CLAIM_ICON[icon] ?? icon} />
    </span>
  );
}

export function Avatar({ look, faction, label }: { look: { hue: number; skin: number; hair: number; hat: number }; faction: string; label: string }) {
  const skin = SKIN[look.skin % SKIN.length];
  const hair = HAIR[look.hair % HAIR.length];
  const garment = FACTION_COLORS[faction] ?? '#999';
  return (
    <svg className="avatar" viewBox="0 0 56 56" role="img" aria-label={label}>
      <rect width="56" height="56" rx="12" fill={`hsl(${look.hue} 35% 22%)`} />
      <path d="M8 56c2-14 10-18 20-18s18 4 20 18z" fill={garment} />
      <circle cx="28" cy="26" r="11" fill={skin} />
      <path d="M17 24a11 11 0 0 1 22 0c-4-4-8-5-11-5s-7 1-11 5z" fill={hair} />
      <circle cx="24" cy="27" r="1.4" fill="#2b1d14" />
      <circle cx="32" cy="27" r="1.4" fill="#2b1d14" />
      <path d="M25 32q3 2 6 0" stroke="#2b1d14" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      {look.hat === 1 && <path d="M15 20l15-16 11 16z" fill="#6b2f8a" />}
      {look.hat === 2 && <path d="M12 19h32M18 19c0-5 4-7 10-7s10 2 10 7" fill="#d9b84a" stroke="#d9b84a" strokeWidth="2" />}
      {look.hat === 4 && <rect x="16" y="14" width="24" height="7" rx="2" fill="#3e3a52" />}
      {look.hat === 5 && <path d="M13 20h30M19 20c0-5 3-8 9-8s9 3 9 8" fill="#c5503b" stroke="#c5503b" strokeWidth="2" />}
      {look.hat === 6 && <path d="M16 20a12 12 0 0 1 24 0z" fill="#e9e1d0" />}
      {look.hat === 3 && <path d="M16 20a12 11 0 0 1 24 0z" fill="#8a8a8a" />}
    </svg>
  );
}

export function Pips({ ap, max, spend = 0 }: { ap: number; max: number; spend?: number }) {
  return (
    <span className="pips" role="img" aria-label={`${ap} of ${max} Influence`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`pip ${i < ap ? (i >= ap - spend ? 'preview' : 'on') : ''}`} />
      ))}
    </span>
  );
}

export function Bar({ value, max = 100, kind = '', marks = [], label }: { value: number; max?: number; kind?: string; marks?: number[]; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`bar ${kind}`} role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
      {marks.map((m, i) => (
        <span key={i} className="mark" style={{ left: `${(m / max) * 100}%` }} />
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // the latest close handler, kept in a ref: the dialog's focus handling must run once when it opens and once when it closes, not
  // every time the parent re-renders (typing in a field inside the dialog re-renders the parent on every key, which would give focus
  // back to whatever opened the dialog)
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const closable = !!onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    // focus on the next frame so the key press that opened the dialog cannot also activate its primary button
    const raf = window.requestAnimationFrame(() => first?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeRef.current) {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab' && el) {
        const f = Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
        if (!f.length) return;
        const a = f[0];
        const z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      const a = document.activeElement;
      if (!a || a === document.body || el?.contains(a)) prev?.focus?.();
    };
  }, [closable]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={wide ? { width: 'min(760px,100%)' } : undefined}>
        <div className="row spread">
          <h2>{title}</h2>
          {onClose && (
            <button className="btn icon-btn ghost" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function evIcon(code: string): string {
  if (code.startsWith('LAW_ACT')) return '✨';
  if (code === 'LAW_COLLAPSED') return '⚠';
  if (code.startsWith('LAW_')) return '◈';
  if (code === 'DEATH') return '†';
  if (code === 'LIFE_SPARED' || code === 'HOME_SPARED' || code === 'FIELD_SPARED' || code === 'BRIDGE_HELD') return '✦';
  if (code.startsWith('HOME_') || code === 'FIELD_FLOODED') return '⌂';
  if (code.startsWith('FIRE') || code === 'FIELD_BURNED') return '🔥';
  if (code.startsWith('BRIDGE')) return '≈';
  if (code.startsWith('RIVAL')) return '⚔';
  if (code === 'BELIEVER_GAINED') return '★';
  if (code.startsWith('BELIEF') || code === 'BELIEVER_LOST') return '•';
  if (code === 'EVACUATION' || code === 'TRAPPED') return '⇨';
  if (code === 'VICTORY') return '★';
  if (code === 'DEFEAT') return '✖';
  if (code === 'FOOD' || code === 'FAMINE') return '☕';
  if (code === 'BEAT') return '❦';
  return '·';
}
