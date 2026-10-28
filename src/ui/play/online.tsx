import { useState } from 'react';
import { aiClient, type AiStatus } from '../../ai/client.ts';

/**
 * Online reading, shared by both composers: off by default, offered behind a notice that says what leaves the device and who pays,
 * and nothing is sent anywhere until the player accepts and the server says it is configured. Turning it off forgets the session.
 */

export type OptIn = 'off' | 'asking' | 'checking' | 'on';

const UNAVAILABLE: Record<string, string> = {
  disabled: 'Online reading is switched off on this server.',
  not_configured: 'Online reading is not set up on this server.',
  over_budget: 'The online budget for today is spent.',
  quota_unavailable: 'Online reading is paused right now.',
};

export function useOnlineReading() {
  const [online, setOnline] = useState(false);
  const [optIn, setOptIn] = useState<OptIn>('off');
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [onlineNote, setOnlineNote] = useState<string | null>(null);
  const turnOn = async () => {
    setOptIn('checking');
    setOnlineNote(null);
    const st = await aiClient.status();
    if ('ok' in st) {
      setOptIn('off');
      setOnlineNote(st.why);
      return;
    }
    setAiStatus(st);
    if (!st.available) {
      setOptIn('off');
      setOnlineNote(`${UNAVAILABLE[st.reason ?? ''] ?? 'Online reading is unavailable.'} The offline reader works as always.`);
      return;
    }
    const sess = await aiClient.openSession();
    if (!sess.ok) {
      setOptIn('off');
      setOnlineNote(`${sess.why} The offline reader works as always.`);
      return;
    }
    setOnline(true);
    setOptIn('on');
  };
  const turnOff = () => {
    aiClient.forget();
    setOnline(false);
    setOptIn('off');
  };
  return { online, optIn, setOptIn, aiStatus, onlineNote, turnOn, turnOff };
}

export type OnlineReading = ReturnType<typeof useOnlineReading>;

/** The opt-in row: offline by default, the notice when asked, a clear label once on ("simulated" for the local test server). */
export function OnlineRow({ o, prefix, leaves }: { o: OnlineReading; prefix: string; leaves: string }) {
  return (
    <div className="online-row" data-testid={`${prefix}-online-row`}>
      {o.optIn === 'on' ? (
        <p className="small" style={{ margin: 0 }}>
          <span className="chip violet" data-testid={`${prefix}-online-on`}>{o.aiStatus?.provider === 'mock' ? 'Online reading: simulated (local test server, no model)' : `Online reading on${o.aiStatus?.models ? ` · ${o.aiStatus.models.fast}` : ''}`}</span>{' '}
          <button type="button" className="btn small" onClick={o.turnOff} data-testid={`${prefix}-online-off`}>Turn off</button>
        </p>
      ) : o.optIn === 'asking' || o.optIn === 'checking' ? (
        <div className="consent" role="group" aria-labelledby={`${prefix}-consent-title`} data-testid={`${prefix}-consent`}>
          <p className="small" id={`${prefix}-consent-title`} style={{ margin: '0 0 0.3rem' }}><b>Read beliefs with a language model?</b></p>
          <ul className="small" style={{ margin: '0 0 0.4rem' }}>
            <li>{leaves}</li>
            <li>Each reading is a paid request, paid by whoever runs this game. There are daily limits; a refused or failed reading costs you nothing.</li>
            <li>The server asks for model providers that do not train on what they are sent.</li>
            <li>A model only proposes. The game checks every reading against what this village can physically do, exactly as it checks its own.</li>
            <li>The offline reader always works. You can turn this off at any time.</li>
          </ul>
          <div className="row" style={{ gap: '0.5rem' }}>
            <button type="button" className="btn primary small" disabled={o.optIn === 'checking'} onClick={() => void o.turnOn()} data-testid={`${prefix}-consent-yes`}>{o.optIn === 'checking' ? 'Checking…' : 'Turn on online reading'}</button>
            <button type="button" className="btn small" disabled={o.optIn === 'checking'} onClick={() => o.setOptIn('off')} data-testid={`${prefix}-consent-no`}>Not now</button>
          </div>
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          Reading offline (nothing leaves this device).{' '}
          <button type="button" className="btn small" onClick={() => o.setOptIn('asking')} data-testid={`${prefix}-online`}>Use online reading…</button>
        </p>
      )}
      {o.onlineNote && <p className="small muted" data-testid={`${prefix}-online-note`} style={{ margin: '0.3rem 0 0' }}>{o.onlineNote}</p>}
    </div>
  );
}
