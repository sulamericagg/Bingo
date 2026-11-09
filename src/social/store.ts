/**
 * Estado local do social (chave própria no localStorage, separada do save principal):
 * preferências do chat, idade, silenciados/bloqueados, amigos, Fichas de Campeonato.
 *
 * FICHAS DE CAMPEONATO: moeda NÃO comprável, ganha jogando (1 por dia ao entrar, missões,
 * passe). Use addFichas(n) de outros módulos (missões/passe). Nunca vender por dinheiro/gemas.
 */
import { bus } from '../core/events';
import { dayNumber } from '../core/storage';

const KEY = 'bloop-social-v1';
export const FICHAS_MAX = 20;

export interface Friend {
  id: string;
  name: string;
  skin: string;
}

export interface SocialState {
  /** chat ligado (padrão: sim para 13+) */
  chatOn: boolean;
  /** "Modo seguro": só atalhos rápidos (obrigatório para menores de 13) */
  safeMode: boolean;
  /** null = ainda não perguntou */
  ageGroup: 'under13' | 'teen' | null;
  muted: string[];
  blocked: string[];
  friends: Friend[];
  fichas: number;
  fichasDay: number;
  /** foto do perfil: criatura escolhida (id) — vazio = personagem */
  photoCreature: string;
  badges: string[];
  lastProfilePush: number;
  /** melhores pontuações por jogo (preenchido pelo 'run-end') */
  bests: Record<string, number>;
  champWins: number;
}

const defaults = (): SocialState => ({
  chatOn: true,
  safeMode: false,
  ageGroup: null,
  muted: [],
  blocked: [],
  friends: [],
  fichas: 1,
  fichasDay: 0,
  photoCreature: '',
  badges: [],
  lastProfilePush: 0,
  bests: {},
  champWins: 0,
});

function load(): SocialState {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (o && typeof o === 'object') return { ...defaults(), ...o };
  } catch {
    /* */
  }
  return defaults();
}

export const social: SocialState = load();

export function persistSocial(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(social));
  } catch {
    /* */
  }
  bus.emit('social');
}

/** Pode digitar texto livre? (não: chat desligado, modo seguro ou menor de 13) */
export const canTypeFree = (): boolean => social.chatOn && !social.safeMode && social.ageGroup === 'teen';

export function setAgeGroup(g: 'under13' | 'teen'): void {
  social.ageGroup = g;
  if (g === 'under13') social.safeMode = true;
  persistSocial();
}

export const getFichas = (): number => social.fichas;
export function addFichas(n: number): void {
  social.fichas = Math.max(0, Math.min(FICHAS_MAX, social.fichas + Math.round(n)));
  persistSocial();
  bus.emit('fichas', social.fichas);
}
/** +1 ficha por dia ao abrir o jogo. Devolve true se ganhou agora. */
export function dailyFicha(): boolean {
  const d = dayNumber();
  if (social.fichasDay === d) return false;
  social.fichasDay = d;
  addFichas(1);
  return true;
}

export const isHidden = (pid: string): boolean => social.muted.includes(pid) || social.blocked.includes(pid);
export function toggleList(list: 'muted' | 'blocked', pid: string, on: boolean): void {
  const arr = social[list];
  const i = arr.indexOf(pid);
  if (on && i < 0) arr.push(pid);
  if (!on && i >= 0) arr.splice(i, 1);
  persistSocial();
}
export const isFriend = (pid: string): boolean => social.friends.some((f) => f.id === pid);
export function setFriend(f: Friend, on: boolean): void {
  social.friends = social.friends.filter((x) => x.id !== f.id);
  if (on) social.friends.unshift(f);
  persistSocial();
}
export function addBadge(id: string): void {
  if (!social.badges.includes(id)) social.badges.push(id);
  persistSocial();
}
