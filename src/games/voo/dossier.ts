/* ============================================================
 *  POUSO FORÇADO — dossiê de papel (briefing da missão e relatório
 *  final): pasta que abre, folhas que viram, carimbos. Tudo em HTML/CSS.
 * ============================================================ */
import { fmt, t } from '../../i18n';
import { sfx } from '../../3d/common/sfx';
import { roleName, weatherName } from './data';
import { hatIcon, vIcon } from './icons';
import type { OutKind, Stats } from './sim';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface CrewLine {
  name: string;
  role: number;
  bot: boolean;
  me: boolean;
  stats?: Stats;
  /** online: skin e id do jogador */
  skin?: string;
  id?: string;
}
export interface Brief {
  flight: string;
  from: string;
  to: string;
  weather: number;
  mode: 'normal' | 'daily' | 'training';
  crew: CrewLine[];
}

/** pasta com folhas; resolve quando o jogador fecha */
function folder(root: HTMLElement, coverHtml: string, sheets: string[], buttons: { id: string; label: string; cls: string; ico: string }[], skipLabel: string): Promise<string> {
  return new Promise((resolve) => {
    const scr = document.createElement('div');
    scr.className = 'voo-scr voo-desk';
    scr.innerHTML = `<div class="voo-folder"><div class="voo-back"></div>${sheets
      .map((s, i) => `<div class="voo-sheet" style="z-index:${4 - Math.min(3, i)};transform:rotate(${(i % 2 ? 1 : -1) * (0.6 + i * 0.4)}deg)">${s}</div>`)
      .join('')}<div class="voo-cover">${coverHtml}</div></div>
      <div class="voo-dnav l"><button class="voo-btn ghost" data-skip>${vIcon('throw', 22)}${esc(skipLabel)}</button></div>
      <div class="voo-dnav"><button class="voo-btn gold" data-next>${esc(t('voo.d.next', 'Próxima folha'))}</button></div>`;
    root.appendChild(scr);
    const cover = scr.querySelector('.voo-cover') as HTMLElement;
    const pages = Array.from(scr.querySelectorAll<HTMLElement>('.voo-sheet'));
    const nav = scr.querySelector('.voo-dnav:not(.l)') as HTMLElement;
    let step = 0; // 0 = capa fechada; 1 = folha 0 visível; ...
    let timer = 0;
    const done = (id: string) => {
      clearTimeout(timer);
      scr.remove();
      resolve(id);
    };
    const showButtons = () => {
      nav.innerHTML = buttons.map((b) => `<button class="voo-btn ${b.cls}" data-b="${b.id}">${vIcon(b.ico, 22)}${esc(b.label)}</button>`).join('');
    };
    const advance = () => {
      clearTimeout(timer);
      if (step === 0) {
        cover.classList.add('open');
        sfx.whoosh();
      } else if (step < pages.length) {
        pages[step - 1].classList.add('gone');
        sfx.swish();
      }
      step++;
      if (step >= pages.length) showButtons();
      else timer = window.setTimeout(advance, step === 1 ? 3600 : 4200);
      // folha atual "em cima" e reta
      const cur = pages[Math.min(step, pages.length) - 1];
      pages.forEach((p) => p.classList.toggle('on', p === cur));
      if (cur) cur.style.transform = 'rotate(0deg)';
    };
    timer = window.setTimeout(advance, 900);
    scr.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-b],[data-skip],[data-next]') as HTMLElement | null;
      if (b?.dataset.b) return done(b.dataset.b);
      if (b && b.dataset.skip !== undefined) {
        if (buttons.length === 1) return done(buttons[0].id);
        clearTimeout(timer);
        cover.classList.add('open');
        pages.slice(0, -1).forEach((p) => p.classList.add('gone'));
        pages.forEach((p, i) => p.classList.toggle('on', i === pages.length - 1));
        step = pages.length;
        showButtons();
        (scr.querySelector('.voo-dnav.l') as HTMLElement).style.display = 'none';
        return;
      }
      if (step < pages.length) advance();
    });
  });
}

const hatRow = (c: CrewLine) =>
  `<div class="cm">${hatIcon(c.role, 34)}<div><div>${esc(c.name)}${c.me ? ' ★' : ''}</div><small>${esc(roleName(c.role))}${c.bot ? ' · ' + esc(t('voo.d.bot', 'ajudante Bloop')) : ''}</small></div></div>`;

export function briefing(root: HTMLElement, b: Brief): Promise<string> {
  const cover = `<div style="font-size:14px;font-weight:800;letter-spacing:3px">${esc(t('voo.d.file', 'PASTA DE MISSÃO'))}</div><div class="ttl">${esc(t('voo.name', 'Pouso Forçado'))}</div>${vIcon('plane', 64)}<div class="voo-stamp" style="position:static;transform:rotate(-8deg)">${esc(t('voo.d.secret', 'CONFIDENCIAL'))}</div>`;
  // ícone primeiro, rótulo curto (criança que ainda não lê entende pelos desenhos — pedido do dono)
  const row = (ic: string, txt: string) => `<div class="ln ic">${vIcon(ic, 30)}<span>${esc(txt)}</span></div>`;
  const wIc = ['star', 'turb', 'turb'][b.weather] ?? 'star';
  const mIc = b.mode === 'daily' ? 'calendar' : b.mode === 'training' ? 'school' : 'plane';
  const s1 = `<h3>${vIcon('plane', 26)}${esc(t('voo.d.mission', 'Missão: voo {f}', { f: b.flight }))}</h3>
    ${row('plane', `${b.from} → ${b.to}`)}
    ${row(wIc, weatherName(b.weather))}
    ${row(mIc, b.mode === 'daily' ? t('voo.mode.daily', 'Voo do dia') : b.mode === 'training' ? t('voo.mode.training', 'Treino de pouso') : t('voo.mode.normal', 'Voo normal'))}
    ${row('warn', t('voo.d.sitShort', 'O comandante pode desmaiar!'))}
    <div class="voo-stamp">${esc(t('voo.d.mStamp', 'MISSÃO'))}</div>`;
  const s2 = `<h3>${vIcon('crew', 26)}${esc(t('voo.d.crew', 'Tripulação'))}</h3><div class="crew">${b.crew.map(hatRow).join('')}</div>
    <div class="voo-stamp amber">${esc(t('voo.d.approved', 'APROVADO'))}</div>`;
  const s3 = `<h3>${vIcon('info', 26)}${esc(t('voo.d.orders', 'Ordens'))}</h3>
    ${row('ap', t('voo.d.o1s', 'Siga a seta rosa'))}
    ${row('water', t('voo.d.o2s', 'Apague o fogo, tape vazamentos'))}
    ${row('crew', t('voo.d.o3s', 'Toque no retrato: o ajudante vai'))}
    ${row('flaps', t('voo.d.o4s', 'Flapes, trem e toque suave'))}
    <div class="voo-stamp big">${esc(t('voo.d.go', 'BOA SORTE!'))}</div>`;
  return folder(root, cover, [s1, s2, s3], [{ id: 'go', label: t('voo.d.board', 'Embarcar!'), cls: 'green', ico: 'plane' }], t('voo.d.skip', 'Pular'));
}

export interface Report {
  kind: OutKind;
  reason: string;
  stars: number;
  score: number;
  best: number;
  newBest: boolean;
  coins: number;
  vs: number;
  spd: number;
  off: number;
  crew: CrewLine[];
  unlocks: string[];
  daily: boolean;
  flight: string;
}
export function stampText(k: OutKind): string {
  return k === 'perfect' ? t('voo.r.perfect', 'POUSO PERFEITO') : k === 'good' ? t('voo.r.good', 'POUSO SEGURO') : k === 'rough' ? t('voo.r.rough', 'POUSO DURO') : t('voo.r.crash', 'ACIDENTE');
}
export function endReport(root: HTMLElement, r: Report): Promise<string> {
  const stars = `<div class="voo-stars">${[0, 1, 2].map((i) => vIcon(i < r.stars ? 'star' : 'starOff', 40)).join('')}</div>`;
  const cls = r.kind === 'crash' ? '' : r.kind === 'rough' ? 'amber' : 'green';
  const cover = `<div style="font-size:14px;font-weight:800;letter-spacing:3px">${esc(t('voo.d.report', 'RELATÓRIO DE VOO'))}</div><div class="ttl">${esc(r.flight)}</div>${stars}<div class="voo-stamp ${cls}" style="position:static;transform:rotate(-8deg)">${esc(stampText(r.kind))}</div>`;
  const big = r.kind === 'crash' ? 'warn' : r.kind === 'perfect' ? 'trophy' : 'runway';
  const s1 = `<h3>${vIcon(r.kind === 'crash' ? 'warn' : 'runway', 26)}${esc(t('voo.d.result', 'Resultado'))}</h3>
    <div class="voo-bigres">${vIcon(big, 56)}${stars}<span class="pts">${vIcon('coin', 26)}+${fmt(r.coins)}</span></div>
    <div class="ln"><b>${esc(t('voo.d.what', 'O que houve'))}</b>${esc(r.reason)}</div>
    <div class="ln"><b>${esc(t('voo.d.touch', 'Toque'))}</b>${esc(t('voo.d.touchV', '{v} m/s · {s} nós · {o} m do eixo', { v: r.vs.toFixed(1), s: Math.round(r.spd * 1.94), o: Math.round(r.off) }))}</div>
    <div class="ln"><b>${esc(t('voo.d.score', 'Pontos'))}</b>${fmt(r.score)}${r.newBest ? ' — ' + esc(t('voo.d.newBest', 'NOVO RECORDE!')) : ' · ' + esc(t('voo.d.best', 'recorde {b}', { b: fmt(r.best) }))}</div>
    <div class="voo-stamp big ${cls}">${esc(stampText(r.kind))}</div>`;
  // ícones primeiro (para quem ainda não lê); o texto vai no title
  const statLine = (c: CrewLine) => {
    const s = c.stats;
    if (!s) return '';
    const chip = (ico: string, n: string, tip: string) => `<span class="sc" title="${esc(tip)}">${vIcon(ico, 20)}${n}</span>`;
    const parts: string[] = [];
    if (s.fires) parts.push(chip('ext', String(s.fires), t('voo.d.sFires', '{n} fogo(s) apagado(s)', { n: s.fires })));
    if (s.fixes - s.fires > 0) parts.push(chip('wrench', String(s.fixes - s.fires), t('voo.d.sFixes', '{n} conserto(s)', { n: s.fixes - s.fires })));
    if (s.calmed) parts.push(chip('calm', String(s.calmed), t('voo.d.sCalm', '{n} passageiro(s) acalmado(s)', { n: s.calmed })));
    if (s.stowed) parts.push(chip('bag', String(s.stowed), t('voo.d.sStow', '{n} mala(s) guardada(s)', { n: s.stowed })));
    if (s.pilotSec > 5) parts.push(chip('yoke', (s.pilotSec / 60).toFixed(1) + "'", t('voo.d.sPilot', '{m} min no manche', { m: (s.pilotSec / 60).toFixed(1) })));
    if (s.falls) parts.push(chip('turb', String(s.falls), t('voo.d.sFalls', '{n} tombo(s)', { n: s.falls })));
    if (!parts.length) return `<div class="stl">${esc(t('voo.d.sNone', 'ficou de olho na paisagem'))}</div>`;
    return `<div class="stl chips">${parts.join('')}</div>`;
  };
  const s2 = `<h3>${vIcon('crew', 26)}${esc(t('voo.d.crewRep', 'Ficha da tripulação'))}</h3><div class="crew">${r.crew
    .map((c) => `<div class="cm">${hatIcon(c.role, 34)}<div><div>${esc(c.name)}${c.me ? ' ★' : ''} <small style="display:inline">${esc(roleName(c.role))}</small></div>${statLine(c)}</div></div>`)
    .join('')}</div>`;
  const s3 = `<h3>${vIcon('trophy', 26)}${esc(t('voo.d.rewards', 'Recompensas'))}</h3>
    <div class="ln"><b>${esc(t('voo.d.coins', 'Moedas'))}</b>${vIcon('coin', 22)} +${fmt(r.coins)}${r.daily ? ' · ' + esc(t('voo.d.dailyB', 'bônus do voo do dia')) : ''}</div>
    ${r.unlocks.map((u) => `<div class="ln"><b>${esc(t('voo.d.unlocked', 'Desbloqueado'))}</b>${vIcon('star', 22)} ${esc(u)}</div>`).join('')}
    <div class="ln" style="opacity:.75">${esc(r.kind === 'perfect' ? t('voo.d.tipP', 'Lendário! Tente o voo do dia.') : r.kind === 'crash' ? t('voo.d.tipC', 'Ninguém se machucou — só o orgulho. Dica: flapes 2, trem baixado e potência ~35% na final.') : t('voo.d.tipR', 'Para a manteiga: chegue devagar e puxe de leve nos últimos 10 m.'))}</div>
    <div class="voo-stamp ${cls}">${esc(t('voo.d.filed', 'ARQUIVADO'))}</div>`;
  return folder(
    root,
    cover,
    [s1, s2, s3],
    [
      { id: 'exit', label: t('voo.exit', 'Sair'), cls: 'ghost', ico: 'close' },
      { id: 'again', label: t('voo.d.again', 'Voar de novo'), cls: 'green', ico: 'plane' },
    ],
    t('voo.d.toEnd', 'Ver tudo'),
  ).then((id) => id);
}

/** cartão de título da abertura */
export function titleCard(root: HTMLElement): HTMLElement {
  const d = document.createElement('div');
  d.className = 'voo-title';
  d.innerHTML = `<b>${esc(t('voo.titleCard', 'POUSO FORÇADO'))}</b><small>${esc(t('voo.titleSub', 'O comandante desmaiou. Agora é com vocês!'))}</small>`;
  root.appendChild(d);
  return d;
}
