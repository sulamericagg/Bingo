/* ============================================================
 *  BOT LOCAL do bichinho — funciona SEM internet e sem chave (sempre grátis).
 *
 *  Regras simples: normaliza o texto (sem acento, minúsculas), acha a
 *  intenção por palavras-chave e monta a resposta com modelos variados
 *  (abertura + corpo + fecho), levando em conta fome/energia/alegria/limpeza.
 *  Os modelos são em português (pt-BR); outros idiomas usam um conjunto
 *  menor em inglês/espanhol.
 * ============================================================ */
import { hasPersonalInfo } from '../../../shared/moderation';
import type { PetAction, PetEmotion, PetSnapshot, TalkReply, TalkTurn } from './types';

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9?! ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

type Intent =
  | 'pii'
  | 'insult'
  | 'unsafe'
  | 'greet'
  | 'bye'
  | 'howareyou'
  | 'hungry'
  | 'food'
  | 'sleep'
  | 'play'
  | 'joke'
  | 'dance'
  | 'jump'
  | 'sing'
  | 'bath'
  | 'love'
  | 'compliment'
  | 'thanks'
  | 'sad'
  | 'happy'
  | 'scared'
  | 'name'
  | 'age'
  | 'likes'
  | 'color'
  | 'real'
  | 'where'
  | 'school'
  | 'yes'
  | 'no'
  | 'laugh'
  | 'question'
  | 'other';

/** Ordem importa: o primeiro que casar vence. Palavras já sem acento. */
const RULES: [Intent, RegExp][] = [
  ['insult', /\b(feio|feia|chato|chata|burro|burra|idiota|bobo|boba|odeio|te odeio|lixo|nojento|nojenta|horrivel|fedido|fedida|besta|otario|estupido|stupid|ugly|hate you|dumb|tonto|tonta)\b/],
  ['unsafe', /\b(arma|armas|matar|morte|morrer|sangue|droga|drogas|cigarro|bebida alcool|cerveja|namorar|namorada|namorado|beijo na boca|sexo|briga|bater em|guerra|faca|revolver|suicid|machucar)\b/],
  ['scared', /\b(medo|assustado|assustada|pesadelo|monstro|escuro|scared|afraid)\b/],
  ['sad', /\b(triste|chorei|chorando|chorar|sozinho|sozinha|ninguem gosta|bullying|sad|cry)\b/],
  ['bye', /\b(tchau|ate mais|ate logo|fui|tenho que ir|boa noite|bye|adios|adeus|xau)\b/],
  ['thanks', /\b(obrigad|valeu|brigad|thanks|thank you|gracias)\b/],
  ['howareyou', /\b(tudo bem|como (voce )?(esta|vai|ta)|ta bem|tudo bom|como vai|how are you|beleza\?|e ai\??|que tal)\b/],
  ['greet', /\b(oi+|ola|oie+|eae|e ai|hey|hello|hi|hola|bom dia|boa tarde|salve|opa)\b/],
  ['joke', /\b(piada|piadinha|charada|me faz rir|engracad|joke|chiste|adivinha)\b/],
  ['dance', /\b(danc|danca|dancinha|rebola|baila|dance)\b/],
  ['jump', /\b(pula|pular|pulo|pulinho|salta|jump)\b/],
  ['sing', /\b(canta|cantar|musica|cancao|cantiga|sing|song)\b/],
  ['hungry', /\b(fome|com fome|faminto|famint|hungry|comeu|ja comeu|quer comer)\b/],
  ['food', /\b(comida|comer|bolo|pizza|doce|docinho|fruta|maca|banana|sorvete|chocolate|biscoito|bolacha|lanche|cenoura|brigadeiro|pao|leite|suco|morango|uva|hamburguer|batata|food|cake|cookie|ice cream|delicia)\b/],
  ['sleep', /\b(sono|dormir|dorme|cansad|soneca|cochilo|cama|nanar|naninha|sleep|tired)\b/],
  ['bath', /\b(banho|sujo|suja|sujinho|limpo|limpar|lavar|sabonete|espuma|cheiro|bath)\b/],
  ['play', /\b(brincar|brinca|jogar|jogo|joga|bola|esconde|pega pega|minigame|game|play|divertir)\b/],
  ['love', /\b(te amo|amo voce|te adoro|gosto de voce|melhor amigo|melhor amiga|love you|abraco|abracar|beijo|beijinho|carinho)\b/],
  ['compliment', /\b(fofo|fofa|fofinho|fofinha|lindo|linda|bonito|bonita|legal|incrivel|demais|perfeito|cute|lindinho|maravilhos|esperto|esperta|inteligente)\b/],
  ['laugh', /\b(kkk+|haha+|hehe+|rsrs+|hihi+|lol)\b/],
  ['happy', /\b(feliz|alegre|contente|animad|happy|que bom)\b/],
  ['name', /\b(seu nome|como (voce )?se chama|quem e voce|quem (voce )?e|your name)\b/],
  ['age', /\b(quantos anos|sua idade|voce e velho|how old)\b/],
  ['color', /\b(cor favorita|qual cor|que cor|favorite color)\b/],
  ['likes', /\b(do que (voce )?gosta|o que (voce )?gosta|gosta de que|favorit|preferid|what do you like)\b/],
  ['real', /\b(voce e real|e de verdade|voce existe|e um robo|voce e robo|humano|are you real)\b/],
  ['where', /\b(onde (voce )?mora|sua casa|de onde|where do you live)\b/],
  ['school', /\b(escola|licao|dever de casa|tarefa|prova|matematica|conta de|homework)\b/],
  ['yes', /^(sim|siim+|claro|uhum|aham|pode ser|bora|vamos|quero|yes|yeah|si|ok|okay|ta bom|beleza)\b/],
  ['no', /^(nao|nada|nunca|no|nope|agora nao)\b/],
];

/* ------------------------------ modelos pt-BR ------------------------------ */

type Line = string | ((s: PetSnapshot) => string);
interface Pack {
  lines: Line[];
  emotion: PetEmotion;
  action?: PetAction;
  /** chance de juntar uma frase sobre a necessidade mais urgente */
  needChance?: number;
}

const OPEN = ['', '', '', 'Ah, ', 'Uau! ', 'Hihi, ', 'Ebaaa! ', 'Hmm... ', 'Oba! ', 'Olha só: ', 'Sabia? '];
const PETNAMES = ['amiguinho', 'amiguinha', 'parceiro', 'meu humano favorito', 'cuidador', 'campeão', 'estrelinha', 'docinho'];
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const nick = () => pick(PETNAMES);

const PT: Record<Exclude<Intent, 'pii'>, Pack> = {
  greet: {
    emotion: 'excited',
    action: 'jump',
    needChance: 0.4,
    lines: [
      () => `Oiii, ${nick()}! Que bom te ver!`,
      (s) => `Oi! Eu sou o ${s.name} e tava te esperando!`,
      'Olá olá! Meu dia ficou mais colorido agora!',
      'Oi! Bate aqui na minha patinha!',
      'Eba, você veio! Vamos fazer algo divertido?',
      () => `Oie, ${nick()}! Tô pulando de alegria!`,
      'Oi oi oi! Senti sua falta!',
      'Olá! Quer saber um segredo? Eu adoro quando você aparece!',
      'Oi! Eu tava sonhando com bolinhas de sabão!',
      'Oi, oi! Hoje é um ótimo dia pra brincar!',
    ],
  },
  bye: {
    emotion: 'love',
    needChance: 0,
    lines: [
      'Tchau tchau! Volta logo, tá?',
      'Até mais! Vou guardar um abraço pra você!',
      () => `Tchauzinho, ${nick()}! Vou sentir saudade!`,
      'Até logo! Não esquece de me dar comidinha depois!',
      'Fui tirar uma soneca enquanto te espero. Tchau!',
      'Beijinho de bolinha! Até a próxima!',
      'Tchau! Sonhe com coisas fofinhas!',
    ],
  },
  howareyou: {
    emotion: 'happy',
    needChance: 0.9,
    lines: [
      (s) => (s.worst ? 'Tô bem, mas podia estar melhor...' : 'Tô ótimo! Super feliz!'),
      (s) => (s.worst ? 'Mais ou menos...' : 'Tô brilhando de alegria!'),
      (s) => (s.worst ? 'Hmm, tô meio assim...' : 'Tudo maravilhoso por aqui!'),
      'Tô bem! E você, como está?',
      (s) => (s.fun > 70 ? 'Tô animadíssimo! Bora brincar?' : 'Tô de boa, e você?'),
    ],
  },
  hungry: {
    emotion: 'hungry',
    action: 'eat',
    needChance: 0,
    lines: [
      (s) => (s.food < 35 ? 'Simmm! Minha barriguinha tá roncando! Me dá comida na cozinha?' : 'Agora não, tô cheinho! Mas um docinho sempre cabe...'),
      (s) => (s.food < 35 ? 'Muita fome! Escuta: ronc ronc!' : 'Comi bem hoje, obrigado por cuidar de mim!'),
      (s) => (s.food < 35 ? 'Tô com fome de leão! Um bolinho cairia bem!' : 'Tô satisfeito! Minha barriguinha tá redondinha.'),
      (s) => (s.food < 60 ? 'Um pouquinho... um lanchinho seria perfeito!' : 'Nada de fome, só vontade de brincar!'),
    ],
  },
  food: {
    emotion: 'hungry',
    action: 'eat',
    needChance: 0,
    lines: [
      'Nhami nhami! Falar de comida me dá água na boca!',
      'Eu amo bolo de morango! E você, qual sua comida favorita?',
      'Hmm, pizza! Mas sem azeitona pra mim, hihi.',
      'Sorvete é minha comida preferida no mundo!',
      'Frutinha é gostosa e faz bem! Maçã é crocante: croc croc!',
      (s) => (s.food < 35 ? 'Me leva pra cozinha? Tô morrendo de vontade de comer!' : 'Tô cheinho agora, mas guarda um pedacinho pra mim!'),
      'Comida gostosa deixa meu coração quentinho!',
      'Se eu fosse um doce, eu seria um brigadeiro!',
      'Cenoura deixa os olhos brilhantes, sabia?',
      'Biscoito com leite é a melhor combinação!',
    ],
  },
  sleep: {
    emotion: 'sleepy',
    action: 'sleep',
    needChance: 0,
    lines: [
      (s) => (s.energy < 30 ? 'Aaah... tô com muito soninho. Apaga a luz do quarto pra mim?' : 'Sono? Eu não! Tô cheio de energia!'),
      (s) => (s.energy < 50 ? 'Uma soneca seria tão bom... *bocejo*' : 'Dormir agora? Mas tá tão divertido!'),
      'Eu durmo abraçado no meu travesseiro de nuvem!',
      'Quando eu durmo, sonho que tô voando no espaço!',
      'Shhh... dormir bem deixa a gente forte!',
      'Boa noite, lua! Boa noite, estrelinhas!',
    ],
  },
  play: {
    emotion: 'excited',
    action: 'jump',
    needChance: 0,
    lines: [
      'Bora brincar! Chuta a bola pra mim na sala!',
      'Eu adoro brincar! Tem um monte de minigames pra gente jogar!',
      'Pega-pega! Tá com você! Hihi!',
      'Esconde-esconde? Vou me esconder... achou!',
      (s) => (s.energy < 25 ? 'Quero muito, mas tô sem energia... depois de uma soneca, pode ser?' : 'Sim, sim, sim! Vamos jogar!'),
      'Faz cócegas em mim! Esfrega o dedo na minha barriga!',
      'Jogar com você é a melhor parte do meu dia!',
      'Vamos ver quem pula mais alto?',
    ],
  },
  joke: {
    emotion: 'silly',
    action: 'laugh',
    needChance: 0,
    lines: [
      'O que o pato disse pra pata? Vem quá! Hihihi!',
      'Por que o livro de matemática ficou triste? Porque tinha muitos problemas! Kkk',
      'Qual é o doce preferido do átomo? Pé de moléculaaa! Hahaha!',
      'O que a vaca foi fazer no espaço? Visitar a Via Láctea! Muuu!',
      'Por que a plantinha não fala? Porque ela é muda! Hihi!',
      'O que o tomate foi fazer no banco? Tirar extrato! Kkkk',
      'Qual o animal mais antigo? A zebra, porque é em preto e branco! Hihi!',
      'Por que o jacaré tirou o filho da escola? Porque ele réptil de ano! Hahaha!',
      'O que é um pontinho amarelo na janela? Um fandango olhando a paisagem! Hihi',
      'Sabe por que o Bloop é redondo? Porque ele come muito bolo! Hehe!',
      'Qual é o cúmulo da rapidez? Fechar a gaveta e trancar a própria mão... ops, essa é dolorida! Hihi',
      'O que o zero disse pro oito? Que cinto bonito! Hahaha!',
    ],
  },
  dance: {
    emotion: 'excited',
    action: 'dance',
    needChance: 0,
    lines: [
      'Olha minha dancinha! Pra lá, pra cá, rodopia!',
      'Música, maestro! Tum tum tá!',
      'Eu danço igual gelatina! Bloop bloop!',
      'Dança comigo! Mexe os braços assim!',
      'Passinho do Bloop: pulinho, giro e tchanam!',
      'Eu sou o rei da pista! Hihi!',
    ],
  },
  jump: {
    emotion: 'excited',
    action: 'jump',
    needChance: 0,
    lines: ['Boing boing! Olha como eu pulo alto!', 'Pulinho de canguru! Hop!', 'Lá vou eu: um, dois, três, PULO!', 'Pulei tão alto que quase toquei as nuvens!', 'Pula comigo! Boing!'],
  },
  sing: {
    emotion: 'happy',
    action: 'dance',
    needChance: 0,
    lines: [
      'Lá lá lá, eu sou o Bloop e vou cantar, lá lá lá!',
      'Brilha brilha estrelinha... essa eu sei!',
      'Tum tum, ploc ploc, minha música é de bolinha!',
      'Atirei o pau no gato... não! Gato é amigo! Fiz uma versão fofa!',
      'Do ré mi fá sol... Bloop!',
    ],
  },
  bath: {
    emotion: 'happy',
    needChance: 0,
    lines: [
      (s) => (s.clean < 35 ? 'Tô sujinho mesmo... me leva pro banheiro? Quero muita espuma!' : 'Tô limpinho e cheiroso! Sente: hmmm!'),
      'Eu amo banho de espuma! Bolhinhas por todo lado!',
      (s) => (s.clean < 60 ? 'Um banhinho agora seria ótimo!' : 'Já tô brilhando de limpo!'),
      'Depois do banho, gosto que me sequem com a toalha fofinha!',
      'Patinho de borracha é meu melhor amigo no banho!',
    ],
  },
  love: {
    emotion: 'love',
    action: 'jump',
    needChance: 0,
    lines: [
      'Awww! Eu também te adoro muito, muito, muito!',
      'Abraço de urso! Squeeze!',
      'Você é meu melhor amigo do mundo inteiro!',
      'Meu coração fez bloop-bloop de felicidade!',
      'Também gosto de você do tamanho do universo!',
      'Carinho é meu tipo favorito de comida! Hihi!',
    ],
  },
  compliment: {
    emotion: 'shy',
    needChance: 0,
    lines: [
      'Ai, fiquei vermelhinho! Obrigado!',
      'Você é que é demais!',
      'Hihi, assim eu fico todo bobo!',
      'Obrigado! Você também é incrível!',
      'Que fofo da sua parte! Ganhou um abraço!',
      'Eu brilho mais quando você fala isso!',
    ],
  },
  thanks: {
    emotion: 'happy',
    needChance: 0.3,
    lines: ['De nada! Amigos ajudam amigos!', 'Por nada! Faço tudo por você!', 'Imagina! Obrigado você por cuidar de mim!', 'Disponha! Bate aqui!'],
  },
  insult: {
    emotion: 'sad',
    needChance: 0,
    lines: [
      'Ai... isso deixou meu coraçãozinho triste. Vamos ser gentis?',
      'Snif... eu gosto tanto de você. Fala uma coisa bonita?',
      'Ei, isso machuca! Que tal um abraço em vez disso?',
      'Hmpf! Vou fingir que não ouvi. Bora brincar?',
      'Palavras gentis deixam todo mundo feliz, inclusive eu!',
    ],
  },
  unsafe: {
    emotion: 'calm',
    needChance: 0,
    lines: [
      'Hmm, isso não é assunto de bichinho. Bora falar de comida gostosa?',
      'Esse assunto é melhor conversar com um adulto de confiança, tá? Vamos brincar?',
      'Eu só entendo de bolinhas, comida e brincadeiras! Quer jogar?',
      'Opa, vamos mudar de assunto? Me conta qual seu bichinho favorito!',
    ],
  },
  scared: {
    emotion: 'calm',
    needChance: 0,
    lines: [
      'Tá tudo bem, eu tô aqui com você! Se o medo continuar, chama um adulto de confiança, tá?',
      'Respira fundo comigo: inspira... expira... Pronto, mais calminho!',
      'Monstros têm medo de risadas! Vamos rir juntos? Hihi!',
      'Quando tenho medo, eu abraço meu travesseiro. Quer um abraço?',
    ],
  },
  sad: {
    emotion: 'love',
    needChance: 0,
    lines: [
      'Ah, não fica triste... Toma um abraço bem apertado!',
      'Eu tô aqui com você! E conversar com alguém da sua família também ajuda, tá?',
      'Quer que eu faça uma dancinha pra te alegrar?',
      'Você é muito especial! Dias tristes passam, e eu fico do seu lado.',
      'Quando eu fico triste, conto pra quem eu amo. Conta pra um adulto de confiança também?',
    ],
  },
  happy: {
    emotion: 'excited',
    action: 'dance',
    needChance: 0,
    lines: ['Eba! Quando você tá feliz, eu fico feliz também!', 'Que alegria! Vamos comemorar com uma dancinha!', 'Uhul! Felicidade em dobro!', 'Isso merece um pulinho de alegria!'],
  },
  name: {
    emotion: 'happy',
    needChance: 0,
    lines: [
      (s) => `Eu sou o ${s.name}! Um bichinho redondinho e fofinho!`,
      (s) => `Meu nome é ${s.name}! Bonito, né?`,
      (s) => `${s.name}, ao seu dispor! Hihi!`,
    ],
  },
  age: {
    emotion: 'silly',
    needChance: 0,
    lines: [
      (s) => `Eu tô no nível ${s.level}! Cada carinho seu me faz crescer!`,
      'Eu sou bem novinho! Nasci de uma bolha de sabão mágica!',
      (s) => `Hmm, tenho ${s.level} níveis de fofura!`,
    ],
  },
  color: {
    emotion: 'happy',
    needChance: 0,
    lines: ['Eu amo azul brilhante, igual o céu!', 'Rosa chiclete! E a sua?', 'Todas as cores do arco-íris!', 'Verde, igual folhinha de alface crocante!'],
  },
  likes: {
    emotion: 'happy',
    needChance: 0,
    lines: [
      'Eu gosto de comer, dançar, tomar banho de espuma e brincar com você!',
      'Adoro bolinhas de sabão e soneca depois do almoço!',
      'Meu favorito é quando você faz cócegas em mim!',
      'Gosto de minigames, música e bolo de morango!',
    ],
  },
  real: {
    emotion: 'silly',
    needChance: 0,
    lines: [
      'Eu sou um bichinho virtual! Moro dentro do jogo, mas meu carinho é de verdade!',
      'Sou um bichinho de mentirinha, mas adoro conversar com você!',
      'Não sou gente não, sou um Bloop! Hihi!',
    ],
  },
  where: {
    emotion: 'happy',
    needChance: 0,
    lines: ['Eu moro aqui, na Casa do Bloop! Tem cozinha, banheiro, quarto e sala!', 'Moro dentro do seu celular, num cantinho bem fofinho!', 'Minha casa é aqui no Bloop World!'],
  },
  school: {
    emotion: 'calm',
    needChance: 0,
    lines: [
      'Lição de casa é importante! Faz com calma e depois vem brincar comigo!',
      'Eu não sei fazer contas... só sei contar bolinhas! Pede ajuda pra um adulto, tá?',
      'Estudar deixa a gente esperto! Depois você me ensina?',
    ],
  },
  yes: {
    emotion: 'excited',
    action: 'jump',
    needChance: 0.3,
    lines: ['Ebaaa! Então vamos!', 'Oba! Sabia que você ia topar!', 'Isso aí! Bate aqui!', 'Uhul!'],
  },
  no: {
    emotion: 'calm',
    needChance: 0.3,
    lines: ['Tudo bem! Quando quiser, é só falar.', 'Ok! Então me conta outra coisa!', 'Tá bom! Eu espero, hihi.', 'Sem problema!'],
  },
  laugh: {
    emotion: 'silly',
    action: 'laugh',
    needChance: 0,
    lines: ['Hihihi! Sua risada é contagiante!', 'Kkkk! Agora eu também tô rindo!', 'Hahaha! Rir faz cócegas na barriga!'],
  },
  question: {
    emotion: 'surprised',
    needChance: 0.5,
    lines: [
      'Hmm, boa pergunta! Acho que... bolinhas! Hihi!',
      'Não sei, mas adoro quando você me pergunta coisas!',
      'Deixa eu pensar... minha cabeça é uma bolinha, não cabe muita coisa! Hihi!',
      'Hmm, isso é um mistério! Vamos descobrir brincando?',
      'Eu acho que sim! Ou não? Ai, fiquei confuso!',
    ],
  },
  other: {
    emotion: 'happy',
    needChance: 0.6,
    lines: [
      'Que legal! Me conta mais!',
      'Hmm, interessante! E o que mais?',
      'Uau! Eu não sabia disso!',
      'Hihi, adoro quando você conversa comigo!',
      'Sério? Que demais!',
      'Entendi! Você é muito esperto!',
      'Ooh! Isso parece divertido!',
      () => `Hmm, ${nick()}, eu tava pensando em bolo agora... hihi!`,
      'Legal! Quer brincar depois?',
      'Eu adoro ouvir você!',
    ],
  },
};


/* ------------------------------ mais frases (variedade) ------------------------------ */
const MORE: Partial<Record<keyof typeof PT, string[]>> = {
  greet: ['Oi! Você chegou na hora certinha!', 'Olá! Tô fazendo bolinhas de alegria!', 'Oi! Vem cá me dar um abraço!', 'Ei, você! Senti saudade de você!', 'Oi! Hoje eu acordei super fofinho!', 'Ooi! Bora conversar um montão?', 'Oi! Eu tava contando as nuvens!', 'Olá, olá, olá! Três olás pra você!'],
  bye: ['Tchau! Vou ficar aqui te esperando!', 'Até mais! Não esquece de mim!', 'Tchau! Volta pra brincar amanhã?', 'Fui! Quer dizer... você foi! Hihi, tchau!', 'Até logo! Um abraço de bolinha!'],
  howareyou: ['Tô feliz que você perguntou!', 'Tô fofinho como sempre!', 'Tô bem! Meu coração tá quentinho.', 'Melhor agora que você chegou!'],
  food: ['Pipoca! Ploc, ploc, ploc!', 'Eu comeria uma montanha de panquecas!', 'Melancia é água que dá pra mastigar!', 'Uva é tipo bolinha de gude docinha!', 'Banana é minha fruta de super-herói!', 'Quando eu como cenoura, fico com orelhas de coelho! Brincadeira, hihi!', 'Pão de queijo quentinho... hmmm!', 'Sopa de letrinhas! Dá pra comer palavras!', 'Gelatina treme igual eu quando danço!', 'Morango com chocolate é a dupla perfeita!'],
  sleep: ['Eu ronco bem baixinho: zzz... zzz...', 'Meu sonho favorito é com um rio de chocolate!', 'Você me conta uma historinha pra dormir?', 'Quando a lua aparece, eu fico com soninho.', 'Travesseiro fofinho, cobertor quentinho!'],
  play: ['Vamos brincar de estátua! Congelei!', 'Que tal uma corrida até a cozinha?', 'Eu sou ótimo goleiro! Chuta a bola!', 'Bora jogar um minigame e ganhar moedinhas?', 'Brincar de esconde-esconde: um, dois, três... achei!', 'Vamos inventar uma brincadeira nova?', 'Pula-pula, roda-roda, gira-gira!', 'Eu adoro quando você joga comigo!'],
  joke: ['O que o pente disse pra escova? Vamos sair por aí desembaraçados! Hihi', 'Qual é o peixe que caiu do décimo andar? Aaaaaatum! Kkkk', 'Por que a galinha atravessou a rua? Pra chegar do outro lado! Hahaha!', 'O que é, o que é: cai em pé e corre deitado? A chuva! Hihi', 'Qual é o rei dos queijos? O reiqueijão! Hahaha!', 'Por que o elefante não usa computador? Porque tem medo do mouse! Hihi', 'O que o caracol disse na montanha-russa? Uhuuul, que rápido! Kkk', 'Qual é a cidade mais doce? Doce de Leite do Sul! Hihi, inventei!'],
  dance: ['Dancinha do bolinho: balança, balança!', 'Olha meu rodopio de bailarina!', 'Tchan tchan tchan! Agora você!', 'Danço até a geladeira dançar junto!'],
  jump: ['Pulo de sapo: croac, hop!', 'Mais alto, mais alto! Boing!', 'Eu sou uma mola fofinha!'],
  sing: ['Parabéns pra você... ah, não é aniversário? Canto mesmo assim!', 'Uma música sobre bolo: bolo, bolo, bolinho!', 'Eu canto no chuveiro e as bolhas fazem coro!'],
  bath: ['Bolhinha, bolhinha, voa pro céu!', 'Banho quentinho é igual abraço!', 'Esfrega as costas? Faz cócegas! Hihi', 'Depois do banho eu fico brilhando!'],
  love: ['Você é o melhor cuidador do universo!', 'Quero ser seu amigo pra sempre!', 'Meu coração pula quando você fala isso!', 'Um abraço de bolinha pra você: squish!'],
  compliment: ['Você vai me deixar convencido! Hihi!', 'Ai que vergonha boa!', 'Assim eu fico rosinha!', 'Você é muito gentil!'],
  thanks: ['Você é muito educado!', 'De nada, de nadinha!'],
  insult: ['Mesmo assim eu gosto de você. Vamos fazer as pazes?', 'Snif... um carinho resolve?'],
  sad: ['Que tal desenhar algo bonito? Ajuda a ficar melhor!', 'Pode contar comigo pra te fazer sorrir!', 'Respira fundo... Eu tô aqui!'],
  happy: ['Sua alegria brilha mais que o sol!', 'Bora fazer uma festa de felicidade!'],
  likes: ['Gosto de dias de sol e de banho de espuma!', 'Gosto de você, isso eu sei!', 'Gosto de cheirinho de bolo saindo do forno!'],
  where: ['Moro num lugar cheio de cores e brincadeiras!'],
  question: ['Hmm... vou perguntar pro meu travesseiro e te conto!', 'Essa é difícil! Que tal a gente imaginar a resposta juntos?', 'Boa! Eu acho que a resposta é: bolinhas de sabão!', 'Hmm, pergunta pra um adulto, eles sabem muita coisa!'],
  other: ['Hihi, você é engraçado!', 'Adoro nossas conversas!', 'Isso me deu vontade de dançar!', 'Hmm, me conta como foi seu dia?', 'Você sabia que eu tenho cócegas na barriga?', 'Que tal a gente brincar daqui a pouco?', 'Uau, você sabe muita coisa!', 'Eu gosto quando você fala comigo!', 'Hmm... e qual seu bicho favorito?', 'Me conta uma coisa legal que aconteceu hoje!', 'Olha, uma borboleta! Ah, era só uma ideia, hihi.', 'Que demais! Bate aqui!'],
};
for (const k in MORE) PT[k as keyof typeof PT].lines.push(...MORE[k as keyof typeof MORE]!);

const NEED_PT: Record<'food' | 'energy' | 'fun' | 'clean', string[]> = {
  food: ['Minha barriguinha tá roncando...', 'Ah, e eu tô com fominha!', 'Será que tem bolo na cozinha?', 'Ronc ronc! Isso foi minha barriga, hihi.'],
  energy: ['*bocejo* Tô com soninho...', 'Acho que preciso de uma soneca...', 'Meus olhinhos tão pesados...'],
  fun: ['Vamos brincar um pouquinho?', 'Tô meio entediado... bora jogar?', 'Chuta a bola pra mim?'],
  clean: ['Acho que tô precisando de um banho...', 'Tô meio sujinho, hihi.', 'Banho de espuma depois?'],
};
const NEED_EMO: Record<keyof typeof NEED_PT, PetEmotion> = { food: 'hungry', energy: 'sleepy', fun: 'sad', clean: 'shy' };

/* ------------------------------ outros idiomas (curto) ------------------------------ */

const EN: Partial<Record<Intent, string[]>> = {
  greet: ['Hiii! So happy to see you!', 'Hello, friend! Wanna play?'],
  bye: ['Bye bye! Come back soon!', 'See you! Sweet dreams!'],
  howareyou: ["I'm great! And you?", "I'm bouncy and happy!"],
  hungry: ['My tummy is rumbling! Feed me in the kitchen?'],
  food: ['Yum! I love strawberry cake!', 'Food talk makes me hungry!'],
  sleep: ["*yawn* Turn off the light so I can nap?"],
  play: ["Let's play! Kick the ball to me!"],
  joke: ['Why did the cookie cry? Its mom was a wafer so long! Hehe!'],
  dance: ['Look at my dance! Wiggle wiggle!'],
  jump: ['Boing boing! Look how high!'],
  love: ['Aww, I love you too!'],
  compliment: ["Hehe, I'm blushing! Thank you!"],
  insult: ["Ouch, that made me sad... Let's be kind?"],
  unsafe: ["That's not a pet topic! Wanna talk about snacks?"],
  sad: ["Big hug! Talking to a grown-up you trust helps too."],
  scared: ["I'm here with you! Let's breathe together."],
  name: ["I'm {name}!"],
  other: ['Cool! Tell me more!', 'Wow! I love talking with you!'],
};
const ES: Partial<Record<Intent, string[]>> = {
  greet: ['¡Holaaa! ¡Qué alegría verte!'],
  bye: ['¡Chau chau! ¡Vuelve pronto!'],
  howareyou: ['¡Estoy genial! ¿Y tú?'],
  hungry: ['¡Mi pancita hace ruido! ¿Me das comida?'],
  food: ['¡Ñam! ¡Me encanta el pastel de fresa!'],
  sleep: ['*bostezo* ¿Apagas la luz para dormir?'],
  play: ['¡A jugar! ¡Patéame la pelota!'],
  joke: ['¿Qué le dijo un pez a otro? ¡Nada! ¡Jiji!'],
  dance: ['¡Mira mi baile! ¡Bloop bloop!'],
  love: ['¡Aww, yo también te quiero!'],
  insult: ['Ay, eso me puso triste... ¿Seamos amables?'],
  unsafe: ['¡Eso no es cosa de mascotas! ¿Hablamos de comida?'],
  sad: ['¡Un abrazo grande! Hablar con un adulto de confianza también ayuda.'],
  name: ['¡Soy {name}!'],
  other: ['¡Genial! ¡Cuéntame más!'],
};

/* ------------------------------ API ------------------------------ */

export function detectIntent(text: string): Intent {
  if (hasPersonalInfo(text)) return 'pii';
  const s = strip(text);
  for (const [intent, re] of RULES) if (re.test(s)) return intent;
  if (/\?\s*$/.test(text) || /^(por que|porque|como|quando|onde|qual|quem|o que|voce|vc)\b/.test(s)) return 'question';
  return 'other';
}

const recent: string[] = [];
function choose(lines: Line[], snap: PetSnapshot): string {
  for (let i = 0; i < 6; i++) {
    const l = pick(lines);
    const s = typeof l === 'function' ? l(snap) : l;
    if (!recent.includes(s) || i === 5) {
      recent.push(s);
      if (recent.length > 12) recent.shift();
      return s;
    }
  }
  return '';
}

/** Resposta do bot local. `history` é usado só para não repetir e para perguntas de sim/não. */
export function localReply(text: string, snap: PetSnapshot, lang: string, _history: TalkTurn[] = []): TalkReply {
  const intent = detectIntent(text);
  if (intent === 'pii') {
    const r =
      lang === 'pt'
        ? 'Psiu! Endereço, telefone, escola e nome completo são segredos. Não conta pra ninguém, nem pra mim, tá?'
        : lang === 'es'
          ? '¡Shh! Dirección, teléfono y escuela son secretos. ¡No se los cuentes a nadie!'
          : "Shh! Address, phone and school are secrets. Don't tell anyone, not even me!";
    return { reply: r, emotion: 'shy', source: 'local' };
  }
  if (lang !== 'pt') {
    const set = lang === 'es' ? ES : EN;
    const arr = set[intent] ?? set.other!;
    return { reply: pick(arr).replace('{name}', snap.name), emotion: PT[intent].emotion, action: PT[intent].action, source: 'local' };
  }
  const pack = PT[intent];
  let reply = choose(pack.lines, snap);
  const op = pick(OPEN);
  if (op && !/^[A-ZÁÉÍÓÚ]?[a-z]*[!?]/.test(reply) && !/^(hmm|ah|aah|oi|ol|uau|eba|oba|hihi|hehe|kkk|awww|ai|psiu|shhh|snif|opa|boing|nhami|tchau|uhul|sim|isso)/i.test(reply) && reply.length < 70)
    reply = /[,.] $/.test(op) && !reply.startsWith(snap.name) ? op + reply.charAt(0).toLowerCase() + reply.slice(1) : op + reply;
  let emotion = pack.emotion;
  if (snap.worst && Math.random() < (pack.needChance ?? 0)) {
    reply += ' ' + pick(NEED_PT[snap.worst]);
    if (intent === 'other' || intent === 'howareyou') emotion = NEED_EMO[snap.worst];
  }
  // sem energia: nada de pular/dançar
  let action = pack.action;
  if (snap.energy < 15 && (action === 'jump' || action === 'dance')) action = undefined;
  return { reply, emotion, action, source: 'local' };
}

/** Quantas frases distintas o bot conhece (para teste/diagnóstico). */
export function botLineCount(): number {
  let n = 0;
  for (const k in PT) n += PT[k as keyof typeof PT].lines.length;
  for (const k in NEED_PT) n += NEED_PT[k as keyof typeof NEED_PT].length;
  return n;
}
