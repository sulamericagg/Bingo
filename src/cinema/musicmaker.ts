/* ============================================================
 *  BLOOP CINEMA — "Criar música": sequenciador para crianças.
 *  1) humor (alegre, aventura, suspense, soninho, festa) · 2) ritmo
 *  (tartaruga ↔ coelho) · 3) instrumentos (ícones) · 4) grade de
 *  passos: melodia pentatônica (sempre soa bem), baixo e bateria.
 *  🎲 sorteia um padrão gostoso; ▶ ouve em loop com o cursor andando.
 *  Salva no projeto como PADRÃO (poucos bytes): o som é sintetizado
 *  na hora (beat.ts) — no editor, no vídeo exportado e na TV.
 * ============================================================ */
import { pushBack } from '../core/back';
import { t } from '../i18n';
import { actx } from './audio';
import { audition, createBeatPlayer, type BeatPlayer } from './beat';
import {
  BASS_INSTS, BASS_ROWS, BPM_MAX, BPM_MIN, DRUM_ROWS, KIT_INSTS, MEL_INSTS, MEL_ROWS, MOOD_DEF, MOODS,
  emptyBeat, parseBeat, randomBeat, type BassInst, type BeatPat, type KitInst, type MelInst, type Mood,
} from './beatpat';

export const moodName = (m: Mood): string =>
  ({
    alegre: () => t('cin.mm.mood.alegre', 'Alegre'),
    aventura: () => t('cin.mm.mood.aventura', 'Aventura'),
    suspense: () => t('cin.mm.mood.suspense', 'Suspense'),
    sono: () => t('cin.mm.mood.sono', 'Soninho'),
    festa: () => t('cin.mm.mood.festa', 'Festa'),
  })[m]();

const MEL_UI: Record<MelInst, [string, () => string]> = {
  piano: ['🎹', () => t('cin.mm.i.piano', 'Piano')],
  chip: ['🎮', () => t('cin.mm.i.chip', 'Videogame')],
  metais: ['🎺', () => t('cin.mm.i.brass', 'Trompete')],
  sanfona: ['🪗', () => t('cin.mm.i.accordion', 'Sanfona')],
  violao: ['🎸', () => t('cin.mm.i.guitar', 'Violão')],
  cordas: ['🎻', () => t('cin.mm.i.strings', 'Violinos')],
  orgao: ['⛪', () => t('cin.mm.i.organ', 'Órgão')],
};
const BASS_UI: Record<BassInst, [string, () => string]> = {
  baixo: ['🎸', () => t('cin.mm.i.bass', 'Baixo')],
  synth: ['🎛️', () => t('cin.mm.i.synth', 'Sintetizador')],
  contra: ['🎻', () => t('cin.mm.i.upright', 'Contrabaixo')],
  chip: ['🎮', () => t('cin.mm.i.chip', 'Videogame')],
};
const KIT_UI: Record<KitInst, [string, () => string]> = {
  bateria: ['🥁', () => t('cin.mm.i.drums', 'Bateria')],
  eletro: ['🔊', () => t('cin.mm.i.electro', 'Eletrônica')],
  chip: ['🎮', () => t('cin.mm.i.chip', 'Videogame')],
  lofi: ['📻', () => t('cin.mm.i.lofi', 'Lo-fi')],
  orq: ['🪘', () => t('cin.mm.i.orch', 'Orquestra')],
};
/** cores das linhas da melodia (grave → agudo) */
const ROW_COL = ['#ff5c5c', '#ff9a3b', '#ffd93b', '#9be15d', '#3ecf8e', '#3fc8ff', '#7b8bff', '#d77bff'];
const DRUM_UI = ['🦶', '👏', '✨'];

/**
 * Abre o criador de música. Resolve com o padrão salvo, ou null (voltou sem salvar).
 * `initial` = trilha que o filme já tem (para editar).
 */
export function openMusicMaker(host: HTMLElement, initial?: BeatPat | null): Promise<BeatPat | null> {
  return new Promise((resolve) => {
    let pat: BeatPat = (initial && parseBeat(initial)) || randomBeat('alegre');
    const el = document.createElement('div');
    el.className = 'mm-root';
    host.appendChild(el);
    let player: BeatPlayer | null = null;
    let out: GainNode | null = null;
    let raf = 0;
    let done = false;
    const finish = (r: BeatPat | null) => {
      if (done) return;
      done = true;
      stop();
      pop();
      el.remove();
      resolve(r);
    };
    const pop = pushBack(() => finish(null));

    const audioOut = (): { c: AudioContext; o: GainNode } | null => {
      const c = actx();
      if (!c) return null;
      if (!out || out.context !== c) {
        out = c.createGain();
        out.gain.value = 0.9;
        out.connect(c.destination);
      }
      return { c, o: out };
    };
    const stop = () => {
      player?.stop();
      player = null;
      cancelAnimationFrame(raf);
      el.querySelectorAll('.mm-col.on').forEach((x) => x.classList.remove('on'));
      const pb = el.querySelector<HTMLElement>('[data-m="play"]');
      if (pb) pb.innerHTML = `▶ <span>${t('cin.mm.play', 'Ouvir')}</span>`;
    };
    const play = () => {
      const a = audioOut();
      if (!a) return;
      player?.stop();
      player = createBeatPlayer(pat, a.c, a.o);
      player.start(0);
      el.querySelector<HTMLElement>('[data-m="play"]')!.innerHTML = `■ <span>${t('cin.mm.stop', 'Parar')}</span>`;
      let last = -2;
      const loop = () => {
        if (!player) return;
        raf = requestAnimationFrame(loop);
        const s = player.step();
        if (s === last) return;
        last = s;
        el.querySelectorAll('.mm-col').forEach((c) => c.classList.toggle('on', +(c as HTMLElement).dataset.s! === s));
      };
      loop();
    };
    /** recomeça o som com as configurações novas (andamento, instrumento...) */
    const restart = () => {
      if (player) play();
    };

    const gridHtml = (): string => {
      const N = pat.steps;
      const cols: string[] = [];
      for (let s = 0; s < N; s++) {
        let cells = '';
        for (let r = MEL_ROWS - 1; r >= 0; r--) cells += `<button class="mm-c mel ${pat.m[s] === String(r) ? 'x' : ''}" style="--c:${ROW_COL[r]}" data-l="m" data-r="${r}" data-s="${s}" aria-label="${t('cin.mm.note', 'Nota')} ${r + 1}"></button>`;
        cells += '<i class="mm-gap"></i>';
        for (let r = BASS_ROWS - 1; r >= 0; r--) cells += `<button class="mm-c bass ${pat.b[s] === String(r) ? 'x' : ''}" data-l="b" data-r="${r}" data-s="${s}" aria-label="${t('cin.mm.bassRow', 'Baixo')} ${r + 1}"></button>`;
        cells += '<i class="mm-gap"></i>';
        for (let r = 0; r < DRUM_ROWS; r++) cells += `<button class="mm-c drum d${r} ${pat.d[r][s] === '1' ? 'x' : ''}" data-l="d" data-r="${r}" data-s="${s}" aria-label="${DRUM_UI[r]}"></button>`;
        cols.push(`<div class="mm-col ${s % 4 === 0 ? 'beat' : ''}" data-s="${s}">${cells}</div>`);
      }
      const labels =
        Array.from({ length: MEL_ROWS }, (_, i) => `<span class="mm-lab" style="color:${ROW_COL[MEL_ROWS - 1 - i]}">●</span>`).join('') +
        '<i class="mm-gap"></i>' +
        Array.from({ length: BASS_ROWS }, () => `<span class="mm-lab">🎸</span>`).join('') +
        '<i class="mm-gap"></i>' +
        DRUM_UI.map((e) => `<span class="mm-lab">${e}</span>`).join('');
      return `<div class="mm-labs">${labels}</div><div class="mm-cols" style="--n:${N}">${cols.join('')}</div>`;
    };
    const instRow = <K extends string>(kind: string, list: readonly K[], ui: Record<K, [string, () => string]>, cur: K) =>
      `<div class="mm-insts">${list.map((id) => `<button class="mm-inst ${id === cur ? 'on' : ''}" data-m="${kind}" data-v="${id}" title="${ui[id][1]()}"><b>${ui[id][0]}</b><small>${ui[id][1]()}</small></button>`).join('')}</div>`;

    const render = () => {
      el.innerHTML = `
        <div class="cin-top">
          <button class="cin-btn cin-ico" data-m="back" aria-label="${t('cin.back', 'Voltar')}">←</button>
          <div class="cin-brand">🎵 ${t('cin.mm.title', 'Criar música')}</div>
          <button class="cin-btn pri" data-m="save">✓ ${t('cin.mm.use', 'Usar no filme')}</button>
        </div>
        <div class="mm-body">
          <div class="mm-side">
            <h5>1. ${t('cin.mm.moodQ', 'Como é a música?')}</h5>
            <div class="mm-moods">${MOODS.map((m) => `<button class="mm-mood ${m === pat.mood ? 'on' : ''}" data-m="mood" data-v="${m}"><b>${MOOD_DEF[m].emoji}</b>${moodName(m)}</button>`).join('')}</div>
            <h5>2. ${t('cin.mm.tempo', 'Ritmo')}</h5>
            <label class="mm-tempo"><span>🐢</span><input type="range" min="${BPM_MIN}" max="${BPM_MAX}" step="2" value="${pat.bpm}" data-m="bpm" aria-label="${t('cin.mm.tempo', 'Ritmo')}"><span>🐇</span><output>${pat.bpm}</output></label>
            <h5>3. ${t('cin.mm.insts', 'Instrumentos')}</h5>
            <div class="mm-ilab">${t('cin.mm.melody', 'Melodia')}</div>${instRow('mel', MEL_INSTS, MEL_UI, pat.mel)}
            <div class="mm-ilab">${t('cin.mm.bassRow', 'Baixo')}</div>${instRow('bass', BASS_INSTS, BASS_UI, pat.bass)}
            <div class="mm-ilab">${t('cin.mm.drumsRow', 'Batida')}</div>${instRow('kit', KIT_INSTS, KIT_UI, pat.kit)}
          </div>
          <div class="mm-main">
            <div class="mm-acts">
              <button class="cin-btn ok mm-play" data-m="play">▶ <span>${t('cin.mm.play', 'Ouvir')}</span></button>
              <button class="cin-btn" data-m="rand">🎲 ${t('cin.mm.random', 'Sortear')}</button>
              <button class="cin-btn ghost sm" data-m="clear">🧹 ${t('cin.mm.clear', 'Limpar')}</button>
              <button class="cin-btn ghost sm" data-m="steps">${pat.steps === 16 ? '16 → 8' : '8 → 16'}</button>
            </div>
            <h5>4. ${t('cin.mm.gridQ', 'Toque nos quadradinhos!')}</h5>
            <div class="mm-grid">${gridHtml()}</div>
            <p class="cin-hint mm-tip">${t('cin.mm.tip', 'Cada coluna é um tempinho. As notas coloridas sempre combinam — pode inventar à vontade!')}</p>
          </div>
        </div>`;
    };
    render();

    const setCell = (lane: 'm' | 'b' | 'd', r: number, s: number) => {
      if (lane === 'd') {
        const row = pat.d[r];
        pat.d[r] = row.slice(0, s) + (row[s] === '1' ? '0' : '1') + row.slice(s + 1);
      } else {
        const key = lane;
        const cur = pat[key][s];
        pat[key] = pat[key].slice(0, s) + (cur === String(r) ? '.' : String(r)) + pat[key].slice(s + 1);
      }
      const on = lane === 'd' ? pat.d[r][s] === '1' : pat[lane][s] === String(r);
      // monofônico: uma nota por coluna na melodia e no baixo
      el.querySelectorAll<HTMLElement>(`.mm-c[data-l="${lane}"][data-s="${s}"]`).forEach((c) => {
        if (lane === 'd') {
          if (+c.dataset.r! === r) c.classList.toggle('x', on);
        } else c.classList.toggle('x', on && +c.dataset.r! === r);
      });
      if (on) {
        const a = audioOut();
        if (a) audition(pat, a.c, a.o, lane, r);
      }
    };

    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-m],[data-l]');
      if (!b) return;
      if (b.dataset.l) return setCell(b.dataset.l as 'm' | 'b' | 'd', +b.dataset.r!, +b.dataset.s!);
      const m = b.dataset.m;
      const v = b.dataset.v!;
      if (m === 'back') return finish(null);
      if (m === 'save') {
        const empty = !/[0-7]/.test(pat.m) && !/[0-3]/.test(pat.b) && !pat.d.some((d) => d.includes('1'));
        return finish(empty ? null : pat);
      }
      if (m === 'play') return player ? stop() : play();
      if (m === 'rand') {
        pat = { ...randomBeat(pat.mood, undefined, pat.steps), bpm: pat.bpm, mel: pat.mel, bass: pat.bass, kit: pat.kit };
      } else if (m === 'clear') {
        pat = { ...emptyBeat(pat.mood, pat.steps), bpm: pat.bpm, key: pat.key, mel: pat.mel, bass: pat.bass, kit: pat.kit };
      } else if (m === 'steps') {
        const n = pat.steps === 16 ? 8 : 16;
        const fit = (s: string) => (n === 8 ? s.slice(0, 8) : s + s);
        pat = { ...pat, steps: n, m: fit(pat.m), b: fit(pat.b), d: [fit(pat.d[0]), fit(pat.d[1]), fit(pat.d[2])] };
      } else if (m === 'mood') {
        pat = randomBeat(v as Mood, undefined, pat.steps);
      } else if (m === 'mel') pat.mel = v as MelInst;
      else if (m === 'bass') pat.bass = v as BassInst;
      else if (m === 'kit') pat.kit = v as KitInst;
      else return;
      const wasPlaying = !!player;
      stop();
      render();
      if (wasPlaying || m === 'rand' || m === 'mood') play();
      else if (m === 'mel' || m === 'bass' || m === 'kit') {
        const a = audioOut();
        if (a) audition(pat, a.c, a.o, m === 'mel' ? 'm' : m === 'bass' ? 'b' : 'd', m === 'kit' ? 0 : 4 % (m === 'mel' ? 8 : 4));
      }
    });
    el.addEventListener('input', (e) => {
      const i = e.target as HTMLInputElement;
      if (i.dataset.m !== 'bpm') return;
      pat.bpm = +i.value;
      (i.parentElement!.querySelector('output') as HTMLOutputElement).value = i.value;
    });
    el.addEventListener('change', (e) => {
      if ((e.target as HTMLElement).dataset.m === 'bpm') restart();
    });
  });
}
