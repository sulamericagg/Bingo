/* ============================================================
 *  MUNDO — "Servidores": mundos online de até 8 (WorldRoom).
 *  - Saguão: criar mundo online (modo/tipo/PvP), minijogos, entrar
 *    por código, convites de amigos.
 *  - Sessão: avatares dos outros (interpolados), edições do mundo
 *    (terreno/peças/portas/baús) mandadas como operações; o servidor
 *    guarda e quem entra remonta tudo. O anfitrião é dono dos bichos.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { notify } from '../../../ui/notify';
import { api, me, wsUrl } from '../../../social/net';
import { skinById } from '../../../game/skins';
import { mergeParts, mat4 } from '../fps/models';
import type { WorldGame, WorldOpts } from './worldgame';
import { freshWorld } from './wsave';
import type { GenOpts } from './gen';
import type { Entity, GameMode, MundoAPI } from './engine';
import { Mob, MOB } from './mobs';
import { modeName } from './worlds';
import { CH } from './gen';

export const MCODE_OK = /^[A-HJ-NP-Z2-9]{6}$/;
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export type Mini = '' | 'ceu' | 'corrida' | 'esconde';
export interface RoomMeta {
  name: string;
  seed: number;
  gen: GenOpts | null;
  mode: GameMode;
  mini: Mini;
  owner: string;
}
export interface Op {
  k: string;
  [x: string]: unknown;
}

/* ------------------------------ avatar dos outros ------------------------------ */

const AV_GEO = new Map<string, THREE.BufferGeometry>();
function avatarGeo(skin: string): THREE.BufferGeometry {
  let g = AV_GEO.get(skin);
  if (g) return g;
  const s = skinById(skin);
  const S = new THREE.SphereGeometry(1, 14, 10);
  g = mergeParts([
    { g: S, c: s.light, m: mat4(0, 0.85, 0, 0.55, 0.75, 0.5), ao: 0.3 },
    { g: S, c: s.belly, m: mat4(0, 0.75, 0.28, 0.38, 0.5, 0.3) },
    { g: S, c: '#ffffff', m: mat4(-0.18, 1.2, 0.4, 0.12, 0.14, 0.08) },
    { g: S, c: '#ffffff', m: mat4(0.18, 1.2, 0.4, 0.12, 0.14, 0.08) },
    { g: S, c: s.eye, m: mat4(-0.18, 1.2, 0.47, 0.06, 0.08, 0.04) },
    { g: S, c: s.eye, m: mat4(0.18, 1.2, 0.47, 0.06, 0.08, 0.04) },
    { g: S, c: s.dark, m: mat4(-0.22, 0.12, 0.05, 0.18, 0.12, 0.24) },
    { g: S, c: s.dark, m: mat4(0.22, 0.12, 0.05, 0.18, 0.12, 0.24) },
    { g: S, c: s.dark, m: mat4(0, 1.62, 0, 0.06, 0.18, 0.06) },
    { g: S, c: s.accent, m: mat4(0, 1.82, 0, 0.1, 0.1, 0.1) },
  ]);
  AV_GEO.set(skin, g);
  return g;
}
function nameSprite(name: string): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const x = cv.getContext('2d')!;
  x.font = 'bold 30px sans-serif';
  const w = Math.min(250, x.measureText(name).width + 24);
  x.fillStyle = 'rgba(20,8,48,.7)';
  x.beginPath();
  x.roundRect(128 - w / 2, 8, w, 46, 18);
  x.fill();
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.fillText(name, 128, 42);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, fog: false }));
  sp.scale.set(1.6, 0.4, 1);
  sp.position.y = 2.25;
  sp.renderOrder = 8;
  return sp;
}
let AV_MAT: THREE.MeshLambertMaterial | null = null;

export class Avatar implements Entity {
  kind = 'player';
  id = 0;
  x = 0;
  y = 0;
  z = 0;
  r = 0.5;
  h = 1.8;
  hp = 20;
  g = new THREE.Group();
  private tx = 0;
  private ty = 0;
  private tz = 0;
  private yaw = 0;
  private tyaw = 0;
  private bob = 0;
  held = '';
  veh = -1;
  constructor(
    readonly pid: string,
    readonly name: string,
    skin: string,
    private sess: NetSession,
  ) {
    AV_MAT ??= new THREE.MeshLambertMaterial({ vertexColors: true });
    const body = new THREE.Mesh(avatarGeo(skin), AV_MAT);
    body.castShadow = true;
    this.g.add(body, nameSprite(name));
  }
  set(p: number[]): void {
    this.tx = p[0];
    this.ty = p[1];
    this.tz = p[2];
    this.tyaw = p[3];
    if (!this.x && !this.z) {
      this.x = this.tx;
      this.y = this.ty;
      this.z = this.tz;
    }
  }
  update(dt: number): boolean {
    const k = Math.min(1, dt * 10);
    const mv = Math.hypot(this.tx - this.x, this.tz - this.z);
    if (mv > 30) {
      this.x = this.tx;
      this.z = this.tz;
    }
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.z += (this.tz - this.z) * k;
    let d = this.tyaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * k;
    this.bob += Math.min(mv * 8, 12) * dt;
    this.g.position.set(this.x, this.y + Math.abs(Math.sin(this.bob)) * 0.08, this.z);
    this.g.rotation.y = this.yaw + Math.PI;
    this.g.visible = this.sess.visible(this);
    return true;
  }
  hit(dmg: number, from: string): void {
    if (from === 'player') this.sess.hitPlayer(this.pid, dmg);
  }
  dispose(api: MundoAPI): void {
    api.scene.remove(this.g);
  }
}

/** bicho do anfitrião visto pelos convidados (só desenho + golpes viram mensagem) */
class GhostMob implements Entity {
  kind: string;
  id = 0;
  x: number;
  y: number;
  z: number;
  r: number;
  h: number;
  hp = 10;
  hostile: boolean;
  mob: Mob;
  tx: number;
  ty: number;
  tz: number;
  seen = 0;
  private atk = 0;
  constructor(
    api: MundoAPI,
    readonly rid: number,
    kind: string,
    x: number,
    y: number,
    z: number,
    private sess: NetSession,
  ) {
    this.kind = 'ghost:' + kind;
    this.mob = new Mob(api, kind, x, y, z);
    const d = MOB.get(kind)!;
    this.r = d.r;
    this.h = d.h;
    this.hostile = d.hostile;
    this.x = this.tx = x;
    this.y = this.ty = y;
    this.z = this.tz = z;
  }
  update(dt: number, api: MundoAPI): boolean {
    this.seen += dt;
    if (this.seen > 2) return false;
    const k = Math.min(1, dt * 8);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.z += (this.tz - this.z) * k;
    const m = (this.mob as unknown as { mesh: THREE.Mesh }).mesh;
    m.position.set(this.x, this.y, this.z);
    // bicho bravo do anfitrião também morde quem está perto aqui
    this.atk -= dt;
    const P = api.player;
    if (this.hostile && api.mode !== 'pacifico' && this.atk <= 0 && Math.hypot(P.x - this.x, P.z - this.z) < this.r + 1.1 && Math.abs(P.y - this.y) < 2) {
      this.atk = 1.4;
      api.hurtPlayer(MOB.get(this.kind.slice(6))!.dmg, 'mob');
    }
    return true;
  }
  setYaw(y: number): void {
    (this.mob as unknown as { mesh: THREE.Mesh }).mesh.rotation.y = y;
  }
  hit(dmg: number, from: string, api: MundoAPI): void {
    if (from !== 'player') return;
    api.burst(5, this.x, this.y + this.h * 0.6, this.z, '#ffffff', 3);
    this.sess.send({ t: 'mg', k: 'hitm', id: this.rid, d: dmg });
  }
  dispose(api: MundoAPI): void {
    this.mob.dispose(api);
  }
}

/* ------------------------------ sessão ------------------------------ */

export class NetSession {
  ws: WebSocket | null = null;
  you = '';
  host = '';
  pvp = false;
  meta: RoomMeta | null = null;
  ops: Op[] = [];
  g: WorldGame | null = null;
  peers = new Map<string, Avatar>();
  private ghosts = new Map<number, GhostMob>();
  private sendT = 0;
  private entT = 0;
  /** aplicando operação remota (não re-enviar) */
  applying = false;
  /** edições de terreno por pedaço ainda não carregado */
  private pend = new Map<string, Op[]>();
  onMg: ((m: Record<string, any>) => void) | null = null;
  onPeers: (() => void) | null = null;
  closed = false;
  /** esconder alguém (esconde-esconde: o pegador não vê… nada) */
  visible: (a: Avatar) => boolean = () => true;

  constructor(
    readonly code: string,
    readonly myName: string,
  ) {}

  get isHost(): boolean {
    return this.you === this.host;
  }

  connect(id: string, skin: string, create: Record<string, unknown> | null): Promise<void> {
    return new Promise((resolve, reject) => {
      const q = new URLSearchParams({ id, name: this.myName, skin });
      if (create) q.set('create', JSON.stringify(create));
      const ws = new WebSocket(wsUrl('/mundo/room/' + this.code) + '?' + q.toString());
      this.ws = ws;
      let ok = false;
      const timer = setTimeout(() => {
        if (!ok) reject(new Error('timeout'));
      }, 9000);
      ws.onmessage = (e) => {
        let m: Record<string, any>;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        if (m.t === 'reject') {
          clearTimeout(timer);
          if (!ok) reject(new Error(m.reason));
          else this.lost(m.reason);
          return;
        }
        if (m.t === 'welcome') {
          ok = true;
          clearTimeout(timer);
          this.you = m.you;
          this.host = m.host;
          this.pvp = !!m.pvp;
          this.meta = m.meta;
          this.ops = Array.isArray(m.ops) ? m.ops : [];
          this.pendingPeers = m.peers ?? [];
          resolve();
          return;
        }
        this.onMsg(m);
      };
      ws.onclose = () => {
        if (!ok) {
          clearTimeout(timer);
          reject(new Error('closed'));
        } else this.lost('closed');
      };
    });
  }
  private pendingPeers: { id: string; name: string; skin: string; p: number[] | null }[] = [];

  send(m: unknown): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  private lost(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    notify(reason === 'kicked' ? t('mundo.net.kicked', 'O anfitrião tirou você do mundo') : t('mundo.net.lost', 'Conexão com o mundo caiu'), { kind: 'bad' });
    this.g?.goHome();
  }

  /** liga a sessão no jogo já montado */
  attach(g: WorldGame): void {
    this.g = g;
    const sb = g.sb!;
    sb.net = this;
    // edições locais → servidor
    g.world.vox.onEdit = (x, y, z, r, f, h) => {
      if (this.applying) return;
      this.send({ t: 'op', op: { k: 'e', x: r2(x), y: r2(y), z: r2(z), r: r2(r), f, h } });
    };
    sb.builds.onChange = (op, p) => {
      if (this.applying) return;
      if (op === 'add') this.send({ t: 'op', op: { k: 'pa', u: p.uid, i: p.id, p: [r2(p.x), r2(p.y), r2(p.z), p.r] } });
      else if (op === 'del') this.send({ t: 'op', op: { k: 'pd', u: p.uid } });
      else this.send({ t: 'op', op: { k: 'pu', u: p.uid, o: p.open ? 1 : 0, c: p.chest?.toJSON() } });
    };
    sb.on('chunkLoad', (c) => this.flushChunk(c.key()));
    for (const op of this.ops) this.apply(op);
    for (const p of this.pendingPeers) this.addPeer(p.id, p.name, p.skin, p.p);
    this.pendingPeers = [];
  }

  private chunkKeys(x: number, z: number, r: number): string[] {
    const out: string[] = [];
    for (let cz = Math.floor((z - r - 1) / CH); cz <= Math.floor((z + r + 1) / CH); cz++) for (let cx = Math.floor((x - r - 1) / CH); cx <= Math.floor((x + r + 1) / CH); cx++) out.push(cx + ',' + cz);
    return out;
  }
  apply(op: Op): void {
    const g = this.g!;
    const sb = g.sb!;
    this.applying = true;
    try {
      if (op.k === 'e') {
        const x = +op.x!, y = +op.y!, z = +op.z!, r = Math.min(4, +op.r!), f = +op.f! | 0;
        g.world.vox.edit(x, y, z, r, f, +(op.h ?? 99), new Map());
        // pedaços ainda não carregados recebem quando carregarem
        for (const k of this.chunkKeys(x, z, r)) {
          if (g.world.chunks.has(k)) continue;
          let a = this.pend.get(k);
          if (!a) this.pend.set(k, (a = []));
          a.push(op);
        }
      } else if (op.k === 'pa') {
        const p = op.p as number[];
        if (!sb.builds.byUid(+op.u!)) sb.builds.add(String(op.i), p[0], p[1], p[2], p[3], +op.u!);
      } else if (op.k === 'pd') {
        const p = sb.builds.byUid(+op.u!);
        if (p) sb.builds.remove(p);
      } else if (op.k === 'pu') {
        const p = sb.builds.byUid(+op.u!);
        if (p) {
          if (!!p.open !== !!op.o) sb.builds.toggleDoor(p);
          if (op.c && p.chest) p.chest.load(op.c);
        }
      }
    } finally {
      this.applying = false;
    }
  }
  private flushChunk(k: string): void {
    const a = this.pend.get(k);
    if (!a) return;
    this.pend.delete(k);
    const g = this.g!;
    this.applying = true;
    for (const op of a) g.world.vox.edit(+op.x!, +op.y!, +op.z!, Math.min(4, +op.r!), +op.f! | 0, +(op.h ?? 99), new Map());
    this.applying = false;
  }

  private addPeer(id: string, name: string, skin: string, p: number[] | null): void {
    if (id === this.you || this.peers.has(id) || !this.g) return;
    const a = new Avatar(id, name, skin, this);
    this.peers.set(id, a);
    this.g.scene.add(a.g);
    this.g.sb!.addEntity(a);
    if (p) a.set(p);
    this.onPeers?.();
  }

  private onMsg(m: Record<string, any>): void {
    const g = this.g;
    if (!g) return;
    switch (m.t) {
      case 'join':
        this.addPeer(m.p.id, m.p.name, m.p.skin, null);
        g.hud.toast(t('mundo.net.joined', '{n} entrou no mundo', { n: m.p.name }), 'gold');
        break;
      case 'leave': {
        const a = this.peers.get(m.id);
        if (a) {
          g.sb!.removeEntity(a);
          this.peers.delete(m.id);
          g.hud.toast(t('mundo.net.left', '{n} saiu', { n: a.name }));
          this.onPeers?.();
        }
        break;
      }
      case 'host':
        this.host = m.id;
        if (this.isHost) g.hud.toast(t('mundo.net.youHost', 'Agora você é o anfitrião'), 'gold');
        this.onPeers?.();
        break;
      case 's': {
        const a = this.peers.get(m.id);
        if (a) {
          a.set(m.p);
          a.held = m.h ?? '';
        }
        break;
      }
      case 'op':
        this.apply(m.op);
        break;
      case 'ent':
        if (!this.isHost) this.ents(m.l);
        break;
      case 'hit':
        if (this.pvp) g.sb!.hurtPlayer(+m.d || 1, 'pvp');
        break;
      case 'pvp':
        this.pvp = !!m.on;
        g.hud.toast(this.pvp ? t('mundo.net.pvpOn', 'PvP ligado') : t('mundo.net.pvpOff', 'PvP desligado'), 'warn');
        break;
      case 'mg':
        if (m.k === 'hitm' && this.isHost) {
          const e = g.sb!.entities().find((x) => x.id === m.id);
          e?.hit?.(Math.min(20, +m.d || 1), 'net', g.sb!);
          break;
        }
        this.onMg?.(m);
        break;
      case 'ev':
        if (m.k === 'boom') g.burst(30, m.x, m.y, m.z, '#ffb02e', 8);
        break;
      case 'reset':
        g.hud.toast(t('mundo.net.reset', 'O anfitrião recomeçou a partida'), 'warn');
        break;
    }
  }

  private ents(l: number[][]): void {
    const g = this.g!;
    const sb = g.sb!;
    const seen = new Set<number>();
    for (const e of l) {
      const [rid, ki, x, y, z, yaw] = e;
      seen.add(rid);
      const kind = MOB_KINDS[ki];
      if (!kind) continue;
      let gm = this.ghosts.get(rid);
      if (!gm) {
        gm = new GhostMob(sb, rid, kind, x, y, z, this);
        this.ghosts.set(rid, gm);
        sb.addEntity(gm);
      }
      gm.tx = x;
      gm.ty = y;
      gm.tz = z;
      gm.seen = 0;
      gm.setYaw(yaw);
    }
    for (const [rid, gm] of this.ghosts)
      if (!seen.has(rid)) {
        sb.removeEntity(gm);
        this.ghosts.delete(rid);
      }
  }

  /** por quadro */
  tick(dt: number): void {
    const g = this.g;
    if (!g || this.closed) return;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.1;
      const v = g.driving >= 0 ? g.vehs[g.driving] : null;
      const p = v ? [r2(v.x), r2(v.y + 0.8), r2(v.z), r2(v.yaw - Math.PI / 2)] : [r2(g.px), r2(g.py), r2(g.pz), r2(g.yaw)];
      this.send({ t: 's', p, h: g.sb!.held() });
    }
    if (this.isHost) {
      this.entT -= dt;
      if (this.entT <= 0) {
        this.entT = 0.2;
        const l: number[][] = [];
        for (const e of g.sb!.entities()) {
          if (!e.kind.startsWith('mob:')) continue;
          const ki = MOB_KINDS.indexOf(e.kind.slice(4));
          l.push([e.id, ki, r2(e.x), r2(e.y), r2(e.z), r2((e as unknown as { yaw: number }).yaw ?? 0)]);
        }
        this.send({ t: 'ent', l });
      }
    }
  }

  hitPlayer(pid: string, d: number): void {
    if (!this.pvp) {
      this.g?.hud.toast(t('mundo.net.noPvp', 'PvP desligado neste mundo'));
      return;
    }
    this.send({ t: 'hit', to: pid, d: Math.round(d * 10) / 10 });
    const a = this.peers.get(pid);
    if (a) this.g?.burst(6, a.x, a.y + 1.2, a.z, '#ff5a7a', 3);
  }

  close(): void {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {
      /* */
    }
    this.ws = null;
  }
}
const MOB_KINDS = ['fofolhudo', 'pipoco', 'muguinho', 'cascudo', 'gosmento', 'sombrinha', 'pedregulho', 'espinhoso'];
const r2 = (v: number) => Math.round(v * 100) / 100;

/* ------------------------------ saguão ------------------------------ */

const LAST = 'bw-mundo-net-last';
function lastWorlds(): { code: string; name: string; mini: Mini }[] {
  try {
    const a = JSON.parse(localStorage.getItem(LAST) || '[]');
    return Array.isArray(a) ? a.filter((x) => x && MCODE_OK.test(x.code)).slice(0, 6) : [];
  } catch {
    return [];
  }
}
function rememberWorld(code: string, name: string, mini: Mini): void {
  const a = [{ code, name, mini }, ...lastWorlds().filter((x) => x.code !== code)].slice(0, 6);
  try {
    localStorage.setItem(LAST, JSON.stringify(a));
  } catch {
    /* */
  }
}
const newCode = () => Array.from({ length: 6 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');

export const MINI_NAMES: Record<Exclude<Mini, ''>, [() => string, () => string]> = {
  ceu: [() => t('mundo.mini.ceu', 'Ilhas no Céu'), () => t('mundo.mini.ceuD', 'Cada um numa ilha flutuante com um baú. O último de pé vence!')],
  corrida: [() => t('mundo.mini.corrida', 'Corrida de Construção'), () => t('mundo.mini.corridaD', 'Um tema, pouco tempo, todo mundo constrói. Depois, votação!')],
  esconde: [() => t('mundo.mini.esconde', 'Esconde-Esconde'), () => t('mundo.mini.escondeD', 'Um procura, o resto se esconde. Quem for achado vira pegador!')],
};

/** saguão dos servidores; resolve com o jogo montado (ou null) */
export async function openServers(root: HTMLElement, opts: WorldOpts): Promise<WorldGame | null> {
  const m = document.createElement('div');
  m.className = 'fl-modal';
  root.appendChild(m);
  let who: { id: string; name: string; skin: string } | null = null;
  try {
    who = await me();
  } catch {
    who = null;
  }
  const invites: { from: string; name: string; code: string; world: string }[] = [];
  return new Promise((resolve) => {
    let busy = false;
    let mode: GameMode = 'sobrevivencia';
    let type: GenOpts['type'] = 'normal';
    let pvp = false;
    const render = (msg = '') => {
      const last = lastWorlds();
      m.innerHTML = `<div class="fl-card"><h2><span>🌐 ${t('mundo.servers', 'Servidores')}</span><button class="fl-btn round red" data-x="1">✕</button></h2>
      <div class="mw-form">
        ${!who ? `<div style="font-weight:800;color:#c21d3c">${t('mundo.net.offline', 'Sem internet agora — os servidores precisam de conexão.')}</div>` : ''}
        ${msg ? `<div style="font-weight:800;color:#c21d3c">${esc(msg)}</div>` : ''}
        ${invites.map((i) => `<div class="mw-row"><div class="sp"><b>${esc(i.name)}</b><small>${t('mundo.net.invitedYou', 'chamou você para')} ${esc(i.world)}</small></div><button class="fl-btn green" data-join="${i.code}">${t('mundo.net.join', 'Entrar')}</button></div>`).join('')}
        <div class="mw-row2"><label style="flex:1">${t('mundo.net.code', 'Código do mundo')}<input type="text" id="mn-code" maxlength="6" placeholder="ABC234" style="text-transform:uppercase"></label><button class="fl-btn green" data-enter="1" style="align-self:flex-end">${t('mundo.net.join', 'Entrar')}</button></div>
        ${last.map((w) => `<div class="mw-row"><div class="sp"><b>${esc(w.name)}</b><small>${w.code}${w.mini ? ' · ' + MINI_NAMES[w.mini][0]() : ''}</small></div><button class="fl-btn" data-join="${w.code}">${t('mundo.net.reopen', 'Abrir')}</button></div>`).join('')}
        <div class="mw-lbl" style="font-weight:900">${t('mundo.net.newOnline', 'Criar mundo online (até 8 jogadores)')}</div>
        <div class="mw-modes">${(['sobrevivencia', 'criativo', 'pacifico'] as GameMode[]).map((k) => `<button class="mw-mode ${mode === k ? 'on' : ''}" data-mode="${k}"><b>${modeName(k)}</b></button>`).join('')}</div>
        <div class="mw-chips">${(['normal', 'plano', 'ilhas', 'flutuantes'] as GenOpts['type'][]).map((k) => `<button class="mw-chip ${type === k ? 'on' : ''}" data-type="${k}">${{ normal: t('mundo.type.normal', 'Normal'), plano: t('mundo.type.plano', 'Plano'), ilhas: t('mundo.type.ilhas', 'Ilhas'), flutuantes: t('mundo.type.flutuantes', 'Ilhas Flutuantes') }[k]}</button>`).join('')}
          <button class="mw-chip ${pvp ? 'on' : ''}" data-pvp="1">⚔ PvP ${pvp ? t('mundo.on', 'ligado') : t('mundo.off', 'desligado')}</button></div>
        <button class="fl-btn gold" data-create="1">${t('mundo.net.create', 'Criar e chamar amigos')}</button>
        <div class="mw-lbl" style="font-weight:900">${t('mundo.minis', 'Minijogos')}</div>
        ${(Object.keys(MINI_NAMES) as Exclude<Mini, ''>[]).map((k) => `<div class="mw-row"><div class="sp"><b>${MINI_NAMES[k][0]()}</b><small>${MINI_NAMES[k][1]()}</small></div><button class="fl-btn green" data-mini="${k}">${t('mundo.play', 'Jogar')}</button></div>`).join('')}
      </div></div>`;
    };
    const start = async (code: string, create: Record<string, unknown> | null) => {
      if (busy || !who) return;
      busy = true;
      render(t('mundo.net.connecting', 'Conectando…'));
      const sess = new NetSession(code, who.name);
      try {
        await sess.connect(who.id, who.skin === 'custom' ? 'bloop' : who.skin, create);
      } catch (e) {
        busy = false;
        const r = (e as Error).message;
        render(r === 'no_world' ? t('mundo.net.noWorld', 'Esse mundo não existe (confira o código)') : r === 'full' ? t('mundo.net.full', 'Mundo cheio (8 jogadores)') : r === 'kicked' ? t('mundo.net.kicked', 'O anfitrião tirou você do mundo') : t('mundo.net.fail', 'Não deu para conectar agora'));
        return;
      }
      const meta = sess.meta!;
      rememberWorld(code, meta.name, meta.mini);
      m.remove();
      clearInterval(invT);
      const save = freshWorld(meta.seed);
      save.gen = meta.gen ?? undefined;
      save.solo = true;
      save.pets = 0;
      save.veh.owned = [];
      // inventário pessoal deste mundo online fica no aparelho
      const key = 'bw-mundo-net:' + code;
      try {
        const local = JSON.parse(localStorage.getItem(key) || 'null');
        if (local) {
          save.sb = local.sb;
          save.veh.owned = local.owned ?? [];
          save.vehPlaced = true;
          if (typeof local.px === 'number') {
            save.px = local.px;
            save.pz = local.pz;
          }
        }
      } catch {
        /* */
      }
      const { WorldGame } = await import('./worldgame');
      const g = new WorldGame(root, {
        ...opts,
        mode: meta.mode,
        save,
        net: sess,
        onSave: (s) => {
          try {
            const sbj = s.sb as Record<string, unknown> | undefined;
            if (sbj) delete sbj.b;
            localStorage.setItem(key, JSON.stringify({ sb: sbj, owned: s.veh.owned, px: s.px, pz: s.pz }));
          } catch {
            /* */
          }
        },
        exit: () => {
          sess.close();
          opts.exit();
        },
      });
      resolve(g);
    };
    m.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b) return;
      const d = b.dataset;
      if (d.x) {
        m.remove();
        clearInterval(invT);
        resolve(null);
        return;
      }
      if (d.mode) mode = d.mode as GameMode;
      if (d.type) type = d.type as GenOpts['type'];
      if (d.pvp) pvp = !pvp;
      if (d.mode || d.type || d.pvp) return render();
      if (d.join) return void start(d.join, null);
      if (d.enter) {
        const c = ((m.querySelector('#mn-code') as HTMLInputElement).value || '').toUpperCase().trim();
        if (!MCODE_OK.test(c)) return render(t('mundo.net.badCode', 'O código tem 6 letras/números'));
        return void start(c, null);
      }
      if (d.create) return void start(newCode(), { name: t('mundo.net.worldOf', 'Mundo de {n}', { n: who?.name ?? 'Bloop' }), seed: Math.floor(Math.random() * 1e9), gen: { type, h: 1, off: [] }, mode, pvp });
      if (d.mini) {
        const k = d.mini as Mini;
        const gen: GenOpts = { type: k === 'ceu' ? 'flutuantes' : k === 'corrida' ? 'plano' : 'normal', h: 1, off: [] };
        return void start(newCode(), { name: MINI_NAMES[k as Exclude<Mini, ''>][0](), seed: Math.floor(Math.random() * 1e9), gen, mode: k === 'corrida' ? 'criativo' : k === 'esconde' ? 'pacifico' : 'sobrevivencia', pvp: k === 'ceu', mini: k });
      }
    });
    render();
    // convites de amigos (a cada 6 s)
    const poll = async () => {
      if (!who) return;
      try {
        const r = await api<{ invites: { from: string; name: string; code: string; world: string }[] }>(`/mundo/invites?id=${encodeURIComponent(who.id)}`);
        const fresh = (r.invites ?? []).filter((i) => MCODE_OK.test(i.code) && !invites.some((x) => x.code === i.code));
        if (fresh.length && !busy) {
          invites.push(...fresh);
          render();
        }
      } catch {
        /* */
      }
    };
    void poll();
    const invT = window.setInterval(() => void poll(), 6000);
  });
}

/** painel de convite (dentro do jogo): amigos online + código */
export async function inviteFriends(sess: NetSession, host: HTMLElement): Promise<void> {
  const m = document.createElement('div');
  m.className = 'fl-modal';
  m.style.zIndex = '45';
  host.appendChild(m);
  m.innerHTML = `<div class="fl-card"><h2><span>${t('mundo.net.invite', 'Chamar amigos')}</span><button class="fl-btn round red" data-x="1">✕</button></h2><div class="mw-form"><div style="font-size:22px;font-weight:900;letter-spacing:.1em;text-align:center">${sess.code}</div><div id="mn-fr">…</div>${sess.isHost ? `<button class="fl-btn ${sess.pvp ? 'red' : ''}" data-pvp="1">⚔ PvP: ${sess.pvp ? t('mundo.on', 'ligado') : t('mundo.off', 'desligado')}</button>` : ''}</div></div>`;
  m.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b) return;
    if (b.dataset.x) return m.remove();
    if (b.dataset.pvp) {
      sess.send({ t: 'pvp', on: !sess.pvp });
      return m.remove();
    }
    if (b.dataset.call) {
      b.disabled = true;
      try {
        const who = await me();
        await api('/mundo/invite', { id: who.id, to: b.dataset.call, code: sess.code, name: who.name, world: sess.meta?.name ?? '' });
        b.textContent = '✓';
      } catch {
        b.textContent = '✕';
      }
    }
  });
  m.addEventListener('pointerdown', (e) => e.stopPropagation());
  try {
    const { homeApi } = await import('../../../services/home');
    const all = await homeApi.friends();
    const on = all.filter((f) => f.online).slice(0, 12);
    (m.querySelector('#mn-fr') as HTMLElement).innerHTML = on.length
      ? on.map((f) => `<div class="mw-row"><div class="sp"><b>${esc(f.name || '@' + f.handle)}</b></div><button class="fl-btn green" data-call="${esc(f.id)}">${t('mundo.net.call', 'Chamar')}</button></div>`).join('')
      : `<div style="font-weight:700;opacity:.75">${t('mundo.net.sendCode', 'Nenhum amigo online. Mande o código!')}</div>`;
  } catch {
    (m.querySelector('#mn-fr') as HTMLElement).textContent = t('mundo.net.sendCode', 'Nenhum amigo online. Mande o código!');
  }
}
