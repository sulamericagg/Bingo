/**
 * Telas online: Correio (presentes), Resgatar código + Desafios e perfil.
 * claimGifts()/redeemCode() JÁ aplicam a recompensa — aqui só mostramos.
 */
import { claimGifts, fetchChallenges, getInbox, getPlayer, onlineReachable, redeemCode, setPlayerName, syncNow, type Gift, type RedeemResult } from '../services/online';
import { normalizeCode } from '../../shared/reward';
import { bus } from '../core/events';
import { celebrate, mergePacks, packChips } from './celebrate';
import { $, esc } from './dom';
import { icon, type IconName } from './icons';

const ERR: Record<NonNullable<RedeemResult['error']>, string> = {
  invalid: 'Código inválido. Confira as letras e tente de novo.',
  expired: 'Esse código expirou. Fique de olho nos próximos desafios!',
  used: 'Você já resgatou esse código.',
  limit: 'Esse código já atingiu o limite de resgates.',
  network: 'Sem conexão. Verifique a internet e tente de novo.',
};

function emptyState(ico: IconName, title: string, sub: string, plateColor = 'violet'): string {
  return `<div class="empty"><div class="plate round plate-${plateColor}">${icon(ico)}</div><b>${esc(title)}</b><small>${esc(sub)}</small></div>`;
}

function timeLeft(ts: number | null): string {
  if (!ts) return '';
  const ms = ts - Date.now();
  if (ms <= 0) return 'expirado';
  const h = Math.floor(ms / 3600000);
  if (h >= 48) return `expira em ${Math.floor(h / 24)} dias`;
  if (h >= 1) return `expira em ${h} h`;
  return `expira em ${Math.max(1, Math.floor(ms / 60000))} min`;
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
      else if (onlineReachable() === false) box.innerHTML = emptyState('cloud-off', 'Sem conexão', 'Conecte-se à internet para receber presentes.', 'violet');
      else box.innerHTML = emptyState('mail', 'Nenhum presente por enquanto', 'Fique de olho: mandamos presentes em eventos e datas especiais!', 'pink');
      return;
    }
    for (const g of list) {
      const row = document.createElement('div');
      row.className = 'gift';
      const exp = timeLeft(g.expiresAt);
      row.innerHTML = `<div class="plate plate-gold gift-ico">${icon('gift')}</div>
        <div class="g-info"><div class="g-title">${esc(g.title || 'Presente')}</div>
        ${g.message ? `<div class="g-msg">${esc(g.message)}</div>` : ''}
        ${exp ? `<div class="g-exp">${icon('clock')} ${exp}</div>` : ''}</div>`;
      $('.g-info', row).appendChild(packChips(g.reward));
      box.appendChild(row);
    }
    btn.innerHTML = `${icon('gift')} Pegar tudo (${list.length})`;
  }

  async claimAll(): Promise<void> {
    const list = getInbox();
    if (!list.length || this.busy) return;
    this.busy = true;
    const btn = $<HTMLButtonElement>('#btn-claim-all');
    btn.disabled = true;
    btn.innerHTML = 'Pegando...';
    const rewards = await claimGifts(list.map((g) => g.id));
    this.busy = false;
    this.renderInbox(getInbox(), false);
    if (!rewards.length) {
      this.toast(onlineReachable() === false ? 'Sem conexão. Tente de novo.' : 'Não foi possível pegar agora', 'cloud-off');
      return;
    }
    const titled = rewards.length === 1 ? rewards[0].title || list[0]?.title : undefined;
    await celebrate(mergePacks(rewards), { title: 'PRESENTES!', subtitle: titled || `${rewards.length} presentes recebidos` });
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
      msg.textContent = 'Digite o código completo.';
      inp.focus();
      return;
    }
    if (this.busy) return;
    this.busy = true;
    const btn = $<HTMLButtonElement>('#btn-redeem');
    btn.disabled = true;
    btn.textContent = 'Verificando...';
    msg.className = 'code-msg';
    msg.textContent = '';
    const r = await redeemCode(code);
    this.busy = false;
    btn.disabled = false;
    btn.innerHTML = `${icon('check')} Resgatar`;
    if (r.ok) {
      inp.value = '';
      msg.className = 'code-msg ok';
      msg.textContent = 'Código resgatado!';
      const pack = r.reward ?? {};
      await celebrate(pack, { title: 'CÓDIGO RESGATADO!', subtitle: pack.title || pack.message || 'Aproveite seus prêmios!' });
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
          ? emptyState('cloud-off', 'Sem conexão', 'Conecte-se para ver os desafios ativos.')
          : emptyState('target', 'Nenhum desafio agora', 'Siga a TEAM Ross: novos desafios com códigos aparecem aqui.', 'cyan');
      return;
    }
    for (const c of list) {
      const row = document.createElement('div');
      row.className = 'challenge';
      const ends = c.endsAt ? timeLeft(c.endsAt).replace('expira', 'termina') : '';
      row.innerHTML = `<div class="plate plate-cyan ch-ico">${icon('target')}</div>
        <div class="g-info"><div class="g-title">${esc(c.title)}</div>
        <div class="g-msg">${esc(c.description)}</div>
        ${ends ? `<div class="g-exp">${icon('clock')} ${ends}</div>` : ''}</div>`;
      const info = $('.g-info', row);
      info.insertAdjacentHTML('beforeend', '<div class="g-prize">Prêmio:</div>');
      info.appendChild(packChips(c.reward));
      if (c.link && /^https?:\/\//i.test(c.link)) {
        const a = document.createElement('button');
        a.className = 'btn btn-gem ch-go';
        a.innerHTML = `${icon('link')} Ver desafio`;
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
    inp.placeholder = 'Seu apelido';
    $('#profile-id').textContent = p ? `ID ${p.id.replace(/-/g, '').slice(0, 8).toUpperCase()}` : 'ID —';
    const st = onlineReachable();
    const el = $('#profile-status');
    el.className = `net ${st === false ? 'off' : st ? 'on' : ''}`;
    el.textContent = st === false ? 'Sem conexão' : st ? 'Online' : 'Conectando...';
  }

  saveName(): void {
    const inp = $<HTMLInputElement>('#profile-name');
    const v = inp.value.trim();
    if (!v || v === getPlayer()?.name) return;
    setPlayerName(v);
    this.toast('Apelido salvo!', 'pencil');
    this.renderProfile();
  }
}

/** Liga ouvintes globais (badge do correio etc.). */
export function bindOnlineBadges(update: (n: number) => void): void {
  bus.on('inbox', (list: Gift[]) => update(list.length));
}
