// Página de desenvolvimento dos filmes do Estúdio Bloop (shared/tv-films.json).
//  ?f=<id>&t=<s>            um quadro 960×540 (W/H com &w=&h=)
//  ?sheet=<id>&n=12         folha de contato (n quadros ao longo do filme, 320×180)
//  ?all=1&k=0.5&from=0&to=50  um quadro por filme (k = fração do filme)
//  ?thumb=<id>              miniatura 320×180 (data URL em window.__thumb) — scripts/tv/thumbs.mjs
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { Renderer } from '../../src/cinema/engine';
import { parseProject } from '../../src/cinema/format';
import { loadOfficial, officialProject, thumbTime } from '../../src/cinema/tv-official';

const qs = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
const films = await loadOfficial();
let s3d: unknown = null;
async function renderer(id: string): Promise<Renderer> {
  const p = parseProject(officialProject(films, id));
  if (!p) throw new Error('sem filme ' + id);
  const r = new Renderer(p);
  if (p.mode === '3d') {
    const m = await import('../../src/cinema/scene3d');
    s3d ??= new m.Scene3D(1);
    r.r3d = s3d as never;
  }
  return r;
}
const canvas = (w: number, h: number, label?: string) => {
  const d = document.createElement('div');
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  d.appendChild(c);
  if (label) d.insertAdjacentHTML('beforeend', `<small>${label}</small>`);
  return { d, c, x: c.getContext('2d')! };
};
const opts = { watermark: true, budget: 0.6, bgScale: 1 };

if (qs.get('f')) {
  const r = await renderer(qs.get('f')!);
  const { d, c, x } = canvas(+(qs.get('w') || 960), +(qs.get('h') || 540));
  app.appendChild(d);
  r.draw(x, c.width, c.height, Math.min(r.duration() - 0.01, +(qs.get('t') || 0)), opts);
} else if (qs.get('sheet')) {
  const id = qs.get('sheet')!;
  const r = await renderer(id);
  const n = +(qs.get('n') || 12);
  const g = document.createElement('div');
  g.className = 'grid';
  app.appendChild(g);
  for (let i = 0; i < n; i++) {
    const T = ((i + 0.6) / n) * r.duration();
    const { d, c, x } = canvas(320, 180, `${T.toFixed(1)}s`);
    g.appendChild(d);
    r.draw(x, c.width, c.height, T, opts);
  }
} else if (qs.get('thumb')) {
  const id = qs.get('thumb')!;
  const r = await renderer(id);
  const { d, c, x } = canvas(320, 180);
  app.appendChild(d);
  r.draw(x, c.width, c.height, thumbTime(r.p), { ...opts, watermark: false });
  (window as unknown as { __thumb: string }).__thumb = c.toDataURL('image/webp', 0.8);
} else {
  const k = +(qs.get('k') || 0.5);
  const from = +(qs.get('from') || 0);
  const to = +(qs.get('to') || films.length);
  const g = document.createElement('div');
  g.className = 'grid';
  app.appendChild(g);
  for (const f of films.slice(from, to)) {
    const r = await renderer(f.id);
    const { d, c, x } = canvas(320, 180, `${f.id} ${f.mode} ${f.dur}s ${f.title}`);
    g.appendChild(d);
    r.draw(x, c.width, c.height, r.duration() * k, opts);
  }
}
document.title = 'ready';
