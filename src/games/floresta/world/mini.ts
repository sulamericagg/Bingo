/* ============================================================
 *  MUNDO — minijogos online (o anfitrião manda nas regras):
 *  - Ilhas no Céu: cada um numa ilha flutuante com um baú de coisas;
 *    PvP ligado; quem cai ou desmaia sai; o último de pé vence.
 *  - Construção (id 'corrida'): tema sorteado, tempo curto, cada um no seu
 *    lote; depois todo mundo visita os lotes e vota (1–5 estrelas).
 *  - Esconde-Esconde: um pegador; os outros têm um tempinho para se
 *    esconder; quem é pego vira pegador também.
 *  - PvP Arena ('pvp'): disco no céu; golpe = EMPURRÃO (sem dano, sem
 *    sangue); quem cai volta na hora e quem derrubou ganha 1 ponto.
 *  - Spleef de Blocos ('spleef'): dois andares de neve; quebre o chão
 *    embaixo dos outros; quem cai do andar de baixo sai; último vence.
 *  - Corrida de Obstáculos ('obby'): plataformas no céu com pontos de
 *    volta; o primeiro a chegar no ouro vence.
 *  Nos servidores OFICIAIS (meta.slot) as rodadas começam sozinhas
 *  quando tem gente suficiente (contagem no letreiro), e recomeçam.
 * ============================================================ */
import { t } from '../../../i18n';
import { audio } from '../../../core/audio';
import type { WorldGame } from './worldgame';
import type { NetSession } from './net';
import { MINI_NAMES, type Mini } from './net';
import { buildObby, buildPvp, buildSpleef, inSpleef, type Course, type V3 } from './arena';
import { blockNum } from './content/blocks';
import { Vector3 } from 'three';

const _dir = new Vector3();

const CSS = `
.mg-ban{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 46px);transform:translateX(-50%);z-index:7;background:rgba(20,8,48,.78);color:#fff;border:3px solid #2a0b5c;border-radius:14px;padding:4px 12px;font-weight:800;font-size:13px;text-align:center;pointer-events:auto;display:flex;gap:8px;align-items:center;max-width:80vw}
.mg-ban b{color:#ffd34a}
.mg-ban .fl-btn{min-height:30px;font-size:12px;padding:2px 10px}
.mg-ban .mg-sc{display:block;font-size:11px;opacity:.9;font-weight:800}
.mg-votes{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);z-index:7;display:flex;gap:6px;pointer-events:auto}
.mg-votes button{font-size:20px;min-width:46px}
.mg-black{position:absolute;inset:0;z-index:6;background:#0e0622;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;pointer-events:none}
.mg-big{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);z-index:8;color:#fff;font-weight:900;font-size:34px;text-shadow:0 3px 0 #2a0b5c,0 0 12px rgba(0,0,0,.4);pointer-events:none;animation:mgpop .9s ease-out forwards}
@keyframes mgpop{0%{transform:translate(-50%,-50%) scale(.4);opacity:0}20%{transform:translate(-50%,-50%) scale(1.15);opacity:1}80%{opacity:1}100%{transform:translate(-50%,-70%) scale(1);opacity:0}}
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
/** quantos jogadores cada minijogo precisa para a rodada automática */
const NEED: Partial<Record<Mini, number>> = { ceu: 2, corrida: 2, esconde: 2, spleef: 2, obby: 1 };

export function startMini(g: WorldGame, sess: NetSession): void {
  const mini = sess.meta?.mini as Mini | undefined;
  if (!mini) return;
  const official = !!sess.meta?.slot;
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
  let phase: 'lobby' | 'count' | 'play' | 'hide' | 'vote' | 'end' = 'lobby';
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
  // arenas
  let arena: { y: number; spawns: V3[]; layers?: number[]; spec?: V3 } | null = null;
  let course: Course | null = null;
  let cp = 0;
  let finished: string[] = [];
  let myFin = false;
  const scores = new Map<string, number>();
  let lastHit = { by: '', at: 0 };
  let endT = 0;
  const everyone = () => [sess.you, ...sess.peers.keys()];
  const nameOf = (id: string) => (id === sess.you ? sess.myName : (sess.peers.get(id)?.name ?? '?'));

  const scoreLine = (): string => {
    if (mini !== 'pvp') return '';
    const top = [...scores.entries()].filter(([id]) => id === sess.you || sess.peers.has(id)).sort((a, b) => b[1] - a[1])[0];
    return `<span class="mg-sc">${t('mundo.mg.youPts', 'Você: {n}', { n: scores.get(sess.you) ?? 0 })}${top && top[1] > 0 && top[0] !== sess.you ? ' · 🏆 ' + t('mundo.mg.topPts', '{n}: {p}', { n: nameOf(top[0]), p: top[1] }) : ''}</span>`;
  };
  const draw = () => {
    const title = MINI_NAMES[mini as Exclude<Mini, ''>]?.[0]() ?? '';
    const tm = T > 0 ? ` · <b>${Math.ceil(T)}s</b>` : '';
    // servidores oficiais andam sozinhos (sem botão); nos mundos de jogador o anfitrião aperta
    const btn = !official && mini !== 'pvp' && sess.isHost && (phase === 'lobby' || phase === 'end') ? `<button class="fl-btn green" data-go="1">${phase === 'end' ? t('mundo.mg.again', 'De novo') : t('mundo.mg.start', 'Começar')}</button>` : '';
    ban.innerHTML = `<span>${title}${tm}<br><small>${status}</small>${scoreLine()}</span>${btn}`;
  };
  ban.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-go]')) hostStart();
  });
  const say = (s: string) => {
    status = s;
    draw();
  };
  const big = (s: string) => {
    const el = document.createElement('div');
    el.className = 'mg-big';
    el.textContent = s;
    g.hud.el.appendChild(el);
    setTimeout(() => el.remove(), 950);
  };
  const lobbyText = () =>
    mini === 'pvp'
      ? t('mundo.mg.pvpGo', 'Bata para empurrar! Derrube os outros da arena.')
      : official
        ? t('mundo.mg.waitMore', 'Esperando mais jogadores… ({n}/{m})', { n: everyone().length, m: NEED[mini] ?? 2 })
        : sess.isHost
          ? t('mundo.mg.waitHost', 'Chame os amigos e toque em Começar')
          : t('mundo.mg.wait', 'Esperando o anfitrião começar…');

  const tp = (x: number, y: number, z: number) => {
    g.teleport(x, z);
    for (const c of g.world.chunks.values()) if (Math.abs(c.cx * 32 + 16 - x) < 40 && Math.abs(c.cz * 32 + 16 - z) < 40 && c.natVol) g.world.vox.makeVol(c);
    g.py = y;
    g.vy = 0;
    sess.stopKnock();
  };
  const kit = (items: [string, number][]) => {
    sb.inv.s.fill(null);
    sb.inv.armor.s.fill(null);
    for (const [id, n] of items) sb.inv.give(id, n);
    sb.select(0);
    sb.hp = sb.maxHp;
    sb.food = 20;
  };
  const spawnOf = (id: string): V3 => {
    const ids = everyone().sort();
    const sp = arena!.spawns;
    return sp[Math.max(0, ids.indexOf(id)) % sp.length];
  };

  /* ---------------- arenas (cada aparelho monta a mesma) ---------------- */
  const reapplyBlocks = () => {
    // edições de bloco já guardadas no servidor (ex.: chão quebrado do Spleef nesta rodada)
    sess.applying = true;
    for (const op of sess.ops) if (op.k === 'b') sb.blocks.setBlock(+op.x! | 0, +op.y! | 0, +op.z! | 0, +op.n! | 0, +op.r! | 0);
    sess.applying = false;
  };
  if (mini === 'pvp') {
    arena = buildPvp(g);
    sess.knockMul = 1.5;
    kit([['sword_madeira', 1]]);
    const s = spawnOf(sess.you);
    tp(s.x, s.y, s.z);
    phase = 'play';
  } else if (mini === 'spleef') {
    arena = buildSpleef(g);
    reapplyBlocks();
    kit([['shovel_madeira', 1]]);
    const s = spawnOf(sess.you);
    tp(s.x, s.y, s.z);
  } else if (mini === 'obby') {
    course = buildObby(g, sess.meta?.seed ?? 1);
    kit([]);
    tp(course.start.x, course.start.y, course.start.z);
  }

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
      // lotes longe do acampamento inicial (casa, placas, carrinhos), lado a lado
      ids.forEach((id, i) => (pl[id] = [Math.round((i - (ids.length - 1) / 2) * 48), 96]));
      plots = pl;
      votes = {};
      theme = Math.floor(Math.random() * THEMES.length);
      send({ k: 'start', game: 'corrida', plots: pl, theme, T: 150 });
    } else if (mini === 'spleef') {
      alive.clear();
      for (const id of ids) alive.add(id);
      // o chão quebrado da rodada passada some do servidor
      sess.send({ t: 'reset' });
      sess.ops = sess.ops.filter((o) => o.k !== 'b');
      send({ k: 'start', game: 'spleef', T: 150 });
    } else if (mini === 'obby') {
      finished = [];
      send({ k: 'start', game: 'obby', T: 150 });
    } else if (mini === 'esconde') {
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
      case 'count':
        if (phase === 'play' || phase === 'hide' || phase === 'vote') break;
        phase = 'count';
        T = m.T;
        say(t('mundo.mg.soon', 'A rodada vai começar!'));
        break;
      case 'start':
        myOut = false;
        endT = 0;
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
          const p = plots[sess.you] ?? [0, 96];
          tp(p[0], g.world.floorAt(p[0], 60, p[1]) + 0.2, p[1]);
          say(t('mundo.mg.theme', 'Tema: {t}', { t: THEMES[theme]() }));
        } else if (m.game === 'spleef') {
          phase = 'play';
          T = m.T;
          arena = buildSpleef(g);
          kit([['shovel_madeira', 1]]);
          const s = spawnOf(sess.you);
          tp(s.x, s.y, s.z);
          say(t('mundo.mg.spleefGo', 'Quebre o chão embaixo dos outros! Não caia!'));
          big(t('mundo.mg.go2', 'JÁ!'));
        } else if (m.game === 'obby') {
          phase = 'play';
          T = m.T;
          cp = 0;
          myFin = false;
          finished = [];
          if (course) tp(course.start.x, course.start.y, course.start.z);
          say(t('mundo.mg.obbyGo', 'Corra até o bloco de ouro! Pule de plataforma em plataforma.'));
          big(t('mundo.mg.go2', 'JÁ!'));
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
      case 'ko':
        // PvP Arena: alguém caiu; quem empurrou por último ganha 1 ponto
        if (m.by) scores.set(m.by, (scores.get(m.by) ?? 0) + 1);
        if (m.by === sess.you) {
          big('+1');
          audio.cash();
        }
        if (m.id !== sess.you) g.hud.toast(m.by ? t('mundo.mg.knocked', '{a} derrubou {b}!', { a: nameOf(m.by), b: nameOf(m.id) }) : t('mundo.mg.outOf', '{n} caiu fora!', { n: nameOf(m.id) }));
        draw();
        break;
      case 'sc':
        for (const [id, v] of Object.entries(m.s ?? {})) scores.set(id, Math.max(scores.get(id) ?? 0, +(v as number) || 0));
        draw();
        break;
      case 'fin':
        if (!finished.includes(m.id)) finished.push(m.id);
        if (m.id !== sess.you) g.hud.toast(t('mundo.mg.finOther', '{n} chegou em {p}º!', { n: nameOf(m.id), p: finished.indexOf(m.id) + 1 }), 'gold');
        if (sess.isHost && phase === 'play' && everyone().every((id) => finished.includes(id))) send({ k: 'win', id: finished[0] ?? '' });
        break;
      case 'win':
        phase = 'end';
        T = 0;
        endT = 9;
        black?.remove();
        black = null;
        voteEl?.remove();
        voteEl = null;
        say(
          Array.isArray(m.tie)
            ? t('mundo.mg.tie', 'Empate entre {n}!', { n: (m.tie as string[]).map(nameOf).join(' e ') })
            : m.id || m.name
              ? t('mundo.mg.winner', 'Vencedor: {n}!', { n: m.name ?? nameOf(m.id) })
              : t('mundo.mg.nobody', 'Fim de jogo!'),
        );
        if (m.id === sess.you) big(t('mundo.mg.youWin', 'VOCÊ VENCEU!'));
        audio.cash();
        break;
      case 'lobby':
        phase = 'lobby';
        T = 0;
        say(lobbyText());
        break;
      case 'vote':
        phase = 'vote';
        T = m.T;
        voteI = m.i;
        {
          const p = (plots as Record<string, [number, number]>)[m.plot] ?? [0, 96];
          // cada visitante num ponto da plateia (não ficam um dentro do outro)
          const ids = everyone().sort();
          const ox = (ids.indexOf(sess.you) - (ids.length - 1) / 2) * 2.6;
          tp(p[0] + ox, g.world.floorAt(p[0] + ox, 60, p[1] + 14) + 0.2, p[1] + 14);
          g.yaw = g.tYaw = 0;
          g.pitch = g.tPitch = -0.3;
        }
        say(t('mundo.mg.voteFor', 'Vote no lote de {n}', { n: nameOf(m.plot) }));
        voteEl?.remove();
        voteEl = null;
        if (m.plot !== sess.you) {
          voteEl = document.createElement('div');
          voteEl.className = 'mg-votes';
          voteEl.innerHTML = [1, 2, 3, 4, 5].map((v) => `<button class="fl-btn gold" data-v="${v}">★${v}</button>`).join('');
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
  // golpe recebido: anota quem empurrou (ponto para ele se eu cair)
  sess.onHit = (from) => {
    lastHit = { by: from, at: performance.now() };
  };
  // novo anfitrião no meio da rodada não sabe quem está vivo → encerra e recomeça
  const prevPeers = sess.onPeers;
  let wasHost = sess.isHost;
  sess.onPeers = () => {
    prevPeers?.();
    if (sess.isHost && !wasHost && mini !== 'pvp' && phase !== 'lobby' && phase !== 'end' && phase !== 'count') send({ k: 'win', id: '' });
    wasHost = sess.isHost;
    if (phase === 'lobby') say(lobbyText());
    // conta o placar para quem chegou agora
    if (mini === 'pvp' && sess.isHost && scores.size) sess.send({ t: 'mg', k: 'sc', s: Object.fromEntries(scores) });
  };
  // testes (?debug): ler o estado e encurtar o relógio
  if (location.search.includes('debug'))
    (window as unknown as { __mini: unknown }).__mini = {
      state: () => ({ phase, T, seekers: [...seekers], plots, votes, status, scores: Object.fromEntries(scores), cp, finished, arena: arena ? { y: arena.y } : null, course }),
      setT: (v: number) => (T = v),
      start: () => hostStart(),
    };
  // esconde-esconde: escondidos não aparecem para quem procura enquanto contam
  sess.visible = () => !(black !== null);
  // esconde-esconde: o nome atravessa paredes — some enquanto a rodada corre
  sess.tagVisible = () => mini !== 'esconde' || phase === 'lobby' || phase === 'end' || phase === 'count';

  const goOut = () => {
    myOut = true;
    sess.send({ t: 'mg', k: 'out', id: sess.you });
    if (sess.isHost) on({ k: 'out', id: sess.you });
    say(t('mundo.mg.youOut', 'Você saiu — assista os outros!'));
  };
  sb.on('death', () => {
    if (mini === 'ceu' && phase === 'play' && !myOut) goOut();
  });

  let tagCd = 0;
  let breakCd = 0;
  let hostT = 0;
  const pBlock = blockNum('neve');
  sb.on('tick', (dt) => {
    if (T > 0) {
      T = Math.max(0, T - dt);
      draw();
      if (sess.isHost && T === 0) {
        if (phase === 'count') hostStart();
        else if (mini === 'corrida' && phase === 'play') {
          voteOrder = Object.keys(plots);
          send({ k: 'vote', plot: voteOrder[0], i: 0, T: 14 });
        } else if (mini === 'corrida' && phase === 'vote') {
          const ni = voteI + 1;
          if (ni < voteOrder.length) send({ k: 'vote', plot: voteOrder[ni], i: ni, T: 14 });
          else {
            let best: string[] = [];
            let bs = -1;
            for (const id of voteOrder) {
              const a = votes[id] ?? [];
              const sc = a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
              if (sc > bs + 1e-6) {
                bs = sc;
                best = [id];
              } else if (Math.abs(sc - bs) <= 1e-6) best.push(id);
            }
            // empate: todos os melhores dividem a vitória
            if (best.length > 1) send({ k: 'win', id: best[0], tie: best });
            else send({ k: 'win', id: best[0] ?? '' });
          }
        } else if (mini === 'esconde' && phase === 'hide') send({ k: 'seek', T: seekT });
        else if (mini === 'esconde' && phase === 'play') send({ k: 'win', id: '', name: t('mundo.mg.hiders', 'os escondidos') });
        else if (mini === 'spleef' && phase === 'play') send({ k: 'win', id: alive.size === 1 ? [...alive][0] : '' });
        else if (mini === 'obby' && phase === 'play') send({ k: 'win', id: finished[0] ?? '' });
      }
    }
    // rodadas automáticas (servidores oficiais): fim → saguão → contagem → começa
    if (official && sess.isHost && mini !== 'pvp') {
      hostT -= dt;
      if (hostT <= 0) {
        hostT = 1;
        if (phase === 'end') {
          endT -= 1;
          if (endT <= 0) send({ k: 'lobby' });
        } else if (phase === 'lobby' && everyone().length >= (NEED[mini] ?? 2)) send({ k: 'count', T: mini === 'obby' && everyone().length === 1 ? 5 : 10 });
        else if (phase === 'lobby') say(lobbyText());
      }
    }
    // Ilhas no Céu: cair das ilhas = fora
    if (mini === 'ceu' && phase === 'play' && !myOut && g.py < 6) {
      goOut();
      tp(0, g.world.floorAt(0, 40, 14) + 0.5, 14);
    }
    // PvP Arena: caiu = volta no disco (ponto para quem empurrou)
    if (mini === 'pvp' && arena) {
      sb.food = 20;
      if (sb.hp < sb.maxHp) sb.hp = sb.maxHp;
      if (g.py < arena.y - 9) {
        const by = performance.now() - lastHit.at < 7000 ? lastHit.by : '';
        sess.send({ t: 'mg', k: 'ko', id: sess.you, by });
        on({ k: 'ko', id: sess.you, by });
        lastHit = { by: '', at: 0 };
        const s = arena.spawns[Math.floor(Math.random() * arena.spawns.length)];
        tp(s.x, s.y + 0.3, s.z);
        big(t('mundo.mg.fell', 'Caiu!'));
      }
      if (sess.isHost) {
        hostT -= dt;
        if (hostT <= 0) {
          hostT = 6;
          if (scores.size) sess.send({ t: 'mg', k: 'sc', s: Object.fromEntries(scores) });
        }
      }
    }
    // Spleef: tocar = quebra o bloco de neve na mira na hora; cair do andar de baixo = fora
    if (mini === 'spleef' && arena) {
      sb.food = 20;
      breakCd -= dt;
      if (g.hud.ctl.use && breakCd <= 0 && phase === 'play' && !myOut) {
        const cam = g.camera;
        const d = cam.getWorldDirection(_dir);
        const h = sb.blocks.pick(cam.position.x, cam.position.y, cam.position.z, d.x, d.y, d.z, 6);
        if (h && h.num === pBlock && inSpleef(h.x + 0.5, h.z + 0.5) && arena.layers!.includes(h.y)) {
          sb.setBlock(h.x, h.y, h.z, 0, 0);
          g.burst(8, h.x + 0.5, h.y + 0.5, h.z + 0.5, '#ffffff', 3);
          breakCd = 0.18;
          audio.tick(0);
        }
      }
      if (g.py < arena.layers![1] - 6) {
        if (phase === 'play' && !myOut) goOut();
        // fora da rodada: assiste da sacada de vidro; fora de rodada (saguão): volta para cima
        const s = phase === 'play' ? arena.spec! : spawnOf(sess.you);
        tp(s.x, s.y + 0.3, s.z);
      }
    }
    // Corrida de Obstáculos: pontos de volta e chegada
    if (mini === 'obby' && course) {
      sb.food = 20;
      for (let i = cp + 1; i < course.checks.length; i++) {
        const c = course.checks[i];
        if (Math.hypot(g.px - c.x, g.pz - c.z) < 2.6 && Math.abs(g.py - c.y) < 1.5) {
          cp = i;
          big(t('mundo.mg.check', 'Ponto de volta!'));
          audio.coin(2);
        }
      }
      const back = course.checks[cp];
      if (g.py < back.y - 7) tp(back.x, back.y + 0.2, back.z);
      const f = course.finish;
      if (phase === 'play' && !myFin && Math.abs(g.px - f.x) < 3.6 && Math.abs(g.pz - f.z) < 3.6 && g.py > f.y - 1) {
        myFin = true;
        sess.send({ t: 'mg', k: 'fin', id: sess.you });
        on({ k: 'fin', id: sess.you });
        big(t('mundo.mg.youFin', 'Chegou em {p}º!', { p: finished.indexOf(sess.you) + 1 }));
      }
    }
    // Construção: fica no seu lote
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
  say(lobbyText());
}
