/**
 * PERFIL — cartão com foto (criatura escolhida, se o módulo de criaturas existir; senão o
 * personagem), nome, nível, recordes por jogo e insígnias. Abre o próprio perfil ou o de
 * outro jogador (chat/ranking): openProfile(id, { name, skin }).
 *
 * Integrações opcionais (outros módulos):
 *   setProfileLevelProvider(() => nivelDoPasse)     — nível exibido
 *   setProfileCreature('s03-rare')                  — foto = criatura (bichinho)
 *   addBadge('champ') (de ./store)                  — insígnias
 * Recordes por jogo vêm do bus 'run-end' (registrado em register.ts).
 */
import { bus } from '../core/events';
import { save } from '../core/storage';
import { listGames } from '../hub/registry';
import { fmt, t } from '../i18n';
import { icon, type IconName } from '../ui/icons';
import { displayName } from '../services/leaderboard';
import { getPlayer } from '../services/online';
import { api } from './net';
import { isFriend, persistSocial, setFriend, social, toggleList } from './store';
import { openSheet, skinThumb, toast } from './sheet';

export interface ProfileData {
  id: string;
  name: string;
  skin: string;
  avatar?: unknown;
  creature?: string;
  level: number;
  bests: Record<string, number>;
  badges: string[];
}

let levelProvider: () => number = () => 1 + Math.floor(Math.sqrt((save.runs || 0) / 3));
export function setProfileLevelProvider(fn: () => number): void {
  levelProvider = fn;
}
export function setProfileCreature(id: string): void {
  social.photoCreature = id;
  persistSocial();
}

const BADGES: Record<string, { label: () => string; icon: IconName }> = {
  champ: { label: () => t('badge.champ', 'Campeão'), icon: 'trophy' },
  finalist: { label: () => t('badge.finalist', 'Finalista'), icon: 'crown' },
  pioneer: { label: () => t('badge.pioneer', 'Pioneiro'), icon: 'rocket' },
  friendly: { label: () => t('badge.friendly', 'Amigável'), icon: 'heart' },
  collector: { label: () => t('badge.collector', 'Colecionador'), icon: 'gem-pile' },
};

export function myProfile(): ProfileData {
  const bests: Record<string, number> = { ...social.bests };
  bests.orbit = Math.max(bests.orbit ?? 0, save.best || 0);
  const badges = [...social.badges];
  if (save.firstSeen && save.firstSeen < Date.UTC(2027, 0, 1) && !badges.includes('pioneer')) badges.push('pioneer');
  return {
    id: getPlayer()?.id ?? '',
    name: displayName(),
    skin: save.skin,
    ...(save.skin === 'custom' ? { avatar: save.avatar } : {}),
    ...(social.photoCreature ? { creature: social.photoCreature } : {}),
    level: Math.max(1, Math.floor(levelProvider())),
    bests,
    badges,
  };
}

/** Envia o perfil público (no máx. a cada 30 min; o servidor também limita). */
export async function pushProfile(force = false): Promise<void> {
  if (!force && Date.now() - social.lastProfilePush < 30 * 60_000) return;
  const p = myProfile();
  if (!p.id) return;
  try {
    await api('/profile', p);
    social.lastProfilePush = Date.now();
    persistSocial();
  } catch {
    /* offline */
  }
}

/* criaturas: carregadas só se o módulo existir no build (import.meta.glob não falha se faltar) */
const creatureMods = import.meta.glob('../creatures/render.ts');
async function creaturePhoto(id: string, size: number): Promise<HTMLElement | null> {
  const loader = Object.values(creatureMods)[0];
  if (!loader || !id) return null;
  try {
    const mod = (await loader()) as { renderCreatureIcon?: (id: string, size: number) => HTMLElement };
    return mod.renderCreatureIcon ? mod.renderCreatureIcon(id, size) : null;
  } catch {
    return null;
  }
}

function gameName(id: string): string {
  const g = listGames().find((x) => x.id === id);
  if (g) return g.name;
  const n: Record<string, string> = { orbit: 'Bloop Orbit', tubo: t('game.tubo', 'Tubo'), rally: t('game.rally', 'Rally'), tycoon: t('game.tycoon', 'Tycoon') };
  return n[id] ?? id;
}

function render(s: ReturnType<typeof openSheet>, p: ProfileData, own: boolean): void {
  const bests = Object.entries(p.bests).filter(([, v]) => v > 0);
  s.body.innerHTML = `<div class="sc-profile">
    <div class="sc-photo"></div>
    <div class="sc-pname"></div>
    <div class="sc-level">${icon('star', { size: 18 })}${t('profile.level', 'Nível {n}', { n: p.level })}</div>
    <div class="sc-stats">${
      bests.length
        ? bests.map(([g, v]) => `<div class="sc-stat"><b>${fmt(v)}</b><span>${escapeHtml(gameName(g))}</span></div>`).join('')
        : `<div class="sc-stat" style="grid-column:1/-1"><span>${t('profile.nobests', 'Ainda sem recordes')}</span></div>`
    }</div>
    <div class="sc-badges">${p.badges
      .filter((b) => BADGES[b])
      .map((b) => `<span class="sc-badge">${icon(BADGES[b].icon, { size: 20 })}${BADGES[b].label()}</span>`)
      .join('')}</div>
    <div class="sc-actions"></div></div>`;
  (s.body.querySelector('.sc-pname') as HTMLElement).textContent = p.name;
  const photo = s.body.querySelector('.sc-photo') as HTMLElement;
  photo.appendChild(skinThumb(p.skin, 120, p.avatar));
  if (p.creature)
    creaturePhoto(p.creature, 120).then((el) => {
      if (el) photo.replaceChildren(el);
    });
  const acts = s.body.querySelector('.sc-actions') as HTMLElement;
  if (own) {
    const note = document.createElement('p');
    note.className = 'sc-note';
    note.textContent = t('profile.ownnote', 'Este é o seu cartão. Outros jogadores veem isso quando tocam no seu nome.');
    acts.appendChild(note);
    return;
  }
  const friend = document.createElement('button');
  const setF = () => {
    const on = isFriend(p.id);
    friend.className = 'sc-btn sm ' + (on ? 'ghost' : 'green');
    friend.innerHTML = icon(on ? 'check' : 'heart', { size: 18 }) + (on ? t('profile.friend', 'Amigo') : t('profile.addfriend', 'Adicionar amigo'));
  };
  setF();
  friend.onclick = () => {
    setFriend({ id: p.id, name: p.name, skin: p.skin }, !isFriend(p.id));
    setF();
  };
  const block = document.createElement('button');
  const setB = () => {
    const on = social.blocked.includes(p.id);
    block.className = 'sc-btn sm ghost';
    block.innerHTML = icon(on ? 'refresh' : 'lock', { size: 18 }) + (on ? t('profile.unblock', 'Desbloquear') : t('profile.block', 'Bloquear'));
  };
  setB();
  block.onclick = () => {
    const on = !social.blocked.includes(p.id);
    toggleList('blocked', p.id, on);
    if (on) setFriend({ id: p.id, name: p.name, skin: p.skin }, false);
    setB();
    setF();
    toast(on ? t('profile.blocked', 'Jogador bloqueado. Você não verá mais as mensagens dele.') : t('profile.unblocked', 'Jogador desbloqueado.'), on ? 'lock' : 'check');
  };
  acts.append(friend, block);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Abre o cartão de perfil. Sem id (ou o próprio id) → o seu. */
export function openProfile(id?: string, fallback?: { name: string; skin: string }): void {
  const mine = getPlayer()?.id ?? '';
  const own = !id || id === mine;
  const s = openSheet(own ? t('profile.mine', 'Meu perfil') : t('profile.title', 'Perfil'), 'user', { small: true, id: 'sc-profile' });
  if (own) {
    render(s, myProfile(), true);
    pushProfile();
    return;
  }
  const base: ProfileData = { id: id!, name: fallback?.name ?? 'Bloop', skin: fallback?.skin ?? 'bloop', level: 1, bests: {}, badges: [] };
  render(s, base, false);
  api<ProfileData>('/profile?id=' + encodeURIComponent(id!))
    .then((p) => {
      if (document.body.contains(s.root)) render(s, { ...base, ...p }, false);
    })
    .catch(() => {});
}

bus.on('social-open-profile', (id?: string, fb?: { name: string; skin: string }) => openProfile(id, fb));
