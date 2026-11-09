/* ============================================================
 *  CATÁLOGO do Bloop Banda — 20 grátis + 60 temporadas × (3 + MEGA).
 *  Todas as músicas, títulos e bandas são ORIGINAIS e FICTÍCIOS
 *  (nenhuma referência a músicas/artistas reais). Só metadados aqui;
 *  a composição e os charts são gerados sob demanda (index.ts).
 * ============================================================ */
import type { MegaTune, SongSpec } from './compose';
import { hash, planSections, rng } from './compose';
import { STYLES, type ModeId, type StyleId } from './styles';

export interface CatalogEntry {
  spec: SongSpec;
  title: string;
  band: string;
  tier: 'free' | 'pass' | 'mega';
  season?: number;
  stage: string;
  bars: number;
  durationSec: number;
}

const NN = (i: number) => String(i).padStart(2, '0');

/* ---------------------------- grátis ---------------------------- */
// id | título | banda | estilo | bpm | tônica | modo | fácil | palco
const FREE: [string, string, StyleId, number, number, ModeId, boolean, string][] = [
  ['Bloop, Bloop, Pula!', 'Os Bloopinhos', 'pop', 100, 0, 'ionian', true, 'palco-pop'],
  ['Minha Primeira Guitarra', 'Garagem dos Gatinhos', 'rock-arena', 110, 7, 'mixolydian', true, 'garagem'],
  ['Tambor de Lata', 'Turma da Panela', 'samba', 96, 5, 'ionian', true, 'carnaval'],
  ['Robô Dançarino', 'Circuito Feliz', 'chiptune', 132, 2, 'ionian', true, 'pixel'],
  ['Soneca na Rede', 'Preguiça Tropical', 'reggae', 80, 9, 'ionian', true, 'praia'],
  ['Volume no Máximo', 'Amplificador Azul', 'rock-arena', 126, 4, 'mixolydian', false, 'arena'],
  ['Trovão de Algodão', 'Nuvem Pesada', 'metal', 152, 4, 'aeolian', false, 'vulcao'],
  ['Corre, Cometa, Corre!', 'Os Foguetes de Papelão', 'punk', 176, 9, 'ionian', false, 'garagem'],
  ['Luzinhas da Cidade', 'Neon Kids do Bairro', 'eletronica', 124, 6, 'aeolian', false, 'neon'],
  ['Pipoca no Arraiá', 'Sanfoninha de Ouro', 'forro', 120, 2, 'mixolydian', false, 'festa-junina'],
  ['Passinho do Planeta', 'MC Órbita', 'funk', 130, 9, 'aeolian', false, 'baile'],
  ['Chuva de Purpurina', 'Estrelinhas K', 'kpop', 122, 11, 'dorian', false, 'palco-pop'],
  ['Tarefa de Casa Relax', 'Caderno Lo-fi', 'lofi', 80, 3, 'dorian', false, 'estudio'],
  ['Bota de Estrela', 'Dupla Céu & Cerrado', 'sertanejo', 94, 7, 'ionian', false, 'rodeio'],
  ['Abadá Arco-Íris', 'Bloco Pula-Pula', 'axe', 132, 0, 'mixolydian', false, 'carnaval'],
  ['Abertura do Reino Bloop', 'Orquestra Bolinha', 'orquestral', 104, 2, 'aeolian', false, 'castelo'],
  ['Fita Cassete do Futuro', 'Turbo Retrô', 'synthwave', 108, 9, 'aeolian', false, 'neon'],
  ['Meia de Bolinha', 'Groove de Meia', 'groove', 116, 4, 'dorian', false, 'discoteca'],
  ['Festa do Meu Pet', 'Os Bloopinhos', 'pop', 104, 7, 'ionian', true, 'palco-pop'],
  ['O Grande Show Bloop', 'Bloop All-Stars', 'rock-arena', 132, 9, 'ionian', false, 'arena'],
];

/* ---------------------------- temporadas ---------------------------- */
// tema musical | estilo | palco | 3 títulos | banda A (músicas 1–2) ; banda B (música 3, estilo vizinho)
const SEASON_MUSIC: string[] = [
  'Pop Natalino Estelar|pop|gelo|Pisca-Pisca no Pinheiro;Rena Sem Freio;Embrulho Misterioso|Coral Gorro Vermelho;Sininhos de Néon',
  'Eletrônica da Virada|eletronica|neon|Dez, Nove, Oito... Já!;Confete Digital;Primeiro Nascer do Sol|DJ Ampulheta;Fogos Synth',
  'Samba Estelar|samba|carnaval|Serpentina de Cometa;Pandeiro Lunar;Purpurina Até de Manhã|Unidos do Asteroide;Bloco da Folia Azul',
  'Reggae da Selva|reggae|floresta|Tucano Tranquilo;Cachoeira Vai e Vem;Orquídea ao Sol|Raízes do Cipó;Cachoeira Dub Clube',
  'K-pop de Confeitaria|kpop|palco-pop|Jujuba Brilhante;Algodão-Doce Sonhador;Pirulito Espiral|Doce Quinteto;Calda de Morango',
  'Lo-fi Submarino|lofi|fundo-do-mar|Golfinho Pensativo;Água-Viva Flutuando;Coral de Domingo|Maré Mansa;Ondinha Roots',
  'Forró Espacial|forro|festa-junina|Bandeirinha Gravitacional;Milho Verde em Marte;Quentão de Estrela|Trio Asa-Delta Lunar;Viola do Sertão Cósmico',
  'Synthwave Robótico|synthwave|neon|Parafuso Solto;Antena Apaixonada;Circuito de Verão|Os Engrenagens Cromados;Placa-Mãe Eletrônica',
  'Rock Jurássico|rock-arena|floresta|Pegada de Dinossauro;Ovo Gigante Rachou;Samambaia Gigante|Os Tricerrocks;Pterodáctilo Punk',
  'Punk Pirata|punk|praia|Mapa Estelar Rasgado;Bússola Doida;Âncora na Lua|Os Bucaneiros Barulhentos;Marujo Amplificado',
  'Metal Assombrado|metal|castelo|Morceguinho Cabeludo;Lua Cheia de Riff;Caldeirão Fervendo|Abóbora Sombria;Vampirinho Banguela',
  'Orquestra do Gelo|orquestral|gelo|Floco de Neve Solitário;Iglu de Cristal;Marcha dos Pinguins Reais|Sinfônica do Polo;Tempestade Gelada',
  'Metal Pesado I|metal|vulcao|Labareda Fofa;Ovo de Dragão;Castelo em Chamas|Escama de Aço;Garra Cintilante',
  'Rock de Arena I|rock-arena|arena|Guitarra no Telhado;Microfone Aberto;Palco Gigante|Os Decibéis Felizes;Trio Volume Dez',
  'Punk Radical|punk|garagem|Prancha Voadora;Rampa Dupla;Capacete Arranhado|Os Joelhos Ralados;Skate de Rodinha Verde',
  'Chiptune 8-bit I|chiptune|pixel|Moedinha Extra;Fliperama Noturno;Cartucho Soprado|Os Bits Saltitantes;Pixel Arcade',
  'Orquestral Encantado|orquestral|castelo|Pergaminho Perdido;Varinha Desafinada;Coroa de Vidro|Filarmônica da Torre;Ferro e Feitiço',
  'Axé Lunar|axe|espaco|Poeira Lunar no Pé;Binóculo da Alegria;Cratera Dançante|Bloco Leãozinho;Batucada da Lua',
  'Eletrônica Neon|eletronica|neon|Letreiro Piscante;Arranha-Céu de Luz;Holograma de Bolso|Neon Prisma;Avenida Synth',
  'Pop das Fadas|pop|floresta|Pétala Pirueta;Cogumelo Cantor;Gota de Orvalho|Fadinhas Faiscantes;Coral das Asinhas',
  'Groove Secreto|groove|discoteca|Disfarce de Bigode;Mala Secreta;Lupa no Salão|Agentes do Ritmo;Código Funk',
  'Metal Vulcânico|metal|vulcao|Magma no Café da Manhã;Rocha Quente;Fumaça de Riff|Lava Barulhenta;Cratera Rock',
  'Batidão do Circo|funk|baile|Picadeiro Pancadão;Malabares de Néon;Palhaço no Grave|MC Trapézio;DJ Lona Azul',
  'Rock dos Samurais|rock-arena|castelo|Leque de Trovão;Cerejeira Elétrica;Templo do Riff|Lâminas Sonoras;Punk do Bambu',
  'Reggae Tropical|reggae|praia|Abacaxi na Rede;Conchinha Sonora;Onda de Domingo|Coqueiro Roots;Maré Lo-fi',
  'Chiptune Maluco|chiptune|pixel|Tubo de Ensaio Saltitante;Bolha Explosiva;Fórmula Secreta 8-bit|Doutor Pixel;Faísca Digital',
  'Pop Arco-íris|pop|palco-pop|Unicórnio Dançante;Estandarte Colorido;Sete Cores no Céu|Cavaleiros do Pop;Arco-Íris Quinteto',
  'Sertanejo Espacial|sertanejo|rodeio|Chapéu de Cometa;Cacto Saudoso;Pôr do Sol em Marte|Dupla Ferradura & Espora;Sanfona da Galáxia',
  'Orquestra do Olimpo|orquestral|castelo|Oráculo Sonhador;Constelação de Mármore;Raio Dourado|Coro do Olimpo;Gigantes de Bronze',
  'Rock de Herói|rock-arena|arena|Capa ao Vento;Máscara Misteriosa;Super Salto Duplo|Liga do Volume;Os Supervelozes de Capa',
  'Funk na Cozinha|funk|baile|Pizza Lunar no Grave;Cupcake Batidão;Chef do Passinho|MC Panela de Pressão;Batedeira Groove',
  'K-pop Cristal|kpop|palco-pop|Safira Brilha;Diamante na Chuva;Geodo Secreto|Cristal Quinteto;Ametista Pop',
  'Lo-fi do Pijama|lofi|estudio|Travesseiro de Nuvem;Lanterninha Debaixo do Lençol;Pantufa Esquecida|Soninho Clube;Rede Dub',
  'Synthwave Ninja|synthwave|neon|Faixa Ninja Néon;Bambu Digital;Sombra Veloz|Ninjas do Teclado;Lua Eletrônica',
  'Groove Gelatina|groove|discoteca|Tremelique;Pudim Rebolante;Bolinha Saltitante|Gelatina Groove Banda;Calda Funk',
  'Metal das Pirâmides|metal|deserto|Esfinge Barulhenta;Escaravelho de Ouro;Oásis Distorcido|Faraós do Riff;Areia Pesada',
  'Eletrônica do Futuro|eletronica|espaco|Relógio Sem Ponteiros;Máquina do Amanhã;Portal Piscante|Ampulheta Synth;Futuro Retrô',
  'Chiptune Brinquedo|chiptune|pixel|Pião Turbo;Ursinho de Corda;Bloquinho Pixel|Brinquedos 8-bit;Caixa de Música Digital',
  'Lo-fi Outonal|lofi|floresta|Folha Laranja;Chá de Castanha;Vento de Abril|Esquilo Lo-fi;Bosque Dub',
  'Eletrônica Abissal|eletronica|fundo-do-mar|Lanterna de Peixe;Pressão Profunda;Bolhas em Câmera Lenta|Abismo Synth;Coral Retrô',
  'Axé da Torcida|axe|arena|Golaço de Calcanhar;Bandeirão Gigante;Arquibancada Pulando|Bloco da Torcida;Batuque do Estádio',
  'Rock a Vapor|rock-arena|garagem|Caldeira Distorcida;Engrenagem de Bronze;Dirigível Barulhento|Os Pistões;Válvula Punk',
  'K-pop das Lanternas|kpop|palco-pop|Lanterna de Papel;Dragão de Seda;Céu de Mil Luzes|Lanterna Quinteto;Luz Suave',
  'Pop Gelado|pop|gelo|Pinguim de Patins;Bola de Neve Gigante;Cachecol Listrado|Os Pinguins Pop;Neve Cintilante',
  'Chiptune Alienígena|chiptune|espaco|Disco Voador de Bolso;Antena Fofa;Abdução de Pelúcia|Os Marcianinhos;Nave Digital',
  'Forró dos Insetos|forro|floresta|Xote da Joaninha;Grilo no Triângulo;Formiga Arretada|Trio Vagalume;Viola do Besouro',
  'Orquestra Real|orquestral|castelo|Trono de Estrelas;Baile Real;Cetro Dourado|Real Sinfônica;Guarda Metálica',
  'Metal das Profundezas|metal|fundo-do-mar|Tentáculo de Aço;Sereia Gritona;Âncora Pesada|Kraken Sonoro;Ressaca Rock',
  'Punk Turbo|punk|garagem|Volta Mais Rápida;Pneu Fumegante;Bandeira Quadriculada|Os Turbinados;Escapamento Rock',
  'Lo-fi nas Nuvens|lofi|nuvens|Balão Distraído;Arco-Íris de Tarde;Céu de Algodão|Nuvem Mansa;Brisa Dub',
  'Groove Detetive|groove|discoteca|Pegada Suspeita;Lupa Dançante;Mistério no Salão|Detetives do Groove;Pista Funk',
  'Reggae dos Cogumelos|reggae|floresta|Chapéu Pintadinho;Esporo Feliz;Musgo Macio|Cogumelo Roots;Floresta Lo-fi',
  'Samba Olímpico|samba|carnaval|Tocha do Pandeiro;Pódio da Folia;Salto Triplo no Tamborim|Acadêmicos da Medalha;Bloco Recorde',
  'Batidão das Poções|funk|baile|Poção Borbulhante;Vassoura no Grave;Feitiço do Passinho|MC Caldeirão;DJ Varinha',
  'Metal Robótico|metal|arena|Punho Metálico;Parafuso Gigante;Reator Barulhento|Colossos de Lata;Robô Rocker',
  'Synthwave das Miragens|synthwave|deserto|Duna de Néon;Camelo Cromado;Oásis Eletrônico|Miragem Cromada;Sol Digital',
  'Eletrônica Boreal|eletronica|gelo|Faixa Verde no Céu;Céu Dançante;Noite Sem Fim Polar|Boreal Synth;Céu Retrô',
  'Axé do Parque|axe|carnaval|Roda-Gigante Pulando;Carrossel Elétrico;Pipoca Saltitante|Bloco do Parque;Batucada Carrossel',
  'Rock de Arena II|rock-arena|espaco|Nebulosa Distorcida;Galáxia no Volume Dez;Supernova de Bolso|Lendas do Riff;Cometas Punk',
  'Festa de Todos os Estilos|pop|palco-pop|Cinco Velinhas;Balão de Aniversário;Bolo de Cinco Andares|Bloop All-Stars;Turma do Parabéns',
];

const NEIGHBOR: Record<StyleId, StyleId> = {
  'rock-arena': 'punk', metal: 'rock-arena', punk: 'rock-arena', pop: 'kpop', funk: 'eletronica', samba: 'axe', forro: 'sertanejo',
  sertanejo: 'forro', eletronica: 'synthwave', kpop: 'pop', lofi: 'reggae', reggae: 'lofi', axe: 'samba', chiptune: 'eletronica',
  orquestral: 'metal', synthwave: 'eletronica', groove: 'funk',
};

/* ---------------------------- MEGA (afinadas à mão) ---------------------------- */
// título | banda | estilo | bpm | tônica | modo | modulação | compassos de solo | sabor do solo | extras(dk=bumbo duplo, build, riff)
const MEGA: string[] = [
  'Sinos na Via Láctea|Coral Bloopinho Estelar|pop|124|2|ionian|2|8|melodic|build',
  'Contagem Regressiva Infinita|DJ Meia-Noite e os Confetes|eletronica|128|9|aeolian|1|8|melodic|build',
  'Sambódromo de Saturno|Unidos da Órbita Feliz|samba|104|7|ionian|2|8|blues|',
  'Cipó Balança Devagarinho|Tucanos do Sol Nascente|reggae|88|9|mixolydian|2|8|melodic|',
  'Brigadeiro Supernova|Esquadrão Açúcar Bloop|kpop|128|4|dorian|1|8|melodic|build',
  'Bolhas de Coral às Três da Tarde|Pérola Sonolenta|lofi|84|5|dorian|2|8|melodic|',
  'Arrasta-Pé na Lua Cheia|Trio Fogueira Cósmica|forro|132|2|mixolydian|2|8|blues|',
  'Engrenagem do Coração|Robôs de Néon|synthwave|116|1|aeolian|2|16|melodic|riff',
  'O Rugido do T-Rex Elétrico|Os Fósseis Barulhentos|rock-arena|136|4|mixolydian|2|16|blues|riff',
  'Abordagem no Cinturão de Asteroides|Capitã Âncora e os Marujos Rápidos|punk|184|9|ionian|1|8|blues|riff',
  'A Abóbora que Ninguém Domou|Caldeirão Uivante|metal|168|4|phrygian|1|16|shred|dk riff',
  'Sinfonia do Iglu Gigante|Orquestra Aurora Polar|orquestral|112|2|aeolian|2|8|melodic|build',
  'Escamas de Fogo e Trovão|Dragões de Ferro Fofo|metal|172|6|harmonic|1|16|neo|dk riff',
  'Mil Lanternas no Estádio|Os Microfones Voadores|rock-arena|128|9|ionian|2|16|melodic|riff',
  'Manobra Impossível|Skate Cometa|punk|186|4|ionian|2|8|blues|riff',
  'Fase Bônus Infinita|Os Cartuchos Saltitantes|chiptune|156|0|ionian|2|16|shred|',
  'O Feitiço da Torre Mais Alta|Filarmônica da Varinha|orquestral|116|7|harmonic|2|8|neo|build',
  'Pula-Pula na Cratera|Banda Leãozinho Lunar|axe|138|10|mixolydian|2|8|melodic|',
  'Avenida de Hologramas|Pixel Prisma e Neon Kid|eletronica|128|11|aeolian|1|8|melodic|build',
  'Asinhas de Orvalho|As Fadinhas Faísca|pop|118|5|lydian|2|8|melodic|',
  'Código Secreto no Salão|Agência Groove Zero-Zero|groove|118|2|dorian|2|8|blues|',
  'Erupção Total|Magma Moleque|metal|176|9|phrygian|1|16|shred|dk riff',
  'Malabarismo no Batidão|MC Trapézio e a Lona Louca|funk|130|7|aeolian|2|8|melodic|',
  'Lâmina de Luz Estelar|Samurais do Riff|rock-arena|132|2|aeolian|2|16|neo|riff',
  'Rede Entre Dois Coqueiros|Conchinha Raiz|reggae|84|7|ionian|2|8|melodic|',
  'Explosão no Tubo de Ensaio|Doutor Bolha e os Bits Malucos|chiptune|150|9|aeolian|2|16|shred|',
  'Escudo de Sete Cores|Cavaleiros do Refrão|pop|120|0|ionian|2|8|melodic|build',
  'Ferradura de Cometa|Dupla Pôr do Sol e Poeira|sertanejo|100|7|ionian|2|8|blues|',
  'Pégaso Sobre o Olimpo|Coro das Constelações|orquestral|108|9|aeolian|2|8|neo|build',
  'Supersalto Final|Liga dos Capas Elétricas|rock-arena|138|7|mixolydian|2|16|blues|riff',
  'Panqueca na Gravidade Zero|MC Cupcake Cósmico|funk|130|2|dorian|2|8|melodic|',
  'Coração de Ametista|Quinteto Geodo|kpop|124|1|aeolian|1|8|melodic|build',
  'Cobertor de Estrelinhas|Pantufas Lo-fi Clube|lofi|82|3|ionian|2|8|melodic|',
  'Sombra no Telhado de Néon|Ninja Cassete|synthwave|112|4|aeolian|2|16|neo|riff',
  'Tremelique Universal|Pudim Groove Orquestra|groove|116|9|dorian|2|8|blues|',
  'Maldição do Escaravelho Dourado|Esfinge Trovejante|metal|164|4|harmonic|1|16|neo|dk riff',
  'Portal do Amanhã|Ampulheta Digital|eletronica|126|5|aeolian|2|8|melodic|build',
  'Ioiô Hiperveloz|Bloquinhos de Oito Bits|chiptune|160|7|ionian|2|16|shred|',
  'Folhas Caindo na Janela|Esquilo Sonolento|lofi|80|8|dorian|2|8|melodic|',
  'Luz no Fundo do Abismo|Água-Viva Eletrônica|eletronica|124|6|aeolian|1|8|melodic|build',
  'Gol de Bicicleta Espacial|Torcida Trio Estelar|axe|136|0|mixolydian|2|8|melodic|',
  'Caldeira a Todo Vapor|Os Engrenados|rock-arena|130|9|mixolydian|2|16|blues|riff',
  'Lanterna Vermelha no Céu|Brilho Lunar Turma|kpop|120|10|aeolian|2|8|melodic|build',
  'Escorregando no Gelo|Pinguins de Gravata|pop|122|2|ionian|2|8|melodic|',
  'Disco Voador de Pelúcia|Os Antenas Fofas|chiptune|148|5|dorian|2|16|shred|',
  'Xote do Vagalume|Besouro do Triângulo|forro|124|7|mixolydian|2|8|blues|',
  'Coroação nas Estrelas|Real Orquestra Galáctica|orquestral|110|0|ionian|2|8|melodic|build',
  'O Polvo Gigante Acordou|Tentáculos de Aço|metal|170|2|phrygian|1|16|shred|dk riff',
  'Volta Mais Rápida do Universo|Os Pneus Faiscantes|punk|188|2|mixolydian|2|8|blues|riff',
  'Cochilo em Cima da Nuvem|Algodão Celeste|lofi|78|10|ionian|2|8|melodic|',
  'A Pista Está Quente|Detetive Lupa Clube|groove|114|4|dorian|2|8|blues|',
  'Chapéu de Cogumelo|Esporos Positivos|reggae|82|2|dorian|2|8|melodic|',
  'Medalha de Ouro no Pandeiro|Acadêmicos da Gravidade|samba|100|5|ionian|2|8|blues|',
  'Poção do Passinho|MC Caldeirinho|funk|130|11|aeolian|2|8|melodic|',
  'Punho de Titânio|Colossos de Lata|metal|160|7|aeolian|1|16|shred|dk riff',
  'Oásis de Pixels|Duna Cromada|synthwave|108|9|aeolian|2|16|melodic|riff',
  'Cortina de Luz Polar|Boreal Bloop|eletronica|125|4|dorian|2|8|melodic|build',
  'Montanha-Russa do Axé|Carrossel Elétrico|axe|134|9|ionian|2|8|melodic|',
  'Lenda de Cem Galáxias|Supernova Rock Clube|rock-arena|134|4|aeolian|2|16|neo|riff',
  'Cinco Anos de Bagunça Estelar|Todo Mundo Bloop|rock-arena|132|7|ionian|2|16|melodic|build',
];

export interface SeasonMusic {
  season: number;
  theme: string;
  style: StyleId;
  stage: string;
  songs: string[]; // 3 ids normais
  mega: string;
}

export const SEASON_MUSIC_INFO: SeasonMusic[] = [];

function entry(spec: SongSpec, title: string, band: string, tier: CatalogEntry['tier'], stage: string, season?: number): CatalogEntry {
  const secs = planSections(spec);
  const bars = secs.reduce((a, s) => a + s.bars, 0);
  return { spec, title, band, tier, season, stage, bars, durationSec: Math.round(((bars * 4 + 4) * 60) / spec.bpm * 10) / 10 };
}

function buildCatalog(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  FREE.forEach(([title, band, style, bpm, key, mode, easy, stage], i) => {
    const id = `free-${NN(i + 1)}`;
    out.push(entry({ id, seed: hash(id), style, bpm, key, mode, easy }, title, band, 'free', stage));
  });
  SEASON_MUSIC.forEach((line, si) => {
    const [theme, style0, stage, titles, bands] = line.split('|');
    const style = style0 as StyleId;
    const tt = titles.split(';');
    const bb = bands.split(';');
    const ids: string[] = [];
    tt.forEach((title, k) => {
      const id = `s${NN(si)}-${k + 1}`;
      ids.push(id);
      const r = rng(hash(id));
      const stl = k === 2 ? NEIGHBOR[style] : style;
      const st = STYLES[stl];
      const bpm = Math.round(st.bpm[0] + r() * (st.bpm[1] - st.bpm[0]));
      const mode = st.modes[Math.floor(r() * st.modes.length)];
      const key = Math.floor(r() * 12);
      out.push(entry({ id, seed: hash(id), style: stl, bpm, key, mode }, title, k === 2 ? bb[1] : bb[0], 'pass', k === 2 ? (st.stage === stage ? stage : st.stage) : stage, si));
    });
    const [title, band, mstyle, bpm, key, mode, up, solo, flavor, flags] = MEGA[si].split('|');
    const id = `s${NN(si)}-mega`;
    const tune: MegaTune = {
      keyUp: Number(up),
      soloBars: Number(solo),
      flavor: flavor as MegaTune['flavor'],
      doubleKick: flags.includes('dk'),
      intro: flags.includes('build') ? 'build' : 'riff',
      hook: hash(`${id}:gancho`),
      drive: mstyle === 'metal' ? 0.95 : undefined,
    };
    out.push(entry({ id, seed: hash(id), style: mstyle as StyleId, bpm: Number(bpm), key: Number(key), mode: mode as ModeId, mega: tune }, title, band, 'mega', stage, si));
    SEASON_MUSIC_INFO.push({ season: si, theme, style, stage, songs: ids, mega: id });
  });
  return out;
}

export const CATALOG: CatalogEntry[] = buildCatalog();
