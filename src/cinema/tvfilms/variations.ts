/* ============================================================
 *  ESTÚDIO BLOOP — variações parametrizadas.
 *
 *  8 "moldes" de história (mistério do sumiço, receita maluca,
 *  competição, missão, festa surpresa, aprender algo, bicho da
 *  fazenda, show de talentos). Cada variação tem SEU elenco, lugar,
 *  luz, objeto, piadas e final escritos à mão (parâmetros); o molde só
 *  dá a estrutura, a câmera e os efeitos, e alterna frases de ligação
 *  para que dois filmes do mesmo molde nunca fiquem parecidos
 *  (index.ts recusa textos parecidos demais).
 * ============================================================ */
import { castName, type FilmSpec, type Genre, type SceneSpec } from './dsl';
import type { Mood } from '../beatpat';

type Light = 'day' | 'dusk' | 'night';
interface Base {
  id: string;
  title: string;
  bg: string;
  light?: Light;
  d3?: boolean;
  cast: [string, string, string];
  tags: string[];
  mood?: Mood;
  genre?: Genre;
  desc?: string;
}
const alt = <T>(a: T[], i: number, k = 0): T => a[(i * 5 + k * 3) % a.length];
function film(v: Base, genre: Genre, mood: Mood, scenes: SceneSpec[]): FilmSpec {
  return { id: v.id, title: v.title, genre: v.genre ?? genre, mood: v.mood ?? mood, mode: v.d3 ? '3d' : '2d', tags: v.tags, desc: v.desc, cast: v.cast, scenes };
}

/* ======================= 1) MISTÉRIO DO SUMIÇO ======================= */
interface Lost extends Base {
  item: string;
  where: string;
  empty: string;
  clue: string;
  caught: string;
  reason: string;
  joke: string;
  end: string;
}
const LOST: Lost[] = [
  { id: 'bloop-v101', title: 'Quem Pegou Minha Meia?', bg: 'bedroom', cast: ['pipoca', 'zeca', 'gato'], tags: ['meia', 'gato'], item: 'minha meia listrada', where: 'Debaixo da cama?', empty: 'Só achei um biscoito de 1999...', clue: 'Fios de lã fazendo um caminho até o armário!', caught: 'Mrrr... que meia quentinha...', reason: 'Ela é perfeita pra cochilar dentro. Cabe a cabeça e o rabo!', joke: 'Agora você tem um gato-meia!', end: 'Pode ficar com essa. Eu uso a outra... e um chinelo!' },
  { id: 'bloop-v102', title: 'O Sumiço do Giz Dourado', bg: 'classroom', d3: true, cast: ['bolha', 'kiki', 'coruja'], tags: ['escola', 'giz'], item: 'o giz dourado da sala', where: 'Na gaveta da mesa?', empty: 'Clipes, borracha e um chiclete de alguém. Eca!', clue: 'Penas! Penas cinzentas perto da janela!', caught: 'Uuh-uuh! Bom dia, turma!', reason: 'Eu queria escrever um poema na árvore pra lua ler à noite.', joke: 'Uma coruja poeta! Essa eu nunca tinha visto!', end: 'Então hoje a aula é de poesia. Com giz dourado pra todo mundo!' },
  { id: 'bloop-v103', title: 'Onde Está a Coroa?', bg: 'castle', light: 'dusk', cast: ['rei', 'lumi', 'guaxinim'], tags: ['castelo', 'coroa'], item: 'a coroa real', where: 'Atrás do trono?', empty: 'Ninguém limpa atrás do trono faz cem anos!', clue: 'Pegadinhas com cinco dedinhos... e cheiro de fruta!', caught: 'Opa. Ninguém viu nada, né?', reason: 'Brilhava tanto que eu achei que era um prato de frutas chique.', joke: 'Majestade, sua coroa virou fruteira!', end: 'Sabe de uma coisa? Fica mais bonita com uvas. Nova moda real!' },
  { id: 'bloop-v104', title: 'A Bola Desaparecida', bg: 'park', cast: ['tuca', 'bia', 'cachorro'], tags: ['bola', 'parque'], item: 'nossa bola de futebol', where: 'No meio das flores?', empty: 'Só abelha. E ela não quer jogar!', clue: 'Um buraco fresquinho perto da árvore!', caught: 'Au! Au! Achei um lugar ótimo pra guardar!', reason: 'Eu enterro tudo que eu amo. A bola, o osso, o chinelo do vovô...', joke: 'Então você ama MUITO o chinelo do vovô!', end: 'Vamos fazer um trato: a gente joga junto e ninguém enterra nada!' },
  { id: 'bloop-v105', title: 'O Pincel Fujão', bg: 'street', light: 'dusk', d3: true, cast: ['nina', 'faisca', 'raposa'], tags: ['pintura', 'rua'], item: 'meu pincel mágico', where: 'Dentro do balde de tinta?', empty: 'Agora minha mão está azul. Só isso.', clue: 'Pinturas de rabos na parede! Laranja e branco!', caught: 'Ficou bonito? Fui eu que pintei!', reason: 'Vi a parede triste e cinza. Ela precisava de cor!', joke: 'Uma raposa artista! A parede até sorriu!', end: 'Vamos pintar a rua inteira juntos. Com permissão, claro!' },
  { id: 'bloop-v106', title: 'Cadê o Chapéu do Mago?', bg: 'forest', light: 'night', cast: ['tito', 'dudu', 'coelho'], tags: ['mágica', 'chapéu'], item: 'meu chapéu pontudo', where: 'Pendurado nos galhos?', empty: 'Só uma coruja dormindo. Shhh!', clue: 'Brilhinhos de mágica pulando no chão!', caught: 'Cheguei! Saí do chapéu sozinho!', reason: 'Eu morava dentro dele. Fui passear e ele veio grudado!', joke: 'O coelho tirou o mago da cartola!', end: 'Agora o truque é ao contrário. Abracadabra, chapéu!' },
  { id: 'bloop-v107', title: 'O Mistério do Picolé', bg: 'beach', cast: ['mel', 'trovao', 'pinguim'], tags: ['praia', 'picolé'], item: 'meu picolé de morango', where: 'Enterrado na areia?', empty: 'Achei uma concha! Mas não é de morango.', clue: 'Pegadas pequenas indo para o isopor!', caught: 'Brrr! Que geladinho gostoso!', reason: 'Tava calor demais! Eu só queria abraçar uma coisa fria.', joke: 'O pinguim tá de férias no isopor!', end: 'Tem picolé pra todos. E uma toalha gelada pro pinguim!' },
  { id: 'bloop-v108', title: 'O Livro que Sumiu', bg: 'bedroom', light: 'night', d3: true, cast: ['gema', 'lupa', 'dino'], tags: ['livro', 'noite'], item: 'o livro de histórias', where: 'Na estante de cima?', empty: 'Só livro de receita. E um de sudoku.', clue: 'Uma luz de lanterna embaixo do cobertor!', caught: 'Só mais uma página! Por favor!', reason: 'A história do dragão estava na melhor parte! Não dava pra parar!', joke: 'Caso resolvido: um leitor muito animado!', end: 'Então hoje eu leio em voz alta. Para todo mundo ouvir!' },
  { id: 'bloop-v109', title: 'A Estrela do Topo', bg: 'snow', cast: ['estrela', 'nuvem', 'urso'], tags: ['neve', 'enfeite'], item: 'a estrela da árvore', where: 'Na montanha de neve?', empty: 'Achei um boneco de neve. Ele também não viu.', clue: 'Marcas de patas enormes... e uma luz piscando na caverna!', caught: 'Ah... vocês acharam meu abajur...', reason: 'A caverna é escura de noite. Eu tinha medo e ela brilha tanto...', joke: 'Um ursão com medo do escuro? Que fofura!', end: 'Toma: uma lanterna só sua. E a estrela volta para a árvore!' },
];
function lostFilm(v: Lost, i: number): FilmSpec {
  const [A, B, C] = v.cast.map(castName);
  const scenes: SceneSpec[] = [
    {
      bg: v.bg,
      light: v.light,
      at: '5 11 -',
      b: [
        `N: ${alt(['Tudo parecia normal naquele dia...', 'Um pequeno mistério estava para começar.', 'Ninguém imaginava o que ia acontecer.'], i)}`,
        `0 surprised: ${alt([`Cadê ${v.item}? Estava aqui agorinha!`, `Socorro! Sumiu ${v.item}!`, `Alguém viu ${v.item}? Desapareceu!`], i)}`,
        `1 think thinking: ${alt(['Calma. Todo mistério deixa pistas.', `Isso é trabalho para detetives, ${A}!`, 'Respira. Vamos pensar com cuidado.'], i, 1)}`,
        `0 sneak thinking: ${v.where}`,
        `0 sad: ${v.empty}`,
        `1 point surprised !sparkles #ding: ${v.clue}`,
        `0 think thinking: ${alt(['Então vamos seguir a pista!', 'Uma pista! Agora sim!', 'Já sei para onde ir!'], i, 2)}`,
        `2 <8 shy: ${v.caught}`,
        `0 surprised: ${alt([`${C}! Era você!`, `Então foi você, ${C}?`, `${C}?! Peguei no flagra!`], i)}`,
        `2 shy !sweat: ${v.reason}`,
        `1 laughing: ${v.joke}`,
        `0 love !hearts: ${v.end}`,
      ],
    },
  ];
  void B;
  return film(v, 'misterio', i % 2 ? 'suspense' : 'alegre', scenes);
}

/* ======================= 2) RECEITA MALUCA ======================= */
interface Cook extends Base {
  dish: string;
  step: string;
  oops: string;
  fx: string;
  boom: string;
  enter: string;
  taste: string;
  name: string;
}
const COOK: Cook[] = [
  { id: 'bloop-v201', title: 'A Panqueca Saltitante', bg: 'kitchen', cast: ['chef', 'pipoca', 'bolota'], tags: ['panqueca', 'cozinha'], dish: 'panqueca', step: 'Farinha, ovo, leite e uma pitadinha de canela.', oops: 'E essa mola aqui? Parece um ingrediente!', fx: '!zoomlines #boing', boom: 'A panqueca tá pulando sozinha pela cozinha!', enter: 'Opa! Choveu panqueca no meu prato!', taste: 'Hum! Gosto de canela... e de cama elástica!', name: 'Vamos chamar de Panqueca Pula-Pula!' },
  { id: 'bloop-v202', title: 'Sopa de Arco-Íris', bg: 'kitchen', d3: true, light: 'dusk', cast: ['gema', 'lumi', 'robozinho'], tags: ['sopa', 'cores'], dish: 'sopa de legumes', step: 'Cenoura, abóbora, ervilha e um caldo quentinho.', oops: 'Vou pôr esse pozinho brilhante pra enfeitar!', fx: '!sparkles #magic', boom: 'A sopa ficou com sete cores! Tá brilhando!', enter: 'Detectei uma sopa muito colorida. Análise: deliciosa.', taste: 'Bip! Cada colherada tem uma cor e um gosto diferente!', name: 'Sopa Arco-Íris! Receita nova da família!' },
  { id: 'bloop-v203', title: 'O Bolo Que Cresceu Demais', bg: 'kitchen', cast: ['mel', 'dudu', 'dino'], tags: ['bolo', 'fermento'], dish: 'bolo de chocolate', step: 'Chocolate, farinha, açúcar e uma colher de fermento.', oops: 'Uma colher? Eu pus o pote inteiro!', fx: '!shake #whoosh', boom: 'O bolo tá crescendo! Já passou da janela!', enter: 'Rawr! Tem uma montanha de bolo lá fora!', taste: 'É o maior bolo do mundo! E é fofinho!', name: 'Bolo Montanha! Dá pra escalar e comer!' },
  { id: 'bloop-v204', title: 'Pipoca no Teto', bg: 'bedroom', light: 'night', cast: ['zeca', 'nina', 'gato'], tags: ['pipoca', 'cinema'], dish: 'pipoca para o cinema em casa', step: 'Milho, uma colherinha de óleo e tampa fechada.', oops: 'Tampa? Que tampa? Ninguém falou de tampa!', fx: '!confetti #pop', boom: 'Tá chovendo pipoca no quarto inteiro!', enter: 'Miau! Eu vim pela pipoca que caiu na minha cabeça!', taste: 'Pipoca direto do céu é a mais gostosa!', name: 'Noite do Cinema com Chuva de Pipoca!' },
  { id: 'bloop-v205', title: 'O Sorvete Gigante', bg: 'candy', d3: true, cast: ['sol', 'kiki', 'pinguim'], tags: ['sorvete', 'doces'], dish: 'sorvete de três bolas', step: 'Uma bola de morango, uma de creme e uma de limão.', oops: 'Três bolas é pouco. Vou pôr trinta!', fx: '!shake #bonk', boom: 'A torre de sorvete tá balançando! Segura!', enter: 'Senti cheiro de gelado! Chegou o especialista!', taste: 'Tem sabor de festa e de dor de cabeça gelada!', name: 'Torre Congelada! Divide com a turma toda!' },
  { id: 'bloop-v206', title: 'Suco Explosivo', bg: 'beach', cast: ['tuca', 'faisca', 'tucano'], tags: ['suco', 'praia'], dish: 'suco de frutas', step: 'Laranja, manga, abacaxi e muito gelo.', oops: 'E se eu ligar o liquidificador no máximo?', fx: '!poof #whoosh', boom: 'Esguichou suco até nas nuvens!', enter: 'Piu! Começou a chover suco de manga!', taste: 'Melhor chuva da história! Abre o bico!', name: 'Suco Tropical Voador! Serve com guarda-chuva!' },
  { id: 'bloop-v207', title: 'Biscoito Falante', bg: 'kitchen', light: 'night', cast: ['bolha', 'bia', 'bu'], tags: ['biscoito', 'forno'], dish: 'biscoitos de estrela', step: 'Manteiga, açúcar, farinha e um forninho bem quentinho.', oops: 'Que tal esse tempero que diz FAZ RIR na etiqueta?', fx: '!notes #magic', boom: 'Os biscoitos estão dando risadinha no forno!', enter: 'Uuu! Quem está rindo tão alto à noite?', taste: 'Comi um e agora EU não paro de rir! Hahaha!', name: 'Biscoito Gargalhada! Só um por pessoa!' },
  { id: 'bloop-v208', title: 'Salada Fujona', bg: 'park', d3: true, cast: ['trovao', 'gema', 'coelho'], tags: ['salada', 'piquenique'], dish: 'salada do piquenique', step: 'Alface, tomate, cenoura e um fio de azeite.', oops: 'As cenouras estão rolando pra longe!', fx: '!zoomlines #steps', boom: 'A salada inteira está fugindo do prato!', enter: 'Cenouras rolando pra mim? Hoje é meu dia de sorte!', taste: 'Crocante! Fresquinha! Nota mil!', name: 'Salada do Coelho! Com cenoura de sobra!' },
  { id: 'bloop-v209', title: 'Pizza no Espaço', bg: 'space', cast: ['estrela', 'chef', 'robozinho'], tags: ['pizza', 'espaço'], dish: 'pizza espacial', step: 'Massa, tomate e queijo de verdade. Nada de queijo da lua!', oops: 'Sem gravidade a cobertura não quer ficar na massa!', fx: '!stars #whoosh', boom: 'Rodelas de tomate flutuando pela nave toda!', enter: 'Alerta! Objeto redondo e cheiroso detectado!', taste: 'Sabor margarida com gostinho de cometa!', name: 'Pizza Orbital! Gira antes de comer!' },
];
function cookFilm(v: Cook, i: number): FilmSpec {
  const [A] = v.cast.map(castName);
  return film(v, 'comedia', i % 3 === 0 ? 'festa' : 'alegre', [
    {
      bg: v.bg,
      light: v.light,
      at: '5 11 -',
      b: [
        `0 happy: ${alt([`Hoje vamos fazer ${v.dish}! A receita da família!`, `Avental no lugar! O prato de hoje é ${v.dish}!`, `Atenção, cozinheiros: hoje é dia de ${v.dish}!`], i)}`,
        `1 cheer happy: ${alt(['Eu ajudo! O que vai primeiro?', 'Posso mexer a colher? Eu sou ótimo nisso!', `Conta comigo, ${A}!`], i, 1)}`,
        `0 point happy: ${v.step}`,
        `1 think smug: ${v.oops}`,
        `0 scared: ${alt(['Espera! Não!', 'Cuidado! Isso não estava na receita!', 'Ai, ai, ai... para tudo!'], i, 2)}`,
        `* ${v.fx} +0.6`,
        `1 surprised: ${v.boom}`,
        `2 <8 happy: ${v.enter}`,
        `2 laughing !hearts: ${v.taste}`,
        `0 laughing: ${v.name}`,
        `1 dance laughing !confetti #applause: ${alt(['Errar na cozinha também é inventar!', 'A melhor receita é a que sai sem querer!', 'Amanhã eu ajudo de novo!'], i)}`,
      ],
    },
  ]);
}

/* ======================= 3) COMPETIÇÃO ======================= */
interface Match extends Base {
  sport: string;
  brag: string;
  rule: string;
  mishap: string;
  help: string;
  result: string;
  lesson: string;
}
const MATCH: Match[] = [
  { id: 'bloop-v301', title: 'Corrida de Saco', bg: 'park', cast: ['gema', 'pipoca', 'trovao'], tags: ['corrida', 'festa junina'], sport: 'a corrida de saco', brag: 'Eu pulo como um canguru campeão!', rule: 'Vale pular, não vale correr com o saco na mão!', mishap: 'Opa! Prendi o pé e rolei feito bolinha!', help: 'Pega minha mão! A gente pula junto!', result: 'Chegaram os dois juntos! Empate de amigos!', lesson: 'Pular junto é mais divertido que pular sozinho.' },
  { id: 'bloop-v302', title: 'O Campeonato de Pipa', bg: 'beach', light: 'dusk', d3: true, cast: ['bolha', 'tuca', 'mel'], tags: ['pipa', 'vento'], sport: 'o campeonato de pipa', brag: 'Minha pipa é a mais rápida do bairro!', rule: 'Ganha a pipa que fizer o desenho mais bonito no céu!', mishap: 'Ai! A linha enroscou na pipa da Mel!', help: 'Calma! Vamos desenrolar juntos, devagar.', result: 'As duas pipas juntas fizeram um coração no céu!', lesson: 'Às vezes o enrosco vira o melhor desenho.' },
  { id: 'bloop-v303', title: 'Basquete dos Bichos', bg: 'street', cast: ['sol', 'cabra', 'urso'], tags: ['basquete', 'bichos'], sport: 'o jogo de basquete', brag: 'Bééé! Eu pulo mais alto que a cesta!', rule: 'Valem três pontos as cestas de longe!', mishap: 'Ops... comi a rede da cesta. Sem querer!', help: 'Sem problema! Eu seguro a cesta com as patas!', result: 'Cesta! Cesta! E o urso virou a tabela!', lesson: 'Quando falta alguma coisa, a gente inventa um jeito.' },
  { id: 'bloop-v304', title: 'Natação Maluca', bg: 'underwater', d3: true, cast: ['estrela', 'peixe', 'pato'], tags: ['natação', 'mar'], sport: 'a prova de natação', brag: 'Quack! Patos nadam desde que nascem!', rule: 'Ida e volta até a concha grande. Sem empurrar!', mishap: 'Socorro! Uma alga enrolou meu pé!', help: 'Eu ilumino o caminho e você se solta!', result: 'Chegaram brilhando juntos na concha!', lesson: 'Nadar é bom. Ajudar é melhor ainda.' },
  { id: 'bloop-v305', title: 'Patins no Gelo', bg: 'snow', cast: ['nuvem', 'kiki', 'pinguim'], tags: ['patins', 'gelo'], sport: 'o desafio de patins', brag: 'Vou fazer um giro triplo com pirueta!', rule: 'Ganha quem fizer a dança mais bonita no gelo!', mishap: 'Escorreguei! Bumbum gelado! Bumbum gelado!', help: 'Patinar de mãos dadas é mais fácil. Vem!', result: 'A dança em dupla ganhou nota dez dos juízes!', lesson: 'Cair faz parte. Levantar com amigo é o segredo.' },
  { id: 'bloop-v306', title: 'O Pega-Bandeira', bg: 'forest', light: 'dusk', d3: true, cast: ['faisca', 'raposa', 'coruja'], tags: ['bandeira', 'time'], sport: 'o pega-bandeira', brag: 'Eu sou rápida e esperta. Ninguém me pega!', rule: 'Pegue a bandeira do outro time e volte sem ser tocado!', mishap: 'Tropecei na raiz! A bandeira caiu na lama!', help: 'Eu vi tudo lá de cima! Vem pelo caminho das pedras!', result: 'Bandeira resgatada! Meio suja, mas resgatada!', lesson: 'Quem enxerga de longe ajuda quem corre de perto.' },
  { id: 'bloop-v307', title: 'Queda de Braço Fofa', bg: 'classroom', cast: ['lupa', 'dudu', 'dinho'], tags: ['força', 'escola'], sport: 'a queda de braço', brag: 'Eu sou um dragão! Tenho braços de dragão!', rule: 'Cotovelo na mesa e sem fazer cócegas!', mishap: 'Hihihi! Ele fez cócegas com o rabo! Não vale!', help: 'Desculpa! Meu rabo tem vida própria!', result: 'Os dois caíram de tanto rir! Ninguém ganhou!', lesson: 'Força de verdade é saber pedir desculpa.' },
  { id: 'bloop-v308', title: 'Corrida de Carrinho', bg: 'desert', d3: true, cast: ['robozinho', 'trovao', 'galo'], tags: ['carrinho', 'deserto'], sport: 'a corrida de carrinho de rolimã', brag: 'Meu carrinho tem turbo! Turbo de pedal!', rule: 'Três voltas ao redor do cacto! Sem atalhos!', mishap: 'A roda soltou! Lá vai ela rolando sozinha!', help: 'Eu tenho uma roda reserva! Bip! Toma!', result: 'O galo cantou e os dois cruzaram a linha juntos!', lesson: 'Peça reserva e amigo reserva salvam qualquer corrida.' },
  { id: 'bloop-v309', title: 'Salto com Vara de Macarrão', bg: 'stage', cast: ['tito', 'bolota', 'sapo'], tags: ['salto', 'circo'], sport: 'o salto em altura', brag: 'Croac! Ninguém pula mais alto que um sapo!', rule: 'O sarrafo sobe um pouquinho a cada salto!', mishap: 'A vara era de macarrão! Ela entortou toda!', help: 'Abracadabra! Agora ela é de borracha!', result: 'O sapo pulou tão alto que pegou uma estrela!', lesson: 'Um pouquinho de mágica e muito treino!' },
];
function matchFilm(v: Match, i: number): FilmSpec {
  const [, B] = v.cast.map(castName);
  return film(v, 'esporte', i % 2 ? 'festa' : 'aventura', [
    {
      bg: v.bg,
      light: v.light,
      at: '8 4.2 11.8',
      b: [
        `0 happy #drumroll: ${alt([`Bem-vindos a ${v.sport}!`, `Começa agora ${v.sport}! Torcida, barulho!`, `Senhoras e senhores: ${v.sport}!`], i)}`,
        `0 point happy: ${v.rule}`,
        `2 flex smug: ${v.brag}`,
        `1 happy: ${alt(['Que vença o melhor! E que todo mundo se divirta!', `Boa sorte, ${castName(v.cast[2])}!`, 'Eu vou dar o meu melhor!'], i, 1)}`,
        `0 cheer happy #whoosh: ${alt(['Preparar... apontar... JÁ!', 'Três, dois, um... VAI!', 'Valendo!'], i, 2)}`,
        `2 dizzy !stars #bonk: ${v.mishap}`,
        `1 think thinking: ${alt(['(Eu podia passar na frente... mas não seria legal.)', '(Se eu continuar, eu ganho... mas e ele?)', '(Ganhar sozinho não tem graça.)'], i)}`,
        `1 happy: ${v.help}`,
        `* !sparkles #applause +0.4`,
        `0 surprised: ${v.result}`,
        `2 love !hearts: ${alt([`Obrigado, ${B}! Você é campeão de verdade.`, `${B}, você é demais!`, `Valeu, ${B}! Amigo é pra isso!`], i, 1)}`,
        `1 bow happy !confetti: ${v.lesson}`,
      ],
    },
  ]);
}

/* ======================= 4) MISSÃO / VIAGEM ======================= */
interface Quest extends Base {
  goal: string;
  ride: string;
  arrive: string;
  local: string;
  problem: string;
  idea: string;
  win: string;
  bye: string;
  bg2: string;
  light2?: Light;
}
const QUEST: Quest[] = [
  { id: 'bloop-v401', title: 'Missão Cometa', bg: 'rooftop', light: 'night', bg2: 'space', d3: true, cast: ['estrela', 'bia', 'gato'], tags: ['cometa', 'foguete'], goal: 'Hoje vamos pegar um pedacinho de cometa para o museu!', ride: 'Foguete de papelão pronto! Contagem regressiva!', arrive: 'Uau, o espaço é ainda maior do que no livro!', local: 'Miau! Quem são vocês no meu cometa?', problem: 'O cometa é muito rápido! Não dá para alcançar!', idea: 'Já sei: a gente joga um novelo e ele vem brincar!', win: 'Funcionou! Ele parou pra brincar com a lã!', bye: 'Leva esse brilhinho de lembrança. Volte sempre!' },
  { id: 'bloop-v402', title: 'O Vulcão de Chocolate', bg: 'candy', bg2: 'desert', cast: ['tuca', 'dudu', 'dino'], tags: ['vulcão', 'doces'], goal: 'Dizem que existe um vulcão que solta chocolate quente!', ride: 'Mochilas, colheres e canecas. Partiu!', arrive: 'Que calor! E que cheirinho de cacau!', local: 'Rawr! Bem-vindos à minha montanha doce!', problem: 'O vulcão está entupido de marshmallow!', idea: 'E se a gente assar os marshmallows primeiro?', win: 'Desentupiu! Chuva de chocolate nas canecas!', bye: 'Voltem no inverno! O chocolate fica ainda melhor!' },
  { id: 'bloop-v403', title: 'A Concha Cantora', bg: 'beach', bg2: 'underwater', d3: true, cast: ['lumi', 'zeca', 'peixe'], tags: ['mar', 'música'], goal: 'No fundo do mar existe uma concha que canta!', ride: 'Máscara, nadadeira e um submarino amarelo!', arrive: 'Tudo azul e cheio de bolhinhas!', local: 'Psiu! Falem baixo, a concha está dormindo.', problem: 'Ela perdeu a voz! Está rouca de tanto cantar!', idea: 'Que tal um chá de alga quentinho? Vovó sempre faz!', win: 'Ela cantou! O mar inteiro está dançando!', bye: 'Agora toda maré traz uma musiquinha pra vocês.' },
  { id: 'bloop-v404', title: 'O Castelo nas Nuvens', bg: 'park', bg2: 'castle', light2: 'dusk', cast: ['nuvem', 'kiki', 'coruja'], tags: ['castelo', 'nuvens'], goal: 'Lá em cima das nuvens tem um castelo esquecido!', ride: 'Segura firme! Vamos subir no balão de festa!', arrive: 'Chegamos! As paredes são fofas como algodão!', local: 'Uuh! Faz tempo que ninguém visita o castelo...', problem: 'A ponte levadiça está presa e não abre!', idea: 'Se todo mundo soprar junto, as nuvens empurram!', win: 'Abriu! O castelo está iluminado de novo!', bye: 'Fiquem à vontade: agora este castelo é de todos!' },
  { id: 'bloop-v405', title: 'A Pegada Misteriosa', bg: 'snow', bg2: 'forest', light2: 'dusk', d3: true, cast: ['trovao', 'nina', 'urso'], tags: ['pegada', 'neve'], goal: 'Encontrei uma pegada gigante na neve! Vamos seguir!', ride: 'Botas, cachecol e muita coragem!', arrive: 'As pegadas entram na floresta escura...', local: 'Oi! Vocês viram meu chinelo? Perdi um pé.', problem: 'O chinelo caiu no rio congelado!', idea: 'A gente faz uma corrente de amigos e puxa!', win: 'Pegamos! Agora o urso tem os dois pés quentinhos!', bye: 'Obrigado! Venham tomar mel na minha toca.' },
  { id: 'bloop-v406', title: 'A Cidade dos Robôs', bg: 'street', bg2: 'rooftop', light2: 'night', cast: ['robozinho', 'pipoca', 'faisca'], tags: ['robôs', 'cidade'], goal: 'Recebi um pedido de socorro da Cidade dos Robôs!', ride: 'Patinete turbo, capacete e mapa digital!', arrive: 'Os prédios piscam como árvores de Natal!', local: 'Ainda bem que chegaram! As luzes estão apagando!', problem: 'A bateria da cidade está fraquinha!', idea: 'Vamos pedalar todos juntos pra gerar energia!', win: 'A cidade acendeu inteirinha! Que lindo!', bye: 'Bip bip! Vocês são os heróis da Cidade dos Robôs!' },
  { id: 'bloop-v407', title: 'A Flor do Deserto', bg: 'street', bg2: 'desert', d3: true, cast: ['gema', 'mel', 'flor'], tags: ['flor', 'deserto'], goal: 'Dizem que no deserto nasce uma flor que nunca murcha!', ride: 'Chapéu, garrafinha de água e protetor solar!', arrive: 'Quanta areia! E lá longe, um ponto colorido!', local: 'Olá! Eu sou a flor. Mas estou com sede...', problem: 'Faz um ano que não chove por aqui!', idea: 'A gente divide a nossa água com ela!', win: 'Ela abriu as pétalas! Que perfume!', bye: 'Levem minhas sementes. Plantem amizade por aí!' },
  { id: 'bloop-v408', title: 'A Torre do Relógio', bg: 'street', bg2: 'castle', light: 'dusk', light2: 'night', cast: ['lupa', 'bolota', 'guaxinim'], tags: ['relógio', 'tempo'], goal: 'O relógio da cidade parou! Ninguém sabe que horas são!', ride: 'Lanterna, lupa e uma escada bem comprida!', arrive: 'Quanta engrenagem! Parece um quebra-cabeça gigante!', local: 'Oi! Eu moro aqui dentro. Tic-tac é minha música!', problem: 'Uma bolinha de gude travou a engrenagem!', idea: 'Se eu empurrar com a pata pequena, ela sai!', win: 'Tic-tac! O relógio voltou a funcionar!', bye: 'Agora ninguém se atrasa. Nem pro lanche!' },
  { id: 'bloop-v409', title: 'O Arco-Íris Perdido', bg: 'park', bg2: 'forest', light2: 'dusk', cast: ['sol', 'tito', 'joaninha'], tags: ['arco-íris', 'cores'], goal: 'O arco-íris sumiu do céu! Vamos achar as cores!', ride: 'Varinha, mapa e um pote vazio para guardar!', arrive: 'A floresta está toda cinza... que triste!', local: 'Eu guardei o vermelho nas minhas bolinhas!', problem: 'O azul e o amarelo estão presos numa teia!', idea: 'Com uma musiquinha a aranha acorda e solta!', win: 'Todas as cores de volta! O céu sorriu!', bye: 'Sempre que chover, procurem a gente lá em cima!' },
  { id: 'bloop-v410', title: 'O Farol Apagado', bg: 'beach', light: 'dusk', bg2: 'rooftop', light2: 'night', d3: true, cast: ['zeca', 'lumi', 'pato'], tags: ['farol', 'mar'], goal: 'O farol da praia apagou! Os barquinhos não acham o caminho!', ride: 'Lanterna, escada e um sanduíche pra viagem!', arrive: 'Lá do alto dá pra ver o mar inteirinho!', local: 'Quack! Eu cuido do farol, mas a lâmpada queimou!', problem: 'Não tem lâmpada nova em lugar nenhum!', idea: 'E se a gente juntar todos os vaga-lumes da praia?', win: 'O farol brilhou verdinho! Os barcos estão voltando!', bye: 'Agora o farol mais bonito do mundo é o nosso!' },
];
function questFilm(v: Quest, i: number): FilmSpec {
  return film(v, i % 2 ? 'espaco' : 'aventura', 'aventura', [
    {
      bg: v.bg,
      light: v.light,
      at: '5 11 -',
      b: [`0 point happy: ${v.goal}`, `1 cheer surprised: ${alt(['Uma missão de verdade? Eu vou!', 'Que aventura! Conta comigo!', 'Sério? Partiu agora mesmo!'], i)}`, `0 happy #whoosh: ${v.ride}`],
    },
    {
      bg: v.bg2,
      light: v.light2,
      at: '5 11 -',
      b: [
        `1 surprised !sparkles: ${v.arrive}`,
        `2 <8 happy #pop: ${v.local}`,
        `0 wave happy: ${alt(['Oi! A gente veio em paz!', 'Olá! Somos exploradores do bem!', 'Prazer! Viemos ajudar!'], i, 1)}`,
        `2 sad: ${v.problem}`,
        `1 think thinking: ${v.idea}`,
        `* !shake !zoomlines #magic +0.5`,
        `0 cheer happy !confetti: ${v.win}`,
        `2 love !hearts: ${v.bye}`,
        `1 wave happy: ${alt(['Missão cumprida! Até a próxima aventura!', 'Melhor viagem do mundo! Tchau, tchau!', 'Voltamos com histórias pra contar!'], i, 2)}`,
      ],
    },
  ]);
}

/* ======================= 5) FESTA SURPRESA ======================= */
interface Party extends Base {
  why: string;
  gift: string;
  near: string;
  excuse: string;
  reveal: string;
  thanks: string;
}
const PARTY: Party[] = [
  { id: 'bloop-v501', title: 'Festa do Pijama Secreta', bg: 'bedroom', light: 'night', cast: ['lumi', 'mel', 'kiki'], tags: ['pijama', 'surpresa'], why: 'A Kiki se mudou ontem. Vamos fazer uma festa do pijama de boas-vindas!', gift: 'Eu trouxe travesseiros, lanterna e um pacote de pipoca!', near: 'Oi! Que barulho é esse de travesseiro?', excuse: 'É... treino de travesseiro voador! Coisa nossa!', reveal: 'Uma festa do pijama pra mim? No meu primeiro dia?', thanks: 'Já sinto que essa casa nova é a melhor de todas!' },
  { id: 'bloop-v502', title: 'O Aniversário do Vovô Robô', bg: 'kitchen', d3: true, cast: ['dudu', 'faisca', 'robozinho'], tags: ['aniversário', 'robô'], why: 'O Bip faz cem anos de fábrica! Vamos preparar um bolo de parafusos!', gift: 'Eu pintei um cartão com tinta que brilha no escuro!', near: 'Bip? Detectei movimento suspeito na cozinha.', excuse: 'É... a gente está consertando a geladeira! Isso!', reveal: 'Erro! Erro! Excesso de felicidade nos circuitos!', thanks: 'Melhor dia da minha programação inteira!' },
  { id: 'bloop-v503', title: 'Festa da Primavera', bg: 'park', cast: ['nina', 'tuca', 'flor'], tags: ['primavera', 'flores'], why: 'Hoje a Florzinha completa um ano! Vamos decorar o parque!', gift: 'Eu fiz uma coroa de folhas e fitas!', near: 'Oi, gente! Por que tem fita pendurada nas árvores?', excuse: 'As árvores... pediram enfeite! Moda de primavera!', reveal: 'Uma festa no parque inteiro? Pra mim?!', thanks: 'Vou desabrochar de tanta alegria!' },
  { id: 'bloop-v504', title: 'Surpresa no Palco', bg: 'stage', light: 'dusk', d3: true, cast: ['sol', 'bolha', 'gema'], tags: ['palco', 'homenagem'], why: 'A Vovó Gema ensinou música pra todo mundo da cidade. Hoje é a homenagem!', gift: 'Eu convidei a orquestra inteira. Até o tocador de triângulo!', near: 'Que movimento é esse no teatro numa terça-feira?', excuse: 'Ensaio! Ensaio de... silêncio! Shhh!', reveal: 'Todos os meus alunos juntos? Que emoção!', thanks: 'A música que eu ensinei voltou pra mim em dobro!' },
  { id: 'bloop-v505', title: 'O Chá da Rainha Coelha', bg: 'castle', cast: ['rei', 'tito', 'coelho'], tags: ['castelo', 'chá'], why: 'A Coelha Real ganhou o concurso de cenouras. Vamos fazer um chá!', gift: 'Fiz um bolo de cenoura com três andares!', near: 'Por que o salão está fechado? Estou sentindo cheiro de bolo!', excuse: 'É o... perfume novo do castelo! Eau de Cenoura!', reveal: 'Um chá real pra mim? Com bolo de cenoura?', thanks: 'Vou pular de alegria! Literalmente!' },
  { id: 'bloop-v506', title: 'Luau dos Amigos', bg: 'beach', light: 'night', d3: true, cast: ['zeca', 'estrela', 'tucano'], tags: ['luau', 'praia'], why: 'O Tucaninho volta de viagem hoje. Vamos fazer um luau na praia!', gift: 'Trouxe lanternas de papel e um violão!', near: 'Piu! Por que tem luzinha na areia?', excuse: 'São... vaga-lumes muito organizados!', reveal: 'Um luau de boas-vindas? Que saudade de vocês!', thanks: 'Viajei o mundo, mas não tem lugar como a minha turma!' },
  { id: 'bloop-v507', title: 'Festa na Neve', bg: 'snow', cast: ['pipoca', 'nuvem', 'pinguim'], tags: ['neve', 'inverno'], why: 'O Pingolim aprendeu a patinar! Vamos fazer uma festa no gelo!', gift: 'Fiz um boneco de neve com a cara dele!', near: 'Oi! Por que tem um boneco de neve igualzinho a mim?', excuse: 'Coincidência! Pura coincidência!', reveal: 'Uma festa pra comemorar meu patins? Que fofura!', thanks: 'Vou patinar pra vocês até o sol nascer!' },
  { id: 'bloop-v508', title: 'Piquenique Surpresa', bg: 'forest', d3: true, cast: ['bia', 'trovao', 'raposa'], tags: ['piquenique', 'floresta'], why: 'A Raponeve ajudou a achar meu cachorro. Vamos agradecer com um piquenique!', gift: 'Trouxe toalha xadrez e sanduíche de três sabores!', near: 'Que cheiro de sanduíche é esse no meio da floresta?', excuse: 'É... a floresta está fazendo lanche!', reveal: 'Um piquenique de agradecimento? Pra mim?!', thanks: 'Ajudar foi fácil. Ganhar amigos assim é melhor ainda!' },
  { id: 'bloop-v509', title: 'O Bolo do Dinossauro', bg: 'forest', light: 'dusk', cast: ['tuca', 'kiki', 'dino'], tags: ['dinossauro', 'aniversário'], why: 'O Bebessauro faz três milhões de anos! Bem, três anos. Vamos fazer festa!', gift: 'Fiz um bolo em forma de vulcão, com velinha de estrela!', near: 'Rawr? Por que tem um vulcão de chantili aqui?', excuse: 'É... uma montanha que apareceu sozinha!', reveal: 'Uma festa jurássica pra mim? Rawr de alegria!', thanks: 'Vou guardar esse dia no meu coração de dinossauro!' },
];
function partyFilm(v: Party, i: number): FilmSpec {
  const [, , C] = v.cast.map(castName);
  return film(v, 'festa', 'festa', [
    {
      bg: v.bg,
      light: v.light,
      at: '5 11 -',
      b: [
        `0 smug %whisper: ${v.why}`,
        `1 cheer happy: ${v.gift}`,
        `0 point happy: ${alt(['Balões ali, confete aqui. Rápido!', 'Pendura a faixa! Arruma a mesa!', 'Todo mundo no seu lugar!'], i)}`,
        `2 <8 confused: ${v.near}`,
        `0 scared 1=scared !sweat: ${v.excuse}`,
        `2 think thinking: ${alt(['Hum... vocês estão muito estranhos hoje.', 'Sei... vou fingir que acredito.', 'Tá bom... mas que esquisito.'], i, 1)}`,
        `2 >R confused #steps: ${alt(['Vou dar uma volta. Já volto!', 'Esqueci uma coisa lá fora!', 'Vou pegar um copo de água.'], i, 2)}`,
        `1 laughing: ${alt(['Ufa! Essa foi por pouco!', 'Quase! Rápido, antes que volte!', 'Ninguém respira até a hora!'], i)}`,
        `2 <8 happy #steps: ${alt(['Voltei! Onde vocês...', 'Pronto, cheguei! O que...', 'E aí, o que vocês estão...'], i, 1)}`,
        `0 cheer laughing 1=cheer/laughing !confetti #applause: SURPRESAAA, ${C}!`,
        `2 surprised !sparkles: ${v.reveal}`,
        `2 love !hearts: ${v.thanks}`,
      ],
    },
  ]);
}

/* ======================= 6) APRENDER ALGO NOVO ======================= */
interface Learn extends Base {
  skill: string;
  fear: string;
  tip1: string;
  fail: string;
  tip2: string;
  try2: string;
  done: string;
}
const LEARN: Learn[] = [
  { id: 'bloop-v601', title: 'A Primeira Pedalada', bg: 'park', cast: ['dudu', 'gema', 'pato'], tags: ['bicicleta', 'coragem'], skill: 'andar de bicicleta sem rodinha', fear: 'E se eu cair? E se a bicicleta fugir?', tip1: 'Olha pra frente, não pro chão. E pedala sem parar!', fail: 'Uooou! Fiz zigue-zague e parei na moita!', tip2: 'Quase! Eu vou segurando atrás. Confia!', try2: 'Pedala, pedala, pedala... vovó, você soltou?', done: 'Soltei faz tempo! Você está andando sozinho!' },
  { id: 'bloop-v602', title: 'Aula de Assobio', bg: 'street', d3: true, cast: ['kiki', 'trovao', 'tucano'], tags: ['assobio', 'música'], skill: 'assobiar', fear: 'Eu sopro e só sai vento. Fffff...', tip1: 'Faz biquinho, como quem vai soprar uma vela.', fail: 'Ffff... saiu um peido de boca. Que vergonha!', tip2: 'Agora põe a língua atrás dos dentes e sopra fininho.', try2: 'Fiii... fiiii... ouvi um barulhinho!', done: 'FIU-FIU! Até o Tucaninho respondeu!' },
  { id: 'bloop-v603', title: 'Mergulho Corajoso', bg: 'beach', cast: ['nina', 'peixe', 'sapo'], tags: ['natação', 'medo'], skill: 'mergulhar a cabeça na água', fear: 'A água entra no nariz e faz cosquinha ruim!', tip1: 'Solta bolhinhas pelo nariz devagar. Assim, ó: blub blub.', fail: 'Blub... cof cof! Engoli um pouquinho de mar!', tip2: 'Primeiro só o queixo. Depois a boca. Depois o resto!', try2: 'Queixo... boca... nariz... e... BLUB!', done: 'Eu vi peixinhos lá embaixo! Quero de novo!' },
  { id: 'bloop-v604', title: 'Amarrando o Cadarço', bg: 'classroom', d3: true, cast: ['zeca', 'bolha', 'coelho'], tags: ['cadarço', 'escola'], skill: 'amarrar o cadarço', fear: 'Esses cordões vivem me enganando!', tip1: 'Faz duas orelhas de coelho, cruza e passa uma por baixo!', fail: 'Fiz um nó tão grande que virou uma bola!', tip2: 'Devagar. Orelha, orelha, abraça e puxa!', try2: 'Orelha... orelha... abraço... puxa!', done: 'Um laço perfeito! Igual às orelhas do Coelhágico!' },
  { id: 'bloop-v605', title: 'O Desenho do Gato', bg: 'bedroom', cast: ['bia', 'tito', 'gato'], tags: ['desenho', 'arte'], skill: 'desenhar um gato', fear: 'Meus desenhos parecem batata com pernas.', tip1: 'Começa com um círculo pra cabeça e um ovo pro corpo.', fail: 'Saiu uma batata com orelhas. De novo!', tip2: 'Agora olha o modelo. Repara nos bigodes e no rabo!', try2: 'Bigode... rabo enrolado... olhinho brilhante...', done: 'É você, Gatobô! Até a pose ficou igual!' },
  { id: 'bloop-v606', title: 'Cambalhota no Tapete', bg: 'stage', d3: true, cast: ['mel', 'faisca', 'urso'], tags: ['ginástica', 'cambalhota'], skill: 'dar uma cambalhota', fear: 'O mundo vai girar e eu vou ficar tonta!', tip1: 'Queixo no peito, mãos no chão e rola como bolinha!', fail: 'Rolei de lado e virei uma panqueca!', tip2: 'Encolhe bem! Imagina que você é um tatu-bola!', try2: 'Sou um tatu... sou um tatu... ROLA!', done: 'Uma cambalhota de verdade! O mundo girou e foi divertido!' },
  { id: 'bloop-v607', title: 'Plantando um Feijão', bg: 'classroom', cast: ['tuca', 'lupa', 'milho'], tags: ['planta', 'ciências'], skill: 'plantar um feijão no algodão', fear: 'E se ele não nascer? Eu não tenho mão boa pra planta.', tip1: 'Algodão molhadinho, feijão em cima e um lugar com sol.', fail: 'Afoguei o feijão! Pus água demais!', tip2: 'Só umas gotinhas por dia. E paciência!', try2: 'Um dia... dois dias... três dias...', done: 'Nasceu! Tem um brotinho verde dando oi!' },
  { id: 'bloop-v608', title: 'Escrevendo o Nome', bg: 'classroom', light: 'dusk', d3: true, cast: ['pipoca', 'gema', 'joaninha'], tags: ['escrever', 'letras'], skill: 'escrever o meu nome sozinho', fear: 'As letras ficam tortas e fogem da linha!', tip1: 'Uma letra de cada vez. Primeiro o P, com barriguinha!', fail: 'O P ficou de cabeça pra baixo. Virou um B?', tip2: 'Barriguinha pra cima e pra direita. Tenta de novo!', try2: 'P... I... P... O... C... A!', done: 'PIPOCA! Meu nome inteirinho! Vou escrever na parede! Brincadeira!' },
  { id: 'bloop-v609', title: 'Fazendo Bolha de Sabão', bg: 'rooftop', light: 'dusk', cast: ['sol', 'lumi', 'abelha'], tags: ['bolhas', 'sopro'], skill: 'fazer uma bolha de sabão gigante', fear: 'Eu sopro forte e a bolha estoura na hora!', tip1: 'Sopra devagarinho, como se fosse um segredo.', fail: 'Ploft! Estourou na minha cara. Que ardido!', tip2: 'Mais devagar ainda. Sopro de borboleta!', try2: 'Fffffuuuuu... tá crescendo... tá crescendo...', done: 'Uma bolha do tamanho de uma melancia! Olha ela voando!' },
];
function learnFilm(v: Learn, i: number): FilmSpec {
  const [A, B] = v.cast.map(castName);
  return film(v, i % 2 ? 'escola' : 'amizade', i % 3 === 1 ? 'sono' : 'alegre', [
    {
      bg: v.bg,
      light: v.light,
      at: '5 11 -',
      b: [
        `0 sad: ${alt([`Todo mundo sabe ${v.skill}. Menos eu.`, `Hoje eu queria aprender a ${v.skill}...`, `${B}, você me ensina a ${v.skill}?`], i)}`,
        `0 scared: ${v.fear}`,
        `1 happy: ${alt(['Todo mundo começa do começo. Vem que eu te ajudo!', `Calma, ${A}. Eu também já tive medo.`, 'Vamos devagar. Um passo de cada vez.'], i, 1)}`,
        `1 point happy: ${v.tip1}`,
        `0 dizzy !stars #bonk: ${v.fail}`,
        `2 <8 happy: ${alt(['Eu vi! Foi quase! Tenta mais uma vez!', 'Errar é o jeito de acertar!', 'Força! Eu estou torcendo!'], i, 2)}`,
        `1 think happy: ${v.tip2}`,
        `0 think thinking: ${v.try2}`,
        `* !sparkles #ding +0.4`,
        `0 cheer surprised: ${v.done}`,
        `1 clap love !hearts: ${alt(['Viu? Você conseguiu sozinho!', 'Eu sabia que você ia conseguir!', 'Que orgulho de você!'], i)}`,
        `0 love: ${alt([`Obrigado, ${B}. Amanhã eu ensino alguém!`, 'Agora eu quero aprender outra coisa!', 'Foi difícil... mas foi o melhor dia!'], i, 1)}`,
      ],
    },
  ]);
}

/* ======================= 7) BICHO DA FAZENDA ======================= */
interface Farm extends Base {
  problem: string;
  try1: string;
  flop: string;
  try2: string;
  works: string;
  end: string;
}
const FARM: Farm[] = [
  { id: 'bloop-v701', title: 'O Galo Rouco', bg: 'park', light: 'dusk', cast: ['tuca', 'galo', 'ovelha'], tags: ['galo', 'manhã'], problem: 'Có... cóóó... Perdi a voz! Amanhã ninguém vai acordar!', try1: 'Que tal um chá de mel com limão?', flop: 'Có... ainda tô parecendo uma buzina furada!', try2: 'E se a gente cantar junto? Cada um faz um pedacinho!', works: 'Mééé-CÓ-CÓ-RI-CÓÓÓ! Funcionou em coral!', end: 'A fazenda acordou com a música mais bonita de todas!' },
  { id: 'bloop-v702', title: 'A Vaca que Queria Voar', bg: 'park', d3: true, cast: ['gema', 'ponei', 'pato'], tags: ['voar', 'sonho'], problem: 'Eu queria voar igual ao pato. Lá de cima tudo deve ser lindo!', try1: 'Bate as orelhas bem rápido! Rápido!', flop: 'Bati, bati... e só fiz vento no milho.', try2: 'E se você subir no morro e olhar lá de cima?', works: 'Uau! Dá pra ver a fazenda inteira daqui!', end: 'Nem precisei voar. Precisei de amigos que me levassem alto!' },
  { id: 'bloop-v703', title: 'O Porquinho Limpinho', bg: 'park', cast: ['bia', 'cabra', 'cao'], tags: ['banho', 'lama'], problem: 'Tem lama demais na fazenda! Eu gosto de ficar cheiroso!', try1: 'Que tal um banho de mangueira?', flop: 'Molhou tudo! Agora a lama ficou ainda mais lama!', try2: 'Vamos fazer um caminho de pedrinhas até o celeiro!', works: 'Pedrinha, pedrinha, pedrinha... cheguei limpinho!', end: 'Agora tem caminho pra quem gosta de lama e pra quem não gosta!' },
  { id: 'bloop-v704', title: 'A Abelha Perdida', bg: 'forest', d3: true, cast: ['nina', 'abelha', 'joaninha'], tags: ['abelha', 'colmeia'], problem: 'Bzzz... me perdi da colmeia! Todas as árvores parecem iguais!', try1: 'Vamos seguir o cheiro das flores!', flop: 'Achei um canteiro de cebola. Não era isso!', try2: 'As abelhas dançam pra mostrar o caminho. Dança comigo!', works: 'Bzz-bzz! Ouvi a música da colmeia! É por ali!', end: 'Em casa! E de presente: um potinho de mel pra cada uma!' },
  { id: 'bloop-v705', title: 'O Milho Medroso', bg: 'park', light: 'night', cast: ['zeca', 'milho', 'coruja'], tags: ['milho', 'noite'], problem: 'De noite a plantação faz barulho de sussurro. Tenho medo!', try1: 'Que tal contar até dez bem devagar?', flop: 'Um, dois... SHHHH... AAAH! O que foi isso?', try2: 'Vamos olhar de perto o que faz o barulho!', works: 'É só o vento fazendo cosquinha nas folhas!', end: 'Agora o barulho parece uma canção de ninar. Boa noite!' },
  { id: 'bloop-v706', title: 'A Cabra Artista', bg: 'street', d3: true, cast: ['tito', 'cabra', 'galo'], tags: ['pintura', 'celeiro'], problem: 'O celeiro está tão sem graça... e eu só sei comer coisas!', try1: 'Pinta com o rabo! Molha na tinta e balança!', flop: 'Ops! Pintei o galo de roxo!', try2: 'E se você pintar com flores? Carimbinho de pétala!', works: 'Olha! O celeiro está florido de cima a baixo!', end: 'Nossa fazenda virou um museu! Galo roxo incluso!' },
  { id: 'bloop-v707', title: 'O Pônei Sem Sapato', bg: 'desert', cast: ['estrela', 'ponei', 'cachorro'], tags: ['pônei', 'ferradura'], problem: 'Perdi uma ferradura! Agora eu ando mancando!', try1: 'Usa minha meia! É quentinha!', flop: 'A meia escorregou! Agora eu deslizo na areia!', try2: 'O Craquinho tem faro! Ele acha a ferradura!', works: 'Au! Achei! Estava atrás do cacto!', end: 'Clop, clop, clop! Que som bom de ouvir!' },
  { id: 'bloop-v708', title: 'O Ovo Mais Bonito', bg: 'park', d3: true, light: 'dusk', cast: ['mel', 'pato', 'galo'], tags: ['ovo', 'Páscoa'], problem: 'Concurso do ovo mais bonito! Mas o meu é todo branquinho...', try1: 'Pinta de bolinhas! Bolinha sempre fica bonito!', flop: 'A tinta escorreu e virou uma meleca colorida!', try2: 'E se o seu ovo contar uma história? Desenha a sua família!', works: 'Pai pato, mãe pata e os patinhos. Ficou perfeito!', end: 'Ganhou o prêmio de ovo mais amado da fazenda!' },
  { id: 'bloop-v709', title: 'A Ovelha Sem Lã', bg: 'snow', cast: ['bolha', 'ovelha', 'cabra'], tags: ['ovelha', 'frio'], problem: 'Cortaram minha lã ontem e hoje caiu neve! Brrr!', try1: 'Corre bem rápido pra esquentar!', flop: 'Corri tanto que escorreguei de bumbum na neve!', try2: 'Vamos tricotar um suéter com a lã que sobrou!', works: 'Um suéter listrado! Quentinho e com estilo!', end: 'Agora eu sou a ovelha mais elegante da montanha!' },
];
function farmFilm(v: Farm, i: number): FilmSpec {
  const [A, B] = v.cast.map(castName);
  return film(v, 'fazenda', i % 2 ? 'sono' : 'alegre', [
    {
      bg: v.bg,
      light: v.light,
      at: '4.2 8 11.8',
      b: [
        `N: ${alt(['Na fazenda da colina, todo dia tinha uma novidade.', 'Era uma tarde calma na fazenda...', 'Na fazenda, os bichos estavam reunidos.'], i)}`,
        `1 sad: ${v.problem}`,
        `0 think thinking: ${alt([`Não fica triste, ${B}. A gente dá um jeito!`, 'Hum... deixa eu pensar numa ideia.', 'Todo problema tem solução. Vamos pensar!'], i, 1)}`,
        `2 happy: ${v.try1}`,
        `1 confused !sweat #slip: ${v.flop}`,
        `2 shrug shy: ${alt(['Ops. Essa ideia não foi das melhores.', 'Bom... foi uma tentativa!', 'Desculpa! Achei que ia dar certo.'], i, 2)}`,
        `0 point happy: ${v.try2}`,
        `* !sparkles #ding +0.4`,
        `1 cheer surprised: ${v.works}`,
        `2 laughing: ${alt([`${A}, você é a melhor ideia da fazenda!`, 'Eu sabia que a segunda ideia ia dar certo!', 'Viva! Viva!'], i)}`,
        `1 love !hearts: ${v.end}`,
      ],
    },
  ]);
}

/* ======================= 8) SHOW DE TALENTOS ======================= */
interface Show extends Base {
  show: string;
  actB: string;
  oopsB: string;
  actC: string;
  twist: string;
  end: string;
}
const SHOW: Show[] = [
  { id: 'bloop-v801', title: 'O Mágico Atrapalhado', bg: 'stage', light: 'dusk', cast: ['bolha', 'tito', 'coelho'], tags: ['mágica', 'show'], show: 'o Show de Mágica da Escola', actB: 'Vou tirar um coelho da cartola! Abracadabra!', oopsB: 'Saiu... um sanduíche de queijo?', actC: 'Eu cheguei pela porta! Alguém me chamou?', twist: 'O coelho estava na plateia o tempo todo!', end: 'Bravo! Melhor truque errado do mundo!' },
  { id: 'bloop-v802', title: 'A Banda dos Bichos', bg: 'stage', d3: true, cast: ['sol', 'galo', 'sapo'], tags: ['banda', 'música'], show: 'a Noite das Bandas', actB: 'Cocoricó no microfone! Um, dois, três!', oopsB: 'Desafinei! Saiu um cocoricó de lado!', actC: 'Croac-croac! Eu faço o baixo!', twist: 'O cocoricó torto com o croac virou um ritmo novo!', end: 'Nasceu o hit do verão: o Cocoric-Croac!' },
  { id: 'bloop-v803', title: 'Piadas de Robô', bg: 'stage', cast: ['faisca', 'robozinho', 'dudu'], tags: ['piadas', 'robô'], show: 'o Concurso de Piadas', actB: 'Por que o robô foi ao médico? Porque estava com vírus!', oopsB: 'Ninguém riu. Recalculando graça...', actC: 'E por que o computador ficou gelado? Ele deixou o Windows aberto!', twist: 'O robô riu tanto que soltou fumacinha pelas orelhas!', end: 'A plateia riu do robô rindo! Sucesso total!' },
  { id: 'bloop-v804', title: 'Dança da Chuva', bg: 'desert', d3: true, cast: ['lumi', 'nuvem', 'cabra'], tags: ['dança', 'chuva'], show: 'o Festival da Dança no Deserto', actB: 'Vou fazer a dança da nuvem! Gira, gira, gira!', oopsB: 'Girei tanto que fiquei tontinha!', actC: 'Bééé! Eu sapateio com os cascos!', twist: 'A dança chamou uma chuvinha de verdade!', end: 'O deserto ganhou flores! Dança mais útil do mundo!' },
  { id: 'bloop-v805', title: 'O Malabarista de Frutas', bg: 'street', light: 'dusk', cast: ['trovao', 'chef', 'guaxinim'], tags: ['malabares', 'circo'], show: 'o Festival de Rua', actB: 'Três laranjas no ar! Agora quatro! Agora cinco!', oopsB: 'Ops, uma caiu... duas... todas caíram!', actC: 'Eu pego! Eu pego! E aproveito pra comer!', twist: 'O guaxinim pegou todas e fez um suco ali mesmo!', end: 'Malabares com suco no final! Aplausos!' },
  { id: 'bloop-v806', title: 'O Cantor Tímido', bg: 'stage', d3: true, light: 'night', cast: ['nina', 'zeca', 'pinguim'], tags: ['canto', 'timidez'], show: 'a Noite dos Talentos', actB: 'Eu... vou cantar uma... musiquinha...', oopsB: 'Esqueci a letra! Todo mundo está olhando!', actC: 'Eu canto o refrão com você! Lá-lá-ri!', twist: 'O pinguim fez o coro e a plateia toda cantou junto!', end: 'Quem tem amigo nunca canta sozinho!' },
  { id: 'bloop-v807', title: 'A Grande Pintura', bg: 'park', cast: ['bia', 'gema', 'tucano'], tags: ['pintura', 'arte'], show: 'a Mostra de Arte do Parque', actB: 'Vou pintar o retrato da Vovó Gema em um minuto!', oopsB: 'Ficou com três olhos e um bigode!', actC: 'Piu! Eu ajudo a pintar com as penas!', twist: 'O retrato virou um arco-íris de penas coloridas!', end: 'É arte moderna! A vovó adorou o bigode!' },
  { id: 'bloop-v808', title: 'Equilíbrio no Telhado', bg: 'rooftop', light: 'night', d3: true, cast: ['estrela', 'kiki', 'gato'], tags: ['equilíbrio', 'noite'], show: 'o Circo das Estrelas', actB: 'Vou andar na corda bamba com uma xícara de chá!', oopsB: 'A xícara tá balançando! Socorro!', actC: 'Miau! Gatos sabem equilíbrio! Me segue!', twist: 'Os dois chegaram do outro lado sem derramar uma gota!', end: 'Um brinde de chá ao circo mais alto da cidade!' },
  { id: 'bloop-v809', title: 'O Ventríloquo e o Boneco', bg: 'stage', cast: ['lupa', 'trovao', 'robozinho'], tags: ['boneco', 'risada'], show: 'a Tarde do Teatrinho', actB: 'Este é meu boneco falante! Diga oi, boneco!', oopsB: 'Ele não disse nada. Que vergonha!', actC: 'Bip! Eu não sou boneco, eu sou o Bip!', twist: 'O boneco era um robô de verdade o tempo todo!', end: 'Melhor dupla de teatro da cidade!' },
];
function showFilm(v: Show, i: number): FilmSpec {
  return film(v, i % 2 ? 'comedia' : 'festa', 'festa', [
    {
      bg: v.bg,
      light: v.light,
      at: '8 4.2 11.8',
      b: [
        `0 wave happy #applause: ${alt([`Boa noite! Começa agora ${v.show}!`, `Palmas para ${v.show}!`, `Bem-vindos a ${v.show}! Silêncio, por favor!`], i)}`,
        `1 bow happy: ${alt(['Primeiro número: eu!', 'Eu vou primeiro! Tô preparado!', 'Atenção, plateia!'], i, 1)}`,
        `1 point smug !sparkles: ${v.actB}`,
        `1 surprised !sweat #crickets: ${v.oopsB}`,
        `0 shy: ${alt(['É... vamos dar mais uma chance?', 'Calma, isso acontece!', 'Respira e continua!'], i, 2)}`,
        `2 jump happy #boing: ${v.actC}`,
        `* !shake !notes #drumroll +0.5`,
        `0 surprised: ${v.twist}`,
        `1 laughing 2=laughing !confetti #applause: ${alt(['Foi sem querer, mas ficou demais!', 'Não era o plano, mas deu certo!', 'Melhor erro da noite!'], i)}`,
        `0 cheer happy: ${v.end}`,
        `1 bow love 2=bow: ${alt(['Obrigado, obrigado! Voltem sempre!', 'A plateia é a melhor parte!', 'Até o próximo show!'], i, 1)}`,
      ],
    },
  ]);
}

export const VARIATIONS: FilmSpec[] = [
  ...LOST.map(lostFilm),
  ...COOK.map(cookFilm),
  ...MATCH.map(matchFilm),
  ...QUEST.map(questFilm),
  ...PARTY.map(partyFilm),
  ...LEARN.map(learnFilm),
  ...FARM.map(farmFilm),
  ...SHOW.map(showFilm),
];
