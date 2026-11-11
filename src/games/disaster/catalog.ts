/* ============================================================
 *  CATÁLOGO DE DESASTRES — 38 perigos-base × modificadores = 100+ desastres com nome,
 *  ícone, aviso curto e cartão divertido (Desastrepédia). Tudo dados: o 2D e o 3D leem o
 *  mesmo catálogo; cada perigo aponta para um MOTOR (DisasterId em scenarios.ts) com uma
 *  "pele" e ajustes (Tune). docs/DISASTER-DESIGN.md §9.
 *
 *  Rotação (deck): todos os desastres liberados saem numa ordem embaralhada SEM repetir até
 *  ver todos; a roleta "Próximo desastre: ?" revela qual vem (roulette.ts).
 * ============================================================ */
import { t } from '../../i18n';
import { MAPS, mulberry, type DisasterId, type MapId, type MapTheme, type ModId, type Scenario } from './scenarios';

/* ------------------------------ tipos ------------------------------ */

export type FluidSkin = 'water' | 'jelly' | 'mud' | 'choco' | 'bubble' | 'lava' | 'goo' | 'snow';
export type StrikeSkin = 'meteor' | 'hail' | 'candy' | 'melon' | 'piano' | 'star';
export type BallSkin = 'bowling' | 'snowball' | 'boulder';

/** ajustes de um desastre sobre os motores (o padrão de cada campo é "neutro") */
export interface Tune {
  fluid?: FluidSkin;
  strike?: StrikeSkin;
  ball?: BallSkin;
  /** rajada: areia (tela marrom) ou vento (folhas) */
  gust?: 'sand' | 'wind';
  /** buracos: chão (sumidouro) ou gelo rachando (lago congelado) */
  ice?: boolean;
  /** furacão: tornado + vento constante + chuva que alaga */
  hurricane?: boolean;
  /** "o chão é lava": a lava sobe por igual desde o começo (sem bombas) */
  lavaFloor?: boolean;
  /** cadência dos golpes (× intervalo⁻¹) */
  rate: number;
  /** tamanho (raio dos golpes, tornado, bolas, ondas) */
  size: number;
  /** velocidade das frentes/rolantes */
  speed: number;
  /** gravidade do Bloop (lua < 1) */
  grav: number;
  /** escorregadio (gelo): 1 = normal, < 1 = menos atrito */
  slip: number;
  night: boolean;
  /** vento lateral constante (−1/0/1 sorteado no jogo) */
  wind: boolean;
  rain: boolean;
  fog: boolean;
  mini: boolean;
  giant: boolean;
  turbo: boolean;
}

export type HazardId =
  | 'tsunami'
  | 'geleia'
  | 'lama'
  | 'enchente'
  | 'chocolate'
  | 'bolhas'
  | 'vulcao'
  | 'chaolava'
  | 'acido'
  | 'avalanche'
  | 'meteoros'
  | 'granizo'
  | 'doces'
  | 'melancias'
  | 'pianos'
  | 'boliche'
  | 'bolaneve'
  | 'raios'
  | 'terremoto'
  | 'tornado'
  | 'furacao'
  | 'sumidouro'
  | 'gelo'
  | 'areia'
  | 'vento'
  | 'meteoro'
  | 'gravidade'
  | 'lua'
  | 'buraco'
  | 'abducao'
  | 'laser'
  | 'pisao'
  | 'calor'
  | 'incendio'
  | 'nevasca'
  | 'geiser'
  | 'fantasma'
  | 'abelhas';

export interface Hazard {
  id: HazardId;
  engine: DisasterId;
  /** ícone (chave em icons.ts) */
  icon: string;
  color: string;
  name: () => string;
  /** aviso curto (uma linha: o que fazer) */
  tele: () => string;
  /** cartão divertido da Desastrepédia */
  desc: () => string;
  /** mapas que combinam (o 1º é o preferido) */
  maps: MapId[];
  /** ajustes fixos deste perigo */
  tune?: Partial<Tune>;
  /** 1 = tranquilo para começar … 3 = pede experiência */
  tier: 1 | 2 | 3;
}

const H = (h: Hazard) => h;

/* ------------------------------ perigos-base ------------------------------ */

export const HAZARDS: Record<HazardId, Hazard> = {
  tsunami: H({ id: 'tsunami', engine: 'tsunami', icon: 'tsunami', color: '#2f8cff', tier: 1, maps: ['praia', 'porto', 'ilha', 'vila'], name: () => t('dz.d.tsunami', 'Tsunami'), tele: () => t('dz.h2.tsunami', 'Ondas cada vez maiores! Suba e troque de lugar entre elas.'), desc: () => t('dz.hzd.tsunami', 'O mar recua... e volta com tudo! Ondas gigantes, uma maior que a outra.') }),
  geleia: H({ id: 'geleia', engine: 'tsunami', icon: 'geleia', color: '#ff5aa5', tier: 2, maps: ['doces', 'parque', 'praia'], tune: { fluid: 'jelly', size: 1.1 }, name: () => t('dz.hz.geleia', 'Onda de Gelatina'), tele: () => t('dz.hzt.geleia', 'Uma onda de gelatina! Suba alto e pule entre as ondas.'), desc: () => t('dz.hzd.geleia', 'Alguém derrubou a maior gelatina do mundo! Ela treme, balança e engole tudo.') }),
  lama: H({ id: 'lama', engine: 'avalanche', icon: 'lama', color: '#8a5a33', tier: 2, maps: ['montanha', 'floresta', 'fazenda'], tune: { fluid: 'mud', ball: 'boulder', size: 0.75 }, name: () => t('dz.hz.lama', 'Deslizamento de Lama'), tele: () => t('dz.hzt.lama', 'A lama desce o morro! Suba e pule as pedras rolando.'), desc: () => t('dz.hzd.lama', 'Choveu tanto que o morro virou um escorregador de lama, com pedras de brinde.') }),
  enchente: H({ id: 'enchente', engine: 'enchente', icon: 'enchente', color: '#3fa0e0', tier: 1, maps: ['vila', 'cidade', 'fazenda', 'porto'], name: () => t('dz.d.enchente', 'Enchente'), tele: () => t('dz.h2.enchente', 'A água sobe em etapas. Suba aos poucos e nade se precisar!'), desc: () => t('dz.hzd.enchente', 'Chuva, chuva e mais chuva! A água sobe degrau por degrau. Quem sabe nadar leva vantagem.') }),
  chocolate: H({ id: 'chocolate', engine: 'enchente', icon: 'chocolate', color: '#7a4a2a', tier: 2, maps: ['doces', 'parque', 'vila'], tune: { fluid: 'choco' }, name: () => t('dz.hz.chocolate', 'Enchente de Chocolate'), tele: () => t('dz.hzt.chocolate', 'Rio de chocolate subindo! É grudento: nadar cansa mais.'), desc: () => t('dz.hzd.chocolate', 'A fábrica de chocolate transbordou! Delicioso, mas grudento demais para nadar.') }),
  bolhas: H({ id: 'bolhas', engine: 'enchente', icon: 'bolhas', color: '#9fe8ff', tier: 2, maps: ['praia', 'parque', 'cidade'], tune: { fluid: 'bubble', size: 1.05 }, name: () => t('dz.hz.bolhas', 'Enchente de Bolhas'), tele: () => t('dz.hzt.bolhas', 'Espuma subindo! Dá para nadar nas bolhas, mas ela sobe alto.'), desc: () => t('dz.hzd.bolhas', 'Uma banheira de espuma do tamanho da cidade! Bolhas, bolhas e mais bolhas.') }),
  vulcao: H({ id: 'vulcao', engine: 'vulcao', icon: 'vulcao', color: '#ff5a1f', tier: 1, maps: ['ilha', 'montanha', 'deserto'], name: () => t('dz.d.vulcao', 'Vulcão'), tele: () => t('dz.h2.vulcao', 'A lava desce da direita e bolas de fogo caem. Fuja das sombras!'), desc: () => t('dz.hzd.vulcao', 'O vulcão acordou de mau humor: lava escorrendo e bolas de fogo voando.') }),
  chaolava: H({ id: 'chaolava', engine: 'vulcao', icon: 'chaolava', color: '#ff7a2e', tier: 2, maps: ['parque', 'cidade', 'vila', 'doces'], tune: { lavaFloor: true }, name: () => t('dz.hz.chaolava', 'O Chão é Lava!'), tele: () => t('dz.hzt.chaolava', 'Não encoste no chão! Pule de lugar alto em lugar alto.'), desc: () => t('dz.hzd.chaolava', 'A brincadeira ficou séria: o chão virou lava de verdade! Só vale pisar no alto.') }),
  acido: H({ id: 'acido', engine: 'acido', icon: 'acido', color: '#6aff3f', tier: 1, maps: ['cidade', 'floresta', 'estacao'], name: () => t('dz.d.acido', 'Gosma Verde'), tele: () => t('dz.h2.acido', 'A gosma sobe e derrete as torres. Pule de uma para outra!'), desc: () => t('dz.hzd.acido', 'Uma gosma verde e borbulhante que derrete tudo que encosta. Eca!') }),
  avalanche: H({ id: 'avalanche', engine: 'avalanche', icon: 'avalanche', color: '#e6f2ff', tier: 1, maps: ['montanha', 'polo'], name: () => t('dz.d.avalanche', 'Avalanche'), tele: () => t('dz.h2.avalanche', 'Avalanches da direita e bolas de neve rolando. Suba e pule!'), desc: () => t('dz.hzd.avalanche', 'Toda a neve da montanha resolveu descer de uma vez. Com bolas de neve de brinde!') }),
  meteoros: H({ id: 'meteoros', engine: 'meteoros', icon: 'meteoros', color: '#ff7a2e', tier: 1, maps: ['estacao', 'deserto', 'vila', 'cidade'], name: () => t('dz.d.meteoros', 'Chuva de Meteoros'), tele: () => t('dz.h2.meteoros', 'Não pare! Os meteoros miram onde você vai estar.'), desc: () => t('dz.hzd.meteoros', 'Pedras do espaço caindo como chuva. Elas miram em quem fica parado!') }),
  granizo: H({ id: 'granizo', engine: 'meteoros', icon: 'granizo', color: '#cfeaff', tier: 1, maps: ['fazenda', 'vila', 'polo', 'cidade'], tune: { strike: 'hail', size: 0.6, rate: 2 }, name: () => t('dz.hz.granizo', 'Chuva de Granizo'), tele: () => t('dz.hzt.granizo', 'Pedrinhas de gelo! Entre numa casa ou não pare de correr.'), desc: () => t('dz.hzd.granizo', 'Bolinhas de gelo caindo do céu sem parar. Pequenas, rápidas e muitas!') }),
  doces: H({ id: 'doces', engine: 'meteoros', icon: 'doces', color: '#ff7ac8', tier: 1, maps: ['doces', 'parque', 'vila'], tune: { strike: 'candy', size: 0.9, rate: 1.4 }, name: () => t('dz.hz.doces', 'Chuva de Doces'), tele: () => t('dz.hzt.doces', 'Balas gigantes caindo! Desvie das sombras coloridas.'), desc: () => t('dz.hzd.doces', 'Parece um sonho, mas cada bala pesa mais que uma geladeira! Desvie das sombras.') }),
  melancias: H({ id: 'melancias', engine: 'meteoros', icon: 'melancias', color: '#3fbf5a', tier: 1, maps: ['fazenda', 'praia', 'doces'], tune: { strike: 'melon', size: 1.0, rate: 0.9 }, name: () => t('dz.hz.melancias', 'Chuva de Melancias'), tele: () => t('dz.hzt.melancias', 'Melancias caindo! Saia de baixo e cuidado com o splash.'), desc: () => t('dz.hzd.melancias', 'Um caminhão de frutas voador perdeu a carga. Splash! Splash! Splash!') }),
  pianos: H({ id: 'pianos', engine: 'meteoros', icon: 'pianos', color: '#3a3a5a', tier: 2, maps: ['cidade', 'vila', 'parque'], tune: { strike: 'piano', size: 1.3, rate: 0.8 }, name: () => t('dz.hz.pianos', 'Chuva de Pianos'), tele: () => t('dz.hzt.pianos', 'Pianos caindo! A sombra mostra onde. Eles ficam no chão depois.'), desc: () => t('dz.hzd.pianos', 'Plim, plom, PLOFT! Pianos despencando do céu e deixando uma bagunça musical.') }),
  boliche: H({ id: 'boliche', engine: 'bolas', icon: 'boliche', color: '#5a6bff', tier: 1, maps: ['parque', 'cidade', 'vila'], tune: { ball: 'bowling' }, name: () => t('dz.hz.boliche', 'Bolas de Boliche Gigantes'), tele: () => t('dz.hzt.boliche', 'Bolas rolando! Pule por cima ou suba bem alto.'), desc: () => t('dz.hzd.boliche', 'Um gigante foi jogar boliche e a cidade virou a pista. Você é o pino!') }),
  bolaneve: H({ id: 'bolaneve', engine: 'bolas', icon: 'bolaneve', color: '#e6f2ff', tier: 2, maps: ['polo', 'montanha'], tune: { ball: 'snowball', size: 1.25, speed: 0.85 }, name: () => t('dz.hz.bolaneve', 'Bola de Neve Gigante'), tele: () => t('dz.hzt.bolaneve', 'Bolas de neve enormes! Suba ou pule na hora certa.'), desc: () => t('dz.hzd.bolaneve', 'Começou com uma bolinha... e cresceu, cresceu, cresceu ladeira abaixo!') }),
  raios: H({ id: 'raios', engine: 'raios', icon: 'raios', color: '#ffe14d', tier: 1, maps: ['floresta', 'vila', 'fazenda', 'praia'], name: () => t('dz.d.raios', 'Tempestade de Raios'), tele: () => t('dz.h2.raios', 'Os raios caem no mais alto! Fique baixo, mas fora da água.'), desc: () => t('dz.hzd.raios', 'Trovões e raios! Eles adoram cair no ponto mais alto. Fique baixinho.') }),
  terremoto: H({ id: 'terremoto', engine: 'terremoto', icon: 'terremoto', color: '#b07a43', tier: 1, maps: ['cidade', 'vila', 'montanha', 'deserto'], name: () => t('dz.d.terremoto', 'Terremoto'), tele: () => t('dz.h2.terremoto', 'O chão vai rachar! Fuja das rachaduras e das sombras.'), desc: () => t('dz.hzd.terremoto', 'O chão treme, racha e derruba prédios. Fique longe de tudo que pode cair!') }),
  tornado: H({ id: 'tornado', engine: 'tornado', icon: 'tornado', color: '#8a94b8', tier: 1, maps: ['fazenda', 'vila', 'deserto', 'cidade'], name: () => t('dz.d.tornado', 'Tornado'), tele: () => t('dz.h2.tornado', 'Abrigue-se numa casa, mas o tornado arranca telhados. Fique longe dele!'), desc: () => t('dz.hzd.tornado', 'Um funil de vento que persegue quem está do lado de fora e arranca telhados!') }),
  furacao: H({ id: 'furacao', engine: 'tornado', icon: 'furacao', color: '#5a7ab8', tier: 2, maps: ['praia', 'porto', 'ilha'], tune: { hurricane: true, wind: true, rain: true }, name: () => t('dz.hz.furacao', 'Furacão'), tele: () => t('dz.hzt.furacao', 'Vento fortíssimo, chuva e tornado! Abrigue-se e segure firme.'), desc: () => t('dz.hzd.furacao', 'O primo grandão do tornado: vento que empurra, chuva que alaga e um funil no meio.') }),
  sumidouro: H({ id: 'sumidouro', engine: 'sumidouro', icon: 'sumidouro', color: '#8a5a33', tier: 1, maps: ['cidade', 'deserto', 'fazenda'], name: () => t('dz.d.sumidouro', 'Sumidouro'), tele: () => t('dz.h.sumidouro', 'O chão afunda onde aparecem rachaduras. Vá para o chão firme!'), desc: () => t('dz.hzd.sumidouro', 'Buracos que aparecem do nada e crescem. O chão está virando queijo suíço!') }),
  gelo: H({ id: 'gelo', engine: 'sumidouro', icon: 'gelo', color: '#9fd8ff', tier: 2, maps: ['polo', 'montanha'], tune: { ice: true, slip: 0.35 }, name: () => t('dz.hz.gelo', 'Gelo Rachando'), tele: () => t('dz.hzt.gelo', 'O lago congelado está rachando! Escorregue para longe das rachaduras.'), desc: () => t('dz.hzd.gelo', 'Patinar no lago congelado era divertido... até o gelo começar a estalar!') }),
  areia: H({ id: 'areia', engine: 'areia', icon: 'areia', color: '#e0a060', tier: 1, maps: ['deserto', 'praia', 'fazenda'], tune: { gust: 'sand' }, name: () => t('dz.d.areia', 'Tempestade de Areia'), tele: () => t('dz.h.areia', 'Rajadas e destroços voando! Entre numa casa ou pule os destroços.'), desc: () => t('dz.hzd.areia', 'Uma parede de areia que esconde tudo e arremessa coisas. Feche os olhinhos!') }),
  vento: H({ id: 'vento', engine: 'areia', icon: 'vento', color: '#a8e0c8', tier: 1, maps: ['fazenda', 'porto', 'vila', 'praia'], tune: { gust: 'wind', speed: 1.15 }, name: () => t('dz.hz.vento', 'Ventania'), tele: () => t('dz.hzt.vento', 'Rajadas de vento! Segure-se e pule as coisas voando.'), desc: () => t('dz.hzd.vento', 'O vento resolveu brincar de arrumar a cidade... jogando tudo para o lado!') }),
  meteoro: H({ id: 'meteoro', engine: 'meteoro', icon: 'meteoro', color: '#ff3f6a', tier: 2, maps: ['vila', 'cidade', 'deserto', 'fazenda'], name: () => t('dz.d.meteoro', 'Meteoro Gigante'), tele: () => t('dz.h.meteoro', 'Corra até o bunker antes do impacto!'), desc: () => t('dz.hzd.meteoro', 'O grandão está vindo! Só o bunker no fim da estrada aguenta. Corra!') }),
  gravidade: H({ id: 'gravidade', engine: 'gravidade', icon: 'gravidade', color: '#b69cff', tier: 2, maps: ['estacao', 'cidade', 'parque'], name: () => t('dz.hz.gravidade', 'Gravidade Maluca'), tele: () => t('dz.hzt.gravidade', 'Quando tudo flutuar, fique embaixo de um teto!'), desc: () => t('dz.hzd.gravidade', 'De vez em quando a gravidade tira férias e tudo sai voando para o céu!') }),
  lua: H({ id: 'lua', engine: 'meteoros', icon: 'lua', color: '#c9c3ff', tier: 2, maps: ['estacao'], tune: { grav: 0.5, strike: 'star', size: 1.1, rate: 0.9 }, name: () => t('dz.hz.lua', 'Gravidade Lunar'), tele: () => t('dz.hzt.lua', 'Pulos de astronauta! Use-os para fugir das estrelas cadentes.'), desc: () => t('dz.hzd.lua', 'Na estação espacial tudo flutua: pulos enormes e estrelas cadentes por todo lado.') }),
  buraco: H({ id: 'buraco', engine: 'buraco', icon: 'buraco', color: '#7a4dff', tier: 3, maps: ['estacao', 'cidade', 'deserto'], name: () => t('dz.hz.buraco', 'Buraco Negro'), tele: () => t('dz.hzt.buraco', 'Ele puxa tudo para o meio! Corra para longe ou entre numa casa.'), desc: () => t('dz.hzd.buraco', 'Um buraco no céu que suga tudo: caixas, telhados e Bloops distraídos!') }),
  abducao: H({ id: 'abducao', engine: 'abducao', icon: 'abducao', color: '#7dff9a', tier: 2, maps: ['fazenda', 'deserto', 'vila'], name: () => t('dz.hz.abducao', 'Abdução Alienígena'), tele: () => t('dz.hzt.abducao', 'Saia da luz do disco voador ou fique embaixo de um teto!'), desc: () => t('dz.hzd.abducao', 'Alienígenas curiosos querem levar um Bloop de lembrança. Não seja escolhido!') }),
  laser: H({ id: 'laser', engine: 'laser', icon: 'laser', color: '#ff4fd8', tier: 2, maps: ['estacao', 'cidade', 'parque'], name: () => t('dz.hz.laser', 'Lasers de Disco Voador'), tele: () => t('dz.hzt.laser', 'Laser baixo: pule! Laser alto: fique no chão!'), desc: () => t('dz.hzd.laser', 'Discos voadores varrendo a cidade com lasers coloridos. Pule ou abaixe!') }),
  pisao: H({ id: 'pisao', engine: 'pisao', icon: 'pisao', color: '#a07850', tier: 2, maps: ['cidade', 'vila', 'floresta'], name: () => t('dz.hz.pisao', 'Pisão do Gigante'), tele: () => t('dz.hzt.pisao', 'Saia da sombra do pé e pule quando ele bater no chão!'), desc: () => t('dz.hzd.pisao', 'Um gigante distraído passeando pela cidade. Cada passo é um terremoto!') }),
  calor: H({ id: 'calor', engine: 'calor', icon: 'calor', color: '#ffb000', tier: 1, maps: ['deserto', 'praia', 'cidade'], name: () => t('dz.hz.calor', 'Onda de Calor'), tele: () => t('dz.hzt.calor', 'Fuja do sol! Fique na sombra ou dentro de uma casa.'), desc: () => t('dz.hzd.calor', 'O sol está tão forte que até os sorvetes estão suando. Procure sombra!') }),
  incendio: H({ id: 'incendio', engine: 'incendio', icon: 'incendio', color: '#ff6a1e', tier: 2, maps: ['floresta', 'fazenda', 'montanha'], name: () => t('dz.hz.incendio', 'Incêndio na Floresta'), tele: () => t('dz.hzt.incendio', 'O fogo vem dos lados! Suba e desça no chão já queimado.'), desc: () => t('dz.hzd.incendio', 'O fogo avança pelo chão e pelas árvores. Espere no alto e passe pelo chão já apagado.') }),
  nevasca: H({ id: 'nevasca', engine: 'nevasca', icon: 'nevasca', color: '#9fd8ff', tier: 1, maps: ['polo', 'montanha', 'vila'], tune: { slip: 0.55 }, name: () => t('dz.hz.nevasca', 'Nevasca Congelante'), tele: () => t('dz.hzt.nevasca', 'Fique quentinho: dentro de casa ou perto da fogueira!'), desc: () => t('dz.hzd.nevasca', 'Tão frio que o nariz congela! Ache uma fogueira ou uma casa quentinha.') }),
  geiser: H({ id: 'geiser', engine: 'geiser', icon: 'geiser', color: '#7fe0ff', tier: 1, maps: ['ilha', 'montanha', 'polo', 'deserto'], name: () => t('dz.hz.geiser', 'Campo de Gêiseres'), tele: () => t('dz.hzt.geiser', 'Saia de cima do chão que borbulha!'), desc: () => t('dz.hzd.geiser', 'O chão borbulha e PUF! Jatos de água quente saem lá de baixo.') }),
  fantasma: H({ id: 'fantasma', engine: 'fantasma', icon: 'fantasma', color: '#cfd8ff', tier: 1, maps: ['floresta', 'vila', 'montanha'], tune: { fog: true, night: true }, name: () => t('dz.hz.fantasma', 'Neblina dos Fantasminhas'), tele: () => t('dz.hzt.fantasma', 'Fantasminhas brincalhões! Fuja deles ou entre numa casa iluminada.'), desc: () => t('dz.hzd.fantasma', 'Na neblina aparecem fantasminhas que querem brincar de pega-pega. Buu!') }),
  abelhas: H({ id: 'abelhas', engine: 'abelhas', icon: 'abelhas', color: '#ffd23f', tier: 1, maps: ['fazenda', 'floresta', 'parque'], name: () => t('dz.hz.abelhas', 'Enxame de Abelhas'), tele: () => t('dz.hzt.abelhas', 'Corra do enxame e entre numa casa para despistar!'), desc: () => t('dz.hzd.abelhas', 'Alguém mexeu na colmeia! Um enxame zangado procura quem foi. Bzzz!') }),
};

/* ------------------------------ modificadores ------------------------------ */

export type ModKey = 'noite' | 'vento' | 'rapido' | 'gigante' | 'mini' | 'chuva' | 'neblina';
export const MOD_DESC: Record<ModKey, () => string> = {
  noite: () => t('dz.md.noite', 'De noite: tudo fica mais escuro!'),
  vento: () => t('dz.md.vento', 'Com ventania empurrando para o lado.'),
  rapido: () => t('dz.md.rapido', 'Turbo: tudo acontece mais rápido!'),
  gigante: () => t('dz.md.gigante', 'Versão gigante: maior, mais forte, porém mais lenta.'),
  mini: () => t('dz.md.mini', 'Versão mini: pequenininhos, mas são muitos!'),
  chuva: () => t('dz.md.chuva', 'Com chuva forte alagando o chão.'),
  neblina: () => t('dz.md.neblina', 'Com neblina: difícil enxergar longe.'),
};

/* ------------------------------ desastres (entradas) ------------------------------ */

export interface DzEntry {
  /** nº na Desastrepédia (1..N, na ordem da lista) */
  n: number;
  key: string;
  hz: HazardId[];
  mods: ModKey[];
  name: () => string;
  /** mapas (padrão: os do 1º perigo) */
  maps?: MapId[];
  tier: 1 | 2 | 3;
}

type Raw = [key: string, hz: HazardId[], mods: ModKey[], name: (() => string) | null, maps?: MapId[]];

/** a lista (nomes explícitos para o i18n achar cada t()) */
const RAW: Raw[] = [
  // ---- 38 perigos-base (nome = nome do perigo) ----
  ...(Object.keys(HAZARDS) as HazardId[]).map((h): Raw => [h, [h], [], null]),
  // ---- noite ----
  ['tsunami_noite', ['tsunami'], ['noite'], () => t('dz.e.tsunami_noite', 'Tsunami ao Luar')],
  ['tornado_noite', ['tornado'], ['noite'], () => t('dz.e.tornado_noite', 'Tornado da Meia-Noite')],
  ['meteoros_noite', ['meteoros'], ['noite'], () => t('dz.e.meteoros_noite', 'Noite das Estrelas Cadentes')],
  ['vulcao_noite', ['vulcao'], ['noite'], () => t('dz.e.vulcao_noite', 'Vulcão na Escuridão')],
  ['enchente_noite', ['enchente'], ['noite'], () => t('dz.e.enchente_noite', 'Enchente Noturna')],
  ['incendio_noite', ['incendio'], ['noite'], () => t('dz.e.incendio_noite', 'Fogueira Fora de Controle')],
  ['terremoto_noite', ['terremoto'], ['noite'], () => t('dz.e.terremoto_noite', 'Terremoto no Escuro')],
  ['avalanche_noite', ['avalanche'], ['noite'], () => t('dz.e.avalanche_noite', 'Avalanche Noturna')],
  ['geiser_noite', ['geiser'], ['noite'], () => t('dz.e.geiser_noite', 'Gêiseres ao Luar')],
  ['abducao_noite', ['abducao'], ['noite'], () => t('dz.e.abducao_noite', 'Discos na Noite')],
  ['laser_noite', ['laser'], ['noite'], () => t('dz.e.laser_noite', 'Balada de Lasers')],
  ['abelhas_noite', ['abelhas'], ['noite'], () => t('dz.e.abelhas_noite', 'Vaga-lumes Zangados')],
  // ---- turbo ----
  ['tsunami_turbo', ['tsunami'], ['rapido'], () => t('dz.e.tsunami_turbo', 'Tsunami Turbo')],
  ['tornado_turbo', ['tornado'], ['rapido'], () => t('dz.e.tornado_turbo', 'Tornado a Jato')],
  ['meteoros_turbo', ['meteoros'], ['rapido'], () => t('dz.e.meteoros_turbo', 'Meteoros Supersônicos')],
  ['boliche_turbo', ['boliche'], ['rapido'], () => t('dz.e.boliche_turbo', 'Strike Turbo')],
  ['enchente_turbo', ['enchente'], ['rapido'], () => t('dz.e.enchente_turbo', 'Enchente Relâmpago')],
  ['chaolava_turbo', ['chaolava'], ['rapido'], () => t('dz.e.chaolava_turbo', 'O Chão é Lava Turbo')],
  ['terremoto_turbo', ['terremoto'], ['rapido'], () => t('dz.e.terremoto_turbo', 'Terremoto Agitado')],
  ['abelhas_turbo', ['abelhas'], ['rapido'], () => t('dz.e.abelhas_turbo', 'Abelhas a Jato')],
  ['laser_turbo', ['laser'], ['rapido'], () => t('dz.e.laser_turbo', 'Lasers Hiperativos')],
  ['granizo_turbo', ['granizo'], ['rapido'], () => t('dz.e.granizo_turbo', 'Granizo Metralhadora')],
  // ---- gigante ----
  ['tsunami_giga', ['tsunami'], ['gigante'], () => t('dz.e.tsunami_giga', 'Mega Tsunami')],
  ['tornado_giga', ['tornado'], ['gigante'], () => t('dz.e.tornado_giga', 'Tornadão')],
  ['meteoros_giga', ['meteoros'], ['gigante'], () => t('dz.e.meteoros_giga', 'Meteoros do Tamanho de Casas')],
  ['pisao_giga', ['pisao'], ['gigante'], () => t('dz.e.pisao_giga', 'Pisão do Rei Gigante')],
  ['bolaneve_giga', ['bolaneve'], ['gigante'], () => t('dz.e.bolaneve_giga', 'Bola de Neve Colossal')],
  ['granizo_giga', ['granizo'], ['gigante'], () => t('dz.e.granizo_giga', 'Granizo do Tamanho de Melancia')],
  ['pianos_giga', ['pianos'], ['gigante'], () => t('dz.e.pianos_giga', 'Pianos de Cauda Gigantes')],
  ['abelhas_giga', ['abelhas'], ['gigante'], () => t('dz.e.abelhas_giga', 'A Abelha Rainha')],
  // ---- mini ----
  ['tornado_mini', ['tornado'], ['mini'], () => t('dz.e.tornado_mini', 'Mini-Tornados')],
  ['meteoros_mini', ['meteoros'], ['mini'], () => t('dz.e.meteoros_mini', 'Chuvisco de Meteorinhos')],
  ['tsunami_mini', ['tsunami'], ['mini'], () => t('dz.e.tsunami_mini', 'Ondinhas Bagunceiras')],
  ['terremoto_mini', ['terremoto'], ['mini'], () => t('dz.e.terremoto_mini', 'Tremeliques')],
  ['pisao_mini', ['pisao'], ['mini'], () => t('dz.e.pisao_mini', 'Pisõezinhos')],
  ['sumidouro_mini', ['sumidouro'], ['mini'], () => t('dz.e.sumidouro_mini', 'Buraquinhos por Todo Lado')],
  // ---- vento / chuva / neblina ----
  ['vulcao_vento', ['vulcao'], ['vento'], () => t('dz.e.vulcao_vento', 'Vulcão na Ventania')],
  ['incendio_vento', ['incendio'], ['vento'], () => t('dz.e.incendio_vento', 'Fogo Soprado')],
  ['nevasca_vento', ['nevasca'], ['vento'], () => t('dz.e.nevasca_vento', 'Nevasca Uivante')],
  ['tsunami_chuva', ['tsunami'], ['chuva'], () => t('dz.e.tsunami_chuva', 'Tsunami de Tempestade')],
  ['meteoros_neblina', ['meteoros'], ['neblina'], () => t('dz.e.meteoros_neblina', 'Meteoros na Neblina')],
  ['calor_vento', ['calor'], ['vento'], () => t('dz.e.calor_vento', 'Vento Quente do Deserto')],
  // ---- combos ----
  ['c_terremoto_tsunami', ['terremoto', 'tsunami'], [], () => t('dz.e.c_terremoto_tsunami', 'Terremoto e Tsunami')],
  ['c_tornado_raios', ['tornado', 'raios'], [], () => t('dz.e.c_tornado_raios', 'Supertempestade')],
  ['c_vulcao_terremoto', ['vulcao', 'terremoto'], [], () => t('dz.e.c_vulcao_terremoto', 'O Vulcão Acordou')],
  ['c_tsunami_meteoros', ['tsunami', 'meteoros'], [], () => t('dz.e.c_tsunami_meteoros', 'Meteoro no Mar')],
  ['c_furacao_raios', ['furacao', 'raios'], [], () => t('dz.e.c_furacao_raios', 'A Tempestade Perfeita')],
  ['c_avalanche_terremoto', ['avalanche', 'terremoto'], [], () => t('dz.e.c_avalanche_terremoto', 'Montanha Desmoronando')],
  ['c_acido_raios', ['acido', 'raios'], [], () => t('dz.e.c_acido_raios', 'Laboratório Maluco')],
  ['c_abducao_laser', ['abducao', 'laser'], [], () => t('dz.e.c_abducao_laser', 'Invasão Alienígena')],
  ['c_buraco_meteoros', ['buraco', 'meteoros'], [], () => t('dz.e.c_buraco_meteoros', 'Tempestade Cósmica')],
  ['c_gravidade_meteoros', ['gravidade', 'meteoros'], [], () => t('dz.e.c_gravidade_meteoros', 'Gravidade Zero')],
  ['c_calor_incendio', ['calor', 'incendio'], [], () => t('dz.e.c_calor_incendio', 'Verão de Fogo')],
  ['c_nevasca_avalanche', ['avalanche', 'nevasca'], [], () => t('dz.e.c_nevasca_avalanche', 'Inverno Sem Fim')],
  ['c_geiser_terremoto', ['geiser', 'terremoto'], [], () => t('dz.e.c_geiser_terremoto', 'Terra Fervendo')],
  ['c_fantasma_raios', ['fantasma', 'raios'], [], () => t('dz.e.c_fantasma_raios', 'Noite Assombrada')],
  ['c_tornado_abelhas', ['tornado', 'abelhas'], [], () => t('dz.e.c_tornado_abelhas', 'Tornado de Abelhas')],
  ['c_chocolate_doces', ['chocolate', 'doces'], [], () => t('dz.e.c_chocolate_doces', 'Fábrica de Doces Maluca')],
  ['c_geleia_doces', ['geleia', 'doces'], [], () => t('dz.e.c_geleia_doces', 'Festa da Gelatina')],
  ['c_pianos_boliche', ['boliche', 'pianos'], [], () => t('dz.e.c_pianos_boliche', 'Concerto Desastroso')],
  ['c_bolhas_melancias', ['bolhas', 'melancias'], [], () => t('dz.e.c_bolhas_melancias', 'Festa na Piscina')],
  ['c_sumidouro_enchente', ['enchente', 'sumidouro'], [], () => t('dz.e.c_sumidouro_enchente', 'Cidade Afundando')],
  ['c_gelo_nevasca', ['gelo', 'nevasca'], [], () => t('dz.e.c_gelo_nevasca', 'Lago Congelado')],
  ['c_chaolava_laser', ['chaolava', 'laser'], [], () => t('dz.e.c_chaolava_laser', 'Chão de Lava com Lasers')],
  ['c_pisao_terremoto', ['pisao', 'terremoto'], [], () => t('dz.e.c_pisao_terremoto', 'O Passeio do Gigante')],
  ['c_areia_calor', ['calor', 'areia'], [], () => t('dz.e.c_areia_calor', 'Deserto Escaldante')],
  ['c_tsunami_tornado', ['tsunami', 'tornado'], [], () => t('dz.e.c_tsunami_tornado', "Tromba d'Água")],
  ['c_vulcao_meteoros', ['vulcao', 'meteoros'], [], () => t('dz.e.c_vulcao_meteoros', 'Chuva de Fogo')],
  ['c_lama_raios', ['lama', 'raios'], [], () => t('dz.e.c_lama_raios', 'Temporal na Serra')],
  ['c_vento_granizo', ['granizo', 'vento'], [], () => t('dz.e.c_vento_granizo', 'Granizo na Ventania')],
  ['c_geiser_gelo', ['geiser', 'gelo'], [], () => t('dz.e.c_geiser_gelo', 'Fogo e Gelo')],
  ['c_fantasma_abelhas', ['fantasma', 'abelhas'], [], () => t('dz.e.c_fantasma_abelhas', 'Pega-Pega Assombrado')],
  ['c_lua_laser', ['lua', 'laser'], [], () => t('dz.e.c_lua_laser', 'Guerra nas Estrelas de Brinquedo')],
  // ---- mapas especiais ----
  ['meteoro_noite', ['meteoro'], ['noite'], () => t('dz.e.meteoro_noite', 'Meteoro Gigante à Noite')],
  ['chocolate_parque', ['chocolate'], ['chuva'], () => t('dz.e.chocolate_parque', 'Chuva de Chocolate Quente'), ['parque', 'doces']],
  ['geleia_turbo', ['geleia'], ['rapido'], () => t('dz.e.geleia_turbo', 'Gelatina Tremelique')],
  ['buraco_mini', ['buraco'], ['mini'], () => t('dz.e.buraco_mini', 'Buraquinho Negro')],
];

/* ------------------------------ montagem ------------------------------ */

const MOD_TIER: Record<ModKey, number> = { noite: 1, vento: 1, rapido: 2, gigante: 2, mini: 1, chuva: 1, neblina: 1 };

let ENTRIES: DzEntry[] | null = null;
export function entries(): DzEntry[] {
  if (ENTRIES) return ENTRIES;
  ENTRIES = RAW.map(([key, hz, mods, name, maps], i): DzEntry => {
    const base = HAZARDS[hz[0]];
    let tier = Math.max(...hz.map((h) => HAZARDS[h].tier)) as number;
    for (const m of mods) tier = Math.max(tier, MOD_TIER[m] + (base.tier > 1 ? 1 : 0));
    if (hz.length > 1) tier = Math.max(2, tier) + (hz.some((h) => HAZARDS[h].tier >= 2) ? 1 : 0);
    return { n: i + 1, key, hz, mods, name: name ?? base.name, maps, tier: Math.min(3, tier) as 1 | 2 | 3 };
  });
  return ENTRIES;
}
export function entryByKey(k: string): DzEntry | undefined {
  return entries().find((e) => e.key === k);
}

/** descrição do cartão: do 1º perigo + (combo) o 2º + modificadores */
export function entryDesc(e: DzEntry): string {
  const parts = [HAZARDS[e.hz[0]].desc()];
  if (e.hz[1]) parts.push(t('dz.e.combo', 'E ainda vem junto: {name}!', { name: HAZARDS[e.hz[1]].name() }));
  for (const m of e.mods) parts.push(MOD_DESC[m]());
  return parts.join(' ');
}
/** aviso curto (o que fazer) do desastre que está acontecendo agora */
export function entryTele(e: DzEntry, idx = 0): string {
  return HAZARDS[e.hz[Math.min(idx, e.hz.length - 1)]].tele();
}

/** ajustes combinados (perigos + modificadores) */
export function tuneOf(e: DzEntry): Tune {
  const tn: Tune = { rate: 1, size: 1, speed: 1, grav: 1, slip: 1, night: false, wind: false, rain: false, fog: false, mini: false, giant: false, turbo: false };
  for (const h of e.hz) {
    const o = HAZARDS[h].tune;
    if (!o) continue;
    for (const k of Object.keys(o) as (keyof Tune)[]) {
      const v = o[k];
      if (k === 'rate' || k === 'size' || k === 'speed' || k === 'grav' || k === 'slip') (tn[k] as number) *= v as number;
      else (tn as unknown as Record<string, unknown>)[k] = v;
    }
  }
  for (const m of e.mods) {
    if (m === 'noite') tn.night = true;
    else if (m === 'vento') tn.wind = true;
    else if (m === 'chuva') tn.rain = true;
    else if (m === 'neblina') tn.fog = true;
    else if (m === 'rapido') tn.turbo = true;
    else if (m === 'gigante') {
      tn.giant = true;
      tn.size *= 1.4;
      tn.rate *= 0.7;
    } else if (m === 'mini') {
      tn.mini = true;
      tn.size *= 0.62;
      tn.rate *= 1.6;
    }
  }
  return tn;
}

/** monta o cenário da rodada a partir de um desastre do catálogo */
export function buildScenario(e: DzEntry, seed: number, difficulty: number, mapPick?: MapId): Scenario {
  const r = mulberry(seed * 7 + 11);
  const pool = e.maps ?? HAZARDS[e.hz[0]].maps;
  const id = mapPick ?? pool[Math.floor(r() * Math.min(pool.length, 3))] ?? pool[0];
  const map: MapTheme = MAPS.find((m) => m.id === id) ?? MAPS[0];
  const engines = e.hz.map((h) => HAZARDS[h].engine);
  // dois perigos no mesmo motor (ex.: chuva de doces + chocolate é ok; granizo + vento = meteoros + areia)
  const disasters = engines.filter((d, i) => engines.indexOf(d) === i);
  const mod: ModId = e.mods.includes('noite') ? 'noite' : e.mods.includes('vento') ? 'vento' : e.mods.includes('rapido') ? 'rapido' : disasters.length > 1 ? 'dupla' : 'none';
  return { n: e.n, seed, map, disasters, mod, difficulty, tune: tuneOf(e), key: e.key };
}

/* ------------------------------ Desastrepédia + deck ------------------------------ */

const PEDIA_KEY = 'bo-dz-pedia';
export interface Pedia {
  /** chave → [vezes visto, vezes sobrevivido] */
  seen: Record<string, [number, number]>;
  /** ordem embaralhada do que falta sair (sem repetir até ver todos) */
  deck: string[];
  /** últimos que saíram (não repete logo depois de reembaralhar) */
  recent: string[];
  /** rodadas jogadas (libera desastres mais difíceis) */
  rounds: number;
}
export function loadPedia(): Pedia {
  try {
    const p = JSON.parse(localStorage.getItem(PEDIA_KEY) || '{}');
    return { seen: p.seen && typeof p.seen === 'object' ? p.seen : {}, deck: Array.isArray(p.deck) ? p.deck : [], recent: Array.isArray(p.recent) ? p.recent : [], rounds: p.rounds | 0 };
  } catch {
    return { seen: {}, deck: [], recent: [], rounds: 0 };
  }
}
export function savePedia(p: Pedia): void {
  try {
    localStorage.setItem(PEDIA_KEY, JSON.stringify(p));
  } catch {
    /* sem armazenamento */
  }
}
export function markSeen(key: string, survived: boolean): void {
  const p = loadPedia();
  const s = p.seen[key] ?? [0, 0];
  s[0]++;
  if (survived) s[1]++;
  p.seen[key] = s;
  savePedia(p);
}

/** tier liberado pelas rodadas jogadas: começa só com os tranquilos */
export function tierFor(rounds: number): number {
  return rounds < 5 ? 1 : rounds < 14 ? 2 : 3;
}

/** primeiros desastres de quem nunca jogou: variados e "fáceis de entender" (nada de sempre tsunami!) */
const FIRST = ['enchente', 'terremoto', 'meteoros', 'tornado', 'granizo', 'abelhas', 'geiser', 'doces', 'calor', 'boliche', 'tsunami', 'vento'];

function shuffle<T>(a: T[], r: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/**
 * Próximo desastre do deck pessoal: tira o primeiro liberado; quando o deck esvazia (ou ficou só
 * com bloqueados), reembaralha tudo o que está liberado, sem os últimos que saíram. Salva.
 */
export function drawNext(rand: () => number = Math.random): DzEntry {
  const p = loadPedia();
  const all = entries();
  const tier = tierFor(p.rounds);
  // meteoro gigante (percurso + bunker) só depois de umas rodadas
  const ok = (e: DzEntry) => e.tier <= tier && !(e.hz[0] === 'meteoro' && p.rounds < 4);
  let pick: DzEntry | undefined;
  if (p.rounds < 3) {
    const fresh = FIRST.filter((k) => !p.recent.includes(k));
    pick = entryByKey(fresh[Math.floor(rand() * fresh.length)] ?? FIRST[0]);
  }
  if (!pick) {
    // deck: o que ainda não saiu, priorizando o nunca visto
    p.deck = p.deck.filter((k) => {
      const e = entryByKey(k);
      return !!e && ok(e);
    });
    if (!p.deck.length) {
      const unseen = all.filter((e) => ok(e) && !p.seen[e.key]).map((e) => e.key);
      const seen = all.filter((e) => ok(e) && p.seen[e.key] && !p.recent.includes(e.key)).map((e) => e.key);
      p.deck = [...shuffle(unseen, rand), ...shuffle(seen, rand)];
      if (!p.deck.length) p.deck = shuffle(all.filter(ok).map((e) => e.key), rand);
    }
    pick = entryByKey(p.deck.shift()!) ?? all[0];
  }
  p.recent = [pick.key, ...p.recent.filter((k) => k !== pick!.key)].slice(0, 12);
  p.rounds++;
  savePedia(p);
  return pick;
}

/** sequência fixa para o grupo (todos veem o mesmo desastre na rodada k) */
export function partyPick(code: number, k: number): DzEntry {
  const all = entries().filter((e) => e.hz[0] !== 'meteoro' || k % 10 === 9);
  const order = shuffle(
    all.map((_, i) => i),
    mulberry(code * 31 + 7),
  );
  return all[order[k % order.length]];
}

/** dificuldade (estrelas) pela experiência: sobe devagar com as rodadas jogadas */
export function starsFor(rounds: number, e: DzEntry): number {
  return Math.max(1, Math.min(5, 1 + Math.floor(rounds / 12) + (e.tier >= 3 ? 1 : 0)));
}
