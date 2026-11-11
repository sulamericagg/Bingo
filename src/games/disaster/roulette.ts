/* ============================================================
 *  "PRÓXIMO DESASTRE: ?" — roleta caça-níquel antes de cada rodada, e a DESASTREPÉDIA
 *  (coleção: descobertos com ícone e cartão; os outros em silhueta). DOM puro, usado pelo
 *  2D, pelo 3D e pela tela de escolha (launch.ts). Sem animação CSS contínua: a fita da roleta
 *  anda por requestAnimationFrame e para sozinha.
 * ============================================================ */
import { t, fmt } from '../../i18n';
import { audio } from '../../core/audio';
import { tap } from '../../core/haptics';
import { icon } from '../../ui/icons';
import { dzEntryIcon, dzIcon } from './icons';
import { entries, entryDesc, HAZARDS, loadPedia, type DzEntry } from './catalog';
import { MAPS } from './scenarios';

const CSS = `
.dzr{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;pointer-events:none;z-index:30;font-family:'Fredoka',system-ui,sans-serif;color:#fff;opacity:0;transition:opacity .2s}
.dzr.on{opacity:1}
.dzr .band{position:relative;width:min(560px,92vw);background:linear-gradient(180deg,rgba(44,26,110,.94),rgba(22,14,60,.94));border:3px solid #2a0b5c;border-radius:24px;box-shadow:0 6px 0 #2a0b5c,0 0 0 3px rgba(255,225,77,.5) inset;padding:10px 12px 12px;overflow:hidden}
.dzr .hd{display:flex;align-items:center;justify-content:center;gap:8px;font-weight:800;font-size:18px;color:#ffe14d;-webkit-text-stroke:1px #2a0b5c;letter-spacing:.3px}
.dzr .hd .q{display:inline-flex;width:26px;height:26px;border-radius:8px;background:#ff5aa5;color:#fff;align-items:center;justify-content:center;-webkit-text-stroke:0;border:2px solid #2a0b5c}
.dzr .win{position:relative;height:84px;margin-top:6px;border-radius:16px;background:rgba(0,0,0,.35);overflow:hidden}
.dzr .strip{position:absolute;left:0;top:6px;height:72px;display:flex;gap:8px;will-change:transform}
.dzr .cell{flex:none;width:72px;height:72px;border-radius:14px;background:linear-gradient(180deg,#fff7d6,#ffd36e);border:3px solid #2a0b5c;display:flex;align-items:center;justify-content:center}
.dzr .cell .ico{width:56px;height:56px}
.dzr .frame{position:absolute;left:50%;top:0;bottom:0;width:86px;margin-left:-43px;border:4px solid #ffe14d;border-radius:18px;box-shadow:0 0 18px rgba(255,225,77,.8);pointer-events:none}
.dzr .fade{position:absolute;top:0;bottom:0;width:22%;pointer-events:none}
.dzr .fade.l{left:0;background:linear-gradient(90deg,rgba(22,14,60,1),rgba(22,14,60,0))}
.dzr .fade.r{right:0;background:linear-gradient(270deg,rgba(22,14,60,1),rgba(22,14,60,0))}
.dzr .rev{display:flex;align-items:center;gap:12px;margin-top:8px;min-height:58px;opacity:0;transform:scale(.9);transition:opacity .2s,transform .25s cubic-bezier(.3,1.6,.5,1)}
.dzr.done .rev{opacity:1;transform:none}
.dzr .rev .big{flex:none;width:58px;height:58px;border-radius:16px;background:linear-gradient(180deg,#fff7d6,#ffd36e);border:3px solid #2a0b5c;display:flex;align-items:center;justify-content:center}
.dzr .rev .big .ico{width:46px;height:46px}
.dzr .rev .tx{flex:1;min-width:0;text-align:left}
.dzr .rev b{display:block;font-size:22px;line-height:1.05;color:#fff;-webkit-text-stroke:1px #2a0b5c}
.dzr .rev small{display:block;font-size:13px;line-height:1.25;opacity:.92;margin-top:2px}
.dzr .new{position:absolute;right:10px;top:8px;background:#ff3355;border:2px solid #2a0b5c;border-radius:10px;padding:1px 8px;font-weight:800;font-size:13px;transform:rotate(6deg);opacity:0;transition:opacity .2s}
.dzr.done .new.on{opacity:1}
.dzr .num{font-size:12px;opacity:.75;font-weight:700}
@media (orientation:landscape) and (max-height:430px){.dzr .band{padding:8px 10px 10px}.dzr .win{height:70px}.dzr .strip{height:60px}.dzr .cell{width:60px;height:60px}.dzr .cell .ico{width:46px;height:46px}.dzr .frame{width:72px;margin-left:-36px}.dzr .rev{min-height:50px;margin-top:6px}.dzr .rev b{font-size:19px}}

.dzp{position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;background:radial-gradient(circle at 50% 0%,#3a4fa8,#141a3e 70%);font-family:'Fredoka',system-ui,sans-serif;color:#fff;pointer-events:auto;touch-action:pan-y}
.dzp .top{display:flex;align-items:center;gap:10px;padding:max(10px,env(safe-area-inset-top)) max(14px,var(--edge-r,14px)) 8px max(14px,var(--edge-l,14px))}
.dzp .top h2{margin:0;font-size:22px;color:#ffe14d;-webkit-text-stroke:1.2px #2a0b5c;display:flex;align-items:center;gap:8px}
.dzp .top .ico{width:30px;height:30px}
.dzp .cnt{margin-left:auto;display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px}
.dzp .bar{width:120px;height:12px;border-radius:8px;background:rgba(0,0,0,.4);border:2px solid #2a0b5c;overflow:hidden}
.dzp .bar i{display:block;height:100%;background:linear-gradient(90deg,#5ee08a,#ffe14d)}
.dzp .x{font:inherit;width:44px;height:44px;border-radius:14px;border:2px solid rgba(255,255,255,.3);background:rgba(30,15,70,.72);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none}
.dzp .grid{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;padding:4px max(14px,var(--edge-r,14px)) max(16px,var(--safe-bot,0px)) max(14px,var(--edge-l,14px));align-content:start}
.dzp .c{font:inherit;color:#2a0b5c;cursor:pointer;border:3px solid #2a0b5c;border-radius:16px;background:linear-gradient(180deg,#fff7d6,#ffd36e);box-shadow:0 3px 0 #2a0b5c;padding:6px 4px 5px;display:flex;flex-direction:column;align-items:center;gap:2px;min-height:104px;position:relative}
.dzp .c .ico{width:50px;height:50px}
.dzp .c span{font-size:11.5px;font-weight:700;line-height:1.1;text-align:center}
.dzp .c em{position:absolute;left:5px;top:3px;font-style:normal;font-size:10px;font-weight:800;opacity:.6}
.dzp .c.off{background:linear-gradient(180deg,#3a3f6e,#262a52);color:#9aa3d6}
.dzp .c.off .ico{filter:brightness(0) opacity(.55)}
.dzp .c.t3:not(.off){background:linear-gradient(180deg,#ffd9f2,#ff9ad5)}
.dzp .c.t2:not(.off){background:linear-gradient(180deg,#d9f6ff,#8fd3ff)}
.dzp .card{position:absolute;inset:0;background:rgba(10,8,30,.7);display:flex;align-items:center;justify-content:center;padding:14px}
.dzp .card .p{width:min(92vw,420px);max-height:92%;overflow:auto;background:linear-gradient(180deg,#2c3f7a,#1a2350);border:3px solid #2a0b5c;border-radius:22px;box-shadow:0 6px 0 #2a0b5c;padding:14px 16px;display:flex;gap:14px;align-items:flex-start}
.dzp .card .bi{flex:none;width:92px;height:92px;border-radius:20px;background:linear-gradient(180deg,#fff7d6,#ffd36e);border:3px solid #2a0b5c;display:flex;align-items:center;justify-content:center}
.dzp .card .bi .ico{width:76px;height:76px}
.dzp .card h3{margin:0 0 4px;font-size:21px;color:#ffe14d;-webkit-text-stroke:1px #2a0b5c}
.dzp .card p{margin:0 0 8px;font-size:14px;line-height:1.3}
.dzp .card .st{display:flex;flex-wrap:wrap;gap:6px;font-size:12px;font-weight:700}
.dzp .card .st span{background:rgba(0,0,0,.3);border-radius:10px;padding:2px 8px}
@media (orientation:landscape) and (max-height:430px){.dzp .grid{grid-template-columns:repeat(auto-fill,minmax(84px,1fr))}.dzp .c{min-height:94px}.dzp .c .ico{width:44px;height:44px}}
`;
let cssDone = false;
function css(): void {
  if (cssDone) return;
  cssDone = true;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const iconOf = (e: DzEntry, size = 48) => dzEntryIcon(e.hz, e.mods, size);

/**
 * Roleta: a fita de ícones corre e desacelera até parar no desastre escolhido; aí revela nome,
 * descrição curta e o selo "NOVO!" (primeira vez). Não bloqueia o toque (o jogo continua por baixo).
 * Devolve uma função que fecha na hora.
 */
export function showRoulette(root: HTMLElement, e: DzEntry, o: { isNew: boolean; spin?: number; hold?: number; tele?: string } = { isNew: false }): () => void {
  css();
  const all = entries();
  const N = 26;
  const target = N - 4;
  const cells: DzEntry[] = [];
  for (let i = 0; i < N; i++) cells.push(i === target ? e : all[Math.floor(Math.random() * all.length)]);
  const el = document.createElement('div');
  el.className = 'dzr';
  el.innerHTML = `<div class="band">
    <div class="hd"><span>${t('dz.next', 'Próximo desastre:')}</span><span class="q">?</span></div>
    <div class="win"><div class="strip">${cells.map((c) => `<div class="cell">${iconOf(c, 56)}</div>`).join('')}</div><div class="fade l"></div><div class="fade r"></div><div class="frame"></div></div>
    <div class="rev"><div class="big">${iconOf(e, 46)}</div><div class="tx"><span class="num">#${e.n}</span><b>${esc(e.name())}</b><small>${esc(o.tele ?? HAZARDS[e.hz[0]].tele())}</small></div></div>
    <div class="new${o.isNew ? ' on' : ''}">${t('dz.new', 'NOVO!')}</div>
  </div>`;
  root.appendChild(el);
  const strip = el.querySelector('.strip') as HTMLElement;
  const win = el.querySelector('.win') as HTMLElement;
  void el.offsetWidth;
  el.classList.add('on');
  const spin = (o.spin ?? 2.3) * 1000;
  const hold = (o.hold ?? 2.2) * 1000;
  const t0 = performance.now();
  let raf = 0;
  let lastCell = -1;
  let dead = false;
  const step = () => {
    if (dead) return;
    const cw = (strip.firstElementChild as HTMLElement | null)?.offsetWidth ?? 72;
    const pitch = cw + 8;
    const endX = win.clientWidth / 2 - (target * pitch + cw / 2);
    const k = Math.min(1, (performance.now() - t0) / spin);
    // ease-out com um "quase passou" no fim (caça-níquel)
    const e2 = 1 - Math.pow(1 - k, 3.2);
    const x = endX * e2 + (1 - k) * 0;
    strip.style.transform = `translateX(${x.toFixed(1)}px)`;
    const cell = Math.floor((win.clientWidth / 2 - x) / pitch);
    if (cell !== lastCell) {
      lastCell = cell;
      if (k < 1) audio.tick(cell % 4);
    }
    if (k < 1) raf = requestAnimationFrame(step);
    else {
      el.classList.add('done');
      audio.coin(o.isNew ? 3 : 1);
      tap('medium');
      window.setTimeout(close, hold);
    }
  };
  raf = requestAnimationFrame(step);
  function close(): void {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    el.classList.remove('on');
    window.setTimeout(() => el.remove(), 220);
  }
  return close;
}

/** descobertos / total */
export function pediaCount(): { seen: number; total: number } {
  const p = loadPedia();
  const all = entries();
  return { seen: all.filter((e) => p.seen[e.key]).length, total: all.length };
}

/** Desastrepédia: grade com todos (silhueta para os não vistos); toque abre o cartão. */
export function openPedia(root: HTMLElement, onClose?: () => void): () => void {
  css();
  const p = loadPedia();
  const all = entries();
  const { seen, total } = pediaCount();
  const el = document.createElement('div');
  el.className = 'dzp';
  el.dataset.touchIgnore = '';
  el.innerHTML = `<div class="top">
      <button class="x" aria-label="${t('dz.exit', 'Sair')}">${icon('close', { size: 24 })}</button>
      <h2>${dzIcon('book', 30)}${t('dz.pedia', 'Desastrepédia')}</h2>
      <div class="cnt"><span>${t('dz.pedia.count', '{n} de {total} descobertos', { n: fmt(seen), total: fmt(total) })}</span><div class="bar"><i style="width:${Math.round((100 * seen) / total)}%"></i></div></div>
    </div>
    <div class="grid">${all
      .map((e) => {
        const s = p.seen[e.key];
        return `<button class="c t${e.tier}${s ? '' : ' off'}" data-k="${e.key}"><em>${e.n}</em>${iconOf(e, 50)}<span>${s ? esc(e.name()) : '???'}</span></button>`;
      })
      .join('')}</div>`;
  root.appendChild(el);
  const close = () => {
    el.remove();
    onClose?.();
  };
  el.querySelector('.x')!.addEventListener('click', () => {
    audio.click();
    close();
  });
  el.querySelector('.grid')!.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('[data-k]') as HTMLElement | null;
    if (!b) return;
    const e = all.find((o) => o.key === b.dataset.k);
    if (!e) return;
    audio.click();
    const s = p.seen[e.key];
    const card = document.createElement('div');
    card.className = 'card';
    const maps = (e.maps ?? HAZARDS[e.hz[0]].maps).map((id) => MAPS.find((m) => m.id === id)?.name() ?? '').filter(Boolean);
    card.innerHTML = s
      ? `<div class="p"><div class="bi">${iconOf(e, 76)}</div><div><h3>#${e.n} · ${esc(e.name())}</h3><p>${esc(entryDesc(e))}</p><p><b>${esc(HAZARDS[e.hz[0]].tele())}</b></p><div class="st"><span>${t('dz.pedia.seen', 'Visto {n}×', { n: s[0] })}</span><span>${t('dz.pedia.won', 'Sobreviveu {n}×', { n: s[1] })}</span><span>${esc(maps.slice(0, 3).join(' · '))}</span></div></div></div>`
      : `<div class="p"><div class="bi" style="filter:brightness(0) opacity(.6)">${iconOf(e, 76)}</div><div><h3>#${e.n} · ???</h3><p>${t('dz.pedia.locked', 'Ainda não descoberto! Continue jogando: a roleta escolhe um desastre novo a cada rodada.')}</p></div></div>`;
    card.addEventListener('click', () => card.remove());
    el.appendChild(card);
  });
  return close;
}
