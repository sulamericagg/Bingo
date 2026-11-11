declare module '*.html' {
  const content: string;
  export default content;
}

interface Env {
  DATA: KVNamespace;
  ASSETS: Fetcher;
  /** Durable Object da Corrida Orbital (lobby + salas). */
  RACE: DurableObjectNamespace<import('./race').RaceRoom>;
  /** Presença drop-in (lobby por jogo + shards de até 6). */
  PRESENCE: DurableObjectNamespace<import('./presence').PresenceRoom>;
  /** Chat moderado (uma instância por sala). */
  CHAT: DurableObjectNamespace<import('./chat').ChatRoom>;
  /** Campeonatos (instância única 'hub' com alarme). */
  CHAMP: DurableObjectNamespace<import('./champ').Championship>;
  /** Festa na casa de alguém (uma instância por anfitrião). */
  PARTY: DurableObjectNamespace<import('./party').PartyRoom>;
  /** Amizades + cartão (online/@nome/bagunça) — instância única 'hub'. */
  FRIENDS: DurableObjectNamespace<import('./friends').FriendsHub>;
  /** Grupo (party de até 4) — uma instância por grupo (docs/PARTY.md). */
  SQUAD: DurableObjectNamespace<import('./squad').SquadRoom>;
  /** Pouso Forçado online: salas de voo (relé anfitrião↔convidados) + caixas de convite. */
  FLIGHT: DurableObjectNamespace<import('./flight').FlightRoom>;
  /** Painel admin: códigos/limites atômicos, presentes pegos, compras reportadas, auditoria — instância única 'hub'. */
  ADMIN: DurableObjectNamespace<import('./admin-hub').AdminHub>;
  /** Noites do Acampamento: sala co-op por código (relé anfitrião↔convidados). */
  NIGHTS: DurableObjectNamespace<import('./nights').NightsRoom>;
  /** Mundo Aberto online: mundos de até 8 (edições guardadas) + caixas de convite. */
  MUNDO: DurableObjectNamespace<import('./mundo').WorldRoom>;
  /** Loja de Criações + fila de moderação (UGC) — instância única 'hub' (docs/LOJA-TV.md). */
  UGC: DurableObjectNamespace<import('./ugc-hub').UgcHub>;
  /** TV Bloop: grade ao vivo + votos — instância única 'main'. */
  TV: DurableObjectNamespace<import('./tv').TvChannel>;
  /** Garimpo Bruto online: salas de garimpo (relé anfitrião↔convidados) + caixas de convite. */
  GARIMPO: DurableObjectNamespace<import('./garimpo').GarimpoRoom>;
  /** Cava & Fala online: arena/vila por código (relé; o anfitrião manda na partida) + caixas de convite. */
  CAVA: DurableObjectNamespace<import('./cava').CavaRoom>;
  /** Jangada Bloop online: jangada por código (relé; o anfitrião manda no mundo) + caixas de convite. */
  RAFT: DurableObjectNamespace<import('./raft').RaftRoom>;
  /** Duelo: mesmo desafio para todos ao mesmo tempo (jogos solo jogados em grupo) — uma instância por jogo+código. */
  DUEL: DurableObjectNamespace<import('./duel').DuelRoom>;
  /** Horas mínimas de conta para gerar moedas a criadores (padrão 72; .dev.vars usa 0 no teste local). */
  UGC_MIN_AGE_H?: string;
  /** Segredo definido no painel da Cloudflare (Settings → Variables and Secrets). */
  ADMIN_PASSWORD?: string;
  /** Hash PBKDF2 da senha do painel (público; usado se ADMIN_PASSWORD não existir). */
  ADMIN_PASSWORD_HASH?: string;
  /** História Mágica (Bloop Cinema): chave da API da Anthropic — segredo, ver docs/IA.md. Sem ela, o app usa o gerador offline. */
  ANTHROPIC_API_KEY?: string;
  /** Workers AI (Whisper): transcreve as vozes dos filmes da TV Bloop antes da fila humana (server/voice-mod.ts). */
  AI?: Ai;
  /** Só no teste local (.dev.vars): "device" = usa a transcrição do aparelho como se fosse a do Whisper. */
  AI_STT_MOCK?: string;
  /** "0" desliga a checagem extra das falas pela IA de texto (Claude), mesmo com ANTHROPIC_API_KEY. */
  AI_LLM_CHECK?: string;
}
