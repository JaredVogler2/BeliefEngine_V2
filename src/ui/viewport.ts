/**
 * The part of the page the player can actually see. iOS Safari keeps the layout viewport the same height when the software keyboard
 * opens and shrinks only the visual viewport, so a dialog sized to the screen would put the field being typed into behind the
 * keyboard. The visible height and its offset are published as CSS variables (--vvh, --vvt) that the dialog overlay follows.
 */
export function trackVisualViewport(win: Window = window): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => {};
  const root = win.document.documentElement;
  const set = () => {
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    root.style.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`);
  };
  set();
  vv.addEventListener('resize', set);
  vv.addEventListener('scroll', set);
  return () => {
    vv.removeEventListener('resize', set);
    vv.removeEventListener('scroll', set);
  };
}
