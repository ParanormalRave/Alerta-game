import { Engine } from './core/Engine.js';

/** Readable fatal-error card instead of a silent black canvas. */
function showFatal(message, detail) {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:grid;place-content:center;' +
    'text-align:center;gap:14px;padding:8vw;background:#100e0b;color:#e9dcc2;' +
    'font:14px/1.7 ui-monospace,monospace';
  el.innerHTML =
    '<div style="font:600 20px/1.3 Georgia,serif;letter-spacing:.02em">The Chronicles of Zoal — can’t start the renderer</div>' +
    `<div style="opacity:.85;max-width:64ch;margin:0 auto">${message}</div>` +
    (detail ? `<div style="opacity:.45;font-size:12px">${detail}</div>` : '');
  document.body.appendChild(el);
}

// Boot loader: hold the LOADING card on a flat ~5s timer, then fade it out to
// reveal the opening cinematic. Purely cosmetic — not tied to asset loading;
// it masks the first-frame paint and gives the models a moment to stream in.
// `.done` drops pointer-events immediately so the click-to-begin still lands
// through the fade; the element is removed once the 0.8s fade finishes.
const loader = document.getElementById('loader');
if (loader) {
  setTimeout(() => {
    loader.classList.add('done');
    setTimeout(() => loader.remove(), 900);
  }, 5000);
}

try {
  // Boot the engine, start the render loop.
  const engine = new Engine();
  engine.start();
  // Expose for debugging in the browser console.
  window.__zoal = engine;
} catch (err) {
  console.error(err);
  const webglFailed = /webgl|context/i.test(String(err && err.message));
  showFatal(
    webglFailed
      ? 'Your browser couldn’t create a WebGL context, so the 3D world can’t render. ' +
          'Turn on hardware acceleration (Chrome → Settings → System → “Use graphics acceleration when available”), ' +
          'close spare tabs, then hard-reload (Ctrl+Shift+R). Visit chrome://gpu — WebGL / WebGL2 should read “Hardware accelerated”.'
      : 'The game failed to start. See the browser console for details.',
    String((err && err.message) || err)
  );
}
