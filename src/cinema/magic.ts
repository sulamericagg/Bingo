/* ============================================================
 *  BLOOP CINEMA — História Mágica.
 *  A criança fala (reconhecimento de voz) ou escreve uma ideia; a IA
 *  do nosso servidor (POST /api/ai/story → docs/IA.md) devolve um
 *  roteiro (StorySpec) que vira filme. Sem rede, sem chave no
 *  servidor ou sem direito de uso → gerador OFFLINE (storygen.ts):
 *  o recurso sempre funciona.
 *
 *  Direito de uso da IA: assistir um vídeo premiado = 1 história;
 *  Cinema Pro (Clube / Passe premium) = PRO_DAILY por dia. O servidor
 *  também limita por jogador/IP (defesa de custo).
 * ============================================================ */
import { maskLongText } from '../../shared/moderation';
import { STORY_LIMITS, validateStory, type StorySpec } from '../../shared/story';
import { pushBack } from '../core/back';
import { dayNumber } from '../core/storage';
import { getLang, t } from '../i18n';
import { esc } from '../ui/dom';
import { notify } from '../ui/notify';
import { rewardedAvailable, showRewarded } from '../services/ads';
import { apiBase } from '../services/leaderboard';
import { getPlayer } from '../services/online';
import { isPro } from './gates';
import { menu } from './sheets';
import { dictate, dictating, dictationAvailable, stopDictation } from './dictate';
import { offlineStory } from './storygen';

export const PRO_DAILY = 10;
const KEY = 'cin-magic';
const DEBUG = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search);

interface MagicSave {
  day: number;
  used: number;
  tickets: number;
}
function load(): MagicSave {
  let m: MagicSave = { day: 0, used: 0, tickets: 0 };
  try {
    m = { ...m, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<MagicSave>) };
  } catch {
    /* */
  }
  const d = dayNumber();
  if (m.day !== d) {
    m.day = d;
    m.used = 0;
  }
  return m;
}
function store(m: MagicSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* */
  }
}

/** Limpa textos do roteiro com o mesmo filtro do chat; null = bloqueado (contato/link). */
const clean = (s: string, n: number): string | null => {
  const r = maskLongText(s, n);
  return r.pii ? null : r.text;
};

export type AiResult = { spec: StorySpec } | { error: 'unsafe' | 'offline' | 'limit' | 'failed' };

/** Pede o roteiro à IA do servidor. */
export async function askAi(idea: string, entitlement: 'pro' | 'ad'): Promise<AiResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(`${apiBase()}/api/ai/story`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idea, lang: getLang(), pid: getPlayer()?.id ?? '', ent: entitlement }),
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { story?: unknown; error?: string };
    if (res.status === 422 || body.error === 'unsafe') return { error: 'unsafe' };
    if (res.status === 429) return { error: 'limit' };
    if (!res.ok) return { error: res.status === 503 ? 'offline' : 'failed' };
    const spec = validateStory(body.story, clean);
    return spec ? { spec } : { error: 'failed' };
  } catch {
    return { error: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

const EXAMPLES = [
  () => t('cin.magic.ex1', 'Um robô que perdeu o sorvete na praia'),
  () => t('cin.magic.ex2', 'Festa surpresa no espaço'),
  () => t('cin.magic.ex3', 'Um fantasma medroso no castelo'),
  () => t('cin.magic.ex4', 'Corrida maluca no parque'),
];

/** Tela da História Mágica. Resolve com o roteiro pronto, ou null. */
export function magicFlow(host: HTMLElement): Promise<StorySpec | null> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'kid-root magic';
    let finished = false;
    let busy = false;
    const finish = (r: StorySpec | null) => {
      if (finished) return;
      finished = true;
      stopDictation();
      pop();
      el.remove();
      resolve(r);
    };
    const pop = pushBack(() => finish(null));
    const m = load();
    const pro = isPro();
    const left = pro ? Math.max(0, PRO_DAILY - m.used) : m.tickets;
    el.innerHTML = `
      <div class="kid-top"><button class="cin-btn cin-ico" data-k="back" aria-label="${t('cin.back', 'Voltar')}">←</button><div class="kid-dots"></div></div>
      <div class="magic-wand">🪄</div>
      <h2 class="kid-h">${t('cin.home.magic', 'História Mágica')}</h2>
      <p class="kid-sub">${t('cin.magic.sub', 'Conte sua ideia e a mágica faz o filme!')}</p>
      <div class="kid-bubble magic-box"><textarea rows="3" maxlength="200" data-k2="idea" placeholder="${t('cin.magic.ph', 'Ex.: um gato astronauta que quer achar a lua de queijo')}"></textarea></div>
      <button class="kid-mic magic-mic" data-k="talk" hidden>🎤<span>${t('cin.magic.talk', 'Toque e conte sua ideia')}</span></button>
      <div class="magic-ex">${EXAMPLES.map((f) => `<button class="cin-chip" data-k="ex">${esc(f())}</button>`).join('')}</div>
      <p class="kid-sub magic-left">${pro ? t('cin.magic.leftPro', 'Mágicas com IA hoje: {n}', { n: left }) : left ? t('cin.magic.tickets', 'Você tem {n} mágica(s) com IA', { n: left }) : t('cin.magic.free', 'Mágica rápida grátis • com IA: assista um vídeo')}</p>
      <div class="kid-foot"><button class="cin-btn pri kid-big" data-k="go">✨ ${t('cin.magic.go', 'Fazer a mágica!')}</button></div>
      <div class="magic-busy" hidden><div class="magic-wand spin">🪄</div><b>${t('cin.magic.busy', 'Fazendo mágica...')}</b></div>`;
    host.appendChild(el);
    const ta = el.querySelector<HTMLTextAreaElement>('textarea')!;
    const talk = el.querySelector<HTMLButtonElement>('[data-k="talk"]')!;
    void dictationAvailable().then((ok) => (talk.hidden = !ok));
    const setBusy = (on: boolean) => {
      busy = on;
      el.querySelector<HTMLElement>('.magic-busy')!.hidden = !on;
    };
    el.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
      if (!b || (busy && b.dataset.k !== 'talk')) return;
      const k = b.dataset.k;
      if (k === 'back') return finish(null);
      if (k === 'ex') {
        ta.value = b.textContent ?? '';
        return;
      }
      if (k === 'talk') {
        if (dictating()) return stopDictation();
        talk.classList.add('rec');
        talk.querySelector('span')!.textContent = t('cin.magic.listening', 'Estou ouvindo...');
        const r = await dictate({ onText: (s) => (ta.value = s.slice(0, 200)), onLevel: (v) => talk.style.setProperty('--l', v.toFixed(2)) });
        talk.classList.remove('rec');
        talk.querySelector('span')!.textContent = t('cin.magic.talk', 'Toque e conte sua ideia');
        if ('text' in r) ta.value = r.text.slice(0, 200);
        else if (r.error === 'denied') notify(t('cin.rec.denied', 'Sem permissão do microfone. Libere nas configurações do aparelho.'), { kind: 'warn', icon: 'warning' });
        else if (r.error === 'unsupported') notify(t('cin.easy.noStt', 'Este aparelho não transforma voz em texto. Escreva com o teclado!'), { kind: 'warn' });
        else if (r.error !== 'busy') notify(t('cin.magic.noHear', 'Não ouvi direito. Tente de novo ou escreva!'), { icon: 'sound' });
        return;
      }
      if (k !== 'go') return;
      const raw = ta.value.trim();
      if (raw.length < 3) return void notify(t('cin.magic.need', 'Conte uma ideia primeiro!'), { kind: 'warn' });
      const mk = maskLongText(raw, 200);
      if (mk.pii) return void notify(t('cin.safe.pii', 'Sem contatos, links ou endereços nos filmes, tá?'), { kind: 'warn', icon: 'shield' });
      const idea = mk.text;
      // direito de uso da IA
      const mm = load();
      let ent: 'pro' | 'ad' | null = null;
      if (isPro() && mm.used < PRO_DAILY) ent = 'pro';
      else if (mm.tickets > 0) ent = 'ad';
      else {
        const opts: [string, string, string?][] = [];
        if (rewardedAvailable() || DEBUG) opts.push(['ad', '📺 ' + t('cin.magic.watch', 'Ver um vídeo: mágica com IA'), 'pri']);
        opts.push(['quick', '⚡ ' + t('cin.magic.quick', 'Mágica rápida (sem IA)')]);
        const a = await menu(t('cin.magic.how', 'Como fazer a mágica?'), opts);
        if (!a) return;
        if (a === 'ad') {
          const ok = DEBUG && /[?&]magicad\b/.test(location.search) ? true : await showRewarded();
          if (!ok) return void notify(t('cin.magic.adFail', 'O vídeo não carregou. Use a mágica rápida!'), { kind: 'warn' });
          mm.tickets++;
          store(mm);
          ent = 'ad';
        }
      }
      setBusy(true);
      let spec: StorySpec | null = null;
      if (ent) {
        const r = await askAi(idea, ent);
        if ('spec' in r) {
          spec = r.spec;
          const m2 = load();
          if (ent === 'pro') m2.used++;
          else m2.tickets = Math.max(0, m2.tickets - 1);
          store(m2);
        } else if (r.error === 'unsafe') {
          setBusy(false);
          return void notify(t('cin.magic.unsafe', 'Hmm, essa ideia não combina com o Bloop. Que tal outra?'), { kind: 'warn', icon: 'shield' });
        } else notify(r.error === 'limit' ? t('cin.magic.limit', 'A mágica com IA descansou por hoje. Fiz a mágica rápida!') : t('cin.magic.offline', 'Sem conexão com a mágica: fiz a mágica rápida!'), { icon: 'star' });
      }
      if (!spec) {
        await new Promise((r) => setTimeout(r, 700)); // tempo da animação
        spec = validateStory(offlineStory(idea), clean);
      }
      setBusy(false);
      if (spec) {
        spec.title = (clean(spec.title, STORY_LIMITS.title) ?? '') || t('cin.gen.title', 'Minha história');
        finish(spec);
      }
    });
  });
}
