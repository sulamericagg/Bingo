/* ============================================================
 *  CAVA & FALA — OBJETO FALADO: "fale qualquer coisa e ela aparece".
 *  Fluxo: "Ouvi: <frase>" → pedido seguro (kidSafeRequest) → gerador
 *  DETERMINÍSTICO no aparelho (shared/cavagen) → paga em blocos com o
 *  material cavado → os blocos voam das costas e montam o objeto.
 *  Só quando sobra palavra desconhecida o servidor (POST /api/cava/make,
 *  IA) é chamado em segundo plano: a resposta "melhora" o objeto (pop)
 *  e fica guardada para funcionar offline da próxima vez.
 *  Também: Refazer (variação), Guardar (galeria com miniaturas),
 *  montar/dirigir e o envio para os outros jogadores (online).
 * ============================================================ */
import * as THREE from 'three';
import { getLang, t } from '../../i18n';
import { notify } from '../../ui/notify';
import { sfx } from '../../3d/common/sfx';
import { tap } from '../../core/haptics';
import { apiBase } from '../../services/leaderboard';
import { getPlayer } from '../../services/online';
import { clubActive, passPremiumActive } from '../../services/ads';
import { kidSafeRequest, packSpec, unpackSpec, validateSpec, type ObjSpec, type PackedSpec } from '../../../shared/cavaspec';
import { generate, type Fn, type NounPlan } from '../../../shared/cavagen';
import { M, matColor, matName, type Inv } from './data';
import { Creation, buildBlocks } from './creation';
import { voxelCost, voxelize } from './voxel';
import type { Actor, World } from './world';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const V1 = new THREE.Vector3();

/* ------------------------------ armazenamento local ------------------------------ */
const GAL_KEY = 'bw-cavafala-gal';
const LEARN_KEY = 'bw-cavafala-learn';
const PHRASE_KEY = 'bw-cavafala-phrase';
export interface GalItem {
  id: string;
  text: string;
  name: string;
  spec: PackedSpec;
  thumb: string;
  at: number;
}
function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
}
function save(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sem espaço: tudo bem */
  }
}
export const gallery = (): GalItem[] => load<GalItem[]>(GAL_KEY, []);
const GAL_MAX = 24;

/** custo de uma criação (blocos) em materiais do solo */
function toInv(c: ReturnType<typeof voxelCost>, inv: Inv, half: boolean): Inv | null {
  const k = half ? 0.5 : 1;
  const need: Inv = {};
  // material "mole": tira do que você tem mais (terra, argila, areia, grama)
  let soft = Math.ceil(c.soft * k);
  const softs = [M.Terra, M.Argila, M.Areia, M.Grama].sort((a, b) => (inv[b] ?? 0) - (inv[a] ?? 0));
  for (const m of softs) {
    if (soft <= 0) break;
    const take = Math.min(soft, Math.floor(inv[m] ?? 0));
    if (take > 0) (need[m] = take), (soft -= take);
  }
  if (soft > 0) need[softs[0]] = (need[softs[0]] ?? 0) + soft;
  if (c.stone) need[M.Pedra] = Math.ceil(c.stone * k);
  if (c.crystal) need[M.Cristal] = Math.ceil(c.crystal * k);
  if (c.gold) need[M.Ouro] = Math.ceil(c.gold * k);
  return need;
}
const canPay = (inv: Inv, c: Inv) => Object.entries(c).every(([k, v]) => (inv[+k] ?? 0) >= v);

export interface AiReply {
  spec: ObjSpec;
  plan?: { main?: Partial<NounPlan> } | null;
  source: string;
  learn?: Record<string, Partial<NounPlan>>;
}

/** pede o objeto ao servidor (IA) — null se offline/sem resposta/barrado */
export async function askServer(text: string, lang: string, seed: number, arena: boolean, signal?: AbortSignal): Promise<AiReply | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(`${apiBase()}/api/cava/make`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, lang, seed, pid: getPlayer()?.id ?? '', ent: clubActive() || passPremiumActive() ? 'club' : 'free' }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const b = (await res.json().catch(() => null)) as { spec?: unknown; plan?: AiReply['plan']; source?: string; learn?: AiReply['learn'] } | null;
    if (!b?.spec) return null;
    const spec = validateSpec(b.spec, { arena });
    return spec ? { spec, plan: b.plan, source: String(b.source ?? 'ai'), learn: b.learn } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface Made {
  c: Creation;
  text: string;
  safeText: string;
  redo: number;
  improving: boolean;
}

export class Maker {
  readonly list: Creation[] = [];
  riding: Creation | null = null;
  private made = new Map<string, Made>();
  private seq = 0;
  private pill: HTMLDivElement;
  private card: HTMLDivElement;
  private mountBtn: HTMLButtonElement;
  private cardT = 0;
  private focus: Made | null = null;
  private learned = load<Record<string, Partial<NounPlan>>>(LEARN_KEY, {});
  private phrases = load<Record<string, PackedSpec>>(PHRASE_KEY, {});
  private aborts: AbortController[] = [];
  /** últimos objetos criados (testes) */
  lastSpec: ObjSpec | null = null;
  lastSource = '';

  constructor(private w: World) {
    const hud = w.hud.el;
    this.pill = document.createElement('div');
    this.pill.className = 'cf-make';
    this.card = document.createElement('div');
    this.card.className = 'cf-mcard';
    this.card.dataset.touchIgnore = '';
    this.mountBtn = document.createElement('button');
    this.mountBtn.className = 'cf-mount';
    this.mountBtn.addEventListener('click', () => (this.riding ? this.dismount() : this.mountNear()));
    hud.append(this.pill, this.card, this.mountBtn);
  }

  /* ------------------------------ criar pela frase ------------------------------ */
  /** cria o objeto que a frase descreve. Devolve true se começou a montar. */
  make(text: string, how: 'voice' | 'type'): boolean {
    const w = this.w;
    const lang = getLang();
    const safe = kidSafeRequest(text, lang === 'en' ? 'en' : 'pt');
    if (safe.level !== 'ok') {
      notify(t('cavafala.obj.safe', 'Vamos criar algo divertido no lugar! ✨'), { icon: 'sparkle', key: 'objsafe' });
      // registra o pedido barrado (só texto) para a moderação
      void askServer(text, lang, 0, w.arena).catch(() => null);
    }
    const gen = generate(safe.text, { lang, learned: this.learned });
    const cached = this.phrases[cacheKeyLocal(safe.text, lang)];
    let spec = gen.spec;
    let src = 'lib';
    if (cached) {
      const s = unpackSpec(cached, { arena: w.arena });
      if (s) (spec = s), (src = 'cache');
    }
    if (w.arena) spec = validateSpec(spec, { arena: true }) ?? spec;
    const c = this.spawnPaid(w.me, spec, gen.fn, safe.text, 0, false);
    if (!c) return false;
    this.lastSpec = spec;
    this.lastSource = src;
    const m: Made = { c, text, safeText: safe.text, redo: 0, improving: false };
    this.made.set(c.uid, m);
    this.focus = m;
    this.showPill(spec.name, false);
    if (how === 'voice') tap('light');
    // palavra desconhecida e com internet: a IA tenta melhorar em segundo plano
    if (src === 'lib' && safe.level !== 'block' && (gen.confidence < 0.6 || gen.unknown.length) && navigator.onLine !== false) this.improve(m, gen.unknown);
    return true;
  }

  /** IA em segundo plano → troca o objeto ("pop") e aprende a palavra */
  private improve(m: Made, unknown: string[]): void {
    const w = this.w;
    m.improving = true;
    const ac = new AbortController();
    this.aborts.push(ac);
    const lang = getLang();
    void askServer(m.safeText, lang, hashText(m.safeText), w.arena, ac.signal).then((r) => {
      m.improving = false;
      if (!r || m.c.dead || ac.signal.aborted) {
        if (this.focus === m) this.showPill(m.c.spec.name, false);
        return;
      }
      // aprende: frase inteira e palavras novas (funciona offline depois)
      this.phrases[cacheKeyLocal(m.safeText, lang)] = packSpec(r.spec);
      const keys = Object.keys(this.phrases);
      if (keys.length > 150) delete this.phrases[keys[0]];
      save(PHRASE_KEY, this.phrases);
      if (r.learn) for (const [k, v] of Object.entries(r.learn)) this.learned[k] = v;
      else if (r.plan?.main?.id && unknown.length === 1) this.learned[unknown[0]] = r.plan.main;
      const lk = Object.keys(this.learned);
      if (lk.length > 300) delete this.learned[lk[0]];
      save(LEARN_KEY, this.learned);
      m.c.replace(r.spec, m.c.fn, m.c.variant, null);
      this.lastSpec = r.spec;
      this.lastSource = r.source;
      this.w.net?.obj?.(w.me, m.c.uid, packSpec(r.spec), m.c.pos, m.c.root.rotation.y, m.safeText);
      if (this.focus === m) this.showPill(r.spec.name, false);
      notify(t('cavafala.obj.improved', 'A magia deixou ainda melhor!'), { kind: 'good', key: 'objup', icon: 'sparkle' });
      sfx.sparkle();
    });
    if (this.focus === m) this.showPill(m.c.spec.name, true);
  }

  /** paga (encolhe se faltar um pouco) e coloca na frente do Bloop */
  spawnPaid(a: Actor, spec: ObjSpec, fn: Fn | undefined, text: string, variant: number, half: boolean): Creation | null {
    const w = this.w;
    let s = spec;
    let vx = voxelize(s);
    let need = toInv(voxelCost(vx, w.arena), a.inv, half)!;
    let shrunk = false;
    for (const k of [0.75, 0.55]) {
      if (canPay(a.inv, need)) break;
      const sm = validateSpec(JSON.parse(JSON.stringify(spec)), { arena: w.arena })!;
      for (const p of sm.parts) (p.size = p.size.map((v) => v * k) as typeof p.size), (p.pos = p.pos.map((v) => v * k) as typeof p.pos), p.joint?.pivot && (p.joint.pivot = p.joint.pivot.map((v) => v * k) as typeof p.pos);
      if (sm.seat) sm.seat = sm.seat.map((v) => v * k) as typeof sm.seat;
      s = sm;
      vx = voxelize(s);
      need = toInv(voxelCost(vx, w.arena), a.inv, half)!;
      shrunk = true;
    }
    if (!canPay(a.inv, need)) {
      if (a.isPlayer) {
        const miss = Object.entries(need)
          .filter(([k, v]) => (a.inv[+k] ?? 0) < v)
          .map(([k, v]) => `${Math.ceil(v - (a.inv[+k] ?? 0))} ${matName(+k, w.theme ?? undefined)}`)
          .join(', ');
        notify(t('cavafala.obj.need', '{g}: faltam blocos ({m}). Cave mais!', { g: spec.name, m: miss }), { kind: 'warn', ms: 3800 });
        sfx.drop();
      }
      return null;
    }
    for (const [k, v] of Object.entries(need)) a.inv[+k] = Math.max(0, (a.inv[+k] ?? 0) - v);
    if (a.isPlayer) {
      w.hud.setInv(a.inv);
      if (shrunk) notify(t('cavafala.obj.shrunk', 'Faltou material: fiz um pouco menor!'), { key: 'objsmall', ms: 2600 });
    }
    const uid = (a.nid ?? 'me') + ':' + Date.now().toString(36) + (++this.seq).toString(36);
    const c = this.place(a, s, fn, uid, text, variant, null, null, true);
    c.cost = Object.values(need).reduce((n, v) => n + (v ?? 0), 0);
    w.net?.obj?.(a, uid, packSpec(s), a.body.p, a.yaw, text);
    w.created++;
    return c;
  }

  /** põe o objeto no mundo (sem pagar): na frente de quem criou, no chão */
  place(a: Actor | null, spec: ObjSpec, fn: Fn | undefined, uid: string, text: string, variant: number, at: THREE.Vector3 | null, yawIn: number | null, animate: boolean): Creation {
    const w = this.w;
    const vx = voxelize(spec);
    const yaw = yawIn ?? (a ? a.yaw + Math.PI : 0);
    const fwd = V1.set(Math.sin(yaw), 0, Math.cos(yaw));
    let pos: THREE.Vector3;
    if (at) pos = at.clone();
    else {
      const o = a ? a.body.p : w.me.body.p;
      const dist = 1.3 - vx.min[2] + (spec.body === 'static' ? 0 : 0.4);
      pos = o.clone().addScaledVector(fwd, dist);
      const gy = w.T.groundY(pos.x, pos.z, o.y + 3, o.y - 8);
      pos.y = gy > -Infinity ? gy + (spec.body === 'static' ? -0.05 : 0.15) : o.y;
    }
    const from = a ? w.backpackOf(a, new THREE.Vector3()) : null;
    const c = new Creation(w, { uid, spec, owner: a, pos, yaw, animate, fn, text, variant, from });
    this.list.push(c);
    w.refreshBoxes();
    // limite: arena 2 por Bloop, vila 10 (o mais velho some)
    const max = w.arena ? 2 : 10;
    const mine = this.list.filter((x) => x.owner === a && !x.dead && x.vanish === 0);
    if (mine.length > max) mine[0].poof();
    if (w.isNear(pos.x, pos.y, pos.z)) sfx.whoosh();
    return c;
  }

  /** objeto que alguém de outro aparelho criou (mesmo lugar, sem pagar) */
  netSpawn(a: Actor, packed: unknown, uid: string, x: number, y: number, z: number, yaw: number, text: string): void {
    const spec = unpackSpec(packed, { arena: this.w.arena });
    if (!spec) return;
    const old = this.list.find((c) => c.uid === uid);
    if (old) {
      old.replace(spec, old.fn, old.variant + 1, null);
      return;
    }
    a.body.p.set(x, y, z);
    a.yaw = yaw;
    if (!a.voiceAt || performance.now() - a.voiceAt > 2500) a.model?.say(spec.name + '!', 1800);
    this.place(a, spec, undefined, uid, text, 0, null, yaw + Math.PI, true);
  }

  /* ------------------------------ Refazer / Guardar / Galeria ------------------------------ */
  redo(): void {
    const m = this.focus;
    if (!m || m.c.dead || m.redo >= 6) return;
    m.redo++;
    const gen = generate(m.safeText, { lang: getLang(), variant: m.redo, learned: this.learned });
    let spec = gen.spec;
    if (this.w.arena) spec = validateSpec(spec, { arena: true }) ?? spec;
    m.c.replace(spec, gen.fn, m.redo, this.w.backpackOf(this.w.me, new THREE.Vector3()));
    this.w.net?.obj?.(this.w.me, m.c.uid, packSpec(spec), m.c.pos, m.c.root.rotation.y, m.safeText);
    this.lastSpec = spec;
    this.showPill(spec.name, false);
    sfx.swish();
  }
  keep(): void {
    const m = this.focus;
    if (!m) return;
    const g = gallery();
    if (g.some((x) => JSON.stringify(x.spec) === JSON.stringify(packSpec(m.c.spec)))) {
      notify(t('cavafala.obj.already', 'Já está na sua galeria!'), { key: 'galdup' });
      return;
    }
    g.unshift({ id: m.c.uid, text: m.text, name: m.c.spec.name, spec: packSpec(m.c.spec), thumb: this.thumb(m.c.spec), at: Date.now() });
    if (g.length > GAL_MAX) g.length = GAL_MAX;
    save(GAL_KEY, g);
    notify(t('cavafala.obj.saved', 'Guardado na galeria! Chame de novo pela metade do material.'), { kind: 'good', key: 'galsave', icon: 'star' });
    sfx.yay();
    this.renderCard(m);
  }
  thumb(spec: ObjSpec): string {
    const b = buildBlocks(voxelize(spec));
    return this.w.renderThumb(b.tilt, 2.4);
  }
  /** painel da galeria */
  openGallery(): void {
    const w = this.w;
    if (w.hud.overlay) w.hud.closePanel();
    w.paused = true;
    const g = gallery();
    const d = w.hud.panel(`<div class="cf-card cf-gal">
      <h2>${esc(t('cavafala.obj.gallery', 'Minhas criações'))}</h2>
      ${g.length ? `<p>${esc(t('cavafala.obj.galHint', 'Toque para chamar de novo (metade do material).'))}</p>` : `<p>${esc(t('cavafala.obj.galEmpty', 'Nada guardado ainda. Crie algo falando e toque em GUARDAR!'))}</p>`}
      <div class="cf-galg">${g
        .map((it, i) => {
          const spec = unpackSpec(it.spec);
          const need = spec ? toInv(voxelCost(voxelize(spec), w.arena), w.me.inv, true)! : {};
          const chips = Object.entries(need)
            .map(([k, v]) => `<span class="cf-cost${(w.me.inv[+k] ?? 0) >= v ? '' : ' no'}"><i style="--c:${matColor(+k, w.theme ?? undefined)}"></i>${v}</span>`)
            .join('');
          return `<div class="cf-gi"><button class="cf-gb" data-i="${i}"><img src="${it.thumb}" alt=""/><b>${esc(it.name)}</b><span>${chips}</span></button><button class="cf-gx" data-x="${i}" aria-label="x">×</button></div>`;
        })
        .join('')}</div>
      <div class="cf-row"><button class="cf-btn w" data-a="x">${esc(t('cavafala.close', 'Fechar'))}</button></div></div>`);
    const close = () => {
      w.hud.closePanel();
      w.paused = false;
    };
    d.querySelector('[data-a=x]')!.addEventListener('click', close);
    d.querySelectorAll<HTMLButtonElement>('.cf-gb').forEach((b) =>
      b.addEventListener('click', () => {
        const it = gallery()[+b.dataset.i!];
        const spec = it && unpackSpec(it.spec, { arena: w.arena });
        close();
        if (!spec) return;
        const c = this.spawnPaid(w.me, spec, undefined, it.text, 0, true);
        if (c) {
          const m: Made = { c, text: it.text, safeText: kidSafeRequest(it.text).text, redo: 0, improving: false };
          this.made.set(c.uid, m);
          this.focus = m;
          this.showPill(spec.name, false);
          w.hud.heard(it.text, true, spec.name);
        }
      }),
    );
    d.querySelectorAll<HTMLButtonElement>('.cf-gx').forEach((b) =>
      b.addEventListener('click', () => {
        const gg = gallery();
        gg.splice(+b.dataset.x!, 1);
        save(GAL_KEY, gg);
        this.openGallery();
      }),
    );
    d.addEventListener('pointerdown', (e) => {
      if (e.target === d) close();
    });
  }

  /* ------------------------------ interface ------------------------------ */
  private showPill(name: string, improving: boolean): void {
    this.pill.innerHTML = `<span class="cf-mk-s">✨</span><b>${esc(improving ? t('cavafala.obj.improving', 'Melhorando com magia…') : t('cavafala.obj.creating', 'Criando…'))}</b><em>${esc(name)}</em><i><u></u></i>`;
    this.pill.classList.add('on');
    this.pill.classList.toggle('magic', improving);
    this.card.classList.remove('on');
  }
  private renderCard(m: Made): void {
    const c = m.c;
    const saved = gallery().some((x) => JSON.stringify(x.spec) === JSON.stringify(packSpec(c.spec)));
    this.card.innerHTML = `<div class="cf-mc-t"><b>${esc(c.spec.name)}</b><small>${esc(c.spec.desc)}</small><em>${esc(t('cavafala.obj.blocks', '{n} blocos', { n: c.vx.count }))}</em></div>
      <div class="cf-mc-b"><button class="cf-btn o" data-a="redo">${esc(t('cavafala.obj.redo', 'Refazer'))}</button><button class="cf-btn g" data-a="keep"${saved ? ' disabled' : ''}>${esc(saved ? t('cavafala.obj.kept', 'Guardado') : t('cavafala.obj.keep', 'Guardar'))}</button><button class="cf-btn w" data-a="gal">${esc(t('cavafala.obj.galleryShort', 'Galeria'))}</button></div>`;
    this.card.querySelector('[data-a=redo]')!.addEventListener('click', () => this.redo());
    this.card.querySelector('[data-a=keep]')!.addEventListener('click', () => this.keep());
    this.card.querySelector('[data-a=gal]')!.addEventListener('click', () => this.openGallery());
    this.card.classList.add('on');
    this.cardT = 8;
  }

  /* ------------------------------ montar ------------------------------ */
  private nearRide(): Creation | null {
    const me = this.w.me;
    let best: Creation | null = null;
    let bd = 3.6;
    for (const c of this.list) {
      if (!c.rideable || c.dead || c.vanish > 0 || c.rider || c.assembling > 0) continue;
      const d = Math.hypot(c.pos.x - me.body.p.x, c.pos.z - me.body.p.z) - Math.max(c.vx.max[0], c.vx.max[2]) * 0.5;
      if (d < bd && Math.abs(c.pos.y - me.body.p.y) < 4) (bd = d), (best = c);
    }
    return best;
  }
  mountNear(): void {
    const c = this.nearRide();
    if (!c) return;
    this.riding = c;
    c.rider = this.w.me;
    this.w.me.mounted = true;
    sfx.boing();
    tap('medium');
    notify(t('cavafala.obj.rideHint', 'Use o direcional para dirigir. Olhe para cima/baixo para subir ou descer voando.'), { key: 'ridehint', ms: 3000 });
  }
  dismount(): void {
    const c = this.riding;
    this.riding = null;
    const me = this.w.me;
    me.mounted = false;
    if (!c) return;
    c.rider = null;
    c.drive.set(0, 0, 0);
    // desce do lado
    const yaw = c.body ? c.body.yaw : c.root.rotation.y;
    me.body.p.set(c.pos.x + Math.cos(yaw) * (c.vx.max[0] + 0.8), c.pos.y + 0.5, c.pos.z - Math.sin(yaw) * (c.vx.max[0] + 0.8));
    me.body.v.set(0, 4, 0);
    sfx.pop();
  }
  /** jogador montado: preso no assento; o direcional vira o volante */
  pinRider(a: Actor, move: THREE.Vector3, pitch: number, jump: boolean): void {
    const c = this.riding!;
    if (c.dead || c.vanish > 0) {
      this.dismount();
      return;
    }
    c.drive.copy(move);
    c.driveUp = c.beh.has('flies') ? Math.max(-1, Math.min(1, Math.sin(pitch) * 1.6 * Math.max(0.3, move.length()) + (jump ? 1 : 0))) : 0;
    c.seatWorld(a.body.p);
    a.body.p.y += 0.05;
    if (c.body) a.body.v.copy(c.body.v);
    a.body.onGround = true;
    a.body.groundBox = null;
    if (jump && !c.beh.has('flies') && c.body?.onGround) c.body.v.y = 6;
  }

  /* ------------------------------ por quadro ------------------------------ */
  update(dt: number): void {
    const w = this.w;
    let changed = false;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      // Bloop de outro aparelho montado no próprio objeto: o objeto vai junto
      const o = c.owner;
      if (o?.remote && c.rideable && c.body && ((o.netF ?? 0) & 4) && o.body.p.distanceTo(c.pos) < 5) {
        c.body.p.lerp(V1.copy(o.body.p).setY(o.body.p.y - (c.spec.seat?.[1] ?? 1)), Math.min(1, dt * 8));
        c.body.yaw = o.yaw + Math.PI;
        c.body.v.set(0, 0, 0);
      }
      c.update(dt);
      if (c.dead) {
        if (this.riding === c) this.dismount();
        c.dispose();
        this.list.splice(i, 1);
        this.made.delete(c.uid);
        if (this.focus?.c === c) this.focus = null;
        changed = true;
      }
    }
    if (changed) w.refreshBoxes();
    // pílula "Criando…" → cartão com Refazer/Guardar
    const f = this.focus;
    if (f && this.pill.classList.contains('on')) {
      const k = f.c.assembling > 0 ? f.c.assembling / f.c.asmDur : 1;
      const bar = this.pill.querySelector('u') as HTMLElement | null;
      if (bar) bar.style.width = Math.round(Math.min(1, k) * 100) + '%';
      if (f.c.assembling === 0 && !f.improving) {
        this.pill.classList.remove('on');
        this.renderCard(f);
      }
    }
    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) this.card.classList.remove('on');
    }
    // botão Montar/Descer
    const near = !this.riding && !w.hud.overlay ? this.nearRide() : null;
    const show = !!this.riding || !!near;
    this.mountBtn.classList.toggle('on', show);
    if (show) {
      const label = this.riding ? t('cavafala.obj.getOff', 'Descer') : t('cavafala.obj.ride', 'Montar');
      if (this.mountBtn.textContent !== label) this.mountBtn.textContent = label;
    }
  }

  /** estado para os testes (?debug) */
  state(): { n: number; names: string[]; riding: boolean; last: ObjSpec | null; source: string; blocks: number[] } {
    return { n: this.list.length, names: this.list.map((c) => c.spec.name), riding: !!this.riding, last: this.lastSpec, source: this.lastSource, blocks: this.list.map((c) => c.vx.count) };
  }
  focusCreation(): Creation | null {
    return this.focus?.c ?? null;
  }

  dispose(): void {
    for (const a of this.aborts) a.abort();
    for (const c of this.list) c.dispose();
    this.list.length = 0;
    this.pill.remove();
    this.card.remove();
    this.mountBtn.remove();
  }
}

function hashText(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function cacheKeyLocal(text: string, lang: string): string {
  return lang + ':' + text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
