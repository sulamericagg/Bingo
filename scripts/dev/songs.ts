// Página de desenvolvimento do Bloop Banda: lista, toca, abafa instrumentos, mostra o chart rolando, prévias de dança/aura.
import '@fontsource/fredoka/500.css';
import type { Difficulty, Instrument, SongDef, SongPlayer } from '../../src/music/api';
import { SKINS } from '../../src/game/skins';
import { drawPlayer } from '../../src/game/character';
import {
  allMusicPassSeasons, applyDancePose, drawAura, drawDanceArms, drawDanceFx, playDance, STARTER, type DancePlayer,
} from '../../src/pass/music/index';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const INSTS: Instrument[] = ['drums', 'bass', 'guitar', 'keys', 'vocals'];
const DIFFS: Difficulty[] = ['facil', 'medio', 'dificil', 'expert'];
const LANE_COL = ['#3cff8c', '#ff3b5c', '#ffe14f', '#3b8bff', '#ff8c1a'];

const mod = (await import('../../src/music/songs')).default;
let ctx: AudioContext | null = null;
let player: SongPlayer | null = null;
let cur: SongDef = mod.SONGS[0];
const muted = new Set<Instrument>();

function renderList(): void {
  const q = ($<HTMLInputElement>('q').value || '').toLowerCase();
  const l = $('list');
  l.innerHTML = '';
  for (const s of mod.SONGS) {
    const txt = `${s.id} ${s.title} ${s.band} ${s.style}`.toLowerCase();
    if (q && !txt.includes(q)) continue;
    const d = document.createElement('div');
    d.className = s === cur ? 'on' : '';
    d.innerHTML = `<b>${s.title}</b><br><small>${s.id} · ${s.band} · ${s.style} · ${s.bpm} bpm · ${Math.round(s.durationSec)} s${s.tier === 'mega' ? ' · MEGA' : ''}</small>`;
    d.onclick = () => select(s);
    l.appendChild(d);
  }
}
function select(s: SongDef): void {
  player?.stop();
  player = null;
  cur = s;
  $('title').textContent = `${s.title} — ${s.band}`;
  $('meta').textContent = `${mod.styleName(s.style)} · ${s.bpm} bpm · ${s.bars} compassos · palco ${s.stage} · ${s.tier}${s.season !== undefined ? ' · temporada ' + s.season : ''}`;
  renderList();
  stats();
}
function stats(): void {
  const n = cur.charts[$<HTMLSelectElement>('inst').value as Instrument]?.[$<HTMLSelectElement>('diff').value as Difficulty] ?? [];
  $('stats').textContent = ` ${n.length} notas · ${(new Set(n.map((x) => x.b)).size / cur.durationSec).toFixed(2)} notas/s`;
}
for (const i of INSTS) $('inst').insertAdjacentHTML('beforeend', `<option>${i}</option>`);
for (const d of DIFFS) $('diff').insertAdjacentHTML('beforeend', `<option>${d}</option>`);
$<HTMLSelectElement>('diff').value = 'medio';
$<HTMLSelectElement>('inst').value = 'guitar';
$('inst').onchange = $('diff').onchange = stats;
for (const i of INSTS) {
  const lb = document.createElement('label');
  lb.innerHTML = `<input type="checkbox" checked> ${i}`;
  lb.querySelector('input')!.onchange = (e) => {
    const on = (e.target as HTMLInputElement).checked;
    if (on) muted.delete(i);
    else muted.add(i);
    player?.setTrackGain(i, on ? 1 : 0);
  };
  $('mutes').appendChild(lb);
  const b = document.createElement('button');
  b.textContent = `erro ${i}`;
  b.onclick = () => player?.miss(i);
  $('misses').appendChild(b);
}
$('q').oninput = renderList;
$('play').onclick = async () => {
  ctx ??= new AudioContext();
  await ctx.resume();
  player?.stop();
  player = mod.createPlayer(cur, ctx, ctx.destination);
  for (const i of muted) player.setTrackGain(i, 0);
  player.onEnd(() => ($('time').textContent += ' (fim)'));
  player.start(0);
};
$('stop').onclick = () => {
  player?.stop();
  player = null;
};

// --------- pista de notas ---------
const hw = $<HTMLCanvasElement>('hw');
const hx = hw.getContext('2d')!;
function drawHighway(): void {
  const W = hw.width;
  const H = hw.height;
  hx.fillStyle = '#0a0614';
  hx.fillRect(0, 0, W, H);
  const inst = $<HTMLSelectElement>('inst').value as Instrument;
  const diff = $<HTMLSelectElement>('diff').value as Difficulty;
  const L = diff === 'facil' ? 3 : diff === 'medio' ? 4 : 5;
  const lw = W / L;
  const t = player ? player.time() : 0;
  $('time').textContent = `${t.toFixed(1)} s`;
  const spb = 60 / cur.bpm;
  const hitY = H - 50;
  const pxs = 260; // px por segundo
  for (let l = 0; l < L; l++) {
    hx.fillStyle = l % 2 ? '#150c2a' : '#1a1034';
    hx.fillRect(l * lw, 0, lw, H);
  }
  // linhas de compasso
  hx.strokeStyle = '#ffffff22';
  for (let b = Math.floor(t / spb / 4) * 4; b < (t + 2) / spb; b += 4) {
    const y = hitY - (b * spb - t) * pxs;
    hx.beginPath();
    hx.moveTo(0, y);
    hx.lineTo(W, y);
    hx.stroke();
  }
  const notes = cur.charts[inst]?.[diff] ?? [];
  for (const n of notes) {
    const dt = n.b * spb - t;
    if (dt > 2 || dt + (n.len ?? 0) * spb < -0.3) continue;
    const y = hitY - dt * pxs;
    const x = n.lane * lw + lw / 2;
    if (n.len) {
      hx.fillStyle = LANE_COL[n.lane] + '88';
      hx.fillRect(x - 6, y - n.len * spb * pxs, 12, n.len * spb * pxs);
    }
    hx.fillStyle = LANE_COL[n.lane];
    hx.beginPath();
    hx.ellipse(x, y, lw * 0.35, 12, 0, 0, Math.PI * 2);
    hx.fill();
  }
  hx.strokeStyle = '#fff';
  hx.lineWidth = 3;
  hx.beginPath();
  hx.moveTo(0, hitY);
  hx.lineTo(W, hitY);
  hx.stroke();
}

// --------- danças e auras ---------
const seasons = allMusicPassSeasons();
const danceIds = [...STARTER.dances, ...seasons.flatMap((s) => s.dances.map((d) => d.id))];
const auraIds = [...STARTER.auras, ...seasons.flatMap((s) => s.auras.map((a) => a.id))];
const names = new Map<string, string>();
for (const s of seasons) {
  for (const d of s.dances) names.set(d.id, d.name);
  for (const a of s.auras) names.set(a.id, a.name);
}
for (const id of danceIds) $('dance').insertAdjacentHTML('beforeend', `<option value="${id}">${names.get(id) ?? id}</option>`);
for (const id of auraIds) $('aura').insertAdjacentHTML('beforeend', `<option value="${id}">${names.get(id) ?? id}</option>`);
let dance: DancePlayer | null = playDance(danceIds[0]);
$('dance').onchange = () => (dance = playDance($<HTMLSelectElement>('dance').value));
const fx = $<HTMLCanvasElement>('fx');
const fc = fx.getContext('2d')!;
const T0 = performance.now();
function drawFx(): void {
  const t = (performance.now() - T0) / 1000;
  fc.fillStyle = '#1d1238';
  fc.fillRect(0, 0, fx.width, fx.height);
  const R = 40;
  // esquerda: aura; direita: dança (com a aura também)
  const aura = $<HTMLSelectElement>('aura').value;
  const skin = SKINS[0];
  const base = { t, blink: 0, lookX: 0, lookY: 0, sx: 1, sy: 1, mood: 'happy' as const, lx: -0.5, ly: -0.6 };
  drawAura(fc, aura, 110, 140, R, t);
  fc.save();
  fc.translate(110, 140);
  drawPlayer(fc, skin, R, base);
  fc.restore();
  if (dance) {
    const p = dance.frame(t);
    const x = 310;
    const y = 140;
    drawAura(fc, aura, x + p.dx * R, y + p.dy * R, R, t);
    fc.save();
    fc.translate(x, y);
    applyDancePose(fc, p, R);
    drawDanceArms(fc, p, R, skin.dark);
    drawPlayer(fc, skin, R, { ...base, sx: p.sx, sy: p.sy, mood: p.mood });
    fc.restore();
    drawDanceFx(fc, p, x, y, R);
  }
}
function loop(): void {
  drawHighway();
  drawFx();
  requestAnimationFrame(loop);
}
select(cur);
loop();
