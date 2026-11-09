/**
 * CATÁLOGO DOS 300 BICHINHOS — 60 temporadas × 5 raridades.
 *
 * Cada entrada da TABELA é uma ficha de design curada à mão:
 *   nome | arquétipo | topo | olhos | boca | padrão | membros | adereços(+) | cor | descrição
 * A paleta final mistura a cor própria com a paleta da temporada (seasons.ts).
 * Unicidade (assinatura visual e nomes) é verificada por scripts/dev/check-creatures.mjs.
 */
import type { CreatureDef, CreatureRarity, SeasonCreatures } from './api';
import { SEASONS } from './seasons';

export type Archetype =
  | 'blob' | 'bean' | 'egg' | 'cone' | 'cat' | 'fox' | 'bird' | 'dino' | 'jelly' | 'fish' | 'bug' | 'sprout'
  | 'cloud' | 'robot' | 'ghost' | 'star' | 'slime' | 'fluff' | 'dragon' | 'bunny' | 'bear' | 'penguin'
  | 'mushroom' | 'cube' | 'seal' | 'gem' | 'drop' | 'octo' | 'snail';
export type TopPart =
  | 'none' | 'cat' | 'fox' | 'bunny' | 'bear' | 'droop' | 'antlers' | 'horns' | 'ramhorns' | 'unihorn' | 'antennae'
  | 'crest' | 'sprout' | 'leaves' | 'spikes' | 'fin' | 'flame' | 'curl' | 'tuft' | 'gills' | 'tufts' | 'bolt'
  | 'propeller' | 'mane' | 'knobs' | 'bigears' | 'flower' | 'crystals' | 'lure' | 'vfin';
export type EyeStyle =
  | 'dot' | 'big' | 'happy' | 'sleepy' | 'star' | 'heart' | 'wink' | 'lash' | 'visor' | 'cyclops' | 'sparkle'
  | 'spiral' | 'pixel' | 'frog' | 'stalk' | 'triple';
export type MouthStyle =
  | 'smile' | 'open' | 'cat' | 'fang' | 'tongue' | 'beak' | 'bigbeak' | 'grin' | 'dot' | 'ooh' | 'teeth' | 'nose'
  | 'wavy' | 'trunk' | 'carrot' | 'tusks';
export type Pattern =
  | 'none' | 'belly' | 'spots' | 'stripes' | 'stars' | 'hearts' | 'cap' | 'checker' | 'freckles' | 'zigzag'
  | 'dots' | 'bands' | 'mask' | 'ribs' | 'scales' | 'cracks' | 'rainbow' | 'panda' | 'gears' | 'gems' | 'soccer'
  | 'swirl';
export type Limbs =
  | 'none' | 'feet' | 'arms' | 'wings' | 'bigwings' | 'batwings' | 'bfwings' | 'fins' | 'tentacles' | 'legs6'
  | 'tail' | 'fluffytail' | 'wheels' | 'leafarms' | 'flippers' | 'jet' | 'claws' | 'cactusarms';
export type Prop =
  | 'beanie' | 'scarf' | 'earmuffs' | 'party' | 'clock' | 'wand' | 'tophat' | 'bow' | 'mask' | 'tiara' | 'crown'
  | 'leafhat' | 'flower' | 'cherry' | 'lollipop' | 'pearls' | 'spout' | 'popcorn' | 'straw' | 'bandana' | 'gear'
  | 'eggshell' | 'goggles' | 'map' | 'pirate' | 'eyepatch' | 'witch' | 'cape' | 'snowball' | 'headphones' | 'note'
  | 'mic' | 'guitar' | 'bowtie' | 'cap' | 'sunglasses' | 'helmet' | 'topstar' | 'astro' | 'glasses' | 'wizard'
  | 'medal' | 'laurel' | 'potion' | 'chef' | 'spoon' | 'nightcap' | 'moon' | 'lantern' | 'headband' | 'kabuto'
  | 'lei' | 'badge' | 'cowboy' | 'balloon' | 'hourglass' | 'windkey' | 'trophy' | 'flag' | 'ball' | 'torch'
  | 'magnifier' | 'sleuth' | 'mushhat' | 'saucer' | 'ring' | 'candle' | 'pole' | 'crystal' | 'bell' | 'beret' | 'nemes';

/** Partículas do lendário (e brilho do épico) por temporada. */
export type FxKind =
  | 'snow' | 'stars' | 'confetti' | 'leaves' | 'hearts' | 'bubbles' | 'embers' | 'gears' | 'notes' | 'pixels'
  | 'petals' | 'sparkles' | 'bolts' | 'moons' | 'gems';

export interface CreatureDesign {
  arch: Archetype;
  top: TopPart;
  eyes: EyeStyle;
  mouth: MouthStyle;
  pattern: Pattern;
  limbs: Limbs;
  props: Prop[];
  /** cor principal do corpo */
  col: string;
  /** destaque (adereços) e destaque 2 (padrão/barriga), vindos da paleta da temporada */
  acc: string;
  acc2: string;
  fx: FxKind;
}

export interface CreatureFull extends CreatureDef {
  design: CreatureDesign;
}

export const RARITIES: CreatureRarity[] = ['common', 'medio', 'rare', 'epic', 'legendary'];

const FX: FxKind[] = [
  'snow', 'confetti', 'confetti', 'leaves', 'hearts', 'bubbles', 'embers', 'gears', 'leaves', 'stars',
  'moons', 'snow', 'embers', 'notes', 'bolts', 'pixels', 'sparkles', 'moons', 'bolts', 'petals',
  'stars', 'embers', 'confetti', 'petals', 'bubbles', 'bubbles', 'hearts', 'stars', 'stars', 'bolts',
  'hearts', 'gems', 'moons', 'moons', 'hearts', 'sparkles', 'gears', 'confetti', 'leaves', 'bubbles',
  'stars', 'gears', 'embers', 'snow', 'stars', 'leaves', 'gems', 'bubbles', 'bolts', 'hearts',
  'stars', 'petals', 'stars', 'sparkles', 'bolts', 'sparkles', 'stars', 'confetti', 'stars', 'confetti',
];

/* nome | arquétipo | topo | olhos | boca | padrão | membros | adereços | cor | descrição */
const TABLE: string[] = [
  // 00 Natal Estelar
  'Flocolino|fluff|none|dot|smile|none|feet|beanie|#f4f7ff|Bolinha de neve fofinha que adora gorrinhos.',
  'Pinhetinho|cone|none|big|smile|dots|feet|topstar|#3fbf6a|Arvorezinha que pisca luzinhas quando está feliz.',
  'Biscoitelo|bean|none|happy|smile|zigzag|arms|bowtie|#c98a4b|Biscoitinho de gengibre com cobertura de glacê.',
  'Pingolim|penguin|tuft|sparkle|beak|belly|flippers|earmuffs|#2b3f7a|Pinguim friorento que patina nos anéis de Saturno.',
  'Renastro|bean|antlers|star|nose|belly|feet|scarf+bell|#b9774a|Rei do Natal Estelar: rena de cachecol que puxa trenós de cometa.',
  // 01 Ano Novo Cósmico
  'Confetinho|blob|curl|happy|smile|dots|feet|party|#c7a6ff|Bolinha animada que solta confete quando pula.',
  'Tictaquinho|cube|bolt|big|open|none|arms|clock|#ffd84a|Conta os segundos para a meia-noite sem errar nenhum.',
  'Faíscola|star|none|sparkle|grin|stars|arms|wand|#ffe58a|Estrelinha que desenha fogos de artifício no céu.',
  'Estourito|drop|flame|big|ooh|bands|jet|party|#ff7ad9|Fogo de artifício vivo que explode em cores sem barulho.',
  'Corujanova|bird|tufts|star|beak|stars|bigwings|tophat|#5b3fd6|Rainha do Ano Novo Cósmico: coruja que guarda o relógio das galáxias.',
  // 02 Carnaval Galáctico
  'Purpurino|slime|none|lash|smile|freckles|none|bow|#ff8fe0|Gotinha de purpurina que nunca para de sambar.',
  'Batuquim|cube|none|happy|open|zigzag|arms|headband|#ffe14f|Tamborzinho que marca o ritmo com a barriga.',
  'Serpentino|bean|curl|wink|tongue|stripes|tail|mask|#3cd6ff|Feito de serpentina enrolada, desenrola quando ri.',
  'Lantejoula|fish|fin|sparkle|smile|dots|fins|tiara|#ff5cc8|Peixinho de lantejoulas que brilha no bloco.',
  'Plumário|bird|crest|star|beak|hearts|bigwings|crown|#9b3cff|Rei do Carnaval Galáctico: abre um leque de penas que brilham como neon.',
  // 03 Selva Encantada
  'Folhuxo|sprout|leaves|dot|smile|none|feet|flower|#6dff8a|Brotinho que dança quando chove na selva.',
  'Macaquim|bear|bear|big|grin|belly|tail|leafhat|#b67a4a|Macaquinho que se pendura no cipó pelo rabo.',
  'Tucaninho|bird|none|big|bigbeak|belly|wings|flower|#33304a|Tucano de bico laranja que assobia músicas da floresta.',
  'Sapolim|blob|none|frog|grin|spots|feet|leafhat|#3cff9a|Sapinho que acende pintinhas brilhantes à noite.',
  'Onçalume|cat|cat|sparkle|cat|spots|fluffytail|crown|#ffb347|Rei da Selva Encantada: onça dourada de pintas que brilham como vaga-lumes.',
  // 04 Doces e Confeitos
  'Jujubinha|bean|none|dot|smile|none|feet|cherry|#ff6b9d|Jujuba fofinha com cheirinho de morango.',
  'Cerejinho|blob|none|happy|tongue|cap|arms|cherry|#ffd0a6|Bolinho de chantili com uma cereja de chapéu.',
  'Algodoce|cloud|none|sleepy|smile|none|none|lollipop|#ffb3e6|Nuvem de algodão-doce que derrete de fofura.',
  'Macaronete|blob|bunny|lash|cat|bands|feet|bow|#8ffff0|Coelhinho-macaron recheado de creme de menta.',
  'Caramelícia|blob|unihorn|sparkle|smile|stripes|wings|crown|#ffc2ea|Rainha dos Doces: unicórnio de caramelo com chifre de pirulito.',
  // 05 Fundo do Mar
  'Bolhudo|fish|none|dot|ooh|none|fins|none|#4fd6ff|Peixinho redondo que sopra bolhas em forma de coração.',
  'Estrelito|star|none|happy|smile|dots|none|pearls|#ff9a6b|Estrelinha-do-mar que coleciona conchinhas.',
  'Polvete|octo|none|big|smile|spots|none|bow|#ff7aa8|Polvinho que dá oito abraços de uma vez.',
  'Medusinha|jelly|none|sparkle|dot|dots|none|tiara|#c9a6ff|Água-viva fofinha que brilha como abajur.',
  'Baleirei|seal|none|happy|smile|belly|fins|crown+spout|#3b7bff|Rei do Fundo do Mar: baleia azul que canta e faz chafariz de estrelas.',
  // 06 Festa Junina Espacial
  'Milhito|bean|leaves|dot|smile|dots|feet|none|#ffd84a|Espiga de milho que pula feito pipoca.',
  'Pipoquinha|fluff|none|happy|open|none|none|popcorn|#fff3cf|Pipoca quentinha que estala de alegria.',
  'Quadrilhito|bear|droop|big|teeth|freckles|arms|straw|#d98a4a|Cachorrinho de chapéu de palha que dança quadrilha.',
  'Foguinho|drop|flame|happy|grin|bands|arms|bandana|#ff7a1a|Chaminha de fogueira que esquenta sem queimar.',
  'Galarraiá|bird|crest|sparkle|beak|checker|bigwings|straw+bandana|#ff4f4f|Rei da Festa Junina: galo xadrez que anuncia o arraiá entre as estrelas.',
  // 07 Robôs e Engrenagens
  'Boltinho|robot|bolt|dot|smile|none|feet|none|#9fb3c8|Robozinho do tamanho de um parafuso.',
  'Rodinha|robot|antennae|big|open|bands|wheels|none|#00e5ff|Anda de rodinha e apita quando faz curva.',
  'Gatobô|cat|cat|visor|cat|stripes|tail|gear|#ffb000|Gatinho de lata que ronrona em código.',
  'Voadroid|robot|propeller|cyclops|smile|bands|jet|none|#6ad0ff|Drone fofinho que entrega abraços por via aérea.',
  'Engrenaldo|robot|bolt|sparkle|grin|gears|arms|crown+gear|#e0b44a|Rei das Engrenagens: robô dourado com coração de engrenagem.',
  // 08 Dinossauros
  'Ovossauro|egg|none|dot|smile|spots|feet|none|#f4ead0|Ovo pintadinho que já sabe rugir baixinho.',
  'Bebessauro|dino|spikes|big|smile|belly|tail|eggshell|#a0e050|Dino bebê que acabou de sair da casca.',
  'Tricerinho|dino|horns|big|grin|spots|tail|leafhat|#ff9a5a|Tem chifrinhos de pedra e um coração de manteiga.',
  'Pterinho|dino|crest|sparkle|beak|none|bigwings|goggles|#7ad1ff|Pterossauro aviador que adora voar baixinho.',
  'Reixossauro|dino|spikes|star|fang|belly|tail|crown|#ff7a3c|Rei dos Dinossauros: rex bebê de dentinho de leite e coroa vulcânica.',
  // 09 Piratas das Estrelas
  'Papagaito|bird|crest|dot|beak|none|wings|none|#3cdf6b|Papagaio que repete "terra à vista" o dia inteiro.',
  'Caranguinho|blob|none|stalk|smile|none|claws|bandana|#ff6b4a|Caranguejo de lenço que guarda o mapa do tesouro.',
  'Baúzito|cube|none|big|teeth|bands|feet|map|#a8642f|Baú do tesouro que guarda abraços em vez de moedas.',
  'Lulamaré|bean|fin|wink|smile|stripes|tentacles|pirate+eyepatch|#ef476f|Lula capitã com tapa-olho de estrela.',
  'Capitão Bigodim|cat|cat|sparkle|cat|stripes|fluffytail|pirate|#ffd166|Rei dos Piratas das Estrelas: gato capitão que navega em cometas.',
  // 10 Monstrinhos do Halloween
  'Abobito|blob|sprout|dot|grin|ribs|none|none|#ff8c1a|Abóbora pequenina que só quer docinhos.',
  'Buzinho|ghost|none|big|ooh|none|none|bow|#f4f0ff|Fantasminha tímido que diz "bu" bem baixinho.',
  'Morcegol|blob|fox|big|fang|none|batwings|none|#6b4ab0|Morceguinho que dorme de cabeça para baixo abraçado ao travesseiro.',
  'Bruxagato|cat|cat|star|cat|none|tail|witch|#2a1f3f|Gato preto de chapéu de bruxa que conta histórias.',
  'Rei Abobrão|blob|sprout|star|grin|ribs|batwings|crown+cape|#ff6a00|Rei do Halloween: abóbora de olhos-lanterna e capa de morcego.',
  // 11 Inverno Polar
  'Gelinho|cube|none|dot|smile|none|none|none|#bff3ff|Cubo de gelo que nunca derrete de tanto rir.',
  'Focatinha|seal|none|big|cat|spots|flippers|scarf|#c9d8e8|Foquinha de cachecol que desliza de barriga.',
  'Raponeve|fox|fox|lash|cat|none|fluffytail|none|#f0faff|Raposinha branca que some na neve quando brinca de esconde.',
  'Ursinevado|bear|bear|happy|smile|belly|arms|beanie+snowball|#e6f4ff|Ursinho polar que faz bonecos de neve perfeitos.',
  'Nevascão|fluff|horns|sparkle|teeth|stars|arms|crown|#9fd6ff|Rei do Inverno Polar: gigante peludinho que espalha flocos de cristal.',
  // 12 Reino dos Dragões
  'Ovodraco|egg|horns|dot|smile|zigzag|none|none|#ffb37a|Ovo de dragão quentinho que já tem chifrinhos.',
  'Lagartim|dino|fin|big|tongue|belly|tail|none|#ff8a3c|Lagartinho de fogo que espirra faíscas.',
  'Dragosseda|dragon|horns|lash|smile|belly|wings|bow|#ff7ab0|Dragoazinha de seda que solta fumaça cor-de-rosa.',
  'Escamante|dragon|spikes|sparkle|fang|scales|bigwings|none|#3cc86b|Dragão verde-esmeralda que coleciona pedrinhas bonitas.',
  'Brasarrei|dragon|horns|star|grin|scales|bigwings|crown|#ff3c1f|Rei dos Dragões: dragão de fogo dourado que aquece o reino inteiro.',
  // 13 Festival de Música
  'Notinha|blob|curl|dot|smile|none|none|note|#ff3cac|Notinha musical que cantarola o dia todo.',
  'Caixolinha|cube|none|big|open|bands|feet|headphones|#3cf0ff|Caixinha de som que dança no ritmo do grave.',
  'Cantarola|bird|crest|happy|beak|none|wings|mic|#ffe14f|Passarinho que solta notas brilhantes ao cantar.',
  'Rockinha|fox|fox|star|grin|zigzag|fluffytail|guitar|#ff6bd5|Raposinha roqueira com guitarra de brinquedo.',
  'Maestrelo|bean|tuft|sparkle|open|stars|arms|bowtie+wand|#7d3cff|Rei do Festival de Música: maestro que rege orquestras de estrelas.',
  // 14 Esportes Radicais
  'Skatinho|bean|none|dot|smile|none|wheels|cap|#3cff8c|Desliza de rodinhas e faz manobras de mentirinha.',
  'Surfofo|seal|none|happy|grin|stripes|flippers|sunglasses|#4fb5ff|Foca surfista que pega onda de gelatina.',
  'Cabrilho|bear|horns|big|teeth|none|feet|helmet|#e6d0b0|Cabritinho de capacete que escala montanhas de travesseiro.',
  'Esquiplana|fox|bear|sparkle|teeth|belly|fluffytail|goggles|#ff6b3c|Esquilo voador que plana de óculos de aviador.',
  'Turbolino|fluff|tuft|star|grin|zigzag|jet|helmet|#3cff8c|Rei dos Esportes Radicais: bolinha a jato que dá loopings nas nuvens.',
  // 15 Mundo Pixel
  'Pixelito|cube|none|pixel|smile|checker|none|none|#4fff7a|Quadradinho de 8 bits que pula com som de moedinha.',
  'Fantasbit|ghost|none|pixel|ooh|none|none|none|#ff4fd8|Fantasminha pixelado que se perde em labirintos.',
  'Slimebit|slime|none|pixel|grin|checker|none|none|#4fd6ff|Gelequinha pixelada que derrete em quadradinhos.',
  'Dragãobit|dragon|horns|pixel|fang|checker|wings|none|#b06bff|Dragãozinho de pixel que solta fogo de quadradinhos.',
  'Megabit|cat|cat|pixel|cat|checker|tail|crown|#ffd84a|Rei do Mundo Pixel: gato de 8 bits que conhece todas as fases secretas.',
  // 16 Castelo Mágico
  'Candelinho|drop|flame|dot|smile|none|none|none|#ffe08a|Chaminha de vela que ilumina os corredores do castelo.',
  'Corujinho|bird|tufts|big|beak|belly|wings|glasses|#a07a5a|Corujinha de óculos que lê livros de magia.',
  'Sapíncipe|blob|none|frog|smile|none|feet|crown|#6dff8a|Sapinho que jura que é um príncipe encantado.',
  'Gargulete|blob|horns|happy|fang|spots|batwings|none|#9a90b8|Gárgula de pedra que vira fofinha à noite.',
  'Grifomago|bird|crest|sparkle|beak|stars|bigwings|wizard|#c99bff|Rei do Castelo Mágico: grifo de chapéu de mago que realiza desejos pequenininhos.',
  // 17 Safári Lunar
  'Leolito|cat|mane|dot|cat|none|tail|none|#ffcf6b|Leãozinho de juba fofa que boceja para a lua.',
  'Girafinha|bean|knobs|lash|smile|spots|feet|none|#ffd98a|Girafinha de pescoço curtinho que alcança as estrelas.',
  'Hipolua|blob|bear|big|teeth|none|feet|astro|#9fb3e0|Hipopótamo astronauta que pula alto na gravidade baixa.',
  'Zebrino|bean|tuft|wink|smile|stripes|feet|goggles|#f0f0ff|Zebrinha de listras que brilham no escuro.',
  'Rinolua|blob|unihorn|star|smile|spots|feet|crown|#7ad1ff|Rei do Safári Lunar: rinoceronte de chifre de lua crescente.',
  // 18 Cidade Neon
  'Neonzinho|blob|antennae|dot|smile|none|none|none|#2bffea|Bolinha que acende como letreiro.',
  'Miaunéon|cat|cat|big|cat|stripes|tail|sunglasses|#ff2bd6|Gatinho descolado de óculos que mia em sintetizador.',
  'Holograminho|ghost|none|visor|smile|bands|none|none|#7af0ff|Fantasminha holográfico que pisca em azul.',
  'Grafitinho|fox|fox|star|grin|zigzag|fluffytail|headphones|#b44bff|Raposa artista que pinta murais de luz.',
  'Luminodraco|dragon|horns|visor|grin|bands|bigwings|sunglasses|#ff2bd6|Rei da Cidade Neon: dragão de luz que voa entre arranha-céus.',
  // 19 Jardim das Fadas
  'Florzinha|sprout|flower|dot|smile|none|leafarms|none|#a6ffcf|Brotinho com uma florzinha na cabeça.',
  'Joaninha|bug|antennae|big|smile|spots|legs6|none|#ff4f6a|Joaninha que conta as pintinhas para dormir.',
  'Borbolina|bean|antennae|lash|smile|none|bfwings|none|#ffa6e0|Borboletinha de asas de pétala.',
  'Pétalia|blob|leaves|sparkle|smile|hearts|bfwings|flower+wand|#ffd1f0|Fadinha-bichinho que faz flores nascerem com a varinha.',
  'Florália|bunny|bunny|star|smile|hearts|bfwings|crown+flower|#ffa6e0|Rainha do Jardim das Fadas: coelha de asas de flor que cuida do jardim.',
  // 20 Agentes Secretos
  'Espiãozito|bean|none|dot|smile|none|feet|sunglasses|#5a6a96|Feijãozinho que acha que ninguém o vê.',
  'Camuflito|dino|crest|big|smile|spots|tail|none|#5ef07a|Camaleão que muda de cor para brincar de esconde-esconde.',
  'Guaxinito|bear|bear|big|smile|mask|fluffytail|none|#8f9aa8|Guaxinim de máscara natural, expert em achar biscoitos.',
  'Agentuim|penguin|none|wink|smile|belly|flippers|bowtie+sunglasses|#14181f|Pinguim de gravata-borboleta em missão ultrassecreta.',
  'Mestre Sombrino|cat|cat|visor|cat|none|tail|cape+sunglasses|#20263a|Rei dos Agentes Secretos: gato-sombra que nunca deixa pegadas.',
  // 21 Vulcões e Lava
  'Brasinha|blob|flame|dot|smile|none|none|none|#ff5a1f|Brasa fofinha que adora marshmallow.',
  'Rochinha|cube|none|happy|smile|cracks|feet|none|#6b5a5a|Pedrinha de lava que esquenta as mãos dos amigos.',
  'Salamandrina|dino|gills|big|smile|spots|tail|none|#ffb02a|Salamandra que nada em lava como se fosse piscina.',
  'Vulcanito|cone|flame|sparkle|ooh|cracks|arms|none|#7a3a2a|Vulcãozinho que solta confete de lava.',
  'Fenixa|bird|flame|star|beak|zigzag|bigwings|crown|#ff5a1f|Rainha dos Vulcões: fênix que renasce em fagulhas douradas.',
  // 22 Circo das Galáxias
  'Risadinho|blob|tuft|happy|nose|none|feet|party|#ffe0e0|Bolinha de nariz vermelho que faz todo mundo rir.',
  'Ursabola|bear|bear|big|smile|belly|feet|ball|#c98a5a|Ursinho equilibrista que anda em cima de uma bola.',
  'Coelhágico|bunny|bunny|lash|teeth|none|feet|tophat+wand|#f4f0ff|Coelhinho mágico que tira chapéus de dentro de outro chapéu.',
  'Baloneco|egg|curl|sparkle|smile|stripes|none|balloon|#ff4f6a|Bichinho-balão que flutua pela lona do circo.',
  'Leomestre|cat|mane|star|cat|stripes|tail|tophat+bowtie|#ff8f6a|Rei do Circo das Galáxias: mestre de picadeiro que apresenta o show das estrelas.',
  // 23 Samurais do Cosmos
  'Arrozito|cone|none|dot|smile|bands|none|none|#f5f5f0|Bolinho de arroz que medita sorrindo.',
  'Carpinho|fish|fin|big|ooh|spots|fins|none|#ff7a3c|Carpinha de lago que dá sorte para quem a vê.',
  'Raposéu|fox|fox|happy|cat|none|fluffytail|mask|#f5e6c8|Raposinha do céu de cauda de nuvem.',
  'Pandoka|bear|bear|sleepy|smile|panda|arms|kabuto|#f4f4f4|Pandinha de elmo que pratica caligrafia.',
  'Grou Lunar|bird|crest|star|beak|none|bigwings|kabuto|#ffffff|Rei dos Samurais do Cosmos: grou de armadura de lua que protege a paz.',
  // 24 Ilha Tropical
  'Coquinho|blob|leaves|dot|smile|none|feet|none|#8a5a3a|Coquinho que rola pela areia.',
  'Abacaxim|egg|leaves|happy|smile|scales|feet|sunglasses|#ffcf2e|Abacaxi de óculos escuros que ama dia de sol.',
  'Flamingota|bird|crest|lash|bigbeak|none|wings|lei|#ff8fc0|Flamingo que dorme num pé só e sonha com a praia.',
  'Golfinito|fish|fin|happy|grin|belly|fins|lei|#3cc8ff|Golfinho que salta e desenha arco-íris na água.',
  'Coralino|dragon|crest|sparkle|smile|scales|fins|lei+crown|#3cffd0|Rei da Ilha Tropical: dragão-marinho de coral que dança com as ondas.',
  // 25 Laboratório Maluco
  'Gotícula|drop|none|dot|smile|none|none|none|#9dff3c|Gotinha de experiência que deu muito certo.',
  'Ameboca|slime|antennae|spiral|tongue|dots|none|none|#c74fff|Gelequinha que borbulha quando dá risada.',
  'Atomito|blob|none|cyclops|smile|none|arms|goggles|#4fd6ff|Cientistinha de um olho só e óculos de proteção.',
  'Hamstein|bear|bear|big|teeth|belly|arms|glasses+potion|#ffd0a6|Hamster cientista que inventa poções de cócegas.',
  'Professor Faísca|cloud|bolt|spiral|grin|zigzag|none|goggles+potion|#9dff3c|Rei do Laboratório Maluco: nuvem elétrica que tem ideias geniais.',
  // 26 Cavaleiros do Arco-íris
  'Elmito|blob|none|dot|smile|none|feet|helmet|#c0c8e0|Bolinha de elmo que sonha em ser cavaleira.',
  'Poneizinho|bean|tuft|lash|smile|none|feet|none|#ffb6e6|Pônei de crina arco-íris.',
  'Arcolesma|snail|antennae|big|smile|rainbow|none|none|#a6ffcf|Lesminha que deixa um rastro de arco-íris.',
  'Pegasito|bean|tuft|sparkle|smile|stars|bigwings|helmet|#ffffff|Cavalinho alado de armadura colorida.',
  'Sir Ursolino|bear|bear|star|smile|rainbow|arms|helmet+cape|#ff7a7a|Rei dos Cavaleiros do Arco-íris: urso de armadura que protege todos os sorrisos.',
  // 27 Faroeste Espacial
  'Cactito|bean|flower|dot|smile|freckles|cactusarms|none|#5ec96b|Cactozinho que dá abraços com todo cuidado.',
  'Rolafeno|fluff|none|sleepy|smile|none|none|none|#d9a066|Bolinha de feno que rola atrás do vento.',
  'Coiotinho|fox|fox|happy|smile|belly|fluffytail|bandana|#c98a5a|Coiotinho que uiva canções de ninar para a lua.',
  'Tatuxerife|blob|droop|big|smile|bands|feet|cowboy+badge|#b08a6a|Tatu xerife que se enrola em bolinha para correr.',
  'Bisonauta|bear|horns|star|smile|none|feet|cowboy+scarf|#7a4a2a|Rei do Faroeste Espacial: bisão de chapéu que guia caravanas pelas estrelas.',
  // 28 Mitologia Estelar
  'Estrelim|star|none|dot|smile|none|none|none|#ffd84a|Estrelinha que caiu do céu e gostou daqui.',
  'Cometinho|drop|curl|happy|ooh|stars|none|none|#7dfcff|Cometinha apressado que deixa rastro de poeira brilhante.',
  'Ursinha Menor|bear|bear|sparkle|smile|stars|feet|none|#3b4bb0|Ursinha feita de constelação que pisca à noite.',
  'Cisnestrela|bird|crest|lash|beak|stars|bigwings|tiara|#e0f0ff|Cisne de estrelas que nada na Via Láctea.',
  'Carneirastro|fluff|ramhorns|star|smile|stars|feet|laurel|#f4f0ff|Rei da Mitologia Estelar: carneirinho de lã de nebulosa e chifres de ouro.',
  // 29 Super-Heróis Bloop
  'Heroizinho|blob|none|dot|smile|none|feet|cape|#3b8bff|Bolinha de capa que resgata gatinhos de árvores.',
  'Masquito|bean|curl|big|grin|none|arms|mask+cape|#ff3b3b|Feijãozinho mascarado que corre na velocidade de um espirro.',
  'Supercãozinho|bear|droop|big|tongue|belly|feet|cape|#ffd0a6|Cachorrinho voador que sempre chega na hora do lanche.',
  'Faiscão|fox|fox|star|grin|zigzag|fluffytail|mask|#ffe14f|Raposa-relâmpago que corre mais rápido que o eco.',
  'Capitão Bloopão|blob|tuft|sparkle|grin|stars|arms|cape+medal|#4f6bff|Rei dos Super-Heróis: o bloop mais corajoso, de capa que vira asas.',
  // 30 Cozinha Intergaláctica
  'Panquequim|blob|none|dot|smile|cap|feet|none|#f0c070|Panqueca fofinha com chapéu de mel.',
  'Morangolino|egg|leaves|happy|smile|freckles|feet|none|#ff4f6a|Moranguinho de sardas que adora chantili.',
  'Chefinho|bean|none|big|smile|none|arms|chef+spoon|#fff3e0|Mini chef que prepara sopinha de estrelas.',
  'Pudinzim|slime|none|sparkle|tongue|cap|none|cherry|#ffd27a|Pudim que treme de alegria e brilha de caramelo.',
  'Bolorrei|cube|none|star|open|bands|arms|crown+spoon|#ff6b9d|Rei da Cozinha Intergaláctica: bolo de andares que serve fatias de alegria.',
  // 31 Cristais e Gemas
  'Gemito|gem|none|dot|smile|none|none|none|#b06bff|Gema pequenininha que brilha quando recebe carinho.',
  'Quartzito|bean|crystals|happy|smile|none|feet|none|#6dfcff|Bichinho com cristais nas costas que tilintam.',
  'Toupeirinha|blob|none|sleepy|nose|belly|arms|helmet|#8a6a5a|Toupeira mineira que acha gemas só pelo cheirinho.',
  'Gemolim|gem|crystals|sparkle|smile|gems|wings|none|#ff6bd5|Gema voadora com asinhas de vitral.',
  'Diamiau|cat|crystals|star|cat|gems|fluffytail|crown|#9ff6ff|Rei dos Cristais: gato de diamante cuja cauda espalha arco-íris.',
  // 32 Festa do Pijama
  'Travesseco|cube|none|sleepy|smile|none|none|none|#f4f0ff|Travesseiro fofo que pede mais cinco minutinhos.',
  'Ovelhinha|fluff|droop|sleepy|smile|none|feet|nightcap|#ffffff|Ovelhinha que conta estrelas para dormir.',
  'Pelucito|bear|bear|happy|smile|belly|arms|bow|#c9a07a|Ursinho de pelúcia que espanta pesadelos com abraços.',
  'Soneca|cloud|none|sleepy|ooh|stars|none|nightcap+moon|#a6c9ff|Nuvem sonolenta que traz sonhos de algodão.',
  'Sonhelino|bunny|bunny|happy|smile|stars|feet|nightcap+lantern|#c9a6ff|Rei da Festa do Pijama: coelho dos sonhos que guarda a lanterna das histórias.',
  // 33 Ninjas da Lua
  'Ninjito|blob|none|dot|smile|none|feet|headband|#2a2f4a|Bolinha ninja que some numa nuvem de poeirinha.',
  'Tanukito|bear|bear|big|smile|mask|fluffytail|leafhat|#9a7a5a|Tanuki que se disfarça com uma folhinha na cabeça.',
  'Coelua|bunny|bunny|happy|smile|none|feet|mask|#f0f0ff|Coelhinho da lua que pula telhados em silêncio.',
  'Raposombra|fox|fox|wink|cat|mask|fluffytail|headband|#3a3a6a|Raposa ninja que deixa pegadas de estrelinha.',
  'Tigrelua|cat|cat|star|cat|stripes|tail|headband+moon|#c0c8ff|Rei dos Ninjas da Lua: tigre prateado que corre sobre os raios de luar.',
  // 34 Planeta Gelatina
  'Gelatinho|slime|none|dot|smile|none|none|none|#ff6bd5|Gotinha de gelatina que balança sem parar.',
  'Gelecubo|cube|none|happy|tongue|none|none|none|#6bff9e|Cubo de gelatina de limão que quica como bola.',
  'Gomito|bean|antennae|big|smile|bands|none|none|#ffb02a|Minhoca de goma que se estica para dar oi.',
  'Gelapolvo|octo|none|sparkle|ooh|dots|none|bow|#6bff9e|Polvo de gelatina transparente com bolhinhas dentro.',
  'Rainha Geleia|slime|none|heart|smile|hearts|none|crown|#ff4fa8|Rainha do Planeta Gelatina: geleia de morango que guarda frutinhas dentro.',
  // 35 Aventura Egípcia
  'Escaravinho|bug|antennae|dot|smile|none|legs6|none|#3cc8c8|Besourinho azul que empurra bolinhas de areia.',
  'Miaunilo|cat|cat|lash|cat|none|tail|pearls|#ffd84a|Gatinha dourada de colar que cochila em pirâmides.',
  'Faixinha|bean|none|big|smile|bands|arms|none|#f4ead0|Múmia fofinha enrolada em ataduras de algodão.',
  'Feneco|fox|bigears|sparkle|cat|belly|fluffytail|pearls|#f0c890|Raposinha-do-deserto de orelhas gigantes.',
  'Esfinginha|cat|none|star|smile|none|bigwings|nemes|#e8b878|Rainha da Aventura Egípcia: esfinge de asas douradas que faz charadas fofas.',
  // 36 Viagem no Tempo
  'Segundinho|egg|none|dot|smile|none|feet|hourglass|#ffb347|Ovinho que carrega uma ampulheta para não se atrasar.',
  'Mamutinho|bear|bigears|big|trunk|none|feet|none|#a07a5a|Mamute bebê que viajou de um passado geladinho.',
  'Dodozinho|bird|curl|big|bigbeak|belly|wings|goggles|#9aa0c8|Dodô que voltou no tempo só para comer biscoito.',
  'Cronogato|cat|cat|spiral|cat|stripes|tail|goggles+clock|#7dfcff|Gato do futuro de óculos que lembra o amanhã.',
  'Cronossauro|dino|spikes|star|grin|gears|tail|goggles+hourglass|#5ab0ff|Rei da Viagem no Tempo: dinossauro de engrenagens que pula entre eras.',
  // 37 Brinquedoteca
  'Bloquim|cube|none|dot|smile|checker|feet|none|#4fc3ff|Bloquinho de montar que vira o que quiser.',
  'Quaquito|bird|curl|dot|beak|none|wings|none|#ffe14f|Patinho de banho que nada em bolhas de sabão.',
  'Pionzito|cone|none|happy|smile|stripes|none|none|#ff4f8b|Pião que gira até ficar tontinho.',
  'Cordelito|robot|bolt|big|open|bands|feet|windkey|#ffb02a|Robozinho de corda que dança quando a chave gira.',
  'Fofildo|bunny|droop|star|smile|hearts|arms|crown|#ff9ac0|Rei da Brinquedoteca: coelho de pelúcia de orelhas caídas e remendos de coração.',
  // 38 Bosque Outonal
  'Bolotinha|egg|none|dot|smile|cap|feet|none|#c98a4a|Bolota que usa o próprio chapéu.',
  'Folhavento|drop|curl|happy|smile|none|none|none|#ff8c3c|Folhinha que dança com o vento de outono.',
  'Ouricito|fluff|spikes|big|nose|belly|feet|leafhat|#a0704a|Ouriço de espinhos macios que coleciona folhas.',
  'Texuguinho|bear|bear|happy|smile|stripes|feet|scarf|#5a5a6a|Texugo de cachecol que faz chá de folhas.',
  'Ruivaldo|fox|fox|star|cat|spots|fluffytail|laurel|#ff7a2c|Rei do Bosque Outonal: raposa de cauda flamejante que pinta as folhas de dourado.',
  // 39 Mergulho Abissal
  'Lampeixinho|fish|lure|dot|fang|none|fins|none|#3a4a8a|Peixinho-lanterna que ilumina o caminho dos amigos.',
  'Polvorelha|octo|bigears|big|smile|none|none|none|#ff9ac0|Polvo orelhudo que nada batendo as orelhinhas.',
  'Bolhudim|blob|none|sleepy|wavy|none|fins|none|#ffb6c8|Peixe-bolha preguiçoso, o mais fofo do fundo.',
  'Hipocampito|bean|fin|lash|beak|bands|tail|pearls|#b06bff|Cavalo-marinho que dança com as correntes.',
  'Krakinho|octo|none|star|smile|spots|none|crown|#3cf0ff|Rei do Mergulho Abissal: polvo gigante luminoso que abraça submarinos.',
  // 40 Copa das Estrelas
  'Golzinho|blob|none|dot|smile|soccer|feet|none|#ffffff|Bola de futebol que adora um passe de leve.',
  'Torcidinho|bean|none|happy|open|stripes|arms|flag|#3cff6b|Torcedor que pinta o rosto com as cores do time.',
  'Craquinho|bear|droop|big|tongue|stripes|feet|ball|#ffd0a6|Cachorrinho craque que faz embaixadinhas.',
  'Canarito|bird|crest|sparkle|beak|none|wings|medal|#ffe14f|Passarinho amarelo que canta a cada ponto.',
  'Golaço|dragon|crest|star|grin|stripes|bigwings|trophy|#3cff6b|Rei da Copa das Estrelas: dragão artilheiro que ergue a taça galáctica.',
  // 41 Steampunk
  'Engrenim|blob|bolt|dot|smile|none|feet|goggles|#d9a066|Bolinha de latão que solta vapor quando espirra.',
  'Vaporito|bear|bear|big|teeth|none|tail|tophat|#9a7a5a|Camundongo de cartola que conserta relógios.',
  'Latãozinho|bug|antennae|big|smile|gears|legs6|goggles|#c08040|Besouro de latão que tiquetaqueia ao andar.',
  'Dirigivelo|fish|propeller|happy|smile|bands|fins|tophat|#5ef0ff|Dirigível vivo que leva passageiros de pelúcia.',
  'Vaporante|blob|bigears|star|trunk|gears|feet|tophat+gear|#e0aa70|Rei do Steampunk: elefante de engrenagens que sopra vapor colorido.',
  // 42 Festival das Lanternas
  'Lampiãozinho|egg|none|dot|smile|bands|none|none|#ff4f4f|Lanterninha de papel que flutua com a brisa.',
  'Douradinho|fish|fin|big|ooh|none|fins|none|#ffb02a|Peixinho dourado que nada no céu entre as lanternas.',
  'Gatinho da Sorte|cat|cat|happy|cat|spots|tail|bell|#ffffff|Gatinho que acena para chamar boa sorte.',
  'Dragapel|dragon|crest|big|grin|scales|none|lantern|#ff4f4f|Dragãozinho de papel que dança no desfile.',
  'Carpaluz|fish|crest|star|smile|scales|fins|lantern+crown|#ffd84a|Rei do Festival das Lanternas: carpa dourada que vira luz ao saltar.',
  // 43 Pinguins e Neve
  'Pinguinho|penguin|none|dot|beak|belly|flippers|none|#2a3a5a|Pinguinzinho que escorrega de barriga o dia todo.',
  'Gorrinho|penguin|tuft|happy|beak|belly|flippers|beanie|#3a5ab0|Pinguim de gorro que pesca peixinhos de neve.',
  'Bonequito|bean|none|dot|carrot|dots|arms|tophat+scarf|#ffffff|Bonequinho de neve que não derrete nunca.',
  'Fofuxinho|fluff|none|sparkle|beak|mask|flippers|earmuffs|#a0a8b8|Filhote de pinguim tão fofo que parece uma nuvem.',
  'Pinguimperador|penguin|crest|star|beak|belly|flippers|crown+cape|#1a2a5a|Rei dos Pinguins: imperador de capa de aurora que lidera a marcha na neve.',
  // 44 Alienígenas Fofinhos
  'Alienzinho|blob|antennae|cyclops|smile|none|none|none|#7dff6b|Alienígena de um olho só que acena para todo mundo.',
  'Trioculo|bean|antennae|triple|smile|spots|arms|none|#d46bff|Feijãozinho de três olhos que vê três vezes mais fofura.',
  'Pilotinho|blob|antennae|big|ooh|none|none|saucer|#9dffd0|Alienzinho que pilota um disco voador de bolso.',
  'Gosminho|slime|antennae|triple|tongue|dots|tentacles|astro|#d46bff|Alien de gosma roxa com capacete de bolha.',
  'Galaxínia|jelly|antennae|star|smile|stars|none|crown|#7dff6b|Rainha dos Alienígenas Fofinhos: medusa espacial que conversa com as estrelas.',
  // 45 Mundo dos Insetos
  'Formiguinha|bean|antennae|dot|smile|none|legs6|none|#ff6b3c|Formiguinha que carrega folhas dez vezes maiores que ela.',
  'Abelhinha|bean|antennae|big|smile|stripes|wings|none|#ffd84a|Abelhinha que faz mel de flores de nuvem.',
  'Lagartita|bean|antennae|happy|smile|dots|legs6|flower|#c4ff3c|Lagartinha que sonha em ser borboleta.',
  'Vagalumito|bug|antennae|sparkle|smile|none|wings|lantern|#ffe14f|Vaga-lume que acende o caminho de quem se perdeu.',
  'Besouraldo|bug|unihorn|star|smile|gems|wings|crown|#c4ff3c|Rei do Mundo dos Insetos: besouro de armadura esmeralda e chifre de ouro.',
  // 46 Realeza Galáctica
  'Pajenzinho|blob|curl|dot|smile|none|feet|beret|#ff4f8b|Pajem fofinho que carrega a almofada da coroa.',
  'Corgizinho|fox|fox|happy|tongue|belly|feet|bowtie|#ffb36b|Cãozinho de patas curtas que mora no palácio.',
  'Princesinha|cat|cat|lash|cat|none|tail|tiara+pearls|#fff6fb|Gatinha princesa que só toma leite em xícara de ouro.',
  'Unicorninho Real|bean|unihorn|sparkle|smile|stars|feet|cape|#c9a6ff|Unicórnio guardião do tesouro real.',
  'Imperadraco|dragon|horns|star|grin|stars|bigwings|crown+cape|#ffd84a|Rei da Realeza Galáctica: dragão imperial de capa de veludo e coroa de planetas.',
  // 47 Monstros Marinhos
  'Lagonito|dino|none|dot|smile|spots|fins|none|#3cffb0|Monstrinho do lago que só aparece para tirar foto.',
  'Serpentinha|bean|fin|happy|tongue|stripes|tail|none|#ff5c8a|Serpente-do-mar que faz laços com o próprio corpo.',
  'Tubarinho|fish|fin|happy|fang|belly|fins|none|#7aa8d8|Tubarãozinho que só come algas e abraços.',
  'Axolotinho|bean|gills|big|smile|freckles|feet|none|#ffb6d8|Axolote sorridente que regenera tudo, até o bom humor.',
  'Marolão|dragon|gills|star|smile|scales|fins|crown|#3cffb0|Rei dos Monstros Marinhos: dragão-do-mar que cria ondas de purpurina.',
  // 48 Corrida Turbo
  'Vrunzinho|cube|none|dot|smile|stripes|wheels|none|#ff3b3b|Carrinho fofinho que faz vrum-vrum com a boca.',
  'Lebrinha|bunny|bunny|happy|teeth|stripes|feet|helmet|#d9b08a|Lebre de capacete que corre de pantufas.',
  'Turbolesma|snail|antennae|big|smile|stripes|jet|goggles|#ffd84a|Caracol a jato, o mais rápido do universo.',
  'Guepardito|cat|cat|wink|cat|spots|tail|flag|#ffb347|Guepardo que dá a largada balançando a bandeira.',
  'Turbojato|bean|fin|visor|grin|bands|jet|helmet|#ff3b3b|Rei da Corrida Turbo: foguetinho vivo que dá a volta na galáxia num piscar.',
  // 49 Nuvens e Céu
  'Nuvenzinha|cloud|curl|dot|smile|none|none|none|#ffffff|Nuvenzinha que faz sombra para quem está com calor.',
  'Arquinho|cloud|none|happy|smile|rainbow|none|none|#ffe0f4|Nuvem que guarda um arco-íris na barriga.',
  'Pipinha|gem|none|big|smile|bands|tail|none|#ffb6e6|Pipa viva que brinca de pega-pega com o vento.',
  'Trovinho|cloud|bolt|wink|grin|zigzag|none|none|#a0a8c8|Nuvem de trovão que tem medo do próprio barulho.',
  'Solarito|blob|mane|star|smile|none|wings|crown|#ffd84a|Rei de Nuvens e Céu: solzinho alado que acorda o dia com um bocejo.',
  // 50 Detetives Bloop
  'Lupinha|blob|none|dot|smile|none|feet|magnifier|#ffcf6b|Bolinha curiosa que investiga migalhas de bolo.',
  'Farejito|bear|droop|big|nose|spots|feet|sleuth|#c98a5a|Cão farejador que encontra meias perdidas.',
  'Lontrinha|seal|bear|big|teeth|belly|flippers|glasses|#8a6a4a|Lontra que resolve mistérios boiando de costas.',
  'Coalupa|bear|bigears|sleepy|nose|none|arms|glasses+magnifier|#a0a0b0|Coala sonolento que resolve casos dormindo.',
  'Bigodetive|cat|cat|star|cat|none|tail|sleuth+magnifier|#7d9dff|Rei dos Detetives: gato de bigodes sensíveis que descobre qualquer segredo.',
  // 51 Floresta de Cogumelos
  'Cogumelinho|mushroom|none|dot|smile|spots|feet|none|#ff5c8a|Cogumelo de chapéu pintadinho.',
  'Cogulume|mushroom|antennae|happy|smile|dots|feet|none|#6bffd0|Cogumelo que brilha no escuro da floresta.',
  'Chapeuzinho|bear|bear|big|smile|none|feet|mushhat|#c9a07a|Ursinho que usa um cogumelo de guarda-chuva.',
  'Esporina|bunny|antennae|sparkle|smile|spots|bfwings|mushhat|#b06bff|Fadinha-esporo que espalha brilho entre os cogumelos.',
  'Micelião|mushroom|none|star|grin|spots|arms|crown|#9b3cff|Rei da Floresta de Cogumelos: cogumelo ancião de chapéu brilhante.',
  // 52 Olimpíadas Espaciais
  'Atletinha|bean|none|dot|smile|none|feet|headband|#3cff8c|Feijãozinho que se aquece antes de correr.',
  'Cangurito|bunny|fox|big|smile|belly|feet|medal|#d9a06a|Canguru que salta de planeta em planeta.',
  'Marmotinha|bear|bear|happy|teeth|belly|arms|goggles|#c09070|Marmota nadadora de óculos de natação.',
  'Avestrela|bird|tuft|lash|beak|none|feet|laurel|#f4e6d0|Avestruz velocista que nunca enfia a cabeça no buraco.',
  'Aguiolimpo|bird|crest|star|beak|stars|bigwings|laurel+torch|#ffd84a|Rei das Olimpíadas Espaciais: águia dourada que acende a tocha das estrelas.',
  // 53 Bruxinhos e Poções
  'Borbulhinha|slime|none|dot|smile|none|none|potion|#6dff8a|Gotinha de poção que faz cócegas.',
  'Corvinho|bird|crest|big|beak|none|wings|witch|#3a2a5a|Corvinho falante que lembra as receitas de poção.',
  'Mandraguinha|sprout|leaves|happy|open|none|leafarms|none|#e0b08a|Raizinha mágica que canta quando sai da terra.',
  'Garrafito|drop|none|sparkle|smile|dots|arms|witch|#9b5cff|Poção viva de chapéu que muda de cor com o humor.',
  'Arquibruxo|ghost|none|star|smile|stars|none|wizard+wand|#b48cff|Rei dos Bruxinhos: fantasma sábio que ensina feitiços de risada.',
  // 54 Robôs Gigantes
  'Mechinha|robot|antennae|visor|smile|none|feet|none|#3b8bff|Robozinho que sonha em ser gigante.',
  'Ferrocão|bear|droop|visor|tongue|bands|feet|none|#ff8c1a|Cachorro-robô que abana a cauda de antena.',
  'Mechassauro|dino|spikes|visor|grin|bands|tail|none|#8a9ab0|Dinossauro de metal que ruge "bip-bop".',
  'Megaflex|robot|vfin|visor|grin|bands|jet|none|#5a7bff|Robô de foguetes nos pés que voa de braços para cima.',
  'Gigantron|robot|none|star|smile|checker|arms|crown+cape|#ff8c1a|Rei dos Robôs Gigantes: robô colossal de coração de estrela que protege a cidade.',
  // 55 Deserto das Miragens
  'Dunito|slime|none|dot|smile|none|none|none|#ffcf8a|Montinho de areia que muda de lugar à noite.',
  'Camelinho|blob|droop|sleepy|smile|none|feet|bandana|#d9a066|Camelinho que guarda água de coco na corcova.',
  'Suricatinho|bean|bear|big|smile|belly|arms|sunglasses|#d9b08a|Suricato vigia que fica de pé para ver o pôr do sol.',
  'Miragito|ghost|none|sparkle|smile|zigzag|none|none|#ff6bd5|Bichinho-miragem que aparece e some em ondas de calor.',
  'Dunarrei|dragon|horns|star|smile|zigzag|bigwings|crown+crystal|#ffb347|Rei do Deserto: dragão de areia dourada que esconde oásis nas asas.',
  // 56 Aurora Boreal
  'Aurorinha|cloud|none|dot|smile|none|none|none|#3cffb0|Pedacinho de aurora que caiu na neve.',
  'Lebrártica|bunny|bunny|happy|teeth|none|feet|scarf|#f0f8ff|Lebrinha branca que pula nas cores do céu.',
  'Morsinha|seal|none|big|tusks|belly|flippers|none|#c09a8a|Morsa de bigodão que canta no gelo.',
  'Lobilume|fox|fox|sparkle|smile|belly|fluffytail|none|#c8d8ff|Lobinho que uiva e o céu muda de cor.',
  'Narvaluz|seal|unihorn|star|smile|stars|fins|crown|#b06bff|Rei da Aurora Boreal: narval de chifre de cristal que pinta o céu polar.',
  // 57 Parque de Diversões
  'Bilhetinho|cube|none|dot|smile|zigzag|feet|none|#ffe14f|Ingressinho que vale um passeio de montanha-russa.',
  'Maçãzinha|blob|sprout|happy|smile|none|none|none|#ff3b5c|Maçã do amor brilhante de caramelo.',
  'Carrosselito|bean|tuft|lash|smile|stripes|none|pole|#ffffff|Cavalinho de carrossel que sobe e desce cantando.',
  'Algodolino|fluff|bunny|sparkle|smile|none|feet|balloon|#ff9ad0|Coelhinho de algodão-doce que voa segurando balões.',
  'Loopidraco|dragon|spikes|star|grin|stripes|wings|crown|#ff4f8b|Rei do Parque de Diversões: dragão-montanha-russa que dá loopings de alegria.',
  // 58 Lendas do Universo
  'Poeirinha|fluff|none|dot|smile|none|none|none|#ffd84a|Grãozinho de poeira estelar que virou amigo.',
  'Buraquinho|blob|none|big|ooh|swirl|none|none|#3a2a7a|Buraquinho negro que só engole tristeza.',
  'Saturnino|blob|none|happy|smile|bands|none|ring|#ffb36b|Planetinha de anel que gira de alegria.',
  'Nebulina|cloud|curl|sparkle|smile|stars|wings|tiara|#ff3cac|Nebulosa que faz estrelas novas com um sopro.',
  'Galaxileão|cat|mane|star|cat|stars|bigwings|crown+cape|#6a5cf0|Rei das Lendas do Universo: leão alado de galáxias que guarda as constelações.',
  // 59 Aniversário de 5 Anos
  'Festinho|blob|none|dot|smile|none|feet|candle|#ff5cc8|Bolinho de festa que faz um pedido a cada vela.',
  'Presentinho|cube|none|happy|smile|bands|feet|bow|#5ef0ff|Presente que se abre sozinho de tanta empolgação.',
  'Brigadeirito|blob|none|big|smile|dots|none|none|#5a3a2a|Docinho de chocolate coberto de granulado.',
  'Balãocórnio|egg|unihorn|sparkle|smile|stars|none|party|#ff5cc8|Unicórnio de balão com chapéu de festa.',
  'Bloopástico|blob|curl|star|open|stars|bigwings|crown+balloon|#5ef0ff|Rei do Aniversário de 5 Anos: o bloop mais lendário, celebrando cinco anos de aventuras.',
];

function build(): CreatureFull[] {
  const out: CreatureFull[] = [];
  TABLE.forEach((row, i) => {
    const season = Math.floor(i / 5);
    const rarity = RARITIES[i % 5];
    const [name, arch, top, eyes, mouth, pattern, limbs, props, col, desc] = row.split('|');
    const s = SEASONS[season];
    out.push({
      id: `s${String(season).padStart(2, '0')}-${rarity}`,
      name,
      rarity,
      season,
      theme: s.theme,
      desc,
      design: {
        arch: arch as Archetype,
        top: top as TopPart,
        eyes: eyes as EyeStyle,
        mouth: mouth as MouthStyle,
        pattern: pattern as Pattern,
        limbs: limbs as Limbs,
        props: props === 'none' ? [] : (props.split('+') as Prop[]),
        col,
        acc: s.palette[1],
        acc2: s.palette[2],
        fx: FX[season],
      },
    });
  });
  return out;
}

export const CREATURES: CreatureFull[] = build();
const BY_ID = new Map(CREATURES.map((c) => [c.id, c]));

export function creatureById(id: string): CreatureFull | undefined {
  return BY_ID.get(id);
}

export function seasonCreatures(index: number): SeasonCreatures {
  const i = Math.max(0, Math.min(59, Math.floor(index))) * 5;
  return {
    common: CREATURES[i],
    medio: CREATURES[i + 1],
    rare: CREATURES[i + 2],
    epic: CREATURES[i + 3],
    legendary: CREATURES[i + 4],
  };
}

/** Assinatura visual usada na checagem de unicidade. */
export function creatureSignature(c: CreatureFull): string {
  const d = c.design;
  return [d.arch, d.top, d.eyes, d.mouth, d.pattern, d.props.join('+'), d.col.toLowerCase()].join('|');
}
