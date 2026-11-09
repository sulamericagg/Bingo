/* ============================================================
 *  CASA DO BLOOP — lembretes locais (Android).
 *  - ao pausar o app: agenda até 2 lembretes/dia previstos pelo desgaste
 *    ("Estou com fome!", banho, brincar) + "Saudade de você!" após ~24h
 *  - horário silencioso 21h–9h (lembrete cai para as 9h)
 *  - ao voltar: cancela tudo
 *  - na web: não faz nada
 *  Ícone pequeno no Android: res/drawable/ic_stat_bloop (ver relatório).
 * ============================================================ */
import { isNative } from '../core/platform';
import { persist, save } from '../core/storage';
import { t } from '../i18n';
import { LOW, QUIET_END, QUIET_START, predictCross, tick } from './state';

const IDS = [7101, 7102, 7103, 7104];
const CHANNEL = 'pet';

type LN = typeof import('@capacitor/local-notifications').LocalNotifications;
let ln: LN | null = null;
async function plugin(): Promise<LN | null> {
  if (!isNative) return null;
  if (!ln) {
    try {
      ln = (await import('@capacitor/local-notifications')).LocalNotifications;
      await ln.createChannel({ id: CHANNEL, name: t('pet.notif.channel', 'Bichinho'), description: t('pet.notif.channelDesc', 'Lembretes do seu bichinho'), importance: 3 }).catch(() => {});
    } catch {
      ln = null;
    }
  }
  return ln;
}

/** Pede permissão (depois de explicar na tela). Retorna se ficou permitido. */
export async function requestNotifPermission(): Promise<boolean> {
  save.pet.notifAsked = true;
  persist();
  const p = await plugin();
  if (!p) return false;
  try {
    const r = await p.requestPermissions();
    save.pet.notifOn = r.display === 'granted';
  } catch {
    save.pet.notifOn = false;
  }
  persist();
  return save.pet.notifOn;
}

/** Move um horário para fora do horário silencioso (21h–9h → 9h). */
export function outOfQuiet(at: number): number {
  const d = new Date(at);
  const h = d.getHours();
  if (h >= QUIET_START) {
    d.setDate(d.getDate() + 1);
    d.setHours(QUIET_END, 5 + (at % 20), 0, 0);
  } else if (h < QUIET_END) d.setHours(QUIET_END, 5 + (at % 20), 0, 0);
  return d.getTime();
}

const dayKey = (ms: number): number => {
  const d = new Date(ms);
  return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
};

export interface PlannedNotif {
  id: number;
  at: number;
  title: string;
  body: string;
}

/** Calcula os lembretes (puro; exportado para testes/depuração). */
export function planNotifications(now = Date.now()): PlannedNotif[] {
  tick(now);
  const name = t('pet.notif.title', 'Seu Bloop');
  const cands: { at: number; body: string }[] = [];
  const minGap = 45 * 60000;
  const hungry = predictCross('food', LOW, now);
  if (hungry < Infinity) cands.push({ at: now + Math.max(minGap, hungry), body: t('pet.notif.hungry', 'Estou com fome! Vem me dar um lanchinho?') });
  const dirty = predictCross('clean', LOW, now);
  if (dirty < Infinity) cands.push({ at: now + Math.max(minGap, dirty), body: t('pet.notif.dirty', 'Tô sujinho, me dá um banho?') });
  const bored = predictCross('fun', LOW, now);
  if (bored < Infinity) cands.push({ at: now + Math.max(minGap, bored), body: t('pet.notif.fun', 'Vem brincar comigo!') });
  cands.push({ at: now + 24 * 3600000, body: t('pet.notif.miss', 'Saudade de você! Volta logo?') });

  for (const c of cands) c.at = outOfQuiet(c.at);
  cands.sort((a, b) => a.at - b.at);
  // máximo 2 por dia e pelo menos 3h entre eles
  const perDay = new Map<number, number>();
  const out: PlannedNotif[] = [];
  let lastAt = 0;
  for (const c of cands) {
    const k = dayKey(c.at);
    const n = perDay.get(k) ?? 0;
    if (n >= 2) continue;
    if (lastAt && c.at - lastAt < 3 * 3600000) continue;
    perDay.set(k, n + 1);
    lastAt = c.at;
    out.push({ id: IDS[out.length], at: c.at, title: name, body: c.body });
    if (out.length >= IDS.length) break;
  }
  return out;
}

/** Ao pausar o app. */
export async function scheduleReminders(): Promise<void> {
  const p = await plugin();
  if (!p || !save.pet.notifOn) return;
  try {
    await p.cancel({ notifications: IDS.map((id) => ({ id })) });
    const list = planNotifications();
    if (!list.length) return;
    await p.schedule({
      notifications: list.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        channelId: CHANNEL,
        smallIcon: 'ic_stat_bloop',
        iconColor: '#8a5cff',
        schedule: { at: new Date(n.at), allowWhileIdle: true },
        extra: { route: 'pet' },
      })),
    });
  } catch {
    /* sem permissão ou plugin indisponível */
  }
}

/** Ao voltar para o app. */
export async function cancelReminders(): Promise<void> {
  const p = await plugin();
  if (!p) return;
  try {
    await p.cancel({ notifications: IDS.map((id) => ({ id })) });
    // o usuário pode ter mudado a permissão nas configurações
    if (save.pet.notifAsked) {
      const st = await p.checkPermissions();
      save.pet.notifOn = st.display === 'granted';
      persist();
    }
  } catch {
    /* */
  }
}

/** Toque na notificação → abre a Casa do Bloop. */
export async function onNotifTap(cb: () => void): Promise<void> {
  const p = await plugin();
  if (!p) return;
  try {
    await p.addListener('localNotificationActionPerformed', (a) => {
      if (a.notification?.extra?.route === 'pet') cb();
    });
  } catch {
    /* */
  }
}
