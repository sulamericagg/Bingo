/* ============================================================
 *  BLOOP STUDIO — SERVIDOR ONLINE (publicado pelo criador e aprovado
 *  na moderação; lista em Mundo → Servidores). Usa a mesma sala do
 *  Mundo (WorldRoom, /api/mundo/room/<CÓDIGO>) só para presença:
 *  cada um simula o próprio Bloop no mapa e manda a posição; os outros
 *  aparecem como Bloops com o nome em cima. Com PvP ligado, o botão
 *  "Empurrar" dá um empurrão no Bloop mais perto (sem dano).
 *  O anfitrião manda a foto do mapa (JPEG ≤ 30 KB) para o cartão.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { me, wsUrl } from '../../social/net';
import { tap } from '../../core/haptics';
import { notify } from '../../ui/notify';
import { BloopAvatar } from './avatar';
import type { PlaySession } from './session';
import type { StudioServer } from '../register';

interface Peer {
  id: string;
  name: string;
  skin: string;
  av: BloopAvatar;
  tag: THREE.Sprite;
  cur: THREE.Vector3;
  to: THREE.Vector3;
  yaw: number;
  toYaw: number;
  seated: boolean;
  seen: boolean;
}

const CSS = `
.so-chip{position:absolute;left:calc(env(safe-area-inset-left,0px) + 150px);top:calc(env(safe-area-inset-top,0px) + 14px);max-width:calc(50% - 170px);z-index:6;background:rgba(20,8,48,.72);color:#fff;border-radius:14px;padding:3px 12px;font-weight:900;font-size:13px;display:flex;gap:8px;align-items:center;pointer-events:none;font-family:var(--font,'Fredoka',system-ui,sans-serif)}
.so-chip span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.so-chip i{width:9px;height:9px;border-radius:50%;background:#3ee07a;box-shadow:0 0 6px #3ee07a}
.so-chip i.off{background:#ff4f6a;box-shadow:none}
.so-push{position:absolute;right:calc(env(safe-area-inset-right,0px) + 18px);top:42%;z-index:6;width:74px;height:74px;border-radius:50%;border:none;background:radial-gradient(circle at 40% 35%,#ffb48a,#ff4f6a 60%,#c21d3c);box-shadow:0 5px 0 #6a0a1a;color:#fff;font:inherit;font-weight:900;font-size:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:auto;font-family:var(--font,'Fredoka',system-ui,sans-serif)}
.so-push b{font-size:24px;line-height:1}
.so-push:active{transform:scale(.94)}
`;

function nameTag(name: string): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const x = cv.getContext('2d')!;
  x.font = '900 30px system-ui,sans-serif';
  const w = Math.min(248, x.measureText(name).width + 28);
  x.fillStyle = 'rgba(20,8,48,.72)';
  x.beginPath();
  x.roundRect((256 - w) / 2, 8, w, 46, 18);
  x.fill();
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(name, 128, 32, 230);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 10;
  return s;
}

export class StudioNet {
  private ws: WebSocket | null = null;
  private you = '';
  private host = '';
  private pvp: boolean;
  private peers = new Map<string, Peer>();
  private root = new THREE.Group();
  private chip: HTMLDivElement;
  private push: HTMLButtonElement | null = null;
  private sendT = 0;
  private thumbT = 8;
  private wantThumb = false;
  private closed = false;
  private online = false;
  private pushCd = 0;

  constructor(
    readonly srv: StudioServer,
    private play: PlaySession,
    private scene: THREE.Scene,
    private layer: HTMLElement,
    private standard: boolean,
  ) {
    this.pvp = !!srv.pvp;
    if (!document.getElementById('so-css')) {
      const s = document.createElement('style');
      s.id = 'so-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    scene.add(this.root);
    this.chip = document.createElement('div');
    this.chip.className = 'so-chip';
    layer.appendChild(this.chip);
    this.drawChip();
    this.setPvp(this.pvp);
    if (location.search.includes('debug')) (window as unknown as { __snet: unknown }).__snet = this;
  }

  /** conecta; resolve com '' ou o motivo do erro */
  async connect(): Promise<string> {
    let who: { id: string; name: string; skin: string };
    try {
      who = await me();
    } catch {
      return 'offline';
    }
    this.you = who.id;
    const q = new URLSearchParams({ id: who.id, name: who.name, skin: who.skin === 'custom' ? 'bloop' : who.skin });
    return new Promise((resolve) => {
      let done = false;
      const fin = (r: string) => {
        if (!done) (done = true), resolve(r);
      };
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl(`/mundo/room/${this.srv.code}?${q}`));
      } catch {
        return fin('fail');
      }
      this.ws = ws;
      const to = setTimeout(() => fin('fail'), 9000);
      ws.onmessage = (ev) => {
        let m: Record<string, any>;
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (m.t === 'welcome') {
          clearTimeout(to);
          this.online = true;
          this.host = m.host;
          this.setPvp(!!m.pvp);
          for (const p of m.peers ?? []) this.addPeer(p, p.p);
          this.drawChip();
          fin('');
        } else if (m.t === 'reject') {
          clearTimeout(to);
          fin(String(m.reason ?? 'fail'));
        } else this.on(m);
      };
      ws.onclose = () => {
        clearTimeout(to);
        this.online = false;
        this.drawChip();
        fin('fail');
      };
    });
  }

  private send(m: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private on(m: Record<string, any>): void {
    switch (m.t) {
      case 'join':
        this.addPeer(m.p, null);
        notify(t('srv.joined', '{n} entrou', { n: String(m.p?.name ?? 'Bloop') }), { icon: 'user' });
        break;
      case 'leave': {
        const p = this.peers.get(m.id);
        if (p) {
          this.root.remove(p.av.root, p.tag);
          p.av.dispose();
          (p.tag.material as THREE.SpriteMaterial).map?.dispose();
          p.tag.material.dispose();
          this.peers.delete(m.id);
        }
        break;
      }
      case 'host':
        this.host = m.id;
        break;
      case 's': {
        const p = this.peers.get(m.id);
        if (p && Array.isArray(m.p)) this.setPose(p, m.p);
        break;
      }
      case 'pvp':
        this.setPvp(!!m.on);
        break;
      case 'hit':
        if (!this.pvp) break;
        if (typeof m.x === 'number' && typeof m.z === 'number') this.play.shove(m.x, m.z, 7 + Math.min(4, +m.d || 1));
        tap('medium');
        break;
    }
    this.drawChip();
  }

  private addPeer(a: { id: string; name: string; skin: string }, p: number[] | null): void {
    if (!a?.id || a.id === this.you || this.peers.has(a.id)) return;
    const av = new BloopAvatar(this.standard, a.skin || 'bloop');
    const tag = nameTag(a.name || 'Bloop');
    this.root.add(av.root, tag);
    const peer: Peer = { id: a.id, name: a.name, skin: a.skin, av, tag, cur: new THREE.Vector3(0, -999, 0), to: new THREE.Vector3(0, -999, 0), yaw: 0, toYaw: 0, seated: false, seen: false };
    av.root.visible = tag.visible = false;
    this.peers.set(a.id, peer);
    if (p) this.setPose(peer, p);
  }
  private setPose(p: Peer, a: number[]): void {
    p.to.set(a[0], a[1], a[2]);
    p.toYaw = a[3] ?? 0;
    p.seated = a[4] === 1;
    if (!p.seen) {
      p.seen = true;
      p.cur.copy(p.to);
      p.yaw = p.toYaw;
      p.av.root.visible = p.tag.visible = true;
    }
  }

  private setPvp(on: boolean): void {
    this.pvp = on;
    if (on && !this.push) {
      const b = document.createElement('button');
      b.className = 'so-push';
      b.innerHTML = `<b>✋</b>${t('srv.push', 'Empurrar')}`;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.doPush();
      });
      this.layer.appendChild(b);
      this.push = b;
    } else if (!on && this.push) {
      this.push.remove();
      this.push = null;
    }
  }
  /** empurra o Bloop mais perto (até 2,6 m) */
  doPush(): string {
    if (!this.pvp || this.pushCd > 0) return '';
    this.pushCd = 0.35;
    const me = this.play.netPose();
    let best: Peer | null = null;
    let bd = 2.6;
    for (const p of this.peers.values()) {
      const d = Math.hypot(p.cur.x - me.x, p.cur.z - me.z);
      if (d < bd && Math.abs(p.cur.y - me.y) < 2) (bd = d), (best = p);
    }
    tap('light');
    if (!best) return '';
    this.send({ t: 'hit', to: best.id, d: 3 });
    return best.id;
  }

  private drawChip(): void {
    const n = this.peers.size + 1;
    this.chip.innerHTML = `<i class="${this.online ? '' : 'off'}"></i><span></span><span>👥 ${n}</span>${this.pvp ? '<span>⚔</span>' : ''}`;
    (this.chip.children[1] as HTMLElement).textContent = this.srv.name;
  }

  update(dt: number): void {
    if (this.closed) return;
    this.pushCd -= dt;
    const k = 1 - Math.exp(-dt * 10);
    for (const p of this.peers.values()) {
      if (!p.seen) continue;
      const sp = Math.hypot(p.to.x - p.cur.x, p.to.z - p.cur.z) / Math.max(dt, 1e-3);
      if (p.cur.distanceTo(p.to) > 12) p.cur.copy(p.to);
      else p.cur.lerp(p.to, k);
      let d = p.toYaw - p.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.yaw += d * k;
      p.av.root.position.copy(p.cur);
      p.av.root.rotation.y = p.yaw;
      p.av.animate(dt, Math.min(8, sp * k), false, p.seated);
      p.tag.position.set(p.cur.x, p.cur.y + 1.05, p.cur.z);
    }
    this.sendT -= dt;
    if (this.sendT <= 0 && this.online) {
      this.sendT = 0.1;
      const me = this.play.netPose();
      const r = (v: number) => Math.round(v * 100) / 100;
      this.send({ t: 's', p: [r(me.x), r(me.y), r(me.z), r(me.yaw), me.seated ? 1 : 0] });
    }
    if (this.host === this.you && this.online) {
      this.thumbT -= dt;
      if (this.thumbT <= 0) {
        this.thumbT = 90;
        this.wantThumb = true;
      }
    }
  }

  /** logo depois de desenhar: foto do mapa para o cartão do servidor (anfitrião) */
  afterRender(canvas: HTMLCanvasElement): void {
    if (!this.wantThumb) return;
    this.wantThumb = false;
    try {
      const W = 320;
      const H = 180;
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const x = cv.getContext('2d')!;
      const k = Math.min(canvas.width / W, canvas.height / H);
      x.drawImage(canvas, (canvas.width - W * k) / 2, (canvas.height - H * k) / 2, W * k, H * k, 0, 0, W, H);
      let d = cv.toDataURL('image/jpeg', 0.62);
      if (d.length > 40_000) d = cv.toDataURL('image/jpeg', 0.42);
      if (d.length <= 40_960) this.send({ t: 'thumb', d });
    } catch {
      /* */
    }
  }

  close(): void {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {
      /* */
    }
    this.ws = null;
    for (const p of this.peers.values()) {
      p.av.dispose();
      (p.tag.material as THREE.SpriteMaterial).map?.dispose();
      p.tag.material.dispose();
    }
    this.peers.clear();
    this.scene.remove(this.root);
    this.chip.remove();
    this.push?.remove();
  }
}
