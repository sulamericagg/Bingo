/* ============================================================
 *  BLOOP PINK — minigames dos provadores.
 *  PERFUME: borrifar nas fitinhas (cada frasco revela a família: florido, frutado,
 *  doce, fresco). Com cliente esperando ("quero um cheiro ___"), entregue a fitinha
 *  certa → ela ama e leva o perfume. Sozinho: brincar de borrifar e cheirar.
 *  UNHAS: mão com 5 unhas, paleta de esmaltes; tocar na cor e nas unhas pinta com
 *  pincel. A cliente pede uma cor → pinte as 5 da cor dela.
 *  Clientes sem ajuda também provam: borrifam dois, não gostam de um, amam o outro.
 * ============================================================ */
import { t } from '../../i18n';
import { sfx } from '../../audio';
import { PRODUCTS, PROD, type Product } from './catalog';
import { ic } from './icons';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** famílias de cheiro (ícone + nome) */
export const FAMS = [
  { icon: 'flowers', get name() { return t('pink.fam.0', 'Florido'); } },
  { icon: 'apple', get name() { return t('pink.fam.1', 'Frutado'); } },
  { icon: 'heart', get name() { return t('pink.fam.2', 'Docinho'); } },
  { icon: 'splash', get name() { return t('pink.fam.3', 'Fresquinho'); } },
];
export function famOf(p: Product): number {
  let h = 0;
  for (const c of p.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 4;
}
export const NAIL_COLS = ['#ff5fa2', '#e8336f', '#b48cff', '#7fd1c7', '#ffd34a', '#ff8a3a', '#6aa8ff', '#2a2530'];

export interface TestResult {
  ok: boolean;
  /** produto escolhido (perfume entregue / esmalte da cor) */
  p: Product | null;
}

/** perfume: frascos = perfumes/body splash que a loja tem (ou genéricos) */
export function perfumeGame(host: { panel(h: string): HTMLDivElement; closePanel(): void }, stocked: string[], want: number | null, done: (r: TestResult | null) => void): void {
  const pool = stocked.map((id) => PROD[id]).filter((p) => p && (p.cat === 'perfume' || p.cat === 'splash'));
  const base = PRODUCTS.filter((p) => p.cat === 'splash' || p.cat === 'perfume');
  const list: Product[] = [];
  // garante 4 frascos com famílias diferentes (a pedida sempre aparece)
  for (const f of [0, 1, 2, 3]) list.push(pool.find((p) => famOf(p) === f && !list.includes(p)) ?? base.find((p) => famOf(p) === f && !list.includes(p))!);
  list.sort(() => Math.random() - 0.5);
  const sprayed = new Set<number>();
  let picked = -1;
  const d = host.panel(`<div class="pk-tg perf"><h2>${ic('perfume', 30)}${esc(t('pink.tg.perfume', 'Provador de perfume'))}</h2>
    ${want !== null ? `<div class="ask">${ic('smile', 30)}<span>${esc(t('pink.tg.wantSmell', 'Quero um cheiro...'))}</span><b>${ic(FAMS[want].icon, 30)}${esc(FAMS[want].name)}</b></div>` : `<div class="ask">${ic('spray', 26)}<span>${esc(t('pink.tg.free', 'Borrife nas fitinhas e descubra o cheiro!'))}</span></div>`}
    <div class="bottles">${list
      .map(
        (p, i) => `<div class="bt" data-i="${i}" role="button" aria-label="${esc(p.name)}"><div class="glass" style="--c:${p.color};--cap:${p.cap}"><i class="cap"></i><i class="liq"></i></div><div class="nm">${esc(p.name)}</div><div class="strip"><span class="mist"></span><span class="fam">${ic(FAMS[famOf(p)].icon, 22)}</span></div></div>`,
      )
      .join('')}</div>
    <div class="pk-row">${want !== null ? `<button class="pk-b g" data-a="give" disabled>${ic('check', 24)}${esc(t('pink.tg.give', 'Entregar a fitinha'))}</button>` : ''}<button class="pk-b w" data-a="x">${ic('close', 22)}</button></div></div>`);
  const give = d.querySelector('[data-a=give]') as HTMLButtonElement | null;
  d.querySelectorAll<HTMLElement>('.bt').forEach((el) =>
    el.addEventListener('click', () => {
      const i = +el.dataset.i!;
      if (!sprayed.has(i)) {
        sprayed.add(i);
        sfx.play('spray');
        el.classList.add('sprayed');
        el.querySelector('.glass')!.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(6px) scale(.96)' }, { transform: 'translateY(0)' }], { duration: 220 });
        if (want === null) sfx.play('sparkle', { db: -8 });
        return;
      }
      if (want === null) return;
      picked = i;
      d.querySelectorAll('.bt').forEach((b) => b.classList.toggle('pick', b === el));
      sfx.play('tap');
      if (give) give.disabled = false;
    }),
  );
  d.querySelector('[data-a=x]')!.addEventListener('click', () => {
    host.closePanel();
    done(want === null ? { ok: sprayed.size >= 2, p: null } : null);
  });
  give?.addEventListener('click', () => {
    if (picked < 0) return;
    const p = list[picked];
    const ok = famOf(p) === want;
    sfx.play(ok ? 'goal' : 'wrong');
    host.closePanel();
    done({ ok, p });
  });
}

/** unhas: pinte as 5 unhas (com cliente: da cor que ela pediu) */
export function nailsGame(host: { panel(h: string): HTMLDivElement; closePanel(): void }, want: string | null, done: (r: TestResult | null) => void): void {
  let col = NAIL_COLS[0];
  const nails: (string | null)[] = [null, null, null, null, null];
  // dedos: posições/tamanhos (mão de frente, polegar à esquerda)
  const F = [
    { x: 14, y: 104, w: 26, h: 30, r: -40 },
    { x: 51, y: 42, w: 26, h: 32, r: -6 },
    { x: 79, y: 30, w: 26, h: 33, r: 0 },
    { x: 109, y: 38, w: 25, h: 31, r: 6 },
    { x: 140, y: 64, w: 22, h: 28, r: 14 },
  ];
  const hand = `<svg viewBox="0 0 190 220" class="hand"><path d="M44 210 C40 170 30 150 14 128 C6 116 18 100 32 110 L52 128 L54 60 C54 44 74 44 74 60 L76 112 L80 48 C80 32 104 32 104 48 L106 110 L110 56 C110 40 134 40 134 56 L134 116 L140 80 C142 64 164 66 162 84 L156 150 C152 180 150 196 148 210 Z" fill="#ffd9c0" stroke="#3a0d2a" stroke-width="4" stroke-linejoin="round"/>
    ${F.map((f, i) => `<ellipse class="nail" data-n="${i}" cx="${f.x + f.w / 2}" cy="${f.y + f.h / 2}" rx="${f.w / 2}" ry="${f.h / 2}" transform="rotate(${f.r} ${f.x + f.w / 2} ${f.y + f.h / 2})" fill="#fff3ee" stroke="#c89a8a" stroke-width="2.5"/>`).join('')}</svg>`;
  const d = host.panel(`<div class="pk-tg nails"><h2>${ic('nails', 30)}${esc(t('pink.tg.nails', 'Mesa de unhas'))}</h2>
    <div class="ask">${want ? `${ic('smile', 28)}<span>${esc(t('pink.tg.wantColor', 'Quero esta cor!'))}</span><i class="dot" style="background:${want}"></i>` : `${ic('nails', 24)}<span>${esc(t('pink.tg.paint', 'Escolha a cor e toque nas unhas!'))}</span>`}</div>
    <div class="nwrap">${hand}<div class="pal">${NAIL_COLS.map((c, i) => `<button class="bot${i === 0 ? ' on' : ''}" data-c="${c}" style="--c:${c}" aria-label="${c}"><i></i></button>`).join('')}</div></div>
    <div class="pk-row"><button class="pk-b g" data-a="ok" disabled>${ic('check', 24)}${esc(t('pink.tg.ready', 'Pronto!'))}</button><button class="pk-b w" data-a="x">${ic('close', 22)}</button></div></div>`);
  const ok = d.querySelector('[data-a=ok]') as HTMLButtonElement;
  d.querySelectorAll<HTMLElement>('.bot').forEach((b) =>
    b.addEventListener('click', () => {
      col = b.dataset.c!;
      d.querySelectorAll('.bot').forEach((x) => x.classList.toggle('on', x === b));
      sfx.play('tap');
    }),
  );
  d.querySelectorAll<SVGElement>('.nail').forEach((n) =>
    n.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const i = +n.dataset.n!;
      nails[i] = col;
      n.setAttribute('fill', col);
      n.setAttribute('stroke', '#3a0d2a');
      n.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 260 });
      sfx.play('brush');
      if (nails.every((x) => x)) {
        ok.disabled = false;
        if (!want) sfx.play('sparkle');
      }
    }),
  );
  d.querySelector('[data-a=x]')!.addEventListener('click', () => {
    host.closePanel();
    done(null);
  });
  ok.addEventListener('click', () => {
    const good = want ? nails.every((x) => x === want) : true;
    sfx.play(good ? 'goal' : 'wrong');
    host.closePanel();
    // esmalte "da cor": o que a loja vende com cor mais parecida
    const target = want ?? nails[2]!;
    const pol = PRODUCTS.filter((p) => p.shape === 'polish');
    let best: Product | null = null;
    let bd = 1e9;
    for (const p of pol) {
      const dd = colDist(p.color, target);
      if (dd < bd) {
        bd = dd;
        best = p;
      }
    }
    done({ ok: good, p: best });
  });
}
function colDist(a: string, b: string): number {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  let s = 0;
  for (const sh of [16, 8, 0]) s += Math.abs(((pa >> sh) & 255) - ((pb >> sh) & 255));
  return s;
}
