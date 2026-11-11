/* ============================================================
 *  POUSO FORÇADO — "Voar com amigos": a sala.
 *  Um toque cria a sala (código de 5 letras). A tela mostra os 4
 *  lugares com chapéus, a lista de amigos online com "Chamar" e o
 *  código para mandar. Cada um toca no lugar que quer; lugar vazio
 *  vira ajudante Bloop. Quando todo mundo marca "Pronto", decola
 *  sozinho em 3 s (o anfitrião também pode decolar na hora).
 *  O ANFITRIÃO é o dono do estado da sala (lugares/pronto).
 * ============================================================ */
import { t } from '../../i18n';
import { audio } from '../../core/audio';
import { tap } from '../../core/haptics';
import { drawPlayer, type PlayerPose } from '../../game/character';
import { SKINS } from '../../game/skins';
import { icon } from '../../ui/icons';
import { notify } from '../../ui/notify';
import { api } from '../../social/net';
import { BOT_NAMES, BOT_SKINS, roleName } from './data';
import { drawBloopHat } from './hangar';
import { vIcon } from './icons';
import { CODE_OK, type FlightNet, type Me, type NetMsg } from './net';
import { speak } from './voice';
import { bloopLink, drawBloopQr, scanBloopLink } from '../../ui/scan';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface Seat {
  id: string;
  name: string;
  skin: string;
  ready: boolean;
}
export interface StartCrew {
  r: number;
  id: string;
  name: string;
  skin: string;
  bot: boolean;
}
export type RoomResult = { kind: 'start'; start: NetMsg } | { kind: 'exit' } | { kind: 'join'; code: string };

const emptySeat = (): Seat => ({ id: '', name: '', skin: '', ready: false });

/* ------------------------------ convites ------------------------------ */

export interface Invite {
  from: string;
  name: string;
  code: string;
  at: number;
}
/** consulta convites a cada ~6 s enquanto `alive()`; chama `cb` para cada convite novo */
export function pollInvites(me: () => Promise<Me | null>, cb: (inv: Invite) => void, alive: () => boolean): void {
  const seen = new Set<string>();
  const tick = async () => {
    if (!alive()) return;
    try {
      const m = await me();
      if (m) {
        const r = await api<{ invites: Invite[] }>(`/voo/invites?id=${encodeURIComponent(m.id)}`);
        for (const inv of r.invites ?? []) {
          const k = inv.from + inv.code + inv.at;
          if (seen.has(k) || !CODE_OK.test(inv.code)) continue;
          seen.add(k);
          if (alive()) cb(inv);
        }
      }
    } catch {
      /* sem rede: tenta depois */
    }
    if (alive()) setTimeout(tick, 6000);
  };
  setTimeout(tick, 600);
}

/** cartão "Fulano te chamou pra voar" (por cima de qualquer tela do jogo) */
export function inviteCard(root: HTMLElement, inv: Invite, onJoin: () => void): void {
  const d = document.createElement('div');
  d.className = 'vr-inv';
  d.innerHTML = `${vIcon('plane', 34)}<span><b>${esc(inv.name)}</b><small>${esc(t('voo.r.invited', 'te chamou pra voar!'))}</small></span><button class="vr-go">${vIcon('check', 22)}${esc(t('voo.r.join', 'Entrar'))}</button><button class="vr-x" aria-label="x">${vIcon('close', 20)}</button>`;
  root.appendChild(d);
  speak(t('voo.r.invitedV', '{n} te chamou pra voar!', { n: inv.name }), { urgent: true });
  tap('medium');
  const kill = () => d.remove();
  setTimeout(kill, 30000);
  d.querySelector('.vr-x')!.addEventListener('click', kill);
  d.querySelector('.vr-go')!.addEventListener('click', () => {
    kill();
    onJoin();
  });
}

/* ------------------------------ a sala ------------------------------ */

export interface RoomOpts {
  net: FlightNet;
  me: Me;
  /** papel preferido (o último usado) */
  role: number;
  mode: '2d' | '3d';
}
export interface RoomHandle {
  done: Promise<RoomResult>;
  back(): void;
}

export function openRoom(root: HTMLElement, o: RoomOpts): RoomHandle {
  const { net, me } = o;
  const host = net.isHost;
  let seats: Seat[] = [emptySeat(), emptySeat(), emptySeat(), emptySeat()];
  let cd = 0; // contagem regressiva (s), 0 = parada
  let cdTimer = 0;
  let closed = false;
  let resolve!: (r: RoomResult) => void;
  const done = new Promise<RoomResult>((r) => (resolve = r));
  const offs: (() => void)[] = [];
  const invited = new Set<string>();

  const el = document.createElement('div');
  el.className = 'voo-scr vr';
  el.innerHTML = `<div class="vr-in">
    <header class="vh-top"><button class="vh-icb" data-x aria-label="${esc(t('voo.hg.exit', 'Sair'))}">${vIcon('close', 30)}</button>
      <div class="vh-ttl"><b>${esc(t('voo.hg.friends', 'Voar com amigos'))}</b><small>${esc(t('voo.r.sub', 'Até 4 no mesmo avião. Lugar vazio vira ajudante.'))}</small></div></header>
    <div class="vr-code"><small>${esc(t('voo.r.code', 'CÓDIGO'))}</small><b>${net.code.split('').map((c) => `<i>${c}</i>`).join('')}</b><button class="vr-qr" data-qr aria-label="${esc(t('voo.r.qr', 'QR para escanear'))}"><canvas></canvas></button></div>
    <div class="vr-seats"></div>
    <div class="vr-friends"><div class="vh-lbl">${esc(t('voo.r.call', 'Chamar amigos'))}</div><div class="vr-flist"><div class="vr-note">${esc(t('voo.r.loading', 'Procurando amigos online…'))}</div></div></div>
    <button class="vr-scan" data-scan>${icon('camera', { size: 30 })}<span><b>${esc(t('voo.r.scan', 'Escanear'))}</b><small>${esc(t('voo.r.scanSub', 'Aponte para o QR do amigo e entre na sala dele'))}</small></span></button>
    <form class="vr-join" data-joinf><span>${vIcon('plane', 22)}${esc(t('voo.r.haveCode', 'Tem um código?'))}</span><input maxlength="5" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABC23" aria-label="${esc(t('voo.r.code', 'CÓDIGO'))}"><button class="vr-jbtn" type="submit">${esc(t('voo.r.join', 'Entrar'))}</button></form>
    <div class="vr-foot"><div class="vr-status"></div><button class="vh-fly vr-main" data-main><span class="vh-flyi">${vIcon(host ? 'plane' : 'check', 36)}</span><span class="vh-flyt"><b></b><small></small></span></button></div>
  </div>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const seatsEl = el.querySelector('.vr-seats') as HTMLElement;
  const statusEl = el.querySelector('.vr-status') as HTMLElement;
  const mainB = el.querySelector('[data-main] b') as HTMLElement;
  const mainS = el.querySelector('[data-main] small') as HTMLElement;
  if (!host) {
    (el.querySelector('.vr-join') as HTMLElement).style.display = 'none';
    (el.querySelector('.vr-scan') as HTMLElement).style.display = 'none';
  }
  // QR da sala (estilo Bloop): quem escaneia entra direto
  const link = bloopLink('voo', net.code);
  void drawBloopQr(el.querySelector('.vr-qr canvas') as HTMLCanvasElement, link, 76).catch(() => {});
  const bigQr = () => {
    const d = document.createElement('div');
    d.className = 'vr-qrbig';
    d.innerHTML = `<div class="card"><canvas></canvas><b>${net.code.split('').map((c) => `<i>${c}</i>`).join('')}</b><p>${esc(t('voo.r.qrHint', 'Seu amigo toca em Escanear e aponta a câmera aqui.'))}</p><div class="acts"><button class="vr-share" data-share>${icon('link', { size: 22 })}<span>${esc(t('voo.r.share', 'Mandar código'))}</span></button><button class="vr-jbtn" data-close>${esc(t('voo.r.ok', 'OK'))}</button></div></div>`;
    el.appendChild(d);
    void drawBloopQr(d.querySelector('canvas')!, link, Math.min(280, Math.round(Math.min(innerWidth, innerHeight) * 0.62))).catch(() => {});
    d.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.share !== undefined) return void share();
      if (e.target === d || b?.dataset.close !== undefined) d.remove();
    });
  };

  const mySeat = () => seats.findIndex((s) => s.id === me.id);
  const humans = () => seats.filter((s) => s.id).length;

  /* ---------- desenho ---------- */
  const render = () => {
    seatsEl.innerHTML = seats
      .map((s, r) => {
        const mine = s.id === me.id;
        const tag = s.id ? (mine ? t('voo.r.you', 'Você') : s.ready ? t('voo.r.ready', 'Pronto!') : t('voo.r.here', 'Na sala')) : t('voo.r.bot', 'Ajudante Bloop');
        return `<button class="vr-seat ${s.id ? 'taken' : 'free'} ${mine ? 'mine' : ''} ${s.ready ? 'ready' : ''}" data-r="${r}"><canvas width="120" height="104"></canvas><b>${esc(s.id ? s.name : roleName(r))}</b><small>${s.ready && s.id ? vIcon('check', 14) : ''}${esc(tag)}</small></button>`;
      })
      .join('');
    seatsEl.querySelectorAll<HTMLCanvasElement>('canvas').forEach((c, r) => {
      const s = seats[r];
      const x = c.getContext('2d')!;
      x.clearRect(0, 0, c.width, c.height);
      if (!s.id) x.globalAlpha = 0.45;
      drawBloopHat(x, s.id ? s.skin || 'bloop' : BOT_SKINS[r % BOT_SKINS.length], r, 60, 62, 30, 0, 0, () => render());
      x.globalAlpha = 1;
    });
    const i = mySeat();
    const ready = i >= 0 && seats[i].ready;
    const n = humans();
    if (host) {
      mainB.textContent = t('voo.r.takeoff', 'DECOLAR');
      mainS.textContent = n > 1 ? t('voo.r.nPlayers', '{n} jogadores · {b} ajudantes', { n, b: 4 - n }) : t('voo.r.aloneHint', 'Sem amigos ainda? Decola com ajudantes');
    } else {
      mainB.textContent = ready ? t('voo.r.notReady', 'ESPERA') : t('voo.r.imReady', 'PRONTO!');
      mainS.textContent = ready ? t('voo.r.waitHost', 'Esperando os outros…') : t('voo.r.tapReady', 'Toque quando estiver pronto');
    }
    el.querySelector('[data-main]')!.classList.toggle('on', ready && !host);
    statusEl.innerHTML = cd > 0 ? `${vIcon('clock', 22)}<b>${esc(t('voo.r.cd', 'Decolando em {n}…', { n: cd }))}</b>` : n < 2 ? `${vIcon('crew', 22)}${esc(t('voo.r.waiting', 'Esperando amigos… mande o código!'))}` : `${vIcon('crew', 22)}${esc(t('voo.r.readyN', '{a} de {b} prontos', { a: seats.filter((s) => s.id && (s.ready || s.id === net.hostId)).length, b: n }))}`;
  };

  /* ---------- estado (anfitrião) ---------- */
  const broadcast = () => {
    if (!host) return;
    net.send({ t: 'lobby', seats, cd });
    render();
  };
  const seatFor = (pref: number): number => {
    if (pref >= 0 && pref < 4 && !seats[pref].id) return pref;
    return seats.findIndex((s) => !s.id);
  };
  const autoStart = () => {
    if (!host || closed) return;
    const n = humans();
    const allReady = n >= 2 && seats.every((s) => !s.id || s.id === me.id || s.ready);
    if (allReady && !cd) {
      cd = 3;
      speak(t('voo.r.allReadyV', 'Todo mundo pronto! Decolando!'), { urgent: true });
      const step = () => {
        if (closed) return;
        cd--;
        if (cd <= 0) return start();
        broadcast();
        cdTimer = window.setTimeout(step, 1000);
      };
      cdTimer = window.setTimeout(step, 1000);
      broadcast();
    } else if (!allReady && cd) {
      clearTimeout(cdTimer);
      cd = 0;
      broadcast();
    }
  };
  const start = () => {
    if (closed) return;
    clearTimeout(cdTimer);
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    let nb = 0;
    const crew: StartCrew[] = seats.map((s, r) =>
      s.id ? { r, id: s.id, name: s.name, skin: s.skin, bot: false } : { r, id: '', name: names[nb++ % names.length], skin: BOT_SKINS[(r + nb) % BOT_SKINS.length], bot: true },
    );
    const msg: NetMsg = { t: 'start', seed: (Math.random() * 1e9) | 0, crew, mode: o.mode };
    net.send(msg);
    finish({ kind: 'start', start: msg });
  };

  if (host) {
    seats[seatFor(o.role)] = { id: me.id, name: me.name, skin: me.skin, ready: true };
    offs.push(
      net.on('join', (m) => {
        const i = seats.findIndex((s) => s.id === m.id);
        if (i < 0) {
          const r = seatFor(-1);
          if (r < 0) return;
          seats[r] = { id: String(m.id), name: String(m.name ?? 'Bloop'), skin: String(m.skin ?? 'bloop'), ready: false };
        }
        audio.click();
        speak(t('voo.r.joinedV', '{n} entrou!', { n: String(m.name ?? '') }), { gap: 800 });
        broadcast();
        autoStart();
      }),
      net.on('leave', (m) => {
        const i = seats.findIndex((s) => s.id === m.id);
        if (i >= 0) seats[i] = emptySeat();
        broadcast();
        autoStart();
      }),
      net.on('hello', (m) => {
        // convidado pediu o papel favorito
        const i = seats.findIndex((s) => s.id === m.from);
        const want = +m.role;
        if (i >= 0 && want >= 0 && want < 4 && !seats[want].id) {
          seats[want] = seats[i];
          seats[i] = emptySeat();
        }
        broadcast();
      }),
      net.on('pick', (m) => {
        const i = seats.findIndex((s) => s.id === m.from);
        const r = +m.r;
        if (i < 0 || r < 0 || r > 3 || seats[r].id) return;
        seats[r] = { ...seats[i], ready: false };
        seats[i] = emptySeat();
        broadcast();
        autoStart();
      }),
      net.on('ready', (m) => {
        const i = seats.findIndex((s) => s.id === m.from);
        if (i < 0) return;
        seats[i].ready = !!m.v;
        broadcast();
        autoStart();
      }),
    );
  } else {
    offs.push(
      net.on('lobby', (m) => {
        seats = (m.seats as Seat[]).slice(0, 4);
        const prevCd = cd;
        cd = +m.cd || 0;
        if (cd && cd !== prevCd) tap('light');
        render();
      }),
      net.on('start', (m) => finish({ kind: 'start', start: m })),
    );
    net.send({ t: 'hello', role: o.role });
  }
  offs.push(
    net.onClose((why) => {
      if (closed) return;
      notify(why === 'hostLeft' ? t('voo.r.hostLeft', 'O anfitrião fechou a sala') : t('voo.r.lost', 'Conexão perdida'), { icon: 'cloud-off', kind: 'bad' });
      finish({ kind: 'exit' });
    }),
  );
  render();
  if (host) broadcast();

  /* ---------- amigos online ---------- */
  const flist = el.querySelector('.vr-flist') as HTMLElement;
  const loadFriends = async () => {
    try {
      const { homeApi } = await import('../../services/home');
      const all = await homeApi.friends();
      if (closed) return;
      const on = all.filter((f) => f.online).slice(0, 12);
      if (!on.length) {
        flist.innerHTML = `<div class="vr-note">${icon('user', { size: 18 })}${esc(all.length ? t('voo.r.noneOnline', 'Nenhum amigo online agora. Mande o código!') : t('voo.r.noFriends', 'Sem amigos ainda. Mande o código para quem está perto!'))}</div>`;
        return;
      }
      flist.innerHTML = on
        .map(
          (f) =>
            `<div class="vr-fr" data-fid="${esc(f.id)}"><canvas width="64" height="64"></canvas><span><b>${esc(f.name || '@' + f.handle)}</b><small><i class="dot"></i>${esc(t('voo.r.online', 'online'))}</small></span><button class="vr-call ${invited.has(f.id) ? 'done' : ''}" data-call="${esc(f.id)}">${invited.has(f.id) ? vIcon('check', 22) + esc(t('voo.r.called', 'Chamado')) : vIcon('plane', 22) + esc(t('voo.r.callOne', 'Chamar'))}</button></div>`,
        )
        .join('');
      flist.querySelectorAll<HTMLCanvasElement>('canvas').forEach((c, i) => {
        const f = on[i];
        const x = c.getContext('2d')!;
        x.translate(32, 36);
        const pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0.1, sx: 1, sy: 1, mood: 'happy', lx: -0.5, ly: -0.7, still: true };
        try {
          drawPlayer(x, SKINS.find((k) => k.id === f.skin) ?? SKINS[0], 22, pose);
        } catch {
          /* */
        }
      });
    } catch {
      flist.innerHTML = `<div class="vr-note">${esc(t('voo.r.noFriends', 'Sem amigos ainda. Mande o código para quem está perto!'))}</div>`;
    }
  };
  void loadFriends();
  const fTimer = window.setInterval(() => void loadFriends(), 20000);
  offs.push(() => clearInterval(fTimer));

  /* ---------- toques ---------- */
  const share = async () => {
    const txt = t('voo.r.shareTxt', 'Vem voar comigo no Pouso Forçado (Bloop World)! Código: {c}', { c: net.code });
    try {
      if (navigator.share) {
        await navigator.share({ text: txt, url: link });
        return;
      }
    } catch {
      /* cancelou */
    }
    try {
      await navigator.clipboard.writeText(txt + " " + link);
      notify(t('voo.r.copied', 'Código copiado!'), { icon: 'check', kind: 'good' });
    } catch {
      notify(net.code, { icon: 'link' });
    }
  };
  el.addEventListener('click', async (e) => {
    if (closed) return;
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b) return;
    audio.click();
    if (b.dataset.x !== undefined) return finish({ kind: 'exit' });
    if (b.dataset.share !== undefined) return void share();
    if (b.dataset.qr !== undefined) return bigQr();
    if (b.dataset.scan !== undefined) {
      const l = await scanBloopLink({ types: ['voo'], title: t('voo.r.scan', 'Escanear'), hint: t('voo.r.scanHint', 'Aponte para o QR da sala do amigo') });
      if (l && !closed && l.code !== net.code) finish({ kind: 'join', code: l.code });
      return;
    }
    if (b.dataset.r !== undefined) {
      const r = +b.dataset.r;
      if (seats[r].id) return;
      tap('light');
      if (host) {
        const i = mySeat();
        seats[r] = { ...seats[i] };
        seats[i] = emptySeat();
        broadcast();
        autoStart();
      } else net.send({ t: 'pick', r });
      return;
    }
    if (b.dataset.call) {
      if (invited.has(b.dataset.call)) return;
      invited.add(b.dataset.call);
      b.classList.add('done');
      b.innerHTML = vIcon('check', 22) + esc(t('voo.r.called', 'Chamado'));
      try {
        await api('/voo/invite', { id: me.id, to: b.dataset.call, code: net.code, name: me.name });
        speak(t('voo.r.calledV', 'Chamado!'), { gap: 600 });
      } catch {
        invited.delete(b.dataset.call);
        notify(t('voo.r.callFail', 'Não deu para chamar agora'), { icon: 'cloud-off', kind: 'bad' });
        void loadFriends();
      }
      return;
    }
    if (b.dataset.main !== undefined) {
      if (host) return start();
      const i = mySeat();
      if (i < 0) return;
      const v = !seats[i].ready;
      seats[i].ready = v;
      net.send({ t: 'ready', v });
      if (v) speak(t('voo.r.readyV', 'Pronto!'), { urgent: true });
      render();
    }
  });
  el.querySelector('[data-joinf]')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (el.querySelector('.vr-join input') as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!CODE_OK.test(v) || v === net.code) {
      notify(t('voo.r.badCode', 'Código com 5 letras, como K7Q2M'), { icon: 'warning', kind: 'bad' });
      return;
    }
    finish({ kind: 'join', code: v });
  });

  function finish(r: RoomResult): void {
    if (closed) return;
    closed = true;
    clearTimeout(cdTimer);
    for (const f of offs) f();
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
    resolve(r);
  }
  return {
    done,
    back: () => finish({ kind: 'exit' }),
  };
}
