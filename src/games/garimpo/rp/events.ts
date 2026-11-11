/* ============================================================
 *  GARIMPO — EVENTOS ALEATÓRIOS (dados + gerador combinatório).
 *  ~90 modelos escritos à mão × variações (lugar: estrada/acampamento/mina/cidade;
 *  hora: dia/noite; tempo: sol/nublado/chuva/temporal; dificuldade; veículo; variante
 *  do modelo, ex.: qual bicho) × resultados com números que dependem da dificuldade.
 *  Cada evento concreto = cartão com ícone, título, 1 frase, chips de contexto e
 *  2–3 escolhas com ícone. Pesos, tempo de espera por modelo e penalidade para o
 *  que apareceu há pouco (sem cansar de repetição). Tudo traduzível (t() literal).
 *  `enumerateEvents()` lista todos os eventos concretos possíveis (script de contagem).
 * ============================================================ */
import { t } from '../../../i18n';
import type { SkyKind } from '../weather';
import type { RIcon } from './icons';
import type { ItemId } from './state';

export type Loc = 'road' | 'camp' | 'mine' | 'town';
export type Veh = 'foot' | 'light' | 'heavy' | 'heli' | 'rig';
export type Cat = 'road' | 'camp' | 'weather' | 'spooky' | 'town';

/** efeitos (dinheiro já em R$ "base": o gerador escala pela dificuldade) */
export interface Fx {
  m?: number;
  h?: number;
  fuel?: number;
  food?: number;
  water?: number;
  energy?: number;
  stam?: number;
  it?: [ItemId, number];
  gold?: number;
  /** fração do estoque (negativa = perde) */
  stockK?: number;
  xp?: number;
  dmg?: number;
  /** fração da carga da carreta (negativa = perde) */
  cargoK?: number;
  rumor?: boolean;
  fire?: boolean;
  fog?: boolean;
  sky?: SkyKind;
  /** bônus no preço do ouro (fração, próxima venda) */
  price?: number;
  /** encher o tanque pagando (preço por litro multiplicado) */
  fill?: number;
  repair?: boolean;
  heart?: boolean;
  /** frase do resultado (chave em OUT) */
  say?: OutKey;
}
export interface Choice {
  ic: RIcon;
  l: LabelKey;
  /** custo pago antes (R$ base) */
  cost?: number;
  need?: ItemId;
  /** chance de dar certo (padrão 1) */
  p?: number;
  ok: Fx;
  bad?: Fx;
}
export interface Ctx {
  loc: Loc;
  night: boolean;
  sky: SkyKind;
  diff: number;
  veh: Veh;
  spooky: boolean;
  /** condições dinâmicas (só no jogo; o enumerador considera tudo possível) */
  heat?: boolean;
  dry?: boolean;
  tired?: boolean;
  hungry?: boolean;
  over?: boolean;
  stock?: boolean;
  trip?: boolean;
  dawn?: boolean;
  lowFuel?: boolean;
}
export interface Variant {
  k: string;
  icon?: RIcon;
  name: () => string;
}
export interface Tpl {
  id: string;
  cat: Cat;
  icon: RIcon;
  where: Loc[];
  time?: 'day' | 'night';
  sky?: SkyKind[];
  veh?: Veh[];
  minDiff?: number;
  /** pode aparecer no fácil */
  gentle?: boolean;
  /** evento do time todo (MP: o anfitrião decide e todos veem) */
  team?: boolean;
  w: number;
  /** espera mínima (h de jogo) até repetir */
  cd: number;
  vars?: Variant[];
  cond?: (c: Ctx) => boolean;
  title: () => string;
  text: () => string;
  ch: (c: Ctx, v: Variant | null) => Choice[];
}

/* ---------------- rótulos das escolhas ---------------- */
const LABELS = {
  pay: () => t('gb.ev.c.pay', 'Pagar'),
  refuse: () => t('gb.ev.c.refuse', 'Recusar'),
  help: () => t('gb.ev.c.help', 'Ajudar'),
  ignore: () => t('gb.ev.c.ignore', 'Seguir em frente'),
  kit: () => t('gb.ev.c.kit', 'Usar o kit'),
  mech: () => t('gb.ev.c.mech', 'Chamar o mecânico'),
  wait: () => t('gb.ev.c.wait', 'Esperar'),
  slow: () => t('gb.ev.c.slow', 'Ir devagar'),
  detour: () => t('gb.ev.c.detour', 'Pegar o desvio'),
  honk: () => t('gb.ev.c.honk', 'Buzinar'),
  photo: () => t('gb.ev.c.photo', 'Tirar foto'),
  strap: () => t('gb.ev.c.strap', 'Usar a cinta'),
  show: () => t('gb.ev.c.show', 'Mostrar documentos'),
  weigh: () => t('gb.ev.c.weigh', 'Pesar'),
  lighten: () => t('gb.ev.c.lighten', 'Aliviar a carga'),
  ride: () => t('gb.ev.c.ride', 'Dar carona'),
  stop: () => t('gb.ev.c.stop', 'Parar um pouco'),
  eat: () => t('gb.ev.c.eat', 'Comer'),
  coffee: () => t('gb.ev.c.coffee', 'Tomar um café'),
  answer: () => t('gb.ev.c.answer', 'Responder'),
  listen: () => t('gb.ev.c.listen', 'Só ouvir'),
  join: () => t('gb.ev.c.join', 'Ir junto'),
  alone: () => t('gb.ev.c.alone', 'Ir sozinho'),
  shoulder: () => t('gb.ev.c.shoulder', 'Ir pelo acostamento'),
  hold: () => t('gb.ev.c.hold', 'Segurar firme'),
  fix: () => t('gb.ev.c.fix', 'Consertar'),
  fill: () => t('gb.ev.c.fill', 'Encher o tanque'),
  water: () => t('gb.ev.c.water', 'Dar água'),
  nap: () => t('gb.ev.c.nap', 'Cochilar'),
  window: () => t('gb.ev.c.window', 'Abrir a janela'),
  go: () => t('gb.ev.c.go', 'Ir ver'),
  buy: () => t('gb.ev.c.buy', 'Comprar'),
  sell: () => t('gb.ev.c.sell', 'Vender'),
  lights: () => t('gb.ev.c.lights', 'Acender as luzes'),
  police: () => t('gb.ev.c.police', 'Chamar a polícia'),
  guard: () => t('gb.ev.c.guard', 'Vigiar a noite'),
  pump: () => t('gb.ev.c.pump', 'Bombear'),
  run: () => t('gb.ev.c.run', 'Correr'),
  drink: () => t('gb.ev.c.drink', 'Beber água'),
  shade: () => t('gb.ev.c.shade', 'Descansar na sombra'),
  work: () => t('gb.ev.c.work', 'Trabalhar assim mesmo'),
  keep: () => t('gb.ev.c.keep', 'Guardar'),
  pan: () => t('gb.ev.c.pan', 'Bater a bateia'),
  around: () => t('gb.ev.c.around', 'Dar a volta'),
  party: () => t('gb.ev.c.party', 'Ir para a festa'),
  sleep: () => t('gb.ev.c.sleep', 'Dormir cedo'),
  ask: () => t('gb.ev.c.ask', 'Pedir conselho'),
  dark: () => t('gb.ev.c.dark', 'Ficar no escuro'),
  push: () => t('gb.ev.c.push', 'Empurrar'),
  wish: () => t('gb.ev.c.wish', 'Fazer um pedido'),
  give: () => t('gb.ev.c.give', 'Dar'),
  near: () => t('gb.ev.c.near', 'Chegar perto'),
  far: () => t('gb.ev.c.far', 'Ficar longe'),
  flash: () => t('gb.ev.c.flash', 'Piscar o farol'),
  speed: () => t('gb.ev.c.speed', 'Acelerar'),
  let: () => t('gb.ev.c.let', 'Deixar passar'),
  torch: () => t('gb.ev.c.torch', 'Acender a lanterna'),
  fireplace: () => t('gb.ev.c.fireplace', 'Ficar perto da fogueira'),
  explore: () => t('gb.ev.c.explore', 'Explorar'),
  brake: () => t('gb.ev.c.brake', 'Frear'),
  follow: () => t('gb.ev.c.follow', 'Seguir as pegadas'),
  back: () => t('gb.ev.c.back', 'Voltar'),
  louder: () => t('gb.ev.c.louder', 'Aumentar o som'),
  off: () => t('gb.ev.c.off', 'Desligar'),
  wave: () => t('gb.ev.c.wave', 'Acenar'),
  leave: () => t('gb.ev.c.leave', 'Sair dali'),
  accept: () => t('gb.ev.c.accept', 'Aceitar'),
  repair: () => t('gb.ev.c.repair', 'Fazer revisão'),
  shower: () => t('gb.ev.c.shower', 'Tomar banho'),
  try: () => t('gb.ev.c.try', 'Tentar a sorte'),
  protect: () => t('gb.ev.c.protect', 'Se proteger'),
  blanket: () => t('gb.ev.c.blanket', 'Comprar cobertor'),
  save: () => t('gb.ev.c.save', 'Economizar'),
  chase: () => t('gb.ev.c.chase', 'Correr atrás'),
  letgo: () => t('gb.ev.c.letgo', 'Deixar ir'),
  candy: () => t('gb.ev.c.candy', 'Deixar um docinho'),
  closeEyes: () => t('gb.ev.c.closeEyes', 'Fechar os olhos'),
  ok: () => t('gb.ev.c.ok', 'Entendi'),
  pose: () => t('gb.ev.c.pose', 'Posar para a foto'),
  share: () => t('gb.ev.c.share', 'Dividir'),
  hide: () => t('gb.ev.c.hide', 'Guardar as máquinas'),
};
export type LabelKey = keyof typeof LABELS;
export const label = (k: LabelKey): string => LABELS[k]();

/* ---------------- frases do resultado ---------------- */
const OUT = {
  good: () => t('gb.ev.o.good', 'Deu tudo certo!'),
  lucky: () => t('gb.ev.o.lucky', 'Que sorte!'),
  phew: () => t('gb.ev.o.phew', 'Ufa, passou!'),
  bad: () => t('gb.ev.o.bad', 'Ih, não deu certo...'),
  thanks: () => t('gb.ev.o.thanks', 'Muito obrigado, amigo!'),
  slow: () => t('gb.ev.o.slow', 'Demorou um pouquinho.'),
  safe: () => t('gb.ev.o.safe', 'Melhor prevenir!'),
  fine: () => t('gb.ev.o.fine', 'Levou uma multa.'),
  fireflies: () => t('gb.ev.o.fireflies', 'Eram vaga-lumes! Que lindo!'),
  dog: () => t('gb.ev.o.dog', 'Era só um cachorrão peludo!'),
  owl: () => t('gb.ev.o.owl', 'Era uma coruja curiosa!'),
  wolf: () => t('gb.ev.o.wolf', 'Era um lobo-guará, bicho tímido do cerrado!'),
  vanish: () => t('gb.ev.o.vanish', 'Sumiu... deve ter sido impressão.'),
  wind: () => t('gb.ev.o.wind', 'Era só o vento!'),
  honkBack: () => t('gb.ev.o.honkBack', 'Ele buzinou de volta... e sumiu na curva!'),
  found: () => t('gb.ev.o.found', 'Achou algo útil!'),
  yum: () => t('gb.ev.o.yum', 'Delícia!'),
  rest: () => t('gb.ev.o.rest', 'Descansou um pouco.'),
  nothing: () => t('gb.ev.o.nothing', 'Nada aconteceu.'),
  rumor: () => t('gb.ev.o.rumor', 'A seta mostra o lugar do boato!'),
  fire: () => t('gb.ev.o.fire', 'Fogo! Apague com água!'),
};
export type OutKey = keyof typeof OUT;
export const outText = (k: OutKey): string => OUT[k]();

/* ---------------- contexto (chips) ---------------- */
export const LOC_NAME: Record<Loc, () => string> = {
  road: () => t('gb.ev.loc.road', 'Estrada'),
  camp: () => t('gb.ev.loc.camp', 'Acampamento'),
  mine: () => t('gb.ev.loc.mine', 'Garimpo'),
  town: () => t('gb.ev.loc.town', 'Cidade'),
};
export const SKY_NAME: Record<SkyKind, () => string> = {
  clear: () => t('gb.wx.clear', 'Sol'),
  cloudy: () => t('gb.wx.cloudy', 'Nublado'),
  rain: () => t('gb.wx.rain', 'Chuva'),
  storm: () => t('gb.wx.storm', 'Temporal'),
};
export const SKY_ICON: Record<SkyKind, RIcon> = { clear: 'sun', cloudy: 'sunCloud', rain: 'rain', storm: 'storm' };
export const LOC_ICON: Record<Loc, RIcon> = { road: 'road', camp: 'station', mine: 'nugget', town: 'pin' };

/* ---------------- variantes ---------------- */
const ANIMALS: Variant[] = [
  { k: 'capy', icon: 'capy', name: () => t('gb.ev.v.capy', 'Uma capivara') },
  { k: 'tapir', icon: 'tapir', name: () => t('gb.ev.v.tapir', 'Uma anta') },
  { k: 'ox', icon: 'ox', name: () => t('gb.ev.v.ox', 'Um boi') },
  { k: 'rhea', icon: 'capy', name: () => t('gb.ev.v.rhea', 'Uma ema') },
  { k: 'armadillo', icon: 'capy', name: () => t('gb.ev.v.armadillo', 'Um tatu') },
  { k: 'anteater', icon: 'tapir', name: () => t('gb.ev.v.anteater', 'Um tamanduá') },
];
const SUPPLIES: Variant[] = [
  { k: 'food', icon: 'food', name: () => t('gb.rp.it.marmita', 'Marmita') },
  { k: 'water', icon: 'water', name: () => t('gb.rp.it.agua', 'Garrafa de água') },
  { k: 'diesel', icon: 'jerry', name: () => t('gb.rp.it.jerry', 'Galão de diesel (20 L)') },
];
const TOOLS: Variant[] = [
  { k: 'kit', icon: 'tire', name: () => t('gb.rp.it.kit', 'Kit de pneu') },
  { k: 'cinta', icon: 'hitch', name: () => t('gb.rp.it.cinta', 'Cinta de reboque') },
  { k: 'lanterna', icon: 'lights', name: () => t('gb.rp.it.lanterna', 'Lanterna') },
];
const PARTS: Variant[] = [
  { k: 'hose', name: () => t('gb.ev.v.hose', 'mangueira') },
  { k: 'belt', name: () => t('gb.ev.v.belt', 'correia') },
  { k: 'battery', name: () => t('gb.ev.v.battery', 'bateria') },
];
const LEGENDS: Variant[] = [
  { k: 'saci', icon: 'howl', name: () => t('gb.ev.v.saci', 'o Saci') },
  { k: 'curupira', icon: 'eye', name: () => t('gb.ev.v.curupira', 'o Curupira') },
];

const ROAD: Veh[] = ['rig', 'light', 'heavy'];
const WET: SkyKind[] = ['rain', 'storm'];

/* ======================================================================
 *  MODELOS
 * ====================================================================== */
export const TEMPLATES: Tpl[] = [
  /* ------------------------------ ESTRADA ------------------------------ */
  {
    id: 'flat', cat: 'road', icon: 'tire', where: ['road'], veh: ROAD, w: 8, cd: 3,
    title: () => t('gb.ev.flat.t', 'Pneu furado!'),
    text: () => t('gb.ev.flat.x', 'Pof! Um pneu estourou.'),
    ch: () => [
      { ic: 'tire', l: 'kit', need: 'kit', ok: { h: 0.4, xp: 12, it: ['kit', -1], say: 'good' } },
      { ic: 'wrench', l: 'mech', cost: 90, ok: { h: 1, say: 'slow' } },
      { ic: 'run', l: 'slow', p: 0.55, ok: { h: 0.3, say: 'phew' }, bad: { dmg: 12, m: -60, say: 'bad' } },
    ],
  },
  {
    id: 'animal', cat: 'road', icon: 'capy', where: ['road', 'mine'], veh: ['rig', 'light', 'heavy'], w: 9, cd: 1.5, gentle: true, vars: ANIMALS,
    title: () => t('gb.ev.animal.t', 'Bicho na pista!'),
    text: () => t('gb.ev.animal.x', '{v} está atravessando bem na frente!'),
    ch: (c) => [
      { ic: 'heart', l: 'wait', ok: { h: 0.15, xp: 6, heart: true, say: 'good' } },
      { ic: 'horn', l: 'honk', p: 0.7, ok: { say: 'phew' }, bad: { h: 0.4, say: 'slow' } },
      ...(c.night ? [] : [{ ic: 'camera' as RIcon, l: 'photo' as LabelKey, ok: { h: 0.1, m: 25, say: 'lucky' as OutKey } }]),
    ],
  },
  {
    id: 'tree', cat: 'road', icon: 'tree', where: ['road', 'mine'], veh: ROAD, w: 6, cd: 4,
    title: () => t('gb.ev.tree.t', 'Árvore caída'),
    text: () => t('gb.ev.tree.x', 'Uma árvore caiu e fechou o caminho.'),
    ch: () => [
      { ic: 'hitch', l: 'strap', need: 'cinta', ok: { h: 0.3, xp: 18, say: 'good' } },
      { ic: 'clock', l: 'wait', ok: { h: 1.5, say: 'slow' } },
      { ic: 'map', l: 'detour', p: 0.6, ok: { h: 0.6, fuel: -8, say: 'phew' }, bad: { h: 1.2, dmg: 12, say: 'bad' } },
    ],
  },
  {
    id: 'slide', cat: 'road', icon: 'rocks', where: ['road'], sky: WET, veh: ROAD, w: 7, cd: 5,
    title: () => t('gb.ev.slide.t', 'Deslizamento!'),
    text: () => t('gb.ev.slide.x', 'A chuva derrubou terra do morro na pista.'),
    ch: () => [
      { ic: 'run', l: 'slow', p: 0.7, ok: { h: 0.3, xp: 12, say: 'phew' }, bad: { dmg: 18, h: 0.8, say: 'bad' } },
      { ic: 'clock', l: 'wait', ok: { h: 2, say: 'safe' } },
      { ic: 'map', l: 'detour', ok: { h: 1, fuel: -15, say: 'slow' } },
    ],
  },
  {
    id: 'blitz', cat: 'road', icon: 'police', where: ['road'], veh: ROAD, w: 6, cd: 4, gentle: true,
    title: () => t('gb.ev.blitz.t', 'Blitz da polícia'),
    text: () => t('gb.ev.blitz.x', 'O policial pede os documentos do caminhão.'),
    ch: (c) => [{ ic: 'check', l: 'show', ok: c.over ? { m: -120, say: 'fine' } : { h: 0.15, xp: 5, say: 'good' } }],
  },
  {
    id: 'scale', cat: 'road', icon: 'scale', where: ['road'], veh: ['rig'], minDiff: 1, w: 7, cd: 5,
    title: () => t('gb.ev.scale.t', 'Balança da estrada'),
    text: () => t('gb.ev.scale.x', 'Todo caminhão pesado precisa passar na balança.'),
    ch: (c) => [
      { ic: 'scale', l: 'weigh', ok: c.over ? { m: -200, h: 0.3, say: 'fine' } : { h: 0.2, xp: 8, say: 'good' } },
      { ic: 'box', l: 'lighten', ok: { cargoK: -0.06, h: 0.3, say: 'safe' } },
    ],
  },
  {
    id: 'hitch', cat: 'road', icon: 'hiker', where: ['road'], veh: ['rig', 'light'], time: 'day', w: 6, cd: 4, gentle: true,
    title: () => t('gb.ev.hitch.t', 'Pedindo carona'),
    text: () => t('gb.ev.hitch.x', 'Uma moça com mochila pede carona até a próxima cidade.'),
    ch: () => [
      { ic: 'heart', l: 'ride', p: 0.9, ok: { m: 70, h: 0.2, heart: true, say: 'thanks' }, bad: { h: 0.3, say: 'nothing' } },
      { ic: 'no', l: 'refuse', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'bridge', cat: 'road', icon: 'bridge', where: ['road'], veh: ROAD, w: 5, cd: 6,
    title: () => t('gb.ev.bridge.t', 'Ponte em obras'),
    text: () => t('gb.ev.bridge.x', 'A ponte está quebrada. Tem que dar a volta!'),
    ch: () => [
      { ic: 'map', l: 'detour', ok: { h: 1.2, fuel: -18, say: 'slow' } },
      { ic: 'clock', l: 'wait', ok: { h: 2.5, say: 'safe' } },
      { ic: 'coin', l: 'pay', cost: 60, ok: { h: 0.4, say: 'good' } },
    ],
  },
  {
    id: 'fogbank', cat: 'road', icon: 'fog', where: ['road', 'mine'], sky: ['cloudy', 'rain'], veh: ROAD, w: 6, cd: 5,
    title: () => t('gb.ev.fog.t', 'Neblina fechada'),
    text: () => t('gb.ev.fog.x', 'Uma neblina grossa cobriu tudo. Mal dá para ver!'),
    ch: () => [
      { ic: 'run', l: 'slow', ok: { h: 0.5, xp: 10, fog: true, say: 'safe' } },
      { ic: 'clock', l: 'wait', ok: { h: 1, say: 'slow' } },
      { ic: 'lights', l: 'flash', p: 0.75, ok: { fog: true, say: 'phew' }, bad: { fog: true, dmg: 10, say: 'bad' } },
    ],
  },
  {
    id: 'garage', cat: 'road', icon: 'wrench', where: ['road', 'town'], veh: ROAD, w: 5, cd: 6, gentle: true,
    title: () => t('gb.ev.garage.t', 'Oficina na beira da estrada'),
    text: () => t('gb.ev.garage.x', 'O mecânico oferece uma revisão com desconto.'),
    ch: () => [
      { ic: 'wrench', l: 'repair', cost: 90, ok: { repair: true, h: 0.5, say: 'good' } },
      { ic: 'tire', l: 'buy', cost: 80, ok: { it: ['kit', 1], say: 'found' } },
      { ic: 'road', l: 'ignore', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'pothole', cat: 'road', icon: 'rocks', where: ['road'], veh: ROAD, w: 7, cd: 2,
    title: () => t('gb.ev.pothole.t', 'Buracão!'),
    text: () => t('gb.ev.pothole.x', 'Tem um buraco enorme na pista.'),
    ch: () => [
      { ic: 'run', l: 'around', p: 0.8, ok: { say: 'phew' }, bad: { dmg: 10, say: 'bad' } },
      { ic: 'clock', l: 'slow', ok: { h: 0.2, say: 'safe' } },
    ],
  },
  {
    id: 'hot', cat: 'road', icon: 'heat', where: ['road'], time: 'day', sky: ['clear'], veh: ROAD, minDiff: 1, w: 5, cd: 6,
    title: () => t('gb.ev.hot.t', 'Motor esquentou'),
    text: () => t('gb.ev.hot.x', 'O ponteiro da temperatura subiu no vermelho!'),
    ch: () => [
      { ic: 'clock', l: 'stop', ok: { h: 0.7, say: 'safe' } },
      { ic: 'water', l: 'water', need: 'agua', ok: { h: 0.2, it: ['agua', -1], xp: 8, say: 'good' } },
      { ic: 'run', l: 'ignore', p: 0.5, ok: { say: 'phew' }, bad: { dmg: 20, say: 'bad' } },
    ],
  },
  {
    id: 'pastel', cat: 'road', icon: 'snack', where: ['road', 'town'], time: 'day', veh: ROAD, w: 6, cd: 5, gentle: true,
    title: () => t('gb.ev.pastel.t', 'Lanchonete da estrada'),
    text: () => t('gb.ev.pastel.x', 'Que cheiro bom de pastel quentinho!'),
    ch: () => [
      { ic: 'snack', l: 'eat', cost: 15, ok: { food: 35, h: 0.3, say: 'yum' } },
      { ic: 'energy', l: 'coffee', cost: 6, ok: { energy: 25, h: 0.15, say: 'yum' } },
      { ic: 'road', l: 'ignore', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'quiz', cat: 'road', icon: 'radio', where: ['road', 'camp', 'mine'], w: 5, cd: 8, gentle: true,
    title: () => t('gb.ev.quiz.t', 'Prêmio na rádio!'),
    text: () => t('gb.ev.quiz.x', 'A rádio faz uma pergunta valendo prêmio.'),
    ch: () => [
      { ic: 'phone', l: 'answer', p: 0.5, ok: { m: 120, say: 'lucky' }, bad: { say: 'nothing' } },
      { ic: 'music', l: 'listen', ok: { energy: 6, say: 'rest' } },
    ],
  },
  {
    id: 'convoy', cat: 'road', icon: 'truck', where: ['road'], veh: ['rig'], w: 5, cd: 6, gentle: true,
    title: () => t('gb.ev.convoy.t', 'Comboio'),
    text: () => t('gb.ev.convoy.x', 'Outros caminhoneiros chamam para ir em fila, economizando diesel.'),
    ch: () => [
      { ic: 'truck', l: 'join', ok: { fuel: 15, xp: 8, say: 'good' } },
      { ic: 'road', l: 'alone', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'works', cat: 'road', icon: 'flag', where: ['road'], time: 'day', veh: ROAD, w: 5, cd: 4,
    title: () => t('gb.ev.works.t', 'Obras na pista'),
    text: () => t('gb.ev.works.x', 'Um homem com placa: PARE e SIGA.'),
    ch: () => [
      { ic: 'clock', l: 'wait', ok: { h: 0.5, say: 'safe' } },
      { ic: 'road', l: 'shoulder', p: 0.5, ok: { say: 'phew' }, bad: { m: -90, say: 'fine' } },
    ],
  },
  {
    id: 'herd', cat: 'road', icon: 'ox', where: ['road', 'mine'], time: 'day', veh: ROAD, w: 5, cd: 6, gentle: true,
    title: () => t('gb.ev.herd.t', 'Boiada!'),
    text: () => t('gb.ev.herd.x', 'Uma boiada inteira atravessa com o vaqueiro.'),
    ch: () => [
      { ic: 'clock', l: 'wait', ok: { h: 0.8, heart: true, say: 'good' } },
      { ic: 'run', l: 'slow', ok: { h: 0.35, xp: 8, say: 'good' } },
    ],
  },
  {
    id: 'wet', cat: 'road', icon: 'rain', where: ['road'], sky: WET, veh: ROAD, w: 6, cd: 3,
    title: () => t('gb.ev.wet.t', 'Pista escorregadia'),
    text: () => t('gb.ev.wet.x', 'O asfalto molhado está um sabão!'),
    ch: () => [
      { ic: 'run', l: 'slow', ok: { h: 0.3, xp: 8, say: 'safe' } },
      { ic: 'truck', l: 'speed', p: 0.6, ok: { say: 'phew' }, bad: { dmg: 15, say: 'bad' } },
    ],
  },
  {
    id: 'station', cat: 'road', icon: 'pump', where: ['road'], veh: ROAD, minDiff: 1, w: 4, cd: 6, cond: (c) => !!c.lowFuel,
    title: () => t('gb.ev.station.t', 'Posto à vista'),
    text: () => t('gb.ev.station.x', 'O tanque está baixo e tem um posto logo ali.'),
    ch: () => [
      { ic: 'pump', l: 'fill', ok: { fill: 1, h: 0.3, say: 'good' } },
      { ic: 'road', l: 'ignore', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'gale', cat: 'road', icon: 'storm', where: ['road'], sky: ['storm'], veh: ROAD, minDiff: 2, w: 6, cd: 4,
    title: () => t('gb.ev.gale.t', 'Ventania!'),
    text: () => t('gb.ev.gale.x', 'Rajadas fortes empurram o caminhão para o lado.'),
    ch: () => [
      { ic: 'arm', l: 'hold', p: 0.8, ok: { xp: 12, say: 'phew' }, bad: { dmg: 12, say: 'bad' } },
      { ic: 'clock', l: 'stop', ok: { h: 0.7, say: 'safe' } },
    ],
  },
  {
    id: 'loose', cat: 'road', icon: 'box', where: ['road'], veh: ['rig'], w: 5, cd: 5,
    title: () => t('gb.ev.loose.t', 'Carga solta'),
    text: () => t('gb.ev.loose.x', 'Uma cinta da carga afrouxou!'),
    ch: () => [
      { ic: 'hitch', l: 'stop', ok: { h: 0.25, xp: 10, say: 'safe' } },
      { ic: 'road', l: 'ignore', p: 0.6, ok: { say: 'phew' }, bad: { cargoK: -0.05, say: 'bad' } },
    ],
  },
  {
    id: 'tourists', cat: 'road', icon: 'camera', where: ['road', 'town'], time: 'day', veh: ['rig', 'heavy'], w: 4, cd: 8, gentle: true,
    title: () => t('gb.ev.tourists.t', 'Turistas!'),
    text: () => t('gb.ev.tourists.x', 'Turistas querem tirar foto com seu caminhão.'),
    ch: () => [
      { ic: 'camera', l: 'pose', ok: { m: 35, h: 0.2, heart: true, say: 'lucky' } },
      { ic: 'road', l: 'ignore', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'dust', cat: 'road', icon: 'fog', where: ['road', 'mine'], time: 'day', sky: ['clear'], veh: ROAD, minDiff: 1, w: 4, cd: 6, cond: (c) => !!c.dry,
    title: () => t('gb.ev.dust.t', 'Poeirão'),
    text: () => t('gb.ev.dust.x', 'Com a seca, a poeira vermelha sobe em nuvens.'),
    ch: () => [
      { ic: 'run', l: 'slow', ok: { h: 0.3, say: 'safe' } },
      { ic: 'water', l: 'drink', need: 'agua', ok: { water: 30, it: ['agua', -1], say: 'yum' } },
    ],
  },
  {
    id: 'sunrise', cat: 'road', icon: 'sun', where: ['road', 'camp', 'mine'], sky: ['clear', 'cloudy'], w: 4, cd: 20, gentle: true, cond: (c) => !!c.dawn,
    title: () => t('gb.ev.sunrise.t', 'Nascer do sol'),
    text: () => t('gb.ev.sunrise.x', 'O céu ficou laranja e rosa. Que bonito!'),
    ch: () => [
      { ic: 'heart', l: 'stop', ok: { h: 0.2, energy: 15, heart: true, say: 'rest' } },
      { ic: 'road', l: 'ignore', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'colleague', cat: 'road', icon: 'broken', where: ['road'], veh: ROAD, w: 5, cd: 6, gentle: true,
    title: () => t('gb.ev.colleague.t', 'Colega parado'),
    text: () => t('gb.ev.colleague.x', 'Um caminhoneiro está parado no acostamento, pedindo ajuda.'),
    ch: () => [
      { ic: 'wrench', l: 'help', p: 0.8, ok: { h: 0.6, m: 90, xp: 15, say: 'thanks' }, bad: { h: 0.8, xp: 10, say: 'slow' } },
      { ic: 'phone', l: 'mech', ok: { xp: 5, say: 'good' } },
      { ic: 'road', l: 'ignore', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'radar', cat: 'road', icon: 'camera', where: ['road'], veh: ROAD, minDiff: 1, w: 5, cd: 3,
    title: () => t('gb.ev.radar.t', 'Radar!'),
    text: () => t('gb.ev.radar.x', 'Placa: radar de velocidade logo à frente.'),
    ch: () => [
      { ic: 'run', l: 'slow', ok: { h: 0.05, say: 'safe' } },
      { ic: 'truck', l: 'speed', p: 0.4, ok: { say: 'phew' }, bad: { m: -110, say: 'fine' } },
    ],
  },
  {
    id: 'puppy', cat: 'road', icon: 'heart', where: ['road', 'camp'], time: 'day', w: 4, cd: 12, gentle: true,
    title: () => t('gb.ev.puppy.t', 'Cachorrinho perdido'),
    text: () => t('gb.ev.puppy.x', 'Um cachorrinho magrinho está sozinho, com sede.'),
    ch: () => [
      { ic: 'water', l: 'water', need: 'agua', ok: { it: ['agua', -1], xp: 10, heart: true, say: 'thanks' } },
      { ic: 'pin', l: 'help', p: 0.6, ok: { h: 0.3, m: 60, heart: true, say: 'thanks' }, bad: { h: 0.3, heart: true, say: 'good' } },
    ],
  },
  {
    id: 'toll', cat: 'road', icon: 'coin', where: ['road'], veh: ['rig'], minDiff: 1, w: 5, cd: 4,
    title: () => t('gb.ev.toll.t', 'Pedágio'),
    text: () => t('gb.ev.toll.x', 'Cada eixo paga. Carreta comprida paga mais!'),
    ch: () => [
      { ic: 'coin', l: 'pay', cost: 45, ok: { say: 'good' } },
      { ic: 'map', l: 'detour', ok: { h: 1, fuel: -12, say: 'slow' } },
    ],
  },
  {
    id: 'drowsy', cat: 'road', icon: 'sleep', where: ['road'], veh: ROAD, minDiff: 2, w: 6, cd: 3, cond: (c) => !!c.tired,
    title: () => t('gb.ev.drowsy.t', 'Sono ao volante'),
    text: () => t('gb.ev.drowsy.x', 'Os olhos estão pesando... perigo!'),
    ch: () => [
      { ic: 'bed', l: 'nap', ok: { h: 1, energy: 40, say: 'rest' } },
      { ic: 'energy', l: 'coffee', cost: 6, ok: { energy: 20, say: 'yum' } },
      { ic: 'cloud', l: 'window', p: 0.7, ok: { energy: 5, say: 'phew' }, bad: { dmg: 15, say: 'bad' } },
    ],
  },

  /* ------------------------------ GARIMPO / ACAMPAMENTO ------------------------------ */
  {
    id: 'rumor', cat: 'camp', icon: 'rumor', where: ['camp', 'mine', 'town'], w: 6, cd: 8, gentle: true, team: true,
    title: () => t('gb.ev.rumor.t', 'Boato de ouro!'),
    text: () => t('gb.ev.rumor.x', 'Dizem que acharam ouro grosso perto daqui...'),
    ch: () => [
      { ic: 'map', l: 'go', ok: { rumor: true, say: 'rumor' } },
      { ic: 'no', l: 'ignore', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'breakdown', cat: 'camp', icon: 'broken', where: ['camp', 'mine'], veh: ['light', 'heavy', 'heli'], minDiff: 1, w: 6, cd: 6, vars: PARTS,
    title: () => t('gb.ev.breakdown.t', 'Máquina quebrou'),
    text: () => t('gb.ev.breakdown.x', 'Estourou uma {v}! A máquina parou.'),
    ch: () => [
      { ic: 'wrench', l: 'fix', p: 0.6, ok: { h: 0.5, xp: 20, say: 'good' }, bad: { m: -150, h: 1, say: 'bad' } },
      { ic: 'phone', l: 'mech', cost: 180, ok: { h: 0.6, say: 'good' } },
      { ic: 'clock', l: 'wait', ok: { h: 3, say: 'slow' } },
    ],
  },
  {
    id: 'supply', cat: 'camp', icon: 'truck', where: ['camp'], time: 'day', w: 7, cd: 6, gentle: true, vars: SUPPLIES,
    title: () => t('gb.ev.supply.t', 'Chegou a entrega!'),
    text: () => t('gb.ev.supply.x', 'O caminhão do mercado trouxe: {v}.'),
    ch: (_c, v) => [
      { ic: 'cart', l: 'buy', cost: v?.k === 'diesel' ? 35 : v?.k === 'water' ? 12 : 45, ok: { it: v?.k === 'diesel' ? ['jerry', 1] : v?.k === 'water' ? ['agua', 3] : ['marmita', 2], say: 'found' } },
      { ic: 'no', l: 'refuse', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'buyer', cat: 'camp', icon: 'buyer', where: ['camp', 'town'], time: 'day', w: 6, cd: 10, gentle: true, team: true, cond: (c) => !!c.stock,
    title: () => t('gb.ev.buyer.t', 'Comprador visitante'),
    text: () => t('gb.ev.buyer.x', 'Um comprador oferece um preço especial pelo seu ouro!'),
    ch: () => [
      { ic: 'coin', l: 'sell', ok: { stockK: -0.25, price: 0.3, say: 'lucky' } },
      { ic: 'no', l: 'refuse', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'thief', cat: 'camp', icon: 'thief', where: ['camp'], time: 'night', minDiff: 1, w: 6, cd: 12, team: true, cond: (c) => !!c.stock,
    title: () => t('gb.ev.thief.t', 'Ladrão no estoque!'),
    text: () => t('gb.ev.thief.x', 'Alguém está mexendo no estoque de ouro no escuro!'),
    ch: () => [
      { ic: 'lights', l: 'lights', p: 0.75, ok: { xp: 15, say: 'phew' }, bad: { stockK: -0.06, say: 'bad' } },
      { ic: 'police', l: 'police', cost: 50, ok: { say: 'safe' } },
      { ic: 'shield', l: 'guard', ok: { energy: -30, xp: 20, say: 'good' } },
    ],
  },
  {
    id: 'flood', cat: 'camp', icon: 'rain', where: ['mine'], sky: WET, minDiff: 1, w: 6, cd: 6,
    title: () => t('gb.ev.flood.t', 'Cava alagada'),
    text: () => t('gb.ev.flood.x', 'A chuva encheu o buraco de água barrenta.'),
    ch: () => [
      { ic: 'pump', l: 'pump', ok: { fuel: -10, xp: 8, say: 'good' } },
      { ic: 'clock', l: 'wait', ok: { h: 2, say: 'slow' } },
    ],
  },
  {
    id: 'lightfire', cat: 'weather', icon: 'fire', where: ['camp', 'mine'], sky: ['storm'], minDiff: 2, w: 5, cd: 12, team: true,
    title: () => t('gb.ev.lightfire.t', 'Raio no mato!'),
    text: () => t('gb.ev.lightfire.x', 'Um raio caiu numa árvore e começou um fogo!'),
    ch: () => [{ ic: 'fire', l: 'run', ok: { fire: true, say: 'fire' } }],
  },
  {
    id: 'heatwave', cat: 'weather', icon: 'heat', where: ['camp', 'mine', 'road', 'town'], time: 'day', sky: ['clear'], minDiff: 2, w: 6, cd: 8, cond: (c) => !!c.heat,
    title: () => t('gb.ev.heat.t', 'Onda de calor'),
    text: () => t('gb.ev.heat.x', 'Que calorão! A sede vem rapidinho.'),
    ch: () => [
      { ic: 'water', l: 'drink', need: 'agua', ok: { water: 40, it: ['agua', -1], say: 'yum' } },
      { ic: 'tree', l: 'shade', ok: { h: 1, energy: 15, say: 'rest' } },
      { ic: 'arm', l: 'work', ok: { water: -25, xp: 12, say: 'good' } },
    ],
  },
  {
    id: 'stormwarn', cat: 'weather', icon: 'radio', where: ['camp', 'mine', 'road'], sky: ['cloudy', 'rain'], minDiff: 2, w: 5, cd: 10, team: true,
    title: () => t('gb.ev.stormwarn.t', 'Alerta de temporal'),
    text: () => t('gb.ev.stormwarn.x', 'A rádio avisa: temporal chegando!'),
    ch: () => [
      { ic: 'shield', l: 'hide', ok: { xp: 10, sky: 'storm', say: 'safe' } },
      { ic: 'arm', l: 'work', ok: { sky: 'storm', say: 'nothing' } },
    ],
  },
  {
    id: 'oldpan', cat: 'camp', icon: 'gold', where: ['mine'], w: 5, cd: 10, gentle: true,
    title: () => t('gb.ev.oldpan.t', 'Bateia antiga'),
    text: () => t('gb.ev.oldpan.x', 'Você achou uma bateia velha enterrada no barro.'),
    ch: () => [
      { ic: 'water', l: 'pan', p: 0.6, ok: { gold: 12, say: 'lucky' }, bad: { say: 'nothing' } },
      { ic: 'bag', l: 'keep', ok: { xp: 10, say: 'good' } },
    ],
  },
  {
    id: 'nugget', cat: 'camp', icon: 'nugget', where: ['mine'], veh: ['foot'], w: 6, cd: 6, gentle: true,
    title: () => t('gb.ev.nugget.t', 'Brilhou na pá!'),
    text: () => t('gb.ev.nugget.x', 'Uma pepita de ouro apareceu no meio da terra!'),
    ch: () => [
      { ic: 'bag', l: 'keep', ok: { it: ['pepita', 8], xp: 10, say: 'lucky' } },
      { ic: 'heart', l: 'share', ok: { gold: 6, heart: true, say: 'good' } },
    ],
  },
  {
    id: 'snake', cat: 'camp', icon: 'tree', where: ['mine', 'camp'], time: 'day', veh: ['foot'], w: 4, cd: 8,
    title: () => t('gb.ev.snake.t', 'Cobra na trilha'),
    text: () => t('gb.ev.snake.x', 'Uma cobra cruzou o caminho bem devagar.'),
    ch: () => [
      { ic: 'clock', l: 'wait', ok: { h: 0.1, say: 'safe' } },
      { ic: 'run', l: 'around', ok: { stam: -12, say: 'phew' } },
    ],
  },
  {
    id: 'bees', cat: 'camp', icon: 'tree', where: ['mine', 'camp'], time: 'day', veh: ['foot'], w: 4, cd: 8,
    title: () => t('gb.ev.bees.t', 'Enxame de abelhas'),
    text: () => t('gb.ev.bees.x', 'Bzzzz! Uma colmeia na árvore ao lado.'),
    ch: () => [
      { ic: 'run', l: 'slow', ok: { h: 0.1, say: 'safe' } },
      { ic: 'run', l: 'run', p: 0.5, ok: { say: 'phew' }, bad: { energy: -15, say: 'bad' } },
    ],
  },
  {
    id: 'neighbor', cat: 'camp', icon: 'user', where: ['mine', 'camp'], w: 5, cd: 8, gentle: true,
    title: () => t('gb.ev.neighbor.t', 'Vizinho atolado'),
    text: () => t('gb.ev.neighbor.x', 'O garimpeiro vizinho atolou e pede uma mão.'),
    ch: () => [
      { ic: 'arm', l: 'help', ok: { h: 0.5, m: 60, xp: 15, say: 'thanks' } },
      { ic: 'no', l: 'refuse', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'party', cat: 'camp', icon: 'music', where: ['camp'], time: 'night', w: 4, cd: 24, gentle: true,
    title: () => t('gb.ev.party.t', 'Forró no acampamento!'),
    text: () => t('gb.ev.party.x', 'Tem música, fogueira e milho assado hoje.'),
    ch: () => [
      { ic: 'music', l: 'party', ok: { h: 1, energy: -10, food: 40, heart: true, say: 'yum' } },
      { ic: 'bed', l: 'sleep', ok: { energy: 20, say: 'rest' } },
    ],
  },
  {
    id: 'pipa', cat: 'camp', icon: 'water', where: ['camp', 'mine'], time: 'day', minDiff: 2, w: 4, cd: 10, cond: (c) => !!c.dry,
    title: () => t('gb.ev.pipa.t', 'Caminhão-pipa'),
    text: () => t('gb.ev.pipa.x', 'Chegou água fresquinha do caminhão-pipa.'),
    ch: () => [
      { ic: 'water', l: 'buy', cost: 8, ok: { it: ['agua', 2], water: 20, say: 'yum' } },
      { ic: 'no', l: 'refuse', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'inspector', cat: 'camp', icon: 'shield', where: ['camp'], time: 'day', minDiff: 1, w: 4, cd: 16, team: true,
    title: () => t('gb.ev.inspector.t', 'Fiscal ambiental'),
    text: () => t('gb.ev.inspector.x', 'O fiscal veio ver se a lavadora cuida do rio.'),
    ch: () => [
      { ic: 'check', l: 'show', p: 0.8, ok: { xp: 10, say: 'good' }, bad: { m: -100, say: 'fine' } },
      { ic: 'rumor', l: 'ask', ok: { h: 0.5, xp: 25, say: 'good' } },
    ],
  },
  {
    id: 'genfail', cat: 'camp', icon: 'bolt', where: ['camp', 'mine'], time: 'night', minDiff: 1, w: 4, cd: 12,
    title: () => t('gb.ev.genfail.t', 'Apagão'),
    text: () => t('gb.ev.genfail.x', 'O gerador engasgou e as luzes apagaram!'),
    ch: () => [
      { ic: 'wrench', l: 'fix', p: 0.7, ok: { xp: 12, say: 'good' }, bad: { m: -60, say: 'bad' } },
      { ic: 'moon', l: 'dark', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'oldtimer', cat: 'camp', icon: 'user', where: ['camp', 'town'], w: 4, cd: 16, gentle: true,
    title: () => t('gb.ev.oldtimer.t', 'Garimpeiro antigo'),
    text: () => t('gb.ev.oldtimer.x', 'Um velho garimpeiro quer contar um segredo.'),
    ch: () => [
      { ic: 'rumor', l: 'listen', ok: { xp: 30, rumor: true, say: 'rumor' } },
      { ic: 'heart', l: 'wave', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'mud', cat: 'camp', icon: 'rain', where: ['mine', 'camp'], sky: WET, veh: ['light', 'heavy'], w: 6, cd: 5,
    title: () => t('gb.ev.mud.t', 'Atolou!'),
    text: () => t('gb.ev.mud.x', 'As rodas afundaram no barro mole.'),
    ch: () => [
      { ic: 'hitch', l: 'strap', need: 'cinta', ok: { xp: 15, say: 'good' } },
      { ic: 'phone', l: 'mech', cost: 80, ok: { h: 0.5, say: 'good' } },
      { ic: 'arm', l: 'push', p: 0.5, ok: { stam: -30, xp: 10, say: 'phew' }, bad: { stam: -30, h: 0.5, say: 'bad' } },
    ],
  },
  {
    id: 'lucky', cat: 'camp', icon: 'star', where: ['mine', 'camp'], w: 3, cd: 24, gentle: true,
    title: () => t('gb.ev.lucky.t', 'Dia de sorte'),
    text: () => t('gb.ev.lucky.x', 'Um trevo de quatro folhas no chão do garimpo!'),
    ch: () => [{ ic: 'star', l: 'keep', ok: { gold: 10, heart: true, say: 'lucky' } }],
  },
  {
    id: 'priceup', cat: 'camp', icon: 'coin', where: ['camp', 'mine', 'road', 'town'], time: 'day', w: 4, cd: 24, gentle: true, team: true,
    title: () => t('gb.ev.priceup.t', 'Ouro em alta!'),
    text: () => t('gb.ev.priceup.x', 'O preço do ouro subiu hoje na cidade.'),
    ch: () => [{ ic: 'check', l: 'ok', ok: { price: 0.2, say: 'lucky' } }],
  },
  {
    id: 'pricedown', cat: 'camp', icon: 'coin', where: ['camp', 'mine', 'road', 'town'], time: 'day', minDiff: 2, w: 3, cd: 24, team: true,
    title: () => t('gb.ev.pricedown.t', 'Ouro em baixa'),
    text: () => t('gb.ev.pricedown.x', 'O preço do ouro caiu um pouco hoje.'),
    ch: () => [{ ic: 'check', l: 'ok', ok: { price: -0.12, say: 'nothing' } }],
  },
  {
    id: 'nest', cat: 'camp', icon: 'heart', where: ['mine', 'camp'], time: 'day', veh: ['heavy', 'light'], w: 3, cd: 24, gentle: true,
    title: () => t('gb.ev.nest.t', 'Ninho na máquina'),
    text: () => t('gb.ev.nest.x', 'Um passarinho fez ninho bem no seu retrovisor!'),
    ch: () => [
      { ic: 'heart', l: 'wait', ok: { h: 0.5, heart: true, xp: 10, say: 'good' } },
      { ic: 'tree', l: 'help', ok: { xp: 15, heart: true, say: 'good' } },
    ],
  },
  {
    id: 'rainbow', cat: 'weather', icon: 'sunCloud', where: ['mine', 'camp', 'road'], time: 'day', sky: ['cloudy', 'rain'], w: 3, cd: 24, gentle: true,
    title: () => t('gb.ev.rainbow.t', 'Arco-íris!'),
    text: () => t('gb.ev.rainbow.x', 'Um arco-íris enorme saiu depois da chuva.'),
    ch: () => [
      { ic: 'star', l: 'wish', p: 0.3, ok: { gold: 8, say: 'lucky' }, bad: { heart: true, say: 'good' } },
      { ic: 'camera', l: 'photo', ok: { heart: true, xp: 5, say: 'good' } },
    ],
  },
  {
    id: 'jerryfound', cat: 'camp', icon: 'jerry', where: ['mine', 'road'], minDiff: 1, w: 3, cd: 16,
    title: () => t('gb.ev.jerry.t', 'Galão esquecido'),
    text: () => t('gb.ev.jerry.x', 'Tem um galão de diesel cheio largado no mato.'),
    ch: () => [
      { ic: 'jerry', l: 'keep', ok: { it: ['jerry', 1], say: 'found' } },
      { ic: 'no', l: 'ignore', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'kid', cat: 'camp', icon: 'food', where: ['camp', 'town'], time: 'day', w: 3, cd: 16, gentle: true,
    title: () => t('gb.ev.kid.t', 'Criança com fome'),
    text: () => t('gb.ev.kid.x', 'Uma criança da vila pergunta se tem um lanche.'),
    ch: () => [
      { ic: 'food', l: 'give', need: 'marmita', ok: { it: ['marmita', -1], xp: 20, heart: true, say: 'thanks' } },
      { ic: 'snack', l: 'share', need: 'lanche', ok: { it: ['lanche', -1], xp: 12, heart: true, say: 'thanks' } },
      { ic: 'heart', l: 'wave', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'toolsale', cat: 'camp', icon: 'wrench', where: ['camp', 'town'], time: 'day', w: 4, cd: 12, gentle: true, vars: TOOLS,
    title: () => t('gb.ev.toolsale.t', 'Promoção!'),
    text: () => t('gb.ev.toolsale.x', 'O mascate faz desconto: {v}.'),
    ch: (_c, v) => [
      { ic: 'cart', l: 'buy', cost: v?.k === 'lanterna' ? 20 : 50, ok: { it: [(v?.k ?? 'kit') as ItemId, 1], say: 'found' } },
      { ic: 'no', l: 'refuse', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'stars', cat: 'camp', icon: 'star', where: ['camp', 'mine'], time: 'night', sky: ['clear'], w: 3, cd: 24, gentle: true,
    title: () => t('gb.ev.stars.t', 'Céu estrelado'),
    text: () => t('gb.ev.stars.x', 'Milhões de estrelas e a Via Láctea inteira!'),
    ch: () => [
      { ic: 'star', l: 'stop', ok: { energy: 10, heart: true, say: 'rest' } },
      { ic: 'bed', l: 'sleep', ok: { energy: 15, say: 'rest' } },
    ],
  },
  {
    id: 'hail', cat: 'weather', icon: 'storm', where: ['camp', 'mine', 'road'], sky: ['storm'], minDiff: 2, w: 4, cd: 12,
    title: () => t('gb.ev.hail.t', 'Granizo!'),
    text: () => t('gb.ev.hail.x', 'Pedrinhas de gelo caindo do céu!'),
    ch: () => [
      { ic: 'shield', l: 'protect', ok: { h: 0.3, say: 'safe' } },
      { ic: 'run', l: 'run', p: 0.6, ok: { say: 'phew' }, bad: { energy: -10, dmg: 5, say: 'bad' } },
    ],
  },
  {
    id: 'cold', cat: 'weather', icon: 'moon', where: ['camp', 'mine', 'road', 'town'], time: 'night', sky: ['clear', 'cloudy'], minDiff: 2, w: 4, cd: 24,
    title: () => t('gb.ev.cold.t', 'Noite gelada'),
    text: () => t('gb.ev.cold.x', 'Chegou uma frente fria. Brrr!'),
    ch: () => [
      { ic: 'fire', l: 'fireplace', ok: { energy: 10, say: 'rest' } },
      { ic: 'bed', l: 'blanket', cost: 30, ok: { energy: 20, say: 'rest' } },
    ],
  },
  {
    id: 'drought', cat: 'weather', icon: 'heat', where: ['camp', 'mine'], minDiff: 2, w: 4, cd: 24, cond: (c) => !!c.dry,
    title: () => t('gb.ev.drought.t', 'Seca'),
    text: () => t('gb.ev.drought.x', 'Faz dias que não chove. O lago baixou.'),
    ch: () => [
      { ic: 'water', l: 'save', ok: { xp: 8, say: 'safe' } },
      { ic: 'cart', l: 'buy', cost: 15, ok: { it: ['agua', 3], say: 'found' } },
    ],
  },
  {
    id: 'hat', cat: 'weather', icon: 'cloud', where: ['camp', 'mine'], veh: ['foot'], sky: ['cloudy', 'storm'], w: 4, cd: 12,
    title: () => t('gb.ev.hat.t', 'O vento levou o chapéu!'),
    text: () => t('gb.ev.hat.x', 'Uma rajada arrancou seu chapéu da cabeça.'),
    ch: () => [
      { ic: 'run', l: 'chase', p: 0.6, ok: { stam: -15, say: 'phew' }, bad: { stam: -15, m: -20, say: 'bad' } },
      { ic: 'coin', l: 'letgo', ok: { m: -20, say: 'nothing' } },
    ],
  },

  /* ------------------------------ NOITE: SUSTOS DIVERTIDOS ------------------------------ */
  {
    id: 'flights', cat: 'spooky', icon: 'lights', where: ['road', 'mine', 'camp'], time: 'night', w: 6, cd: 10,
    title: () => t('gb.ev.flights.t', 'Luzes na mata...'),
    text: () => t('gb.ev.flights.x', 'Luzinhas verdes dançam no meio das árvores.'),
    ch: () => [
      { ic: 'eye', l: 'near', p: 0.6, ok: { xp: 12, heart: true, say: 'fireflies' }, bad: { say: 'vanish' } },
      { ic: 'run', l: 'far', ok: { say: 'safe' } },
    ],
  },
  {
    id: 'hooded', cat: 'spooky', icon: 'hood', where: ['road'], time: 'night', veh: ROAD, w: 5, cd: 16,
    title: () => t('gb.ev.hooded.t', 'Figura de capuz'),
    text: () => t('gb.ev.hooded.x', 'Alguém de capuz parado na beira da estrada... e sumiu!'),
    ch: () => [
      { ic: 'lights', l: 'flash', ok: { say: 'vanish' } },
      { ic: 'truck', l: 'speed', ok: { fuel: -3, say: 'phew' } },
    ],
  },
  {
    id: 'ghosttruck', cat: 'spooky', icon: 'ghostTruck', where: ['road'], time: 'night', veh: ['rig'], w: 5, cd: 16,
    title: () => t('gb.ev.ghosttruck.t', 'Caminhão fantasma'),
    text: () => t('gb.ev.ghosttruck.x', 'Faróis no retrovisor... mas a estrada atrás está vazia.'),
    ch: () => [
      { ic: 'horn', l: 'honk', ok: { xp: 8, say: 'honkBack' } },
      { ic: 'mirror', l: 'let', ok: { h: 0.2, say: 'wind' } },
    ],
  },
  {
    id: 'howl', cat: 'spooky', icon: 'howl', where: ['road', 'camp', 'mine'], time: 'night', w: 5, cd: 12,
    title: () => t('gb.ev.howl.t', 'Uivo na noite'),
    text: () => t('gb.ev.howl.x', 'Auuuuu! Um uivo comprido ecoou no mato.'),
    ch: () => [
      { ic: 'lights', l: 'torch', need: 'lanterna', ok: { xp: 15, heart: true, say: 'wolf' } },
      { ic: 'fire', l: 'fireplace', ok: { energy: -5, say: 'safe' } },
    ],
  },
  {
    id: 'oldstation', cat: 'spooky', icon: 'station', where: ['road'], time: 'night', veh: ROAD, w: 4, cd: 20,
    title: () => t('gb.ev.oldstation.t', 'Posto abandonado'),
    text: () => t('gb.ev.oldstation.x', 'Um posto velho, com uma lâmpada piscando sozinha.'),
    ch: () => [
      { ic: 'lights', l: 'explore', need: 'lanterna', p: 0.6, ok: { it: ['jerry', 1], xp: 12, say: 'found' }, bad: { say: 'wind' } },
      { ic: 'road', l: 'ignore', ok: { say: 'safe' } },
    ],
  },
  {
    id: 'werewolf', cat: 'spooky', icon: 'wolf', where: ['road', 'mine'], time: 'night', sky: ['clear', 'cloudy'], w: 4, cd: 24,
    title: () => t('gb.ev.werewolf.t', 'A lenda do lobisomem'),
    text: () => t('gb.ev.werewolf.x', 'Uma sombra peluda cruzou a estrada na lua cheia!'),
    ch: () => [
      { ic: 'no', l: 'brake', ok: { xp: 10, say: 'dog' } },
      { ic: 'horn', l: 'honk', ok: { say: 'dog' } },
    ],
  },
  {
    id: 'legend', cat: 'spooky', icon: 'eye', where: ['mine', 'camp', 'road'], time: 'night', w: 4, cd: 24, vars: LEGENDS,
    title: () => t('gb.ev.legend.t', 'Seria {v}?'),
    text: () => t('gb.ev.legend.x', 'Um redemoinho passou assobiando e pegadas esquisitas ficaram no barro.'),
    ch: () => [
      { ic: 'snack', l: 'candy', need: 'lanche', p: 0.5, ok: { it: ['lanche', -1], gold: 10, say: 'lucky' }, bad: { it: ['lanche', -1], heart: true, say: 'vanish' } },
      { ic: 'pin', l: 'follow', p: 0.5, ok: { rumor: true, say: 'rumor' }, bad: { h: 1, say: 'slow' } },
      { ic: 'run', l: 'back', ok: { say: 'safe' } },
    ],
  },
  {
    id: 'boitata', cat: 'spooky', icon: 'fire', where: ['mine', 'camp', 'road'], time: 'night', sky: ['clear'], w: 3, cd: 30,
    title: () => t('gb.ev.boitata.t', 'Uma luz azul no céu!'),
    text: () => t('gb.ev.boitata.x', 'Um rastro de fogo azul serpenteou lá no alto... o Boitatá?'),
    ch: () => [
      { ic: 'star', l: 'wish', p: 0.35, ok: { gold: 15, say: 'lucky' }, bad: { heart: true, say: 'vanish' } },
      { ic: 'moon', l: 'closeEyes', ok: { say: 'phew' } },
    ],
  },
  {
    id: 'radioghost', cat: 'spooky', icon: 'radio', where: ['road', 'camp'], time: 'night', w: 4, cd: 20,
    title: () => t('gb.ev.radioghost.t', 'O rádio ligou sozinho'),
    text: () => t('gb.ev.radioghost.x', 'Chiado... e uma música bem antiga começa a tocar.'),
    ch: () => [
      { ic: 'music', l: 'louder', ok: { energy: 8, heart: true, say: 'good' } },
      { ic: 'no', l: 'off', ok: { say: 'phew' } },
    ],
  },
  {
    id: 'eyes', cat: 'spooky', icon: 'owl', where: ['camp', 'mine', 'road'], time: 'night', w: 5, cd: 12,
    title: () => t('gb.ev.eyes.t', 'Olhos no escuro'),
    text: () => t('gb.ev.eyes.x', 'Dois olhos amarelos brilham no galho da árvore...'),
    ch: () => [
      { ic: 'heart', l: 'wave', ok: { heart: true, say: 'owl' } },
      { ic: 'lights', l: 'torch', need: 'lanterna', ok: { xp: 10, say: 'owl' } },
    ],
  },
  {
    id: 'whisper', cat: 'spooky', icon: 'ghost', where: ['mine'], time: 'night', veh: ['foot'], w: 4, cd: 16,
    title: () => t('gb.ev.whisper.t', 'Sussurro na mina'),
    text: () => t('gb.ev.whisper.x', 'Um eco esquisito vem do fundo do buraco: uuuuh...'),
    ch: () => [
      { ic: 'eye', l: 'explore', p: 0.5, ok: { it: ['pepita', 6], say: 'lucky' }, bad: { say: 'wind' } },
      { ic: 'run', l: 'leave', ok: { say: 'safe' } },
    ],
  },
  {
    id: 'lakesong', cat: 'spooky', icon: 'music', where: ['camp', 'mine'], time: 'night', w: 3, cd: 24,
    title: () => t('gb.ev.lakesong.t', 'Canto no lago'),
    text: () => t('gb.ev.lakesong.x', 'Uma cantoria bonita vem lá do lago... quem será?'),
    ch: () => [
      { ic: 'music', l: 'listen', ok: { energy: 10, heart: true, say: 'rest' } },
      { ic: 'bed', l: 'sleep', ok: { energy: 15, say: 'rest' } },
    ],
  },

  /* ------------------------------ CIDADE / PARADAS ------------------------------ */
  {
    id: 'fair', cat: 'town', icon: 'food', where: ['town'], time: 'day', w: 6, cd: 8, gentle: true,
    title: () => t('gb.ev.fair.t', 'Feira na praça'),
    text: () => t('gb.ev.fair.x', 'Frutas fresquinhas: manga, caju e açaí!'),
    ch: () => [
      { ic: 'cart', l: 'buy', cost: 12, ok: { food: 30, water: 10, say: 'yum' } },
      { ic: 'road', l: 'ignore', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'bonusjob', cat: 'town', icon: 'box', where: ['town'], veh: ['rig'], w: 5, cd: 10, gentle: true,
    title: () => t('gb.ev.bonusjob.t', 'Frete extra'),
    text: () => t('gb.ev.bonusjob.x', 'Uma loja pede para levar umas caixas no caminho.'),
    ch: () => [
      { ic: 'check', l: 'accept', ok: { h: 0.4, m: 140, xp: 10, say: 'good' } },
      { ic: 'no', l: 'refuse', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'fan', cat: 'town', icon: 'horn', where: ['town', 'road'], time: 'day', veh: ['rig', 'heavy'], w: 4, cd: 12, gentle: true,
    title: () => t('gb.ev.fan.t', 'Fã de caminhão'),
    text: () => t('gb.ev.fan.x', 'Um menino faz sinal: buzina, caminhoneiro!'),
    ch: () => [
      { ic: 'horn', l: 'honk', ok: { xp: 8, heart: true, say: 'good' } },
      { ic: 'heart', l: 'wave', ok: { heart: true, say: 'good' } },
    ],
  },
  {
    id: 'festa', cat: 'town', icon: 'flag', where: ['town'], w: 3, cd: 24, gentle: true,
    title: () => t('gb.ev.festa.t', 'Festa na cidade'),
    text: () => t('gb.ev.festa.x', 'Bandeirinhas, quentão e quadrilha na praça!'),
    ch: () => [
      { ic: 'music', l: 'party', ok: { h: 1, energy: -10, food: 30, heart: true, say: 'yum' } },
      { ic: 'road', l: 'ignore', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'shower', cat: 'town', icon: 'water', where: ['town'], minDiff: 2, w: 4, cd: 12,
    title: () => t('gb.ev.shower.t', 'Banho quentinho'),
    text: () => t('gb.ev.shower.x', 'O posto tem chuveiro quente para caminhoneiro.'),
    ch: () => [
      { ic: 'water', l: 'shower', cost: 10, ok: { energy: 25, h: 0.3, say: 'rest' } },
      { ic: 'road', l: 'ignore', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'scratch', cat: 'town', icon: 'star', where: ['town'], minDiff: 1, w: 3, cd: 12,
    title: () => t('gb.ev.scratch.t', 'Raspadinha'),
    text: () => t('gb.ev.scratch.x', 'O caixa oferece uma raspadinha da sorte.'),
    ch: () => [
      { ic: 'star', l: 'try', cost: 5, p: 0.2, ok: { m: 100, say: 'lucky' }, bad: { say: 'nothing' } },
      { ic: 'no', l: 'refuse', ok: { say: 'nothing' } },
    ],
  },
  {
    id: 'cheapfuel', cat: 'town', icon: 'pump', where: ['town', 'road'], veh: ['rig', 'light', 'heavy'], minDiff: 1, w: 4, cd: 10,
    title: () => t('gb.ev.cheapfuel.t', 'Diesel em promoção'),
    text: () => t('gb.ev.cheapfuel.x', 'Placa no posto: diesel mais barato só hoje!'),
    ch: () => [
      { ic: 'pump', l: 'fill', ok: { fill: 0.75, h: 0.3, say: 'good' } },
      { ic: 'road', l: 'ignore', ok: { say: 'nothing' } },
    ],
  },
];

/* ======================================================================
 *  GERADOR
 * ====================================================================== */
export const COST_K = [0.6, 1, 1.3, 1.7];
export const GAIN_K = [1.25, 1, 0.9, 0.8];
/** dinheiro escalado pela dificuldade (custos sobem, prêmios descem) */
export function scaleMoney(v: number, diff: number): number {
  return Math.round(v * (v < 0 ? COST_K[diff] : GAIN_K[diff]));
}

/** passa nos filtros estáticos (lugar, hora, tempo, dificuldade, veículo, sustos) */
export function allowed(tp: Tpl, c: Ctx, gentle: boolean): boolean {
  if (!tp.where.includes(c.loc)) return false;
  if (tp.time === 'day' && c.night) return false;
  if (tp.time === 'night' && !c.night) return false;
  if (tp.sky && !tp.sky.includes(c.sky)) return false;
  if (tp.veh && !tp.veh.includes(c.veh)) return false;
  if ((tp.minDiff ?? 0) > c.diff) return false;
  if (gentle && !tp.gentle) return false;
  if (tp.cat === 'spooky' && !c.spooky) return false;
  return true;
}

export interface Concrete {
  tp: Tpl;
  v: Variant | null;
  ctx: Ctx;
  key: string;
}

/** escolhe um evento para o contexto (ou null): peso × penalidade de repetição */
export function pick(c: Ctx, gentle: boolean, cd: Record<string, number>, recent: string[], now: number, rnd: () => number): Concrete | null {
  let tot = 0;
  const pool: [Tpl, number][] = [];
  for (const tp of TEMPLATES) {
    if (!allowed(tp, c, gentle)) continue;
    if (tp.cond && !tp.cond(c)) continue;
    if ((cd[tp.id] ?? -1e9) + tp.cd > now) continue;
    let w = tp.w;
    const ri = recent.indexOf(tp.id);
    if (ri >= 0) w *= 0.15 + (ri / Math.max(1, recent.length)) * 0.5;
    // mesma categoria que o último: menos provável (variedade)
    const last = recent[recent.length - 1];
    if (last && TEMPLATES.find((x) => x.id === last)?.cat === tp.cat) w *= 0.6;
    if (tp.cat === 'spooky') w *= c.diff >= 3 ? 1.3 : 1;
    pool.push([tp, w]);
    tot += w;
  }
  if (!pool.length) return null;
  let r = rnd() * tot;
  let tp = pool[0][0];
  for (const [p, w] of pool) {
    r -= w;
    if (r <= 0) {
      tp = p;
      break;
    }
  }
  const v = tp.vars ? tp.vars[Math.floor(rnd() * tp.vars.length)] : null;
  return { tp, v, ctx: c, key: keyOf(tp, v, c) };
}

export function keyOf(tp: Tpl, v: Variant | null, c: Ctx): string {
  return [tp.id, v?.k ?? '-', c.loc, c.night ? 'n' : 'd', c.sky, c.diff, tp.veh ? c.veh : '*'].join('|');
}

/** texto do título/frase já com a variante */
export function render(ev: Concrete): { title: string; text: string } {
  const v = ev.v ? ev.v.name() : '';
  return { title: ev.tp.title().split('{v}').join(v), text: ev.tp.text().split('{v}').join(v) };
}

/** todos os eventos concretos possíveis (para contar/testar) */
export function enumerateEvents(): { key: string; title: string; text: string; chips: string; choices: string }[] {
  const out: { key: string; title: string; text: string; chips: string; choices: string }[] = [];
  const locs: Loc[] = ['road', 'camp', 'mine', 'town'];
  const skies: SkyKind[] = ['clear', 'cloudy', 'rain', 'storm'];
  const vehs: Veh[] = ['foot', 'light', 'heavy', 'heli', 'rig'];
  for (const tp of TEMPLATES)
    for (const loc of locs)
      for (const night of [false, true])
        for (const sky of skies)
          for (let diff = 0; diff < 4; diff++)
            for (const veh of tp.veh ? vehs : (['foot'] as Veh[])) {
              const c: Ctx = { loc, night, sky, diff, veh, spooky: true, heat: true, dry: true, tired: true, stock: true, dawn: true, lowFuel: true, over: false };
              if (!allowed(tp, c, diff === 0)) continue;
              for (const v of tp.vars ?? [null]) {
                const ev: Concrete = { tp, v, ctx: c, key: keyOf(tp, v, c) };
                const r = render(ev);
                const chips = `${LOC_NAME[loc]()} · ${night ? t('gb.rp.night', 'Noite') : t('gb.rp.day', 'Dia')} · ${SKY_NAME[sky]()}`;
                const choices = tp
                  .ch(c, v)
                  .map((ch) => `${label(ch.l)}${ch.cost ? ` (-${scaleMoney(-ch.cost, diff) * -1})` : ''}${ch.need ? ` [${ch.need}]` : ''}${ch.ok.m ? ` ${ch.ok.m > 0 ? '+' : ''}${scaleMoney(ch.ok.m, diff)}` : ''}`)
                  .join(' / ');
                out.push({ key: ev.key, title: r.title, text: r.text, chips, choices });
              }
            }
  return out;
}
