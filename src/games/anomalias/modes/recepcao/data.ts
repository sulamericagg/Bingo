/* ============================================================
 *  RECEPÇÃO — dados puros (sem DOM/three): hóspedes, pistas de impostor,
 *  noites 1–5 e a fila de visitantes da noite (determinística pela semente).
 *  Regras de justiça (como o diretor do núcleo): o 1º visitante é sempre
 *  normal; nunca 3 impostores seguidos; toda pista da noite pode ser vista
 *  com as ferramentas liberadas naquela noite; pistas ficam mais sutis.
 * ============================================================ */
import { Rng } from '../../core/util';
import { BEHAVE_OK, type Behave, type Hat, type Look } from '../visitor';

export const R_NIGHTS = 5;

export interface Guest {
  id: string;
  /** "nome" em ícone (criança não precisa ler) */
  icon: string;
  look: Look;
}

const G = (id: string, icon: string, color: string, hat: Hat, hatColor: string, o: Partial<Look> = {}): Guest => ({
  id,
  icon,
  look: { color, eyes: 2, mouth: 0, hat, hatColor, glasses: false, scarf: null, bag: null, ...o },
});

export const GUESTS: Guest[] = [
  G('morango', '🍓', '#ff5a7a', 'beanie', '#3ee07a'),
  G('lua', '🌙', '#6f7bff', 'none', '#ffffff', { glasses: true }),
  G('estrela', '⭐', '#ffcf2e', 'crown', '#ff9a2e'),
  G('peixe', '🐟', '#4fc3ff', 'cap', '#ff4f6a', { bag: '#8a5a3a' }),
  G('cogumelo', '🍄', '#ff8a4a', 'bow', '#ffffff', { scarf: '#5ad1ff' }),
  G('sapo', '🐸', '#53d36b', 'cap', '#ffd34a'),
  G('flor', '🌻', '#ffb3d9', 'flower', '#ff5cc8', { bag: '#7b3dff' }),
  G('foguete', '🚀', '#c0c6d6', 'none', '#ffffff', { scarf: '#ff4f6a', glasses: true }),
  G('donut', '🍩', '#c58cff', 'chef', '#ffffff'),
  G('cacto', '🌵', '#2fbf8f', 'flower', '#ff5a5a', { glasses: true }),
  G('balao', '🎈', '#ff4f4f', 'beanie', '#5ad1ff', { scarf: '#ffd34a' }),
  G('pizza', '🍕', '#ffd99a', 'chef', '#ffffff', { bag: '#3ee07a' }),
];

/** pistas de impostor (uma por impostor; as primeiras noites podem ter duas) */
export type Tell =
  | 'eyes' // nº de olhos diferente do crachá
  | 'teeth' // boca larga com dentes
  | 'color' // cor bem diferente da foto
  | 'noAcc' // falta acessório da foto
  | 'notList' // não está na lista
  | 'shadow' // sem sombra
  | 'spin' // a cabeça gira demais
  | 'still' // parado demais (não pisca, não respira)
  | 'answer' // responde outro nome
  | 'blink' // olhos piscam fora de ritmo
  | 'mirror' // reflexo errado
  | 'uv' // marca escondida (luz UV)
  | 'stamp' // carimbo do crachá errado
  | 'glitch' // balão de fala com chiado
  | 'date' // data do crachá errada
  | 'twice' // já entrou hoje
  | 'tint' // cor um pouquinho diferente
  | 'smallTeeth'; // bocão sutil (lupa)

export const TELL_NIGHT: Record<Tell, number> = {
  eyes: 1,
  teeth: 1,
  color: 1,
  noAcc: 1,
  notList: 1,
  shadow: 2,
  spin: 2,
  still: 2,
  answer: 2,
  blink: 3,
  mirror: 3,
  uv: 3,
  stamp: 3,
  glitch: 3,
  date: 4,
  twice: 4,
  tint: 4,
  smallTeeth: 5,
};
/** pistas "fáceis" (não entram na noite 5 quando há sutis) */
const OBVIOUS: Tell[] = ['eyes', 'teeth', 'color', 'notList'];

export type Tool = 'card' | 'list' | 'light' | 'zoom' | 'ask' | 'uv';
export function toolsFor(night: number): Tool[] {
  const t: Tool[] = ['card', 'list', 'light', 'zoom'];
  if (night >= 2) t.push('ask');
  if (night >= 3) t.push('uv');
  return t;
}

export interface RNight {
  visitors: number;
  impostors: number;
  /** impostores com 2 pistas (noites fáceis) */
  doubleTells: number;
  /** perigo por impostor que entrou */
  danger: number;
  /** chamadas de segurança */
  guards: number;
}
export function rNight(n: number): RNight {
  const k = Math.max(1, Math.min(R_NIGHTS, n));
  return {
    visitors: 5 + k,
    impostors: [2, 3, 3, 4, 4][k - 1],
    doubleTells: [2, 1, 0, 0, 0][k - 1],
    danger: [34, 34, 40, 45, 50][k - 1],
    guards: 2,
  };
}

/** carimbos possíveis do crachá (forma + cor) e "datas" (fases da lua) */
export const STAMPS = [
  { shape: 'star', color: '#ff4f6a' },
  { shape: 'heart', color: '#3ee07a' },
  { shape: 'circle', color: '#5ad1ff' },
  { shape: 'square', color: '#ffb300' },
  { shape: 'triangle', color: '#b36bff' },
] as const;
/** "datas" (o crachá mostra um calendário com o número) */
export const DATES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export interface Card {
  icon: string;
  look: Look;
  stamp: number;
  date: number;
  /** marca d'água UV (crachá verdadeiro tem) */
  uvMark: boolean;
}
export interface VisitorPlan {
  idx: number;
  guest: Guest;
  /** aparência real (o que se vê) */
  look: Look;
  beh: Behave;
  card: Card;
  impostor: boolean;
  tells: Tell[];
  /** resposta à pergunta "quem é você?" (ícone) */
  answer: string;
  glitch: boolean;
  /** reflexo: null = sumiu; senão rosto/cor do reflexo */
  mirror: { gone: boolean; color: string | null; mouth: 0 | 1 | 2 };
}

export interface NightPlan {
  night: number;
  cfg: RNight;
  /** lista de convidados da noite (ícones) */
  list: Guest[];
  stamp: number;
  date: number;
  visitors: VisitorPlan[];
}

function shiftHue(hex: string, dh: number, dl = 0): string {
  const c = hexToHsl(hex);
  return hslToHex((c[0] + dh + 1) % 1, c[1], Math.max(0.15, Math.min(0.85, c[2] + dl)));
}
function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** monta a noite inteira */
export function planNight(night: number, seed: number): NightPlan {
  const rng = new Rng(seed ^ 0x7ec3);
  const cfg = rNight(night);
  const pool = rng.shuffle(GUESTS.slice());
  const listN = Math.min(pool.length - 2, cfg.visitors);
  const list = pool.slice(0, listN);
  const outsiders = pool.slice(listN);
  const stamp = rng.int(STAMPS.length);
  const date = (night - 1) % DATES.length;
  // ordem: 1º normal, nunca 3 impostores seguidos
  let order: boolean[] = [];
  for (let tries = 0; tries < 50; tries++) {
    order = rng.shuffle([...Array(cfg.impostors).fill(true), ...Array(cfg.visitors - cfg.impostors).fill(false)]);
    if (order[0]) continue;
    let run = 0,
      ok = true;
    for (const x of order) {
      run = x ? run + 1 : 0;
      if (run >= 3) ok = false;
    }
    if (ok) break;
  }
  if (order[0]) {
    const j = order.indexOf(false);
    [order[0], order[j]] = [order[j], order[0]];
  }
  const avail = (Object.keys(TELL_NIGHT) as Tell[]).filter((t) => TELL_NIGHT[t] <= night);
  // pistas da noite: prioriza as novas daquela noite; sem repetir até gastar
  let bag: Tell[] = [];
  const fresh = avail.filter((t) => TELL_NIGHT[t] === night);
  const refill = () => {
    let b = avail.slice();
    if (night >= 5) b = b.filter((t) => !OBVIOUS.includes(t));
    bag = rng.shuffle(b);
  };
  refill();
  const drawTell = (exclude: Tell[], seenGuests: number): Tell => {
    for (let k = 0; k < 40; k++) {
      if (!bag.length) refill();
      let t: Tell;
      const fi = fresh.findIndex((f) => !exclude.includes(f) && bag.includes(f));
      if (fi >= 0 && rng.next() < 0.6) {
        t = fresh[fi];
        bag.splice(bag.indexOf(t), 1);
      } else t = bag.pop()!;
      if (exclude.includes(t)) continue;
      if (t === 'twice' && seenGuests === 0) continue;
      return t;
    }
    return 'eyes';
  };
  const visitors: VisitorPlan[] = [];
  const seen: Guest[] = [];
  const listOrder = rng.shuffle(list.slice());
  let doubles = cfg.doubleTells;
  order.forEach((imp, idx) => {
    let guest = listOrder[idx % listOrder.length];
    const look: Look = { ...guest.look };
    const beh: Behave = { ...BEHAVE_OK };
    const card: Card = { icon: guest.icon, look: { ...guest.look }, stamp, date, uvMark: true };
    const tells: Tell[] = [];
    let answer = guest.icon;
    let glitch = false;
    const mirror: VisitorPlan['mirror'] = { gone: false, color: null, mouth: 0 };
    if (imp) {
      const n = doubles-- > 0 ? 2 : 1;
      for (let k = 0; k < n; k++) tells.push(drawTell(tells.concat(tells.includes('notList') || tells.includes('twice') ? ['notList', 'twice'] : []), seen.length));
      // identidade primeiro (troca quem é), depois as mudanças em cima dela
      tells.sort((a, b) => Number(b === 'notList' || b === 'twice') - Number(a === 'notList' || a === 'twice'));
      for (const tl of tells) {
        switch (tl) {
          case 'eyes':
            look.eyes = guest.look.eyes === 2 ? (rng.next() < 0.5 ? 3 : 1) : 2;
            break;
          case 'teeth':
            look.mouth = 2;
            break;
          case 'smallTeeth':
            look.mouth = 1;
            break;
          case 'color':
            look.color = shiftHue(guest.look.color, 0.33 + rng.next() * 0.3, 0);
            break;
          case 'tint':
            look.color = shiftHue(guest.look.color, (rng.next() < 0.5 ? -1 : 1) * 0.09, -0.08);
            break;
          case 'noAcc':
            if (look.hat !== 'none') look.hat = 'none';
            else if (look.glasses) look.glasses = false;
            else if (look.scarf) look.scarf = null;
            else look.bag = null;
            break;
          case 'notList': {
            const o = outsiders[rng.int(outsiders.length)];
            guest = o;
            Object.assign(look, o.look);
            card.icon = o.icon;
            card.look = { ...o.look };
            answer = o.icon;
            break;
          }
          case 'twice': {
            const o = seen[rng.int(seen.length)];
            guest = o;
            Object.assign(look, o.look);
            card.icon = o.icon;
            card.look = { ...o.look };
            answer = o.icon;
            break;
          }
          case 'shadow':
            beh.shadow = false;
            break;
          case 'spin':
            beh.headSpin = true;
            break;
          case 'still':
            beh.still = true;
            break;
          case 'blink':
            beh.blinkAsync = true;
            break;
          case 'answer': {
            const others = GUESTS.filter((g) => g.icon !== guest.icon);
            answer = others[rng.int(others.length)].icon;
            break;
          }
          case 'glitch':
            glitch = true;
            break;
          case 'mirror':
            if (rng.next() < 0.5) mirror.gone = true;
            else mirror.mouth = 2;
            break;
          case 'uv':
            beh.uvMark = true;
            card.uvMark = rng.next() < 0.5;
            break;
          case 'stamp':
            card.stamp = (stamp + 1 + rng.int(STAMPS.length - 1)) % STAMPS.length;
            break;
          case 'date':
            card.date = (date + 2 + rng.int(DATES.length - 3)) % DATES.length;
            break;
        }
      }
    } else seen.push(guest);
    visitors.push({ idx, guest, look, beh, card, impostor: imp, tells, answer, glitch, mirror });
  });
  return { night, cfg, list, stamp, date, visitors };
}

/** estrelas: ★ sobreviveu, ★ nenhum impostor entrou, ★ nenhum hóspede de verdade barrado */
export interface RResult {
  night: number;
  survived: boolean;
  correct: number;
  total: number;
  letIn: number;
  complaints: number;
  sec: number;
}
export function rStars(r: RResult): number {
  if (!r.survived) return 0;
  return 1 + (r.letIn === 0 ? 1 : 0) + (r.complaints === 0 ? 1 : 0);
}
export function rCoins(r: RResult): number {
  return (r.survived ? 10 + r.night * 5 : 3) + r.correct * 3;
}
