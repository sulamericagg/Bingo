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
  /** Segredo definido no painel da Cloudflare (Settings → Variables and Secrets). */
  ADMIN_PASSWORD?: string;
  /** Hash PBKDF2 da senha do painel (público; usado se ADMIN_PASSWORD não existir). */
  ADMIN_PASSWORD_HASH?: string;
  /** História Mágica (Bloop Cinema): chave da API da Anthropic — segredo, ver docs/IA.md. Sem ela, o app usa o gerador offline. */
  ANTHROPIC_API_KEY?: string;
}
