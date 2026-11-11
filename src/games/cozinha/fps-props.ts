/* ============================================================
 *  COZINHA 3D — peças FÍSICAS que você toca (kit src/3d/common/interact):
 *  geladeira/armário com porta e adesivo do ingrediente (cada "caixa"),
 *  botão giratório do fogão e do forno, botão do liquidificador,
 *  alavanca da torneira, tampa da lixeira e sininho do balcão.
 *  O estado mora na Sim (station.heat) ou aqui (porta, torneira).
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { t } from '../../i18n';
import { gameFont } from '../../i18n/font';
import { ControlKit, HingedDoor, Knob, Lever, Lid, PushButton, sticker, type Control } from '../../3d/common/interact';
import { INGS, ingName } from './data';
import { INK, Vis, drawIng } from './art';
import { H, T } from './fps-kitchen';
import type { Sim, Station } from './sim';

/** ingredientes que ficam na geladeira (o resto vai no armário de madeira) */
const COLD = new Set(['tomate', 'alface', 'queijo', 'carne', 'frango', 'peixe', 'ovo', 'leite', 'pepino', 'cenoura', 'morango', 'manga', 'acai', 'camarao', 'calabresa', 'pimentao', 'limao', 'massaPizza', 'massaPQ', 'massaBolo', 'massaPastel', 'cebola', 'coco', 'banana', 'abobora', 'milho', 'mandioca', 'batata']);
export const FRIDGE_H = 0.84;

export interface StProps {
  st: Station;
  /** botão de ligar (fogão/forno: giratório; liquidificador: apertar) */
  heat?: Control;
  door?: HingedDoor;
  faucet?: Lever;
  lid?: Lid;
  bell?: PushButton;
  /** geladeira (true) ou armário (false) */
  cold?: boolean;
}

export class KitchenProps {
  readonly kit: ControlKit;
  readonly group = new THREE.Group();
  readonly by: (StProps | null)[] = [];
  private owned: { dispose(): void }[] = [];
  constructor(
    sim: Sim,
    standard: boolean,
    world: CANNON.World,
    staticMat: CANNON.Material,
  ) {
    this.kit = new ControlKit(standard);
    const kit = this.kit;
    for (const st of sim.st) {
      if (!st.fx && !st.fy) {
        this.by.push(null);
        continue;
      }
      const cx = (st.x + 0.5) * T;
      const cz = (st.y + 0.5) * T;
      const yaw = Math.atan2(st.fx, st.fy);
      const cs = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const P = (lx: number, lz: number): [number, number] => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
      const p: StProps = { st };
      const at = (lx: number, y: number, lz: number) => {
        const [x, z] = P(lx, lz);
        return { x, y, z, yaw };
      };
      switch (st.k) {
        case 'pot':
        case 'pan':
          // no TAMPO, na quina da frente: aparece quando você olha a panela
          p.heat = kit.add(new Knob(kit, { ...at(0.38, H, 0.4), scale: 1.25, label: () => t('cozinha.fps.knob', 'Botão do fogo'), verb: (on) => (on ? t('cozinha.fps.heatOff', 'Desligar o fogo') : t('cozinha.fps.heatOn', 'Ligar o fogo')) }));
          break;
        case 'oven':
          p.heat = kit.add(new Knob(kit, { ...at(0.36, H + 0.34, 0.415), scale: 1.2, color: '#ff5c7a', label: () => t('cozinha.fps.ovenKnob', 'Botão do forno'), verb: (on) => (on ? t('cozinha.fps.ovenOff', 'Desligar o forno') : t('cozinha.fps.ovenOn', 'Ligar o forno')) }));
          break;
        case 'blender':
          p.heat = kit.add(new PushButton(kit, { ...at(0, H + 0.075, 0.15), scale: 1.1, label: () => t('cozinha.fps.blendBtn', 'Botão do liquidificador'), verb: (on) => (on ? t('cozinha.fps.blendOff', 'Parar') : t('cozinha.fps.blendOn', 'Bater!')) }));
          break;
        case 'sink':
          p.faucet = kit.add(new Lever(kit, { ...at(0.16, H + 0.055, -0.42), scale: 1.2, color: '#5aaaff', label: () => t('cozinha.fps.faucet', 'Torneira'), verb: (on) => (on ? t('cozinha.fps.waterOff', 'Fechar a torneira') : t('cozinha.fps.waterOn', 'Abrir a torneira')) }, 0.11, -0.3, 1.2));
          break;
        case 'trash': {
          const g = new THREE.LatheGeometry(
            ([[0.3, 0], [0.3, 0.03], [0.24, 0.07], [0.12, 0.09], [0, 0.095]] as const).map(([r, y]) => new THREE.Vector2(r, y)),
            16,
          );
          p.lid = kit.add(new Lid(kit, { ...at(0, H + 0.52, 0), label: () => t('cozinha.fps.trash', 'Lixo'), verb: () => '' }, g, 0.6));
          break;
        }
        case 'window':
          p.bell = kit.add(new PushButton(kit, { ...at(0.36, H + 0.04, 0.2), scale: 1.5, color: '#e8c24a', label: () => t('cozinha.fps.bell', 'Sininho'), verb: () => t('cozinha.fps.ring', 'Tocar') }, false));
          p.bell.group.rotation.order = 'YXZ';
          p.bell.group.rotation.x = -Math.PI / 2;
          p.bell.refreshBox();
          break;
        case 'crate':
          this.fridge(st, p, at, P, yaw, world, staticMat);
          break;
      }
      if (p.heat && (st.k === 'pot' || st.k === 'pan')) {
        p.heat.group.rotation.order = 'YXZ';
        p.heat.group.rotation.x = -Math.PI / 2;
        p.heat.refreshBox();
      }
      for (const c of [p.heat, p.door, p.faucet, p.lid, p.bell]) if (c) this.group.add(c.group);
      this.by.push(p);
    }
    for (const c of kit.controls) c.refreshBox();
  }

  /** geladeira (ou armário) em cima da bancada, porta com adesivo do ingrediente */
  private fridge(st: Station, p: StProps, at: (lx: number, y: number, lz: number) => { x: number; y: number; z: number; yaw: number }, P: (lx: number, lz: number) => [number, number], yaw: number, world: CANNON.World, staticMat: CANNON.Material): void {
    const kit = this.kit;
    const id = INGS[st.ing].id;
    const cold = COLD.has(id);
    p.cold = cold;
    const body = cold ? '#eef3fa' : '#c98a4a';
    const inner = cold ? '#d4e6f7' : '#8a5a30';
    const W = 0.92;
    const D = 0.78;
    const Hh = FRIDGE_H;
    const y0 = H;
    const g = new THREE.Group();
    const [gx, gz] = P(0, -0.05);
    g.position.set(gx, y0, gz);
    g.rotation.y = yaw;
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, col: string) => {
      const m = kit.mesh(new THREE.BoxGeometry(w, h, d), col, cold ? 0.05 : 0);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      g.add(m);
    };
    const th = 0.04;
    box(W, th, D, 0, th / 2, 0, body); // fundo
    box(W, th, D, 0, Hh - th / 2, 0, body); // teto
    box(th, Hh, D, -W / 2 + th / 2, Hh / 2, 0, body);
    box(th, Hh, D, W / 2 - th / 2, Hh / 2, 0, body);
    box(W, Hh, th, 0, Hh / 2, -D / 2 + th / 2, inner); // fundo interno
    box(W - 2 * th, 0.015, D - th, 0, 0.44, 0.01, cold ? '#ffffff' : '#a8743c'); // prateleira
    if (cold) {
      // luz interna e faixa azul
      const lamp = kit.mesh(new THREE.BoxGeometry(0.2, 0.02, 0.05), '#fff6c4', 0, true);
      lamp.position.set(0, Hh - th - 0.012, -0.1);
      g.add(lamp);
      box(W + 0.01, 0.05, D + 0.01, 0, Hh - 0.06, 0, '#5ab0ff');
    } else box(W + 0.02, 0.05, D + 0.02, 0, Hh, 0, '#a8743c');
    this.group.add(g);
    // porta (dobradiça à esquerda de quem olha)
    const d = new HingedDoor(kit, { ...at(0, y0 + 0.02, D / 2 - 0.05 + 0.02), color: cold ? '#f6f9fd' : '#d9a05a', label: () => (cold ? t('cozinha.fps.fridgeX', 'Geladeira · {x}', { x: ingName(id) }) : t('cozinha.fps.pantryX', 'Armário · {x}', { x: ingName(id) })), verb: (on) => (on ? t('cozinha.fps.close', 'Fechar') : t('cozinha.fps.open', 'Abrir')) }, W - 0.02, Hh - 0.04, -1, 6);
    // adesivo: ícone grande do ingrediente + nome
    const s = sticker('fr' + st.ing + (cold ? 1 : 0), 0.46, 0.56, 256, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#ffffff';
      c.strokeStyle = INK;
      c.lineWidth = 10;
      c.beginPath();
      c.roundRect(8, 8, w - 16, h - 16, 40);
      c.fill();
      c.stroke();
      c.save();
      c.translate(w / 2, h * 0.42);
      drawIng(c, st.ing, Vis.Raw, w * 0.3);
      c.restore();
      c.fillStyle = INK;
      c.font = gameFont(700, 38);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      let name = ingName(id);
      while (name.length > 3 && c.measureText(name).width > w - 30) name = name.slice(0, -1);
      c.fillText(name, w / 2, h * 0.82);
    });
    s.position.set(0, 0.04, 0.003);
    d.face.add(s);
    p.door = kit.add(d);
    this.owned.push({ dispose: () => g.parent?.remove(g) });
    // colisão do corpo do móvel (itens quicam nele)
    const bd = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(W / 2, Hh / 2, D / 2 - 0.06)), material: staticMat });
    const [bx, bz] = P(0, -0.11);
    bd.position.set(bx, y0 + Hh / 2, bz);
    bd.quaternion.setFromEuler(0, yaw, 0);
    world.addBody(bd);
  }

  update(dt: number, time: number): void {
    this.kit.update(dt, time);
  }
  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.kit.dispose();
    this.group.parent?.remove(this.group);
  }
}
