/* ============================================================
 *  MUNDO — minijogos online (o anfitrião manda nas regras):
 *  - Ilhas no Céu: cada um numa ilha flutuante com um baú de coisas;
 *    PvP ligado; quem cai ou desmaia sai; o último de pé vence.
 *  - Corrida de Construção: tema sorteado, tempo curto, cada um no seu
 *    lote; depois todo mundo visita os lotes e vota (1–5 estrelas).
 *  - Esconde-Esconde: um pegador; os outros têm um tempinho para se
 *    esconder; quem é pego vira pegador também.
 * ============================================================ */
import { t } from '../../../i18n';
import { audio } from '../../../core/audio';
import type { WorldGame } from './worldgame';
import type { NetSession } from './net';
import { MINI_NAMES } from './net';

const CSS = `
.mg-ban{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 46px);transform:translateX(-50%);z-index:7;background:rgba(20,8,48,.78);color:#fff;border:3px solid #2a0b5c;border-radius:14px;padding:4px 12px;font-weight:800;font-size:13px;text-align:center;pointer-events:auto;display:flex;gap:8px;align-items:center;max-width:80vw}
.mg-ban b{color:#ffd34a}
.mg-ban .fl-btn{min-height:30px;font-size:12px;padding:2px 10px}
.mg-votes{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);z-index:7;display:flex;gap:6px;pointer-events:auto}
.mg-votes button{font-size:20px;min-width:46px}
.mg-black{position:absolute;inset:0;z-index:6;background:#0e0622;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;pointer-events:none}
`;
const THEMES = [
  () => t('mundo.theme.0', 'Casa na Árvore'),
  () => t('mundo.theme.1', 'Foguete'),
  () => t('mundo.theme.2', 'Castelo de Doces'),
  () => t('mundo.theme.3', 'Farol na Praia'),
  () => t('mundo.theme.4', 'Robô Gigante'),
  () => t('mundo.theme.5', 'Lanchonete'),
  () => t('mundo.theme.6', 'Zoológico'),
  () => t('mundo.theme.7', 'Navio'),
];

export function startMini(g: WorldGame, sess: NetSession): void {
  const mini = sess.meta?.mini;
  if (!mini) return;
  if (!document.getElementById('mg-css')) {
    const s = document.createElement('style');
    s.id = 'mg-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  const sb = g.sb!;
  const ban = document.createElement('div');
  ban.className = 'mg-ban';
  g.hud.el.appendChild(ban);
  ban.addEventListener('pointerdown', (e) => e.stopPropagation());
  let phase: 'lobby' | 'play' | 'hide' | 'vote' | 'end' = 'lobby';
  let T = 0;
  let status = '';
  // estado do anfitrião
  const alive = new Set<string>();
  let seekers = new Set<string>();
  let plots: Record<string, [number, number]> = {};
  let votes: Record<string, number[]> = {};
  let voteOrder: string[] = [];
  let voteI = -1;
  let theme = 0;
  let myOut = false;
  let black: HTMLDivElement | null = null;
  let voteEl: HTMLDivElement | null = null;
  const everyone = () => [sess.you, ...sess.peers.keys()];
  const nameOf = (id: string) => (id === sess.you ? sess.myName : sess.peers.get(id)?.name ?? '?');

  const draw = () => {
    const title = MINI_NAMES[mini as 'ceu'][0]();
    const tm = T > 0 ? ` · <b>${Math.ceil(T)}s</b>` : '';
    const btn = sess.isHost && (phase === 'lobby' || phase === 'end') ? `<button class="fl-btn green" data-go="1">${phase === 'end' ? t('mundo.mg.again', 'De novo') : t('mundo.mg.start', 'Começar')}</button>` : '';
    ban.innerHTML = `<span>${title}${tm}<br><small>${status}</small></span>${btn}`;
  };
  ban.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-go]')) hostStart();
  });
  const say = (s: string) => {
    status = s;
    draw();
  };
  say(sess.isHost ? t('mundo.mg.waitHost', 'Chame os amigos e toque em Começar') : t('mundo.mg.wait', 'Esperando o anfitrião começar…'));

  const tp = (x: number, y: number, z: number) => {
    g.teleport(x, z);
    for (const c of g.world.chunks.values()) if (Math.abs(c.cx * 32 + 16 - x) < 40 && Math.abs(c.cz * 32 + 16 - z) < 40 && c.natVol) g.world.vox.makeVol(c);
    g.py = y;
    g.vy = 0;
  };

  /* ---------------- anfitrião ---------------- */
  const hostStart = () => {
    if (!sess.isHost) return;
    const ids = everyone();
    if (mini === 'ceu') {
      const sp: Record<string, number[]> = {};
      const o = new Float32Array(2);
      const cands: number[][] = [];
      for (let r = 40; r < 400 && cands.length < ids.length; r += 16)
        for (let a = 0; a < Math.PI * 2 && cands.length < ids.length; a += 0.4) {
          const x = Math.round(Math.cos(a) * r);
          const z = Math.round(Math.sin(a) * r) + 14;
          g.world.gen.skyIsland(x, z, o);
          if (o[0] < 0.45) continue;
          if (cands.some((c) => Math.hypot(c[0] - x, c[2] - z) < 30)) continue;
          cands.push([x, o[1] + o[0] * 5 + 1, z]);
        }
      ids.forEach((id, i) => (sp[id] = cands[i % Math.max(1, cands.length)] ?? [0, 60, 14]));
      alive.clear();
      for (const id of ids) alive.add(id);
      send({ k: 'start', game: 'ceu', sp });
    } else if (mini === 'corrida') {
      const pl: Record<string, [number, number]> = {};
      ids.forEach((id, i) => (pl[id] = [i * 48, 30]));
      plots = pl;
      votes = {};
      theme = Math.floor(Math.random() * THEMES.length);
      send({ k: 'start', game: 'corrida', plots: pl, theme, T: 150 });
    } else {
      const seek = ids[Math.floor(Math.random() * ids.length)];
      seekers = new Set([seek]);
      send({ k: 'start', game: 'esconde', seek: [seek], hide: 35, T: 180 });
    }
  };
  const send = (m: Record<string, unknown>) => {
    sess.send({ t: 'mg', ...m });
    on(m);
  };

  /* ---------------- todos ---------------- */
  const on = (m: Record<string, any>) => {
    switch (m.k) {
      case 'start':
        myOut = false;
        if (m.game === 'ceu') {
          phase = 'play';
          T = 0;
          sb.inv.s.fill(null);
          sb.inv.armor.s.fill(null);
          sb.hp = sb.maxHp;
          sb.food = 20;
          const p = m.sp[sess.you] ?? [0, 60, 14];
          tp(p[0], p[1], p[2]);
          // baú de saque ao lado
          sess.applying = true;
          const ch = sb.builds.add('bau', p[0] + 1.5, p[1] - 1, p[2], 0);
          sess.applying = false;
          const loot = ['sword_pedra', 'sword_ferro', 'helmet_cobre', 'vest_ferro', 'pedra', 'terra', 'terra', 'pao', 'fruta', 'estilingue', 'pedrinha', 'dinamite', 'pick_pedra', 'boots_cobre'];
          for (let i = 0; i < 7; i++) {
            const id = loot[Math.floor(Math.random() * loot.length)];
            ch?.chest?.add(id, id === 'terra' || id === 'pedra' || id === 'pedrinha' ? 16 : 1);
          }
          say(t('mundo.mg.ceuGo', 'Pegue o baú, construa pontes e derrube os outros!'));
        } else if (m.game === 'corrida') {
          phase = 'play';
          T = m.T;
          plots = m.plots;
          theme = m.theme;
          const p = plots[sess.you] ?? [0, 30];
          tp(p[0], g.world.floorAt(p[0], 60, p[1]) + 0.2, p[1]);
          say(t('mundo.mg.theme', 'Tema: {t}', { t: THEMES[theme]() }));
        } else {
          seekers = new Set(m.seek);
          phase = 'hide';
          T = m.hide;
          say(seekers.has(sess.you) ? t('mundo.mg.youSeek', 'Você é o pegador! Espere…') : t('mundo.mg.hide', 'Esconda-se!'));
          if (seekers.has(sess.you)) {
            black = document.createElement('div');
            black.className = 'mg-black';
            black.textContent = t('mundo.mg.eyes', 'Olhos fechados… contando!');
            g.hud.el.appendChild(black);
          }
          m.T2 = m.T;
          seekT = m.T;
        }
        audio.cash();
        break;
      case 'out':
        if (sess.isHost) {
          alive.delete(m.id);
          if (alive.size <= 1 && phase === 'play') send({ k: 'win', id: [...alive][0] ?? '' });
        }
        if (m.id !== sess.you) g.hud.toast(t('mundo.mg.outOf', '{n} caiu fora!', { n: nameOf(m.id) }));
        break;
      case 'win':
        phase = 'end';
        T = 0;
        black?.remove();
        black = null;
        voteEl?.remove();
        voteEl = null;
        say(m.id ? t('mundo.mg.winner', 'Vencedor: {n}!', { n: m.name ?? nameOf(m.id) }) : t('mundo.mg.nobody', 'Fim de jogo!'));
        audio.cash();
        break;
      case 'vote':
        phase = 'vote';
        T = m.T;
        voteI = m.i;
        {
          const p = (plots as Record<string, [number, number]>)[m.plot] ?? [0, 30];
          tp(p[0], g.world.floorAt(p[0], 60, p[1] + 16) + 0.2, p[1] + 16);
          g.yaw = g.tYaw = 0;
          g.pitch = g.tPitch = -0.15;
        }
        say(t('mundo.mg.voteFor', 'Vote no lote de {n}', { n: nameOf(m.plot) }));
        voteEl?.remove();
        voteEl = null;
        if (m.plot !== sess.you) {
          voteEl = document.createElement('div');
          voteEl.className = 'mg-votes';
          voteEl.innerHTML = [1, 2, 3, 4, 5].map((v) => `<button class="fl-btn gold" data-v="${v}">${'★'.repeat(v > 3 ? 1 : 1)}${v}</button>`).join('');
          voteEl.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            const b = (e.target as HTMLElement).closest('[data-v]') as HTMLElement | null;
            if (!b) return;
            const v = +b.dataset.v!;
            if (sess.isHost) on({ k: 'v', plot: m.plot, v, from: sess.you });
            else sess.send({ t: 'mg', k: 'v', plot: m.plot, v });
            voteEl?.remove();
            voteEl = null;
            audio.click();
          });
          g.hud.el.appendChild(voteEl);
        }
        break;
      case 'v':
        if (sess.isHost) (votes[m.plot] ??= []).push(Math.max(1, Math.min(5, +m.v)));
        break;
      case 'tag':
        if (sess.isHost && phase === 'play' && seekers.has(m.from) && !seekers.has(m.id)) send({ k: 'found', id: m.id, by: m.from });
        break;
      case 'found':
        seekers.add(m.id);
        g.hud.toast(t('mundo.mg.found', '{a} achou {b}!', { a: nameOf(m.by), b: nameOf(m.id) }), 'gold');
        if (m.id === sess.you) say(t('mundo.mg.nowSeek', 'Achado! Agora você também procura.'));
        if (sess.isHost && everyone().every((id) => seekers.has(id))) send({ k: 'win', id: m.by, name: t('mundo.mg.seekers', 'os pegadores') });
        break;
      case 'seek':
        phase = 'play';
        T = m.T;
        black?.remove();
        black = null;
        say(seekers.has(sess.you) ? t('mundo.mg.go', 'Vai! Toque nos escondidos para pegar.') : t('mundo.mg.shh', 'Shhh… fique escondido!'));
        break;
    }
  };
  let seekT = 180;
  sess.onMg = (m) => on(m);
  // esconde-esconde: escondidos não aparecem para quem procura enquanto contam
  sess.visible = () => !(black !== null);

  sb.on('death', () => {
    if (mini === 'ceu' && phase === 'play' && !myOut) {
      myOut = true;
      sess.send({ t: 'mg', k: 'out', id: sess.you });
      if (sess.isHost) on({ k: 'out', id: sess.you });
      say(t('mundo.mg.youOut', 'Você saiu — assista os outros!'));
    }
  });

  let tagCd = 0;
  sb.on('tick', (dt) => {
    if (T > 0) {
      T = Math.max(0, T - dt);
      draw();
      if (sess.isHost && T === 0) {
        if (mini === 'corrida' && phase === 'play') {
          voteOrder = Object.keys(plots);
          send({ k: 'vote', plot: voteOrder[0], i: 0, T: 14 });
        } else if (mini === 'corrida' && phase === 'vote') {
          const ni = voteI + 1;
          if (ni < voteOrder.length) send({ k: 'vote', plot: voteOrder[ni], i: ni, T: 14 });
          else {
            let best = '';
            let bs = -1;
            for (const id of voteOrder) {
              const a = votes[id] ?? [];
              const sc = a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
              if (sc > bs) {
                bs = sc;
                best = id;
              }
            }
            send({ k: 'win', id: best });
          }
        } else if (mini === 'esconde' && phase === 'hide') send({ k: 'seek', T: seekT });
        else if (mini === 'esconde' && phase === 'play') send({ k: 'win', id: '', name: t('mundo.mg.hiders', 'os escondidos') });
      }
    }
    // Ilhas no Céu: cair das ilhas = fora
    if (mini === 'ceu' && phase === 'play' && !myOut && g.py < 6) {
      myOut = true;
      sess.send({ t: 'mg', k: 'out', id: sess.you });
      if (sess.isHost) on({ k: 'out', id: sess.you });
      tp(0, g.world.floorAt(0, 40, 14) + 0.5, 14);
      say(t('mundo.mg.youOut', 'Você saiu — assista os outros!'));
    }
    // Corrida: fica no seu lote
    if (mini === 'corrida' && phase === 'play') {
      const p = plots[sess.you];
      if (p) {
        g.px = Math.max(p[0] - 14, Math.min(p[0] + 14, g.px));
        g.pz = Math.max(p[1] - 14, Math.min(p[1] + 14, g.pz));
      }
    }
    // Esconde: pegador parado contando; tocar perto de alguém = pegar
    if (mini === 'esconde') {
      if (phase === 'hide' && seekers.has(sess.you)) {
        g.hud.ctl.mx = g.hud.ctl.my = 0;
      }
      tagCd -= dt;
      if (phase === 'play' && seekers.has(sess.you) && g.hud.ctl.use && tagCd <= 0) {
        tagCd = 0.6;
        for (const [id, a] of sess.peers) {
          if (seekers.has(id)) continue;
          if (Math.hypot(a.x - g.px, a.z - g.pz) < 2.6 && Math.abs(a.y - g.py) < 2.2) {
            if (sess.isHost) on({ k: 'tag', id, from: sess.you });
            else sess.send({ t: 'mg', k: 'tag', id });
            break;
          }
        }
      }
    }
  });
  draw();
}
