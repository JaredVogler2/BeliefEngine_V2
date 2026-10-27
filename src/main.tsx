import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

function unsupported(msg: string): void {
  const main = document.createElement('main');
  main.style.cssText = 'max-width:520px;margin:4rem auto;padding:1.5rem;font-family:system-ui;color:#f4ecd8';
  const title = document.createElement('h1');
  title.textContent = 'Belief Engine';
  const text = document.createElement('p');
  text.textContent = msg;
  main.append(title, text);
  root!.replaceChildren(main);
}

if (!('structuredClone' in globalThis) || !('ResizeObserver' in globalThis) || !document.createElement('canvas').getContext) {
  unsupported('This browser is too old to run the game. Please use a current version of Chrome, Edge, Firefox or Safari.');
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
