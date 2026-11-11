// Página de audição do áudio do Bloop World: todos os pacotes (sons), temas (estados + vinhetas),
// ambientes e motores. /scripts/dev/audio.html
// Também expõe window.__audio para o script de render offline (scripts/dev/audio-render.mjs).
import {
  ambience, engine, getPack, listPacks, Motor, music, play, prepare, renderTheme, THEMES, enterGame,
  type MState, type StingId,
} from '../../src/audio';
import { AMB_REF, MUSIC_REF, SFX_REF, makeImpulse } from '../../src/audio/engine';
import { measure } from '../../src/audio/sound';

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const log = (s: string) => ($('#log').textContent = s);

function btn(label: string, cls: string, fn: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  if (cls) b.className = cls;
  b.onclick = () => {
    engine.unlock();
    fn();
  };
  return b;
}

function build(): void {
  const root = $('#packs');
  root.innerHTML = '';
  for (const p of listPacks()) {
    const sec = document.createElement('section');
    const th = p.theme === undefined ? 'hub' : p.theme;
    sec.innerHTML = `<h2>${p.name}<small>${p.id}${th ? ' · ♪ ' + th : ' · sem música do app'}</small></h2>`;
    if (p.id !== 'base') sec.append(btn('▶ entrar no jogo (pacote+tema+ambiente)', 'amb', () => enterGame(p.id)));
    if (th && THEMES[th]) {
      const r = document.createElement('div');
      r.className = 'row';
      r.innerHTML = `<div class="lbl">Música: ${THEMES[th].name} — ${THEMES[th].bpm} bpm</div>`;
      r.append(btn('♪ tocar', 'mus', () => music.play(th)));
      for (const s of ['calm', 'tension', 'victory'] as MState[]) r.append(btn(s, 'mus', () => (music.play(th), music.setState(s))));
      for (const k of ['win', 'lose', 'levelup', 'item', 'start'] as StingId[]) r.append(btn('★ ' + k, 'mus', () => (music.theme !== th && music.play(th), music.sting(k))));
      sec.append(r);
    }
    if (p.amb) {
      const r = document.createElement('div');
      r.className = 'row';
      r.innerHTML = '<div class="lbl">Ambiente</div>';
      r.append(btn('🌙 ligar ambiente', 'amb', () => void ambience.start(p.id)));
      r.append(btn('desligar', 'amb', () => ambience.stop()));
      sec.append(r);
    }
    if (p.motor) {
      const r = document.createElement('div');
      r.className = 'row';
      r.innerHTML = `<div class="lbl">Motor (${p.motor.kind}) — arraste o acelerador</div>`;
      let m: Motor | null = null;
      const rng = document.createElement('input');
      rng.type = 'range';
      rng.min = '0';
      rng.max = '100';
      rng.value = '0';
      rng.oninput = () => m?.set(Number(rng.value) / 100, Number(rng.value) / 100);
      r.append(
        btn('ligar', '', () => {
          m?.stop();
          m = new Motor(p.motor!);
        }),
        rng,
        btn('desligar', '', () => {
          m?.stop();
          m = null;
        }),
      );
      sec.append(r);
    }
    const r = document.createElement('div');
    r.className = 'row';
    r.innerHTML = `<div class="lbl">Sons (${Object.keys(p.sounds).length})</div>`;
    for (const n of Object.keys(p.sounds)) {
      const d = p.sounds[n];
      if (d.loop) r.append(btn('⟳ ' + n, 'amb', () => void import('../../src/audio').then((a) => a.sfx.loop(`${p.id}.${n}`).then((h) => setTimeout(() => h?.stop(0.5), 6000)))));
      else r.append(btn(n, '', () => play(`${p.id}.${n}`, { force: true })));
    }
    sec.append(r);
    root.append(sec);
  }
}

$('#go').onclick = () => {
  engine.unlock();
  log(`contexto: ${engine.ctx?.state} @ ${engine.ctx?.sampleRate} Hz`);
};
$('#stop').onclick = () => {
  music.play(null);
  ambience.stop();
};
document.querySelectorAll<HTMLInputElement>('input[data-mix]').forEach((i) => {
  const k = i.dataset.mix as 'vol' | 'music' | 'sfx';
  i.value = String(Math.round(engine.mix[k] * 100));
  i.oninput = () => engine.setMix({ [k]: Number(i.value) / 100 });
});
build();

/* ============================== render offline (para o script) ============================== */
function wav(buf: AudioBuffer): string {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  out.setUint32(4, 36 + n * ch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  w(36, 'data');
  out.setUint32(40, n * ch * 2, true);
  const data = [...Array(ch)].map((_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  const bytes = new Uint8Array(out.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const curve = (v: number) => v * v;

/** mixagem offline de um jogo: tema (calm→tension→victory) + ambiente + efeitos do pacote, com os ganhos do app */
async function renderMix(id: string, sec = 20, sr = 44100): Promise<AudioBuffer> {
  const p = getPack(id)!;
  const th = p.theme === undefined ? 'hub' : p.theme;
  const oc = new OfflineAudioContext(2, sr * sec, sr);
  const mix = { vol: 1, music: 0.8, sfx: 1 };
  const lim = oc.createDynamicsCompressor();
  lim.threshold.value = -10;
  lim.knee.value = 8;
  lim.ratio.value = 8;
  lim.attack.value = 0.003;
  lim.release.value = 0.22;
  const master = oc.createGain();
  master.gain.value = curve(mix.vol);
  master.connect(lim).connect(oc.destination);
  const sfxBus = oc.createGain();
  sfxBus.gain.value = SFX_REF * curve(mix.sfx);
  sfxBus.connect(master);
  const sRev = oc.createConvolver();
  sRev.buffer = makeImpulse(oc, 1.4, 3, 0.45);
  const sWet = oc.createGain();
  sWet.gain.value = 0.35;
  sRev.connect(sWet).connect(sfxBus);
  // música: renderizada à parte (mesmo código) e colada no barramento
  if (th) {
    const mb = await renderTheme(th, sec, [
      [0, 'calm'],
      [sec * 0.4, 'tension'],
      [sec * 0.75, 'victory'],
    ], { sr });
    const s = oc.createBufferSource();
    s.buffer = mb;
    const g = oc.createGain();
    g.gain.value = MUSIC_REF * curve(mix.music);
    s.connect(g).connect(master);
    s.start(0);
  }
  // ambiente
  for (const l of p.amb?.layers ?? []) {
    const def = p.sounds[l.id];
    const bufs = await prepare(`${id}.${l.id}`, def, sr);
    if (!bufs) continue;
    const s = oc.createBufferSource();
    s.buffer = bufs[0];
    s.loop = true;
    const g = oc.createGain();
    g.gain.value = AMB_REF * Math.pow(10, (l.db ?? 0) / 20);
    s.connect(g).connect(sfxBus);
    s.start(0);
  }
  // efeitos: sorteia sons do pacote (sem loops) ao longo do tempo
  const names = Object.keys(p.sounds).filter((n) => !p.sounds[n].loop && p.sounds[n].bus !== 'amb');
  const base = ['click', 'coin', 'jump', 'land', 'hit', 'crack', 'cash'];
  const pool = names.length >= 3 ? names : [...names, ...base];
  let t = 0.6;
  let i = 0;
  while (t < sec - 1.5) {
    const n = pool[i++ % pool.length];
    const key = names.includes(n) ? `${id}.${n}` : `base.${n}`;
    const def = names.includes(n) ? p.sounds[n] : getPack('base')!.sounds[n];
    if (def) {
      const bufs = await prepare(key, def, sr);
      if (bufs) {
        const s = oc.createBufferSource();
        s.buffer = bufs[i % bufs.length];
        s.connect(sfxBus);
        if (def.rev) {
          const rg = oc.createGain();
          rg.gain.value = def.rev;
          s.connect(rg).connect(sRev);
        }
        s.start(t);
      }
    }
    t += 0.45 + ((i * 37) % 10) / 10;
  }
  return oc.startRendering();
}

const stats = (b: AudioBuffer) => {
  const m = measure(b);
  return { peak: m.peak, peakDb: 20 * Math.log10(m.peak + 1e-9), rms300Db: 20 * Math.log10(m.rms + 1e-9) };
};

(window as unknown as { __audio: unknown }).__audio = {
  packs: () => listPacks().map((p) => ({ id: p.id, theme: p.theme === undefined ? 'hub' : p.theme, sounds: Object.keys(p.sounds), amb: !!p.amb })),
  themes: () => Object.keys(THEMES),
  async theme(id: string, sec: number) {
    const b = await renderTheme(id, sec, [
      [0, 'calm'],
      [sec / 3, 'tension'],
      [(2 * sec) / 3, 'victory'],
    ], { stings: [[sec - 3, 'win']] });
    return { wav: wav(b), ...stats(b) };
  },
  async sound(key: string) {
    const [pid, n] = key.split('.');
    const def = getPack(pid)!.sounds[n];
    const bufs = await prepare(key, def, 44100);
    const b = bufs![0];
    return { ...stats(b), dur: b.duration };
  },
  async mix(id: string, sec = 20) {
    const b = await renderMix(id, sec);
    return { wav: wav(b), ...stats(b) };
  },
};
log('pronto — toque em ▶ Ligar áudio');
