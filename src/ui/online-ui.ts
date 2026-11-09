/**
 * Telas online: Correio (presentes), Resgatar código + Desafios e perfil.
 * claimGifts()/redeemCode() JÁ aplicam a recompensa — aqui só mostramos.
 */
import { claimGifts, fetchChallenges, getInbox, getPlayer, onlineReachable, redeemCode, syncNow, type Gift, type RedeemResult } from '../services/online';
import { normalizeCode } from '../../shared/reward';
import { applyNick, checkNick, nickIssueText } from '../services/profile';
import { bus } from '../core/events';
import { celebrate, mergePacks, packChips } from './celebrate';
import { $, esc } from './dom';
import { icon, type IconName } from './icons';
import { t } from '../i18n';

const ERR: Record<NonNullable<RedeemResult['error']>, string> = {
  get invalid() { return t('redeem.err.invalid', 'Código inválido. Confira as letras e tente de novo.'); },
  get expired() { return t('redeem.err.expired', 'Esse código expirou. Fique de olho nos próximos desafios!'); },
  get used() { return t('redeem.err.used', 'Você já resgatou esse código.'); },
  get limit() { return t('redeem.err.limit', 'Esse código já atingiu o limite de resgates.'); },
  get network() { return t('redeem.err.network', 'Sem conexão. Verifique a internet e tente de novo.'); },
};

function emptyState(ico: IconName, title: string, sub: string, plateColor = 'violet'): string {
  return `<div class="empty"><div class="plate round plate-${plateColor}">${icon(ico)}</div><b>${esc(title)}</b><small>${esc(sub)}</small></div>`;
}

function timeLeft(ts: number | null, ends = false): string {
  if (!ts) return '';
  const ms = ts - Date.now();
  if (ms <= 0) return t('time.expired', 'expirado');
  const h = Math.floor(ms / 3600000);
  if (h >= 48) return ends ? t('time.endsDays', 'termina em {n} dias', { n: Math.floor(h / 24) }) : t('time.expDays', 'expira em {n} dias', { n: Math.floor(h / 24) });
  if (h >= 1) return ends ? t('time.endsH', 'termina em {n} h', { n: h }) : t('time.expH', 'expira em {n} h', { n: h });
  const m = Math.max(1, Math.floor(ms / 60000));
  return ends ? t('time.endsMin', 'termina em {n} min', { n: m }) : t('time.expMin', 'expira em {n} min', { n: m });
}

export class OnlineUI {
  private toast: (m: string, i?: IconName) => void;
  private busy = false;

  constructor(toast: (m: string, i?: IconName) => void) {
    this.toast = toast;
  }

  /* ---------------- correio ---------------- */

  /** Renderiza com o que já tem e atualiza do servidor em segundo plano. */
  openInbox(): void {
    this.renderInbox(getInbox(), onlineReachable() === null);
    syncNow().then((list) => {
      if ($('#inbox').classList.contains('on')) this.renderInbox(list, false);
    });
  }

  renderInbox(list: Gift[], loading: boolean): void {
    const box = $('#inbox-list');
    const btn = $<HTMLButtonElement>('#btn-claim-all');
    box.innerHTML = '';
    btn.classList.toggle('hidden', !list.length);
    btn.disabled = this.busy;
    if (!list.length) {
      if (loading) box.innerHTML = `<div class="loading"><i></i><i></i><i></i></div>`;
      else if (onlineReachable() === false) box.innerHTML = emptyState('cloud-off', t('net.offline', 'Sem conexão'), t('inbox.offlineSub', 'Conecte-se à internet para receber presentes.'), 'violet');
      else box.innerHTML = emptyState('mail', t('inbox.empty', 'Nenhum presente por enquanto'), t('inbox.emptySub', 'Fique de olho: mandamos presentes em eventos e datas especiais!'), 'pink');
      return;
    }
    for (const g of list) {
      const row = document.createElement('div');
      row.className = 'gift';
      const exp = timeLeft(g.expiresAt);
      row.innerHTML = `<div class="plate plate-gold gift-ico">${icon('gift')}</div>
        <div class="g-info"><div class="g-title">${esc(g.title || t('inbox.gift', 'Presente'))}</div>
        ${g.message ? `<div class="g-msg">${esc(g.message)}</div>` : ''}
        ${exp ? `<div class="g-exp">${icon('clock')} ${exp}</div>` : ''}</div>`;
      $('.g-info', row).appendChild(packChips(g.reward));
      box.appendChild(row);
    }
    btn.innerHTML = `${icon('gift')} ${t('inbox.claimAllN', 'Pegar tudo ({n})', { n: list.length })}`;
  }

  async claimAll(): Promise<void> {
    const list = getInbox();
    if (!list.length || this.busy) return;
    this.busy = true;
    const btn = $<HTMLButtonElement>('#btn-claim-all');
    btn.disabled = true;
    btn.innerHTML = t('inbox.claiming', 'Pegando...');
    const rewards = await claimGifts(list.map((g) => g.id));
    this.busy = false;
    this.renderInbox(getInbox(), false);
    if (!rewards.length) {
      this.toast(onlineReachable() === false ? t('net.offlineRetry', 'Sem conexão. Tente de novo.') : t('inbox.claimFail', 'Não foi possível pegar agora'), 'cloud-off');
      return;
    }
    const titled = rewards.length === 1 ? rewards[0].title || list[0]?.title : undefined;
    await celebrate(mergePacks(rewards), { title: t('inbox.giftsTitle', 'PRESENTES!'), subtitle: titled || t('inbox.giftsN', '{n} presentes recebidos', { n: rewards.length }) });
  }

  /* ---------------- código ---------------- */

  openRedeem(): void {
    const inp = $<HTMLInputElement>('#code-input');
    $('#code-msg').textContent = '';
    $('#code-msg').className = 'code-msg';
    inp.value = '';
    this.loadChallenges();
  }

  async redeem(): Promise<void> {
    const inp = $<HTMLInputElement>('#code-input');
    const msg = $('#code-msg');
    const code = normalizeCode(inp.value);
    if (code.length < 3) {
      msg.className = 'code-msg err';
      msg.textContent = t('redeem.short', 'Digite o código completo.');
      inp.focus();
      return;
    }
    if (this.busy) return;
    this.busy = true;
    const btn = $<HTMLButtonElement>('#btn-redeem');
    btn.disabled = true;
    btn.textContent = t('redeem.checking', 'Verificando...');
    msg.className = 'code-msg';
    msg.textContent = '';
    const r = await redeemCode(code);
    this.busy = false;
    btn.disabled = false;
    btn.innerHTML = `${icon('check')} ${t('redeem.btn', 'Resgatar')}`;
    if (r.ok) {
      inp.value = '';
      msg.className = 'code-msg ok';
      msg.textContent = t('redeem.ok', 'Código resgatado!');
      const pack = r.reward ?? {};
      await celebrate(pack, { title: t('redeem.okTitle', 'CÓDIGO RESGATADO!'), subtitle: pack.title || pack.message || t('redeem.okSub', 'Aproveite seus prêmios!') });
    } else {
      msg.className = 'code-msg err';
      msg.innerHTML = `${icon(r.error === 'network' ? 'cloud-off' : 'warning')} ${esc(ERR[r.error ?? 'invalid'])}`;
      const box = $('#redeem .code-box');
      box.classList.remove('shake');
      void box.offsetWidth;
      box.classList.add('shake');
    }
  }

  private async loadChallenges(): Promise<void> {
    const box = $('#challenge-list');
    box.innerHTML = `<div class="loading"><i></i><i></i><i></i></div>`;
    const list = await fetchChallenges();
    if (!$('#redeem').classList.contains('on')) return;
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML =
        onlineReachable() === false
          ? emptyState('cloud-off', t('net.offline', 'Sem conexão'), t('redeem.offlineSub', 'Conecte-se para ver os desafios ativos.'))
          : emptyState('target', t('redeem.none', 'Nenhum desafio agora'), t('redeem.noneSub', 'Siga a TEAM Ross: novos desafios com códigos aparecem aqui.'), 'cyan');
      return;
    }
    for (const c of list) {
      const row = document.createElement('div');
      row.className = 'challenge';
      const ends = c.endsAt ? timeLeft(c.endsAt, true) : '';
      row.innerHTML = `<div class="plate plate-cyan ch-ico">${icon('target')}</div>
        <div class="g-info"><div class="g-title">${esc(c.title)}</div>
        <div class="g-msg">${esc(c.description)}</div>
        ${ends ? `<div class="g-exp">${icon('clock')} ${ends}</div>` : ''}</div>`;
      const info = $('.g-info', row);
      info.insertAdjacentHTML('beforeend', `<div class="g-prize">${t('redeem.prize', 'Prêmio:')}</div>`);
      info.appendChild(packChips(c.reward));
      if (c.link && /^https?:\/\//i.test(c.link)) {
        const a = document.createElement('button');
        a.className = 'btn btn-gem ch-go';
        a.innerHTML = `${icon('link')} ${t('redeem.see', 'Ver desafio')}`;
        a.onclick = () => window.open(c.link, '_blank', 'noopener');
        info.appendChild(a);
      }
      box.appendChild(row);
    }
  }

  /* ---------------- perfil ---------------- */

  renderProfile(): void {
    const p = getPlayer();
    const inp = $<HTMLInputElement>('#profile-name');
    if (document.activeElement !== inp) inp.value = p?.name ?? '';
    inp.placeholder = t('settings.nick', 'Seu apelido');
    $('#profile-id').textContent = p ? `ID ${p.id.replace(/-/g, '').slice(0, 8).toUpperCase()}` : 'ID —';
    const st = onlineReachable();
    const el = $('#profile-status');
    el.className = `net ${st === false ? 'off' : st ? 'on' : ''}`;
    el.textContent = st === false ? t('net.offline', 'Sem conexão') : st ? t('net.online', 'Online') : t('net.connecting', 'Conectando...');
  }

  saveName(): void {
    const inp = $<HTMLInputElement>('#profile-name');
    const v = inp.value.trim();
    if (!v || v === getPlayer()?.name) return;
    const bad = checkNick(v); // mesmas regras do chat (offline)
    if (bad) {
      this.toast(nickIssueText(bad), 'warning');
      inp.value = getPlayer()?.name ?? '';
      return;
    }
    applyNick(v);
    this.toast(t('settings.nickSaved', 'Apelido salvo!'), 'pencil');
    this.renderProfile();
  }
}

/** Liga ouvintes globais (badge do correio etc.). */
export function bindOnlineBadges(update: (n: number) => void): void {
  bus.on('inbox', (list: Gift[]) => update(list.length));
}
