/* ============================================================
 *  BLOOP PINK — avaliações (estilo perfil de empresa no mapa/buscador).
 *  Clientes que saem deixam (às vezes) uma nota de 1 a 5 com comentário que vem do
 *  que viveram na loja (linda, suja, cara, fila, cadê, fedendo, ajudou no provador...).
 *  As avaliações novas são publicadas uma vez por SEMANA. A foto da empresa é a
 *  fachada atual renderizada (mudou a frente, muda a foto).
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { ic } from './icons';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface Review {
  d: number;
  st: number;
  /** motivo (chave do comentário) */
  k: string;
  /** visual do cliente "cor1|cor2|chapéu" */
  lk: string;
  n: string;
}
export interface RevState {
  pub: Review[];
  pend: Review[];
  /** último dia publicado */
  last: number;
}
export const REV0: RevState = { pub: [], pend: [], last: 0 };

const NAMES = ['Ana B.', 'Lia M.', 'Duda', 'Bia R.', 'Malu', 'Cacau', 'Teté', 'Nina S.', 'Gabi', 'Luli', 'Mel F.', 'Juju', 'Lara P.', 'Sofi', 'Dani', 'Rafa', 'Kiki', 'Vivi C.', 'Tati', 'Bel'];
const TXT: Record<string, () => string> = {
  pretty: () => t('pink.rv.pretty', 'Loja linda demais! Volto sempre.'),
  helped: () => t('pink.rv.helped', 'A dona me ajudou a escolher. Amei!'),
  cheap: () => t('pink.rv.cheap', 'Preços ótimos, levei um monte!'),
  fast: () => t('pink.rv.fast', 'Atendimento rapidinho e simpático.'),
  ok: () => t('pink.rv.ok', 'Gostei, mas pode melhorar.'),
  expensive: () => t('pink.rv.expensive', 'Bonita, mas tudo muito caro.'),
  dirty: () => t('pink.rv.dirty', 'Loja suja, que pena.'),
  queue: () => t('pink.rv.queue', 'Fila enorme no caixa.'),
  missing: () => t('pink.rv.missing', 'Não achei o que eu queria.'),
  stink: () => t('pink.rv.stink', 'A dona estava fedendo, credo!'),
  ugly: () => t('pink.rv.ugly', 'A loja ainda está meio feia.'),
  nothing: () => t('pink.rv.nothing', 'Fui e não tinha nada.'),
};
/** cria a avaliação a partir do que o cliente viveu (falas) e do humor */
export function makeReview(day: number, mood: number, said: Set<string>, look: string): Review {
  const st = mood > 88 ? 5 : mood > 68 ? 4 : mood > 50 ? 3 : mood > 30 ? 2 : 1;
  const has = (p: string) => [...said].some((k) => k.startsWith(p));
  let k = 'ok';
  if (st >= 4) k = has('helped') ? 'helped' : has('cheap') ? 'cheap' : has('pretty') ? 'pretty' : st === 5 ? 'pretty' : 'fast';
  else k = has('stink') ? 'stink' : has('dirty') ? 'dirty' : has('exp') ? 'expensive' : has('slow') || has('line') || has('gave') ? 'queue' : has('miss') ? 'missing' : has('nothing') ? 'nothing' : has('ugly') ? 'ugly' : 'ok';
  return { d: day, st, k, lk: look, n: NAMES[Math.floor(Math.random() * NAMES.length)] };
}
/** publica as pendentes (uma vez por semana) — devolve quantas */
export function publishWeek(r: RevState, day: number): number {
  if (day - r.last < 7 || !r.pend.length) return 0;
  const n = r.pend.length;
  r.pub.push(...r.pend.slice(-12));
  r.pend = [];
  r.last = day;
  if (r.pub.length > 80) r.pub.splice(0, r.pub.length - 80);
  return n;
}
export function rating(r: RevState): number {
  if (!r.pub.length) return 0;
  return r.pub.reduce((a, b) => a + b.st, 0) / r.pub.length;
}
const stars = (v: number, sz = 16) => {
  let h = '';
  for (let i = 1; i <= 5; i++) h += `<span class="rv-s${v >= i - 0.25 ? ' on' : v >= i - 0.75 ? ' half' : ''}">${ic('star5', sz)}</span>`;
  return h;
};
/** carinha do cliente (canvas → dataURL, cache) */
const faces = new Map<string, string>();
function faceUrl(look: string): string {
  let u = faces.get(look);
  if (u) return u;
  const [a, b] = look.split('|');
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = b || '#ffc6de';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = a || '#ff8cc0';
  x.beginPath();
  x.arc(32, 38, 22, 0, 7);
  x.fill();
  x.strokeStyle = '#3a0d2a';
  x.lineWidth = 3;
  x.stroke();
  x.fillStyle = '#3a0d2a';
  x.beginPath();
  x.arc(25, 34, 3.2, 0, 7);
  x.arc(39, 34, 3.2, 0, 7);
  x.fill();
  x.beginPath();
  x.arc(32, 41, 6, 0.3, Math.PI - 0.3);
  x.stroke();
  u = c.toDataURL();
  faces.set(look, u);
  return u;
}
/** página do perfil (dentro do tablet) */
export function reviewsHtml(r: RevState, name: string, photo: string, day: number): string {
  const avg = rating(r);
  const list = [...r.pub].reverse().slice(0, 30);
  const dist = [5, 4, 3, 2, 1].map((s) => r.pub.filter((x) => x.st === s).length);
  const max = Math.max(1, ...dist);
  const nextIn = Math.max(0, 7 - (day - r.last));
  return `<div class="pk-rv">
    <div class="rv-head">${photo ? `<img class="rv-photo" src="${photo}" alt="">` : `<div class="rv-photo"></div>`}
      <div class="rv-id"><b class="rv-name">${esc(name)}</b><div class="rv-avg"><b>${avg ? avg.toFixed(1).replace('.', ',') : '—'}</b>${stars(avg, 18)}<small>(${r.pub.length})</small></div>
      <div class="rv-cat">${ic('store', 16)}${esc(t('pink.rv.cat', 'Loja de cosméticos'))} · ${ic('clock', 14)}8h–20h</div>
      <div class="rv-next">${ic('review', 16)}${esc(r.pend.length ? t('pink.rv.pending', '{n} novas avaliações em {d} dias', { n: r.pend.length, d: nextIn }) : t('pink.rv.weekly', 'Atualiza toda semana'))}</div></div></div>
    <div class="rv-dist">${dist.map((n, i) => `<div><span>${5 - i}</span><i><b style="width:${(n / max) * 100}%"></b></i></div>`).join('')}</div>
    ${list.length ? list.map((x) => `<div class="rv-it"><img src="${faceUrl(x.lk)}" alt=""><div><div class="rv-who"><b>${esc(x.n)}</b><small>${esc(day - x.d <= 0 ? t('pink.rv.today', 'hoje') : t('pink.rv.ago', 'há {n} dias', { n: day - x.d }))}</small></div><div class="rv-st">${stars(x.st, 14)}</div><div class="rv-tx">${esc((TXT[x.k] ?? TXT.ok)())}</div></div></div>`).join('') : `<div class="pk-note">${ic('review', 22)}${esc(t('pink.rv.none', 'Ainda sem avaliações. Atenda bem e espere a semana!'))}</div>`}
  </div>`;
}

/** foto da fachada (renderiza a cena de uma câmera na calçada do outro lado) */
export function storefrontPhoto(r: THREE.WebGLRenderer, scene: THREE.Scene, cx: number, w: number): string {
  const W = 480;
  const H = 270;
  const cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 80);
  const dist = Math.max(8, w * 1.05);
  cam.position.set(cx, 1.9, Math.min(11, dist));
  cam.lookAt(cx, 2.5, 0);
  const rt = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });
  const prev = r.getRenderTarget();
  r.setRenderTarget(rt);
  r.render(scene, cam);
  const px = new Uint8Array(W * H * 4);
  r.readRenderTargetPixels(rt, 0, 0, W, H, px);
  r.setRenderTarget(prev);
  rt.dispose();
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const img = x.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  x.putImageData(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.82);
}
