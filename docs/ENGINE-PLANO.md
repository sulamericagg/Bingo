# Bloop Studio → Bloop Engine: implementation plan ("our Roblox Studio")


---

## 0. TL;DR

Bloop Studio already has most of an engine's core: a 3D editor, physics play mode, a deterministic block VM, missions, terrain, a store with a moderation queue, a server browser with Studio servers, and a party system. What it lacks is the **game layer** above a single map:

- multiple levels and story progression
- declared variables and a HUD
- part animations, NPCs and dialog
- cutscenes
- an input abstraction (keyboard, mouse, gamepad)
- a multiplayer **game-state** model (today online play is presence only)
- a cover-photo tool
- visibility (private, unlisted, scheduled)
- versioned review, with the admin playing the game before approving
- discovery in "Jogos da comunidade"
- templates with guided tutorials

Approach:

- **Format v4**: purely additive. Old readers still play level 1.
- **No new Durable Object class.** New SQLite tables go in `UgcHub`, plus new RPC methods on `SquadRoom`, `ServerDir` and `WorldRoom`. This means **no wrangler migration tag**.
- **W0 scaffolding** lands first and pre-wires every shared seam (types, panel IDs, hook interfaces, route stubs, QA entries). After that, **5 parallel workstreams** each own a disjoint set of files.

---

## 1. Gap analysis

| Requirement | What exists today (file) | Gap |
|---|---|---|
| Build-mode game creation | Editor with parts, joints, Caneta 3D, terrain, layers (`src/studio/editor/*`, `ui/panels.ts`). "Missão" with 4 templates (`ui/mission.ts`). `Creation.game` = {title, desc, tags, maxPlayers} | No "game project" concept above one map. No dashboard (levels, modes, cover, publish) |
| Levels | One map per `Creation`. `deps` embeds imported creations, 1 level deep | No `levels[]`, no level transitions, no per-level spawn, no saved progress |
| Logic | Fichas (`LogicRule`) plus Script blocks (`format.ts` Script/Block, VM in `play/vm.ts`, editor in `ui/blocks.ts`). Up to 32 untyped variables. `q: players` exists | Missing events: key/action button, player-join, level-start, cutscene-end, var-change, tag-touch, enemy-defeated, timer-end. Missing blocks: level, cutscene, dialog/choice, anim, show/hide, camera, HUD, NPC, it/tag, save, broadcast. No declared variables, variable scope (player vs game), or HUD binding |
| Animations | Joint motors and `move`/`rotate` blocks (tweens) only | No keyframe part animations (loop/ping-pong), no NPC walk paths, no avatar emotes from logic |
| Opening cutscenes / story ("historinha") | `src/3d/cine` (`Cine`: letterbox, subs, title, skip, back button = skip, TTS narration, music). `src/cinema` has a pure timeline evaluator (`engine.ts`: `evalActors`, `evalCam2`, `ease`), 3D `Scene3D`, and `loadStudioSet()` (a stale ad-hoc studio parser marked TODO) | No cutscene data in the game format, no in-world cutscene player, no authoring UI, no cinema-project import |
| Player count and modes | `GameMeta.maxPlayers` 1..16 (the doc says "hoje o jogo é solo"). Studio servers support 4/8/12 with goal Livre/Juntos/Corrida/Coleta/Sobreviver/Empurra (`server/servers.ts`). `WorldRoom` has `MUNDO_MAX = 8` (inconsistent with 12). `play/online.ts` is **presence only**: each client simulates itself, plus a PvP push | No declared mode set (solo / online / story) or min/max. No lobby, countdown or host-authoritative game state, so doors, collectibles, scores and "it" are not shared. No story mode |
| Keyboard and mouse (phone USB/BT, PC) | Play: WASD/arrows via `session.ts` `onKey`. `look.ts` accepts mouse drag. Editor: right-drag camera and wheel. `FpsControls` has keyboard | No action-map layer, no pointer lock, no gamepad, no editor shortcuts (undo, delete, copy, tool keys), no HUD auto-hide for physical input, no rebinding, no PC-scale layout |
| Photo tool and cover editor | `studio.thumb()` / `thumbs3()` auto-render 3 angles (`studio.ts`). Server takes 3 thumbs of 60 KB or less | No photo mode (free camera, hide HUD, poses), no editor (crop, filters, stickers, title), no "cover" slot |
| Publish → admin approval | `submitForReview` → `/api/ugc/publish` → UgcHub queue → admin "Moderação" tab (`server/admin.html`, `server/ugc-admin.ts`) with approve/reject/hide/ban. Moderator role exists | **Admin cannot play the game.** Content view is only a names/parts summary. No "needs-changes" on the server (client `ReviewStatus` has it, `shared/ugc.ts` `UgcStatus` does not). **Re-publishing overwrites `ugc:c:<id>` and resets an approved item to pending, so the live game vanishes during re-review.** There is no versioning |
| Visibility | Only `friendsOnly` on Studio servers. Store items are public once approved | PRIVATE (party), UNLISTED (password), SCHEDULED (premiere). Must be enforced on **every** content path: `/api/ugc/get`, `/browse`, `/thumb`, `/api/servers/list`, `WorldRoom` join |
| "Jogos da comunidade" next to servers | Mundo server browser (`src/games/floresta/world/browser.ts`) has tabs hot/friends/minis/pvp/players/mine. Studio store has a `section: 'games'` | No Games tab or section with cards, countdowns and Play solo / online / story. No auto-instanced online rooms per game (today the creator must manually "Criar servidor") |
| Party/server integration | `TOGETHER_GAMES` includes `studio` (faixa only). `partySeat` room contract. `sendFocus(..., {srv})` | Studio must become `mode:'room'` for community games so the leader launches and the group joins the same room |
| Templates and tutorials | `starters.ts` (B builder), `guide.ts` (5-step "Monte um carro" with glow, done and "Fazer por mim"), mission templates, `src/cinema/tutorial.ts` | No generic tutorial engine, no 5 sample projects |
| Kid-friendly, old tablets | `sicons.ts`, quality tiers (`core/quality` Tier 0..3), `pro.ts` part limits per tier, notify toasts, touch module | Need performance budgets for cutscenes, levels and photo, plus icon-first new panels |

---

## 2. Architecture

### 2.1 Game format v4 (`src/studio/format.ts`; additive only, `FORMAT_VERSION = 4`, `migrate()` maps v1|2|3 → 4)

The root `Creation` stays a `kind: 'map'` and **is level 1**. Old clients ignore the new fields and play level 1 with a flat experience.

```ts
Creation {
  ...v3 fields
  game?: GameMeta              // extended (below)
  levels?: Level[]             // v4: extra levels (≤ 8). Level 1 = root parts/terrain/mission/scripts
  vars?: VarDef[]              // v4: declared variables (≤ 32)
  anims?: PartAnim[]           // v4: keyframe animations (≤ 32), level 1 (each Level has its own)
  npcs?: Npc[]                 // v4: ≤ 16 per level
  cutscenes?: Cutscene[]       // v4: ≤ 12, shared across levels
  story?: StoryFlow            // v4: Historinha order
}

GameMeta {
  title, desc, tags, maxPlayers            // existing
  modes?: {
    solo?: boolean                          // default true
    story?: boolean                         // needs `story`
    online?: { min: 1..8, max: 2..8, teams?: 0|2, pvp?: boolean, goal?: 'free'|'coop'|'race'|'collect'|'survive'|'tag'|'push' }
  }
  intro?: string                            // cutscene id played on start (skippable)
  cover?: 0                                 // index into thumbs (cover = thumbs[0])
  hud?: { vars: string[] }                  // variables shown with icons (≤ 4)
  controls?: { action?: IconId, action2?: IconId, run?: boolean }  // which buttons exist
}

Level {
  id: string, name: string (≤ 24)
  parts, joints, logic, materials?, scripts?, terrain?, worldKind?, seed?, gen?, mission?, anims?, npcs?
  next?: string                              // level id or '' = end
}

VarDef { name (≤16), init: number, scope: 'player'|'game', hud?: IconId, persist?: boolean /*story save*/ }

PartAnim { id, part?: number, g?: number, loop: 'once'|'loop'|'pingpong', auto?: boolean,
           keys: { t: number, p?: Vec3 /*offset*/, r?: Vec3, s?: Vec3, ease?: Ease }[] /* ≤ 16 */ }

Npc { id, name (≤16), look: { skin?: string, avatar?: AvatarData, creature?: string },
      at: Vec3, yaw: number, path?: Vec3[] /* ≤ 8 */, speed?: number,
      talk?: DialogLine[] /* ≤ 6, shown on tap */, role?: 'friend'|'shop'|'enemy' }

DialogLine { who?: npcId|'player'|'', text (≤ 80, filtered), choices?: { text (≤24), set?: {v, e: Expr}, go?: string /*msg*/ }[] /* ≤ 3 */ }

Cutscene {                                   // in-world, world-space (meters), plays over the live level
  id, name, dur (1..90 s), level?: string, skippable: true (forced),
  cam:   { t, p: Vec3, look: Vec3 | {npc|part}, fov?, ease?: Ease }[]     // ≤ 24
  actors:{ who: 'player'|npcId|`part:${n}`, keys: { t, p: Vec3, yaw?, pose?: PoseId, expr?: ExprId, ease? }[] }[]  // ≤ 6 tracks
  subs:  { t, end?, who?, text (≤ 80), style?: BubbleStyle }[]            // ≤ 24
  sfx?:  { t, snd: SoundId }[], fx?: { t, kind: FxKind, dur }[], music?: ThemeId, title?: { text, at }
  from?: string                              // cinema project id it was imported from (info only)
}
StoryFlow { steps: ({ k: 'cut', id } | { k: 'level', id } | { k: 'end', text? })[] /* ≤ 24 */ }
```

**New script events** (`SCRIPT_EVENTS` append):

| Event | Fires when |
|---|---|
| `action` | `{key: 'a'\|'b'}` (on-screen button / E / F / gamepad A/B) |
| `join` | a player joins |
| `level` | a level starts |
| `cutend` | `{id}` cutscene ended |
| `var` | `{v}` variable changed |
| `tag` | another player touched me |
| `defeat` | an enemy was defeated |
| `timeup` | time ran out |
| `talk` | `{npc}` |

**New blocks** (`BLOCK_KINDS` append):

| Block | Fields |
|---|---|
| `level` | `{to: levelId \| 'next'}` |
| `cutscene` | `{id}`, waits |
| `dialog` | `{lines: DialogLine[]}`, waits, choices set vars / send msgs |
| `anim` | `{id, on: 'play'\|'stop'}` |
| `show` / `hide` | `{part}` |
| `camera` | `{k: 'shake'\|'focus'\|'reset', part?}` |
| `npc` | `{id, k: 'walk'\|'stop'\|'face', to?}` |
| `it` | `{who: 'me'\|'toucher'\|'random'}` (tag) |
| `hud` | `{text}` banner |
| `save` | story checkpoint |
| `emote` | `{pose}` |

`Expr` gains `{ q: 'it' | 'level' | 'alive' }`. `set` and `change` keep `v`, with scope coming from `VarDef`. Undeclared vars stay player-scoped (backward compatible).

**LIMITS** (new, enforced in `validate()`):

- 8 levels
- total parts across levels ≤ `LIMITS.parts` (2000)
- 12 cutscenes
- 32 anims per level
- 16 NPCs per level
- JSON ≤ **1 MB for games** (`UGC.maxGameBytes`, new). Normal creations stay at 512 KB.

The editor still applies per-tier limits from `pro.ts` **per level**. `hashCreation` canonicalization includes the new fields. Strings (dialog, subs, names, choices) are filtered client-side with `shared/moderation.ts` and **re-filtered server-side**.

**Cinema reuse:**

- Types reused verbatim from `src/cinema/format.ts`: `Ease`, `PoseId`, `ExprId`, `BubbleStyle`, `FxKind`. They are type imports, so no runtime coupling.
- `ease()` comes from `src/cinema/engine.ts`, or `src/3d/cine/ease`.
- The overlay (letterbox, subtitles with TTS, title, Skip, back button) is `Cine` from `src/3d/cine`. A Cine instance runs without its own stage; the Studio renderer draws via `onFrame`.
- A converter `cutscene/from-cinema.ts` maps a **3D** Bloop Cinema project's shots into a `Cutscene`:
  - stage → world uses the documented mapping `X = (x−8)·0.6`, `Z = z·0.9`, `Y = y·0.6`, offset to a chosen anchor
  - `p3` presets → cam keys relative to focus
  - lines → subs (text only)
- **Recorded voices are not imported in v1.** They are a moderation risk; use TTS via `speak()`. A later step can reuse the `voice-mod.ts` Whisper pipeline.
- Fix `loadStudioSet()` to use the official `validate()` + `render/build.ts` (resolves the TODO), owned by W2.

### 2.2 Runtime

- **`play/director.ts` (new, GameDirector)**: owns the game flow above `PlaySession`:
  - mode selection (solo / story / online)
  - intro cutscene, level load/unload (dispose the previous session's meshes and bodies; one level in memory at a time)
  - story steps and save in `localStorage['bs-story:<id>']` (persist vars + step)
  - win/lose → next level / end screen
  - HUD vars
- **`PlaySession`** (`play/session.ts`) gets a narrow `GameHooks` interface, defined in W0 (`play/hooks.ts`):
  - `onEvent(kind, data)`
  - `vars` store
  - `cutscene(id): Promise<void>`
  - `dialog(lines): Promise<choiceIdx>`
  - `anim(id, on)`
  - `npc(...)`
  - `level(to)`
  - `input: InputSource`
  - `net?: NetGame`

  The session calls hooks; implementations live in new files owned by different streams.
- **VM** (`play/vm.ts`):
  - `VmHost` gains the new methods. Blocking blocks (`cutscene`, `dialog`, `wait`) suspend the thread exactly like `wait`.
  - Budgets are unchanged (600 steps per frame, 120 per thread, 48 threads).
  - Variable store is split: player-scoped (local) and game-scoped (`GameVars`).
  - Variable changes fire the `var` event, debounced to once per frame per var to avoid loops.
- **Animations** (`play/anim.ts`): kinematic clusters are already supported (`cl.anim` in session). PartAnim compiles to per-cluster tracks sampled each frame (cheap, no allocations).
- **NPCs** (`play/npc.ts`): reuse `play/avatar.ts` (`BloopAvatar`) for looks, with simple path following, a tap-to-talk prompt, and enemies reusing the existing `enemy` role code.
- **Cutscene player** (`cutscene/player.ts`):
  - freezes input and physics stepping (or slows them)
  - drives the camera from `cam` keys with `Track3`
  - drives actor tracks (player avatar / NPC / part)
  - shows `Cine` overlay subs, title and skip
  - resolves on end or skip, then emits `cutend`
- **Old-tablet budget** (Tier 0):
  - ≤ 4 animated actors in a cutscene
  - no shadows
  - pixel ratio 1
  - level parts per `pro.ts` tier
  - NPC count capped at 6 visible
  - photo capture at 960×540
  - VM budgets unchanged
  - dispose on level switch, verified by `scripts/qa/leaks.mjs`

### 2.3 Multiplayer model

Transport is unchanged: `WorldRoom` in `mode: 'studio'` (`/api/mundo/room/<CODE>`), which already relays `s` (state ≤ 12/s), `ev` (relayed) and `mg` (host → all or `to`), plus host election.

- **Authority split**:
  - Each client is authoritative for **its own avatar** (as today) and **player-scoped vars**.
  - The **host** is authoritative for **game state**: match phase (`lobby → countdown → play → end`), game-scoped vars, part states (door / light / destroyed / spawned / collected-by), anim triggers, `it` player, teams, scores, level index, timer.
- **Protocol** (inside existing envelopes, so no server change is needed for relaying):
  - Client → host: `{t:'ev', k:'g', e: 'touch'|'zone'|'collect'|'button'|'action'|'tag'|'die', part?, who?, seq}`
  - Host → all: `{t:'mg', k:'gs', full?: GameSnapshot, d?: Delta[], seq}` (deltas at ≤ 10 Hz, full snapshot on join and every 10 s)
- **VM placement**:
  - Online, scripts whose event is game-wide (`start`, `every`, `message`, `join`, `level`, `timeup`, `var` on game vars) run **only on the host**.
  - Scripts triggered by the local player (`touch`/`zone`/`collect`/`button`/`action`/`talk`/`tag`) run locally. Any block mutating game state (`score` on a game var, `door`, `destroy`, `spawn`, `match`, `level`, `it`, `team`) is turned by `NetVmHost` into a host request instead of being applied directly.
  - Purely visual/local blocks (`say`, `sound`, `camera`, `dialog`, `emote`) apply locally.
  - Offline uses `LocalVmHost`, which applies everything directly.
- **Host plausibility checks**:
  - `tag` only if the two avatars' last reported positions are within 2.5 m
  - `collect` only once per part
  - per-player event rate ≤ 20/s
- **Host migration**: every client keeps the last full snapshot. When `{t:'host'}` changes, the new host resumes from it. A timer is stored as an absolute server-relative deadline.
- **Modes**:
  - Solo: offline, VM local.
  - Story (Historinha): offline solo in v1. Co-op story is future work.
  - Online: lobby shows `n/min..max`. The host (or the party leader) presses Start; it also auto-starts when `min` is reached plus a 20 s countdown.
  - `tag` goal: `it` var plus a timer; touching passes "it" with 2 s immunity.
  - `race`: checkpoints per player, finish order from the host.
- **Rooms per game**: new `POST /api/games/match {id, item}` → `ServerDir` auto-instances like official SLOTS. Code `G` + 5 chars. It picks the fullest non-full room of that game and version, creates `WorldRoom.setup({mode:'studio', ugc:item, ver:hash, max, pvp, goal, auto:true})` when all are full, and holds a 12 s reservation (existing pattern). Creator-published servers (existing) still work.
- **Party**:
  - Register studio as `mode:'room'` (move it out of `TOGETHER_GAMES`) **only when a community game is focused**. Otherwise keep "together".
  - Leader picks a game in the Games tab → `sendFocus('studio', {game: id, mode: 'online'|'solo'})`. On JOGAR, `partySeat('studio')` uses a code derived from the squad. Leader `setup`s the room (`ServerDir.partyRoom(squad, item)`), members join with retry.
  - Solo games in a party fall back to the existing Duel contract (`registerDuelGame('studio')`): same game, live scoreboard.
- **Capacity**: `WorldRoom` `MUNDO_MAX = 8` is the hard cap for v1. Clamp `servers.publish` max (currently 2..12) to 8, or raise `MUNDO_MAX` deliberately, with load testing.

### 2.4 Server data model, routes, moderation, scheduling, visibility

No new DO class, so there is **no migration tag**. If one is ever added, **append** `{ "tag": "v14-engine", "new_sqlite_classes": [...] }`. Never edit or reorder existing tags.

**UgcHub** (`server/ugc-hub.ts`), new tables via `CREATE TABLE IF NOT EXISTS` in the constructor:

```sql
games (id TEXT PK, vis TEXT NOT NULL DEFAULT 'public',        -- public|unlisted|private|scheduled
       pw TEXT NOT NULL DEFAULT '',                           -- 'pbkdf2:<iter>:<salt>:<hash>' (unlisted only)
       premiere INTEGER,                                      -- ms, scheduled only (≤ now+30 d)
       live_hash TEXT NOT NULL DEFAULT '',                    -- approved version served to players
       pend_hash TEXT NOT NULL DEFAULT '',                    -- version under review
       modes TEXT NOT NULL DEFAULT '{}', maxp INTEGER, minp INTEGER,
       texts_flag INTEGER NOT NULL DEFAULT 0, updated INTEGER)
game_unlock (id TEXT, pid TEXT, t INTEGER, PRIMARY KEY(id,pid)) WITHOUT ROWID   -- unlisted: unlocked players
game_review_tk (tk_hash TEXT PK, id TEXT, hash TEXT, exp INTEGER, by TEXT)       -- admin play tokens (30 min, single item)
game_versions (id TEXT, hash TEXT, status TEXT, reason TEXT, t INTEGER, reviewer TEXT, PRIMARY KEY(id,hash))
```

**KV:**

- `ugc:g:<id>:<hash>` holds versioned game JSON.
- `ugc:c:<id>` is kept as the live version for old clients. It is written **only on approval**, so the "overwrite on resubmit" bug is fixed.
- Thumbs and cover stay in the `items.thumbs` column (cover = index 0).

**Statuses**: add `'needs-changes'` to `UgcStatus` in `shared/ugc.ts`. Item-level status = live version status. A pending new version does **not** hide the live one.

**Access function** (single source of truth), `UgcHub.canPlay(id, pid, ctx: {squadOk?: boolean, mod?: boolean}) → 'ok' | 'not_found' | 'pending' | 'premiere:<ms>' | 'locked' | 'private'`:

| Visibility | Who gets access |
|---|---|
| Author | always (any version; can test solo) |
| Mod or review token | allowed for the pending version |
| Everyone else | requires `status = approved` and a `live_hash`, then the rules below |
| `public` | allowed |
| `scheduled` | allowed only if `now ≥ premiere`. Before that, the **card** is visible with a countdown but content is refused |
| `unlisted` | allowed only if `game_unlock` has `(id, pid)` |
| `private` | allowed only if `squadOk` is true |

`squadOk` is computed in the Worker. The client sends `squad`. The Worker calls a new `SquadRoom.members()` RPC (`server/squad.ts`; the DO is keyed by squad id, so `idFromName(squad)`) and checks that **both the creator and the requester** are current members. Results are cached for 30 s per (squad, item) in the isolate.

**This check is enforced in every content path**, which is the critical part:

- `/api/ugc/get` (game items)
- `/api/ugc/thumb` (only approved, and non-public visibility is hidden except the cover of a scheduled game)
- `/api/ugc/browse` (exclude non-public game items)
- `/api/servers/list` (studio cards of non-public games appear only to people who pass `canPlay`)
- `WorldRoom` join (`mundo.ts` line ~192 currently checks `status === 'approved'` only; replace with `canPlay`, with the client sending `squad` in the join message)
- `/api/games/*`

**Passwords (unlisted)**:

- Kid-friendly: a **picture code** of 4 icons from 12 (12⁴ = 20,736 combinations), or text 4–16 chars.
- Hashed with PBKDF2-SHA256 (reuse `pbkdf2Hex` from `server/auth.ts`), per-item random salt, about 20k iterations (Workers CPU budget). It is never stored or returned in plaintext, and never sent to the admin panel.
- Unlock attempts are rate limited: 5 per 10 min per (pid, id) and 30 per hour per IP (`ugcHub.rate`). Success writes `game_unlock`, so the password is checked once per player.
- Changing the password clears `game_unlock` for that id.
- The share link `#/studio/g/<id>` never contains the password.

**Scheduling**:

- The `premiere` timestamp is set by the author (within +1 h..+30 d) and can be overridden by the admin.
- Lists return the server `now` so the client countdown ("Estreia em X dias Y horas") uses server time.
- If approval comes after `premiere`, the game goes live at approval.
- "Me avise": favorite plus a local notification scheduled at `premiere` (`@capacitor/local-notifications`, already a dependency).
- No alarm is needed, because enforcement is a timestamp comparison.

**New routes** (`server/games.ts`, registered in `server/index.ts`):

| Route | Purpose |
|---|---|
| `POST /api/games/submit {id, creation, cover, shots[≤3], vis, pw?, premiere?, dailyLimit}` | `validate()`, `hashCreation`, size ≤ `UGC.maxGameBytes`, **extract all texts** (titles, level names, var names, dialog, choices, subs, NPC names, say blocks) → `textProblem()`, then flags. Writes `ugc:g:<id>:<hash>`, `pend_hash`, `items` (pending), `game_versions`. Returns `ReviewTicket` |
| `POST /api/games/settings {id, item, vis?, pw?, premiere?}` | author only. Changing visibility needs no re-review (content unchanged). Re-filters nothing |
| `GET /api/games/list?pid=&sort=&tag=&squad=&text=&cursor=` | cards: public live, scheduled (with `premiere`), private if squad passes, own items (any status). Never unlisted (except own) |
| `GET /api/games/get?id=&pid=&squad=` | `{listing, creation}` of the live version, or 403 `{error: 'premiere'\|'locked'\|'private'\|'pending'}` |
| `POST /api/games/unlock {id, item, pw}` | `{ok}` or 403 / 429 |
| `GET /api/games/code?c=` | unlisted lookup by short share code (6 chars) → card with `locked: true` |
| `POST /api/games/match {id, item, squad?}` | `{code}` (calls `canPlay`, then `ServerDir.gameMatch`) |
| `POST /api/games/party-room {id, item, squad}` | `{code}`, leader only |
| `GET /api/games/review?id=&tk=` | `{creation(pending or live), listing}` for the admin iframe. The token hash is checked in `game_review_tk`; expires in 30 min |
| Existing `/api/ugc/score`, `/board`, `/fav`, `/like`, `/report`, `/use` | reused for games |

**Moderation flow**: submit → `pending`. Auto-reject on text `bad`/`pii` (existing `autoReject` path) with a friendly reason. The admin plays and then chooses Aprovar, Pedir mudanças (`needs-changes` plus checklist reasons), Recusar, or Esconder. Approving sets `live_hash = pend_hash`, copies the content to `ugc:c:<id>`, and the author is notified via a Correio message. Reports work as today (`UGC.reportHide` → hidden). Banned authors are blocked by the existing `ubans`.

### 2.5 Admin panel changes (`server/admin.html`, `server/ugc-admin.ts`, `docs/PAINEL-ADMIN.md`)

- New tab **🎮 Jogos**, added to `MOD_TABS` so moderators can use it. Queue filters: Para revisar / Mudanças pedidas / Agendados / Aprovados / Recusados / Todos.
- **Card**: cover plus shots, title, author, visibility badge (🔒 privado / 🔑 senha / 🌍 público / ⏰ estreia dd/mm hh:mm), modes (solo / online n..m / história), level and cutscene counts, flagged texts highlighted (reuse `.ugc-tx` styles), reports, and a version diff vs live (parts ±, texts added/removed).
- **▶ Jogar aqui**: `POST /api/admin/ugc/item/:id/playtoken` → `{url: '/#/studio/review/<id>.<token>'}`, opened in a fullscreen `<iframe>` modal. It is the same origin, and no CSP headers exist in `server/*.ts`.
  - The admin bearer token is **never** passed to the app.
  - The app's review route plays with debug skip buttons: level select, skip cutscene, god mode, and an "online simulation" with 2 local ghost peers.
  - Keyboard and mouse come from W3.
- **Texts tab**: the full extracted text list with who/where (level, NPC, cutscene).
- **Actions**:
  - Aprovar
  - Pedir mudanças (preset kid-friendly reasons such as "texto impróprio", "capa não combina", "jogo travado/impossível", "cópia", plus free text ≤ 160)
  - Recusar (reason required, as today)
  - Esconder
  - Mudar estreia
  - Banir autor
- All of these go through `adminGate`, which already writes to the Registro.
- **Admin API additions**:
  - `GET /ugc/queue?type=jogo`
  - `GET /ugc/item/:id` (content now includes the game summary)
  - `POST /ugc/item/:id/playtoken`
  - `POST /ugc/item/:id/review {status incl. 'needs-changes', reason, hash}` (approves a specific hash; refuses if `pend_hash` changed meanwhile)
  - `POST /ugc/item/:id/premiere {at}`

### 2.6 Input layer (`src/ui/input/`, new and shared by Studio and future games)

- **`actions.ts`**: `InputMap` with axes `move` (x, y) and `look` (dx, dy), and buttons `jump`, `action`, `action2`, `run`, `interact`, `pause`, `photo`, `zoom±`. Each frame: `read()` → `{move, look, pressed: Set, held: Set}`.
- **Sources**:

  | Source | Mapping |
  |---|---|
  | `touch.ts` | wraps the existing `createJoystick`, `createLook`, `bindButton` |
  | `keyboard.ts` | `e.code` based (layout independent): WASD/arrows, Space, E/F, Q, Shift, Esc/Back, P, 1–4. Ignores events from inputs and textareas |
  | `mouse.ts` | Pointer Lock on canvas click in play when `(pointer:fine)` or a mouse is detected. Fallback: hold-drag (Android WebView pointer lock is not reliable). Wheel = zoom. Right button = alternate action |
  | `gamepad.ts` | Gamepad API polling; standard mapping; works with BT controllers in Android WebView and on desktop |

- **`device.ts`**: last-used-device detection (`pointerType`, keydown, gamepad connect). It emits `inputmode` = `touch|kbm|pad`. Touch HUD buttons auto-hide in `kbm`/`pad` and come back on the first touch. It shows key hints ("E" badge) instead of buttons. Initial guess comes from `matchMedia('(pointer:fine) and (hover:hover)')`.
- **`bindings.ts`**: remapping stored in `localStorage['bw-binds']`, with a settings UI (`settings-ui.ts`) using big icon tiles and a "press a key" capture.
- **Editor shortcuts** (`src/studio/editor/shortcuts.ts`):

  | Shortcut | Action |
  |---|---|
  | Ctrl/Cmd+Z / Y / Shift+Z | undo / redo |
  | Del/Backspace | delete |
  | Ctrl+C / V / D | copy / paste / duplicate |
  | G / R / S | move / rotate / scale |
  | F | focus selection |
  | Ctrl+G | group |
  | WASD+QE | fly camera while right mouse is held |
  | Tab or F5 | Testar |
  | Esc | deselect / close sheet |

  Hover highlight and click-select with the mouse.
- **PC layout**: CSS breakpoint ≥ 1100 px and `(pointer:fine)`. The panel drawer docks as a sidebar, buttons get smaller min sizes (still ≥ 40 px), and tooltips show shortcuts.
- **Android**: a hardware Back maps to `pause`/Esc via the existing `core/back` `pushBack`.

### 2.7 Photo tool and cover editor (`src/studio/photo/`)

- **`mode.ts`**: available in play and edit via the 📷 button or the P key.
  - Pauses the simulation, hides the HUD, free camera (joystick/WASD fly, drag/mouse look, pinch/wheel zoom FOV 30–90).
  - Avatar pose/emote picker, grid overlay, 16:9 frame guide.
  - Shoots by rendering to an offscreen `WebGLRenderTarget` at 1280×720 (Tier 0: 960×540) → canvas.
  - Up to 6 shots per session, kept in memory.
- **`editor.ts`**: a 2D canvas editor, icon-first.
  - Crop/zoom (pan inside a 16:9 frame).
  - Filters as LUT-free per-pixel ops (brightness, contrast, saturation, warm, cool, vintage, comic edge) implemented in JS on 640×360. This avoids relying on `ctx.filter` on old WebViews.
  - Stickers from `sicons` plus game icons.
  - Title text in Fredoka with outline and 6 color presets. The text goes through `filterMessage` before it is drawn.
  - Frames.
- **`encode.ts`**: JPEG/WebP quality bisection to ≤ 60 KB (`UGC.maxThumbBytes`). Output: `cover` (thumbs[0]) plus up to 2 extra shots. The auto `thumbs3()` stays as a fallback.

### 2.8 Discovery: "Jogos da comunidade"

- **Mundo browser** (`browser.ts`): new tab **🎮 Jogos** placed second, after Em alta. It is backed by `/api/games/list` and is separate from the server cards.
  - Card: cover, title, author, ♥, players badge (👤 solo / 👥 2–8), story badge 📖, live players in rooms (from `ServerDir`), 🔒 for private (party), countdown chip for scheduled.
  - Tap opens a detail sheet with **Jogar sozinho**, **Jogar online** (`/api/games/match`), **Historinha**, Favoritar, Denunciar, and "Me avise" (scheduled).
  - "Entrar com código" accepts game codes and prompts the picture password.
- The **Studio store** `section: 'games'` uses the same list API (unified client in `store-server.ts`).
- **Deep links**: `#/studio/g/<id>` (and the `?jogo=<code>` / `bloopworld://jogo/<code>` short code for unlisted), handled in `register.ts` / `share.ts`.

### 2.9 Templates and guided tutorials (`src/studio/templates/`)

- **`tutor.ts`**: generalizes `ui/guide.ts` into a step engine `{text, icon, glow, done(), auto(), enter?}` with progress dots, "Fazer por mim", "Pular tutorial", narration via `speak()`, and per-template completion badges (`localStorage`). The existing `guide.ts` car tutorial is re-expressed with it, keeping the `bs-guide-car` key.
- **Templates** (each one is a builder using `B` from `starters.ts` plus tutorial steps), from the "Criar jogo" picker with big cards and a preview cover:

  | Template | Contents | Tutorial steps (about 8–10 each) |
  |---|---|---|
  | `race.ts` 🏎 Corrida | kart, track with checkpoints, laps var, online race 2–8 | change car color → add a ramp → set laps → test → publish |
  | `story.ts` 📖 Historinha | 3 levels, intro cutscene, NPC with a choice dialog, ending cutscene | |
  | `tag.ts` 🏃 Pega-pega online | arena, `it` var, timer, tag event, 2–8 players | |
  | `platformer.ts` 🍄 Plataforma | moving platforms (PartAnim ping-pong), coins, enemies, lives, 2 levels | |
  | `shop.ts` 🏪 Lojinha | money var on HUD, customer NPCs spawned every N s walking a path, a "Vender" action button, upgrade buttons | |
  | `blank.ts` | empty project | |

---

## 3. Workstreams

### W0: Contracts and scaffolding (one owner, lands first, about 1–2 days; every other stream branches from it)

The goal is that after W0 nobody touches another stream's files. W0 freezes the shared seams.

| File | What W0 does |
|---|---|
| `src/studio/format.ts` | v4 **types**, `LIMITS`, `migrate`, `validate()` for all new fields (strict: drop invalid entries), `canonical` update, `jsonBytes`. After W0, **W1 owns this file** |
| `shared/engine.ts` (new) | `Visibility`, `GameCard`, `GameSubmit`, `CanPlay` reasons, `PICTURE_CODE_ICONS`, `ENGINE` limits (`maxGameBytes`, premiere window, unlock rate). Imported by client and server |
| `shared/ugc.ts` | add `'needs-changes'` to `UgcStatus` and `maxGameBytes` |
| `src/studio/play/hooks.ts` (new) | `GameHooks`, `NetGame`, `InputSource`, `CutsceneRunner`, `DialogRunner`, `AnimRunner` interfaces plus no-op defaults |
| `src/studio/ui/panels.ts` | add PanelIds `'game' \| 'cutscenes' \| 'anims' \| 'photo' \| 'templates'`, routed to `import('./<file>')` stubs that each stream fills. **After W0, only W5 edits panels.ts** (publish section) |
| `src/studio/studio.ts` | seams: `openNewGame()` → `templates/picker` stub, `startGame(mode)` → `play/director` stub, photo button → `photo/mode` stub, input init → `ui/input` stub. After W0, studio.ts edits require the owner (W1) |
| `src/studio/ui/sicons.ts` | pre-add all new icon names (party, lock, key, clock, film, level, npc, chat, anim, camera, gamepad, keyboard, mouse, store, tag, race, book, …) |
| `server/index.ts` | register `/api/games/*` → `server/games.ts` stub (501), so W4 fills it without touching index.ts again |
| `scripts/qa/run.mjs` | add steps `engine: ['engine.mjs']`, `input: ['input.mjs']`, `photo: ['photo.mjs']`, `tpl: ['templates.mjs']` (stub files) |
| `docs/STUDIO-FORMATO.md` | v4 section |
| i18n policy | each stream uses its own key prefix (`eng.run.*`, `eng.cut.*`, `eng.in.*`, `eng.pub.*`, `eng.tpl.*`, `adm` is HTML-only). Locale files are generated by `i18n:apply`, so on merge conflicts re-run `npm run i18n:extract && npm run i18n:apply` instead of hand-merging |

**Acceptance:**

- `npm run typecheck`, `npm run i18n:check` and `npm run build` pass.
- Existing creations v1–v3 round-trip unchanged through `validate`/`serialize` (add `scripts/test-format.mjs`, run with node, using fixtures from `starters()`).
- `hashCreation` is stable for v3 docs.

#### i18n key-prefix policy (all streams)

- Every new `t('key', 'Português')` string uses its stream's prefix: **W1** `eng.run.*` (runtime, HUD, director, game sheet, blocks), **W1b** `eng.net.*`, **W2** `eng.cut.*` (cutscenes and anims panels), **W3** `eng.in.*`, **W5** `eng.pub.*` (publish, photo, discovery), **W6** `eng.tpl.*`. W4 strings live only in `server/admin.html` (`adm`), which is not extracted.
- Do not reuse or edit another stream's keys. Do not edit existing `studio.*` keys in files you do not own.
- `src/i18n/locales/*.ts` and `scripts/i18n/*.json` are generated: never hand-merge them. On conflict, take either side, then run `npm run i18n:extract && npm run i18n:apply`, and make sure `npm run i18n:check` passes before merging.
- W0 adds **no** new strings: the new panels get their title from their own module (`ctx.setTitle`).

#### W0 decisions and frozen details (landed on `wip/eng0`)

Lead decisions: online rooms cap at **8** players in v1 (`LIMITS.onlineMax`, `ENGINE.maxPlayersOnline`); **private** = only people in the author's *current* party/squad; **every non-author path requires admin approval**, including private and unlisted; **unlisted** opens with a picture code (4 of 12 icons, `PICTURE_CODE_ICONS`) or a text password.

Details fixed while implementing W0 (they refine §2.1):

- `LIMITS.levels = 8` counts **all** levels, so `levels[]` holds at most 7. Level 1 is the root, with the reserved id `ROOT_LEVEL = 'main'`. `Level.next` absent = the following level in the list; `''` = end.
- Part/joint ids are per level. NPC ids are unique across the whole game (dialog `who` can name an NPC from any level).
- The `camera` and `npc` blocks use `cam` / `act` for their sub-kind (the plan's `k` collides with the block discriminant): `{k:'camera', cam:'shake'|'focus'|'reset', part?}`, `{k:'npc', id, act:'walk'|'stop'|'face', part?}`.
- `GameMeta.maxPlayers` keeps its v3 clamp (1..16) so v3 output is unchanged; online rooms use `modes.online.max` (2..8).
- `canonical()` writes `v` above 3 as 3, so v1–v3 hashes are unchanged (frozen in `scripts/fixtures/format-v3.json`; never regenerate it).
- `format.ts` cannot import anything, so the cinema types (`Ease`, `PoseId`, `ExprId`, `BubbleStyle`, `FxKind`) are literal copies; `play/hooks.ts` asserts at compile time that they still match `src/cinema/format.ts`.
- Minimal compile fixes outside W0's own files: `play/vm.ts` (`VmHost.read(q: ExprQuery)`) and `ui/blocks.ts` (name lookups tolerate the new kinds; the palette still shows only v3 blocks). The current `PlaySession.read` returns 1 for the new queries until W1.

### W1: Game runtime and logic (owns `format.ts` after W0, `play/*` except `online.ts`, `ui/blocks.ts`, new `ui/gamesheet.ts`, `studio.ts`)

- **Files**:
  - `src/studio/play/director.ts` (new)
  - `play/session.ts` (level load/unload, hooks wiring, input via `InputSource`: replace the `keys` set at ~L1630 with `input.read()`)
  - `play/vm.ts` (new events, blocks, scopes, blocking blocks)
  - `play/anim.ts`, `play/npc.ts`, `play/dialog.ts` (new; big-icon dialog bubbles with choices)
  - `play/vars.ts` + `play/hud.ts` (variables HUD: ≤ 4 icon+number chips at the top, clean)
  - `play/local-host.ts` (offline `VmHost`)
  - `ui/blocks.ts` (palette for the new blocks; NPC/level/cutscene pickers)
  - `ui/gamesheet.ts` (Jogo dashboard: Fases list add/rename/reorder, Modos & jogadores steppers, Variáveis, HUD picker, Historinha order)
  - `editor/editor.ts` gets only the level-switch API (`setLevel(id)`), coordinated with W3, who owns the input-related editor parts. **Rule: W1 adds methods at the end of the Editor class; W3 touches only the event handlers and `camera.ts`.**
  - `studio.ts`
- **Acceptance**:
  - A 3-level game with intro cutscene stub, dialog choice → var → branch, an animated platform, an NPC with path, and a HUD var plays start to finish offline in solo and story. Story progress survives an app restart.
  - The VM never exceeds budgets, using a fuzz test with `repeat 1000` without `wait` plus nested `dialog`.
  - Level switch frees GPU memory (`renderer.info.memory` returns to baseline ±5%).
  - Tier 0 holds ≥ 30 fps on a 400-part level (perf QA).
  - v3 maps behave identically (mission, scripts).
- **Tests**:
  - `typecheck`, `i18n:check`, `build`
  - `scripts/test-format.mjs` (shared with W0)
  - new `scripts/test-vm.mjs` (node; drives `vm.ts` with a mock host for determinism, budgets and blocking blocks)
  - `npm run qa -- engine leaks perf` (`scripts/qa/engine.mjs`: open the template fixture via `?debug` `window.__studio`, play through levels with `__cine.skip()`)

### W2: Cutscenes and animation authoring (owns `src/studio/cutscene/*`, `ui/cutscenes.ts`, `ui/anims.ts`, `src/cinema/scene3d.ts` `loadStudioSet` fix)

- **Files**:
  - `cutscene/player.ts` (implements `CutsceneRunner` using `src/3d/cine` `Cine` overlay + `Track3`; read-only use of cine)
  - `cutscene/sample.ts` (pure evaluator, unit-testable)
  - `cutscene/from-cinema.ts` (3D cinema project → Cutscene)
  - `ui/cutscenes.ts` (kid timeline: "📷 + câmera aqui" captures the current editor camera as a key; actors move by dragging in the 3D view then "📌 marcar"; subtitle cards with who/text; duration slider; preview with scrub; ≤ 24 keys)
  - `ui/anims.ts` (PartAnim recorder: select part → "gravar pose" captures transform keys via the public Editor API; loop mode; preview)
  - `play/anim-preview.ts`
  - `src/cinema/scene3d.ts` (only `loadStudioSet` → official `validate` + `render/build.ts`)
- **Acceptance**:
  - The intro cutscene plays on game start, skippable (button, Esc, Back, gamepad B), with letterbox, subtitles and TTS.
  - Camera and actor keys interpolate with eases.
  - A cinema 3D project imports into a viewable cutscene.
  - Authoring works fully by touch and by mouse.
  - Tier 0 cutscene ≥ 30 fps.
  - Cinema app regressions: none (QA `games` for cinema still green).
- **Tests**:
  - `typecheck`, `i18n:check`, `build`
  - `scripts/test-cutscene.mjs` (node: `sample.ts` determinism, `from-cinema` mapping fixtures from `src/cinema/templates.ts`)
  - `npm run qa -- engine games` (cutscene seek via `window.__cine.seek`, screenshots at t = 0, 50%, end)

### W3: Input layer (owns `src/ui/input/*`, `src/studio/editor/shortcuts.ts`, event-handler sections of `editor/editor.ts`, `editor/camera.ts`, PC layout CSS in `studio.css` under a marked `/* PC */` block)

- **Files**:
  - `src/ui/input/{actions,keyboard,mouse,gamepad,touch,device,bindings,settings-ui,index}.ts`
  - `editor/shortcuts.ts`
  - `editor/camera.ts` (WASD fly with RMB, wheel)
  - `editor/editor.ts` (pointer handlers: hover highlight, mouse select; no doc-model changes)
  - `studio.css` (PC block only)
  - `docs/CONTROLES.md` (keyboard/mouse/gamepad section)
- Also provide a `StudioInput implements InputSource` for W1 to call. W3 does **not** edit `session.ts`; W1 swaps in one call.
- **Acceptance**:
  - Play works with keyboard+mouse (pointer lock on desktop; hold-drag fallback in Android WebView), with a BT gamepad, and with touch. Switching device mid-game hides or shows touch buttons within 1 frame.
  - Editor shortcuts work and do not fire while typing in inputs.
  - Rebinding persists.
  - Android hardware keyboard/mouse is tested on a device (manual checklist).
  - No regression of the touch rules in `docs/CONTROLES.md` (multitouch router).
- **Tests**:
  - `typecheck`, `i18n:check`, `build`
  - `scripts/qa/input.mjs` (puppeteer: synthetic `KeyboardEvent`/`PointerEvent` with `pointerType: 'mouse'`, assert avatar moved, HUD hidden in kbm mode, Ctrl+Z restores a deleted part)
  - `npm run qa -- hud input`

### W4: Server (publishing, visibility, scheduling, moderation, matching, admin panel) (owns `server/*`, `shared/ugc.ts` beyond W0's lines, `docs/PAINEL-ADMIN.md`, `docs/LOJA-TV.md`, `docs/MUNDO-SERVIDORES.md`, `scripts/test-server.mjs`, `wrangler.jsonc` if ever needed)

- **Files**:
  - `server/games.ts` (all `/api/games/*`)
  - `server/ugc-hub.ts` (tables, `canPlay`, versions, unlock, review tokens, `queue` type `jogo`)
  - `server/ugc.ts` (apply `canPlay` to get/thumb/browse; fix overwrite-on-resubmit for game items)
  - `server/ugc-admin.ts` (playtoken, needs-changes, premiere override, game content summary + text extraction)
  - `server/admin.html` (🎮 Jogos tab, iframe player modal, text list, checklist)
  - `server/squad.ts` (`members()` RPC)
  - `server/servers.ts` (`gameMatch`, `partyRoom`, list filtering via `canPlay`, max clamp 8)
  - `server/mundo.ts` (join uses `canPlay` + version hash; `setup({auto, ver})`)
  - `server/index.ts` (only inside the W0 stub block)
- **Acceptance**:
  - Every visibility rule is enforced on every endpoint, including the old `/api/ugc/*`, `/api/servers/list` and the WorldRoom join.
  - The password is never echoed; it is hashed with a salt and rate limited (6th attempt → 429).
  - Private access works only while creator and requester share a squad.
  - Scheduled content is refused before premiere while the card is visible with server `now`.
  - Resubmitting an approved game keeps the live version playable.
  - Admin approves a specific hash; a stale hash is refused.
  - Review token works once per item and expires in 30 min; the admin bearer is never in the URL.
  - Moderators can use the Jogos tab; other admin routes still return 403 for mods.
  - No new DO class (or, if added, an appended migration tag only).
- **Tests**:
  - `npm run typecheck` (includes `server/tsconfig.json`)
  - `npm run test:server` extended:
    - submit → pending invisible
    - approve → public visible
    - unlisted get → 403 locked, unlock wrong ×5 → 429, right → ok
    - private with/without shared squad (create squad via WS, join two pids)
    - scheduled before/after premiere (admin override to past)
    - resubmit keeps live
    - stale-hash approve refused
    - playtoken expiry
    - `/api/ugc/get` and `/servers/list` leak tests
    - WorldRoom join rejection reasons
  - `npm run build` (admin.html is bundled as Text)

### W5: Client publish, visibility UI, photo/cover, discovery, party (owns `src/studio/photo/*`, `ui/publish.ts`, the publish section of `ui/panels.ts`, `store-api.ts`, `store-server.ts`, `store-mock.ts`, `share.ts`, `register.ts`, `src/games/floresta/world/browser.ts` (Games tab), new `src/studio/ui/gamecard.ts`, `src/party/contract.ts` (studio room mode))

- **Files**:
  - `photo/{mode,editor,encode,filters}.ts`
  - `ui/publish.ts`: wizard of 4 big steps (Capa 📷 → Nome & etiquetas → Quem pode jogar: 🌍 Todos / 👥 Meu grupo / 🔑 Com senha (picture code) / ⏰ Estreia (date-time picker with "em 2 dias 3 horas" preview) → Enviar). Status screen: Em análise / Mudanças pedidas (with reasons) / Aprovado / Recusado.
  - `store-*` (new methods: `submitGame`, `gameSettings`, `listGames`, `getGame`, `unlock`, `matchGame`, `partyRoom`; mock implements all for offline/dev)
  - `browser.ts` 🎮 Jogos tab + detail sheet + countdown
  - `register.ts` (`#/studio/g/<id>`, `#/studio/review/<id>.<tk>`, `?jogo=` code)
  - `party/contract.ts` (studio `room` mode when a game is focused)
  - `ui/gamecard.ts`
- **Acceptance**:
  - The photo tool captures and edits a cover ≤ 60 KB on Tier 0 without OOM.
  - Full flow end to end against `wrangler dev`: build → photo → publish (each visibility) → admin approves in the iframe → appears in Mundo › Jogos. Private is visible only to party members. The unlisted code plus picture password unlocks. Scheduled shows a live countdown and opens at premiere.
  - The party leader starting a game pulls members into the same room.
  - With no network, the mock path works.
  - All texts are filtered before send.
- **Tests**:
  - `typecheck`, `i18n:check`, `build`
  - `scripts/qa/photo.mjs` (open photo mode, capture, apply filter, assert data URL ≤ 60 KB)
  - `npm run qa -- online` extended (`scripts/qa/online.mjs` with `BLOOP_API`: publish → admin approve via API → list → match two browsers into the same `G…` room → shared door/collectible state; joint with W1 `NetGame`)

### W6: Templates and tutorials (owns `src/studio/templates/*`, `src/studio/ui/tutor.ts`, `ui/guide.ts` port, `starters.ts` read-only reuse)

- **Files**: `templates/{index,picker,race,story,tag,platformer,shop,blank}.ts`, `ui/tutor.ts`, `ui/guide.ts` (re-implemented on tutor, same done key).
- **Dependency**: authored against the W0 types from day 1. Final tutorial verification needs W1 (runtime), W2 (story cutscenes) and W5 (publish step), so W6 merges last.
- **Acceptance**:
  - Each template validates (`validate().ok`, no dropped entries), fits the Tier 0 part limits, plays to a win condition, and has 8–10 tutorial steps, each with a working "Fazer por mim".
  - The picker shows icon cards with a narrated description.
  - The car guide still works.
- **Tests**:
  - `typecheck`, `i18n:check`, `build`
  - `scripts/test-templates.mjs` (node: build each template, `validate`, size ≤ limits, `hashCreation` stable)
  - `scripts/qa/templates.mjs` (for each template: open → run the tutorial with auto() each step → assert done → play with debug autopilot to win)

#### NetGame ownership

| Piece | Owner |
|---|---|
| `play/online.ts` + new `play/net-game.ts` (host snapshot/deltas, `NetVmHost`, lobby/countdown UI) | **W1b**, a second engineer within the W1 area but a separate file set |
| Server side | W4 (only the WorldRoom access changes; relaying already exists) |

Contract: `NetGame` in `hooks.ts` (W0).

#### Merge order

W0 → (W1, W1b, W2, W3, W4, W5 in parallel) → W6. Integration checkpoints:

- after W1 + W3: input in play
- after W1 + W2: cutscenes in director
- after W4 + W5: publish end to end
- after W1b + W4 + W5: online match

The final integration pass runs the full gate: `npm run typecheck && npm run i18n:check && npm run build && npm run test:server && npm run qa`.

#### File ownership summary (conflict guard)

| Area | Owner |
|---|---|
| `format.ts`, `studio.ts`, `play/{session,vm,director,anim,npc,dialog,vars,hud,local-host}.ts`, `ui/{blocks,gamesheet}.ts` | W1 |
| `play/{online,net-game}.ts` | W1b |
| `cutscene/*`, `ui/{cutscenes,anims}.ts`, `cinema/scene3d.ts` (`loadStudioSet` only) | W2 |
| `src/ui/input/*`, `editor/{shortcuts,camera}.ts`, editor.ts event handlers, `studio.css` PC block, `docs/CONTROLES.md` | W3 |
| `server/*`, `scripts/test-server.mjs`, server docs, `wrangler.jsonc` | W4 |
| `photo/*`, `ui/{publish,gamecard}.ts`, panels.ts publish section, `store-*.ts`, `share.ts`, `register.ts`, `floresta/world/browser.ts`, `party/contract.ts` | W5 |
| `templates/*`, `ui/{tutor,guide}.ts` | W6 |
| Shared append-only (W0 pre-fills; later edits only by explicit hand-off) | `sicons.ts`, `shared/engine.ts`, `hooks.ts`, `scripts/qa/run.mjs`, `server/index.ts` |
| Generated | `src/i18n/locales/*.ts` (regenerate, never hand-merge) |

---

## 4. Risks and mitigations

1. **Visibility leaks through legacy endpoints.** `/api/ugc/get`, `/thumb`, `/browse`, `/servers/list`, the WorldRoom join and the embedded share links `#/studio/c/<code>` all bypass new checks unless they are patched. Mitigation: a single `canPlay()` and the W4 leak tests. Disable `#/studio/c/` embedding for v4 games with levels, cutscenes or NPCs (`share.ts`), forcing publish and review.
2. **Private = party is ephemeral.** Squads dissolve after 2 min offline, so a creator's private game becomes unreachable when the party ends. This is acceptable per the spec, but the UI should explain "só quem está no seu grupo agora". Optionally add a "+ amigos" toggle later; this is the owner's decision.
3. **Low-entropy kid passwords.** Picture codes have 20k combinations. Rate limits and per-pid unlock make brute force slow but not impossible. Treat unlisted as "hidden", not "secret", and still require approval.
4. **Unreviewed content shared with kids.** Every non-owner path requires approval, including private. The owner may want "test with my group before approval"; recommend keeping it strict (moderation first) and flag it as an explicit product decision.
5. **Worker CPU and plan limits.** PBKDF2 on the free plan (10 ms CPU): use about 20k iterations plus a one-time unlock. KV free tier is 1,000 writes/day: game submits write versioned keys (1–2 writes each), so cap daily submits (existing `publishLimit`). 1 MB KV values are fine. DO SQLite stores metadata only.
6. **Multiplayer correctness.** Splitting VM execution between host and local can produce desync or double application. Mitigations: idempotent deltas with `seq`, full snapshot every 10 s, host plausibility checks, and keeping v1 game-state scope small (vars, part states, it, teams, timer). Host migration mid-match can lose up to 100 ms of events, which is acceptable for casual play.
7. **WorldRoom capacity mismatch.** `MUNDO_MAX = 8`, while servers allow 12 and `GameMeta` allows 16. Clamp to 8 in v1.
8. **Old tablets.** Cutscenes, NPC avatars and photo capture can spike memory. Use per-tier caps, a single level resident, render-target disposal, and the existing `qa leaks`/`perf` parts as merge gates.
9. **Android WebView pointer lock and gamepad support vary.** Always keep the hold-drag fallback. Gamepad is optional and polled only when connected. Manual device checklist in W3.
10. **Format growth.** v4 must stay additive; `validate()` must drop unknown v5 fields gracefully. `hashCreation` canonicalization changes would break dedupe/versioning, so W0 freezes it with fixtures.
11. **Merge conflicts.** Hot spots are `panels.ts`, `studio.ts`, `session.ts`, `editor.ts`, `sicons.ts`, `server/index.ts`, `qa/run.mjs` and the i18n locales. Mitigations: W0 seams, single owners, and regenerating locales rather than merging them.
12. **Admin review cost.** Playing every game is time-consuming. Provide level select, cutscene skip, god mode, and the text list with filter highlights so review takes minutes. Moderators can share the load.
13. **Voice and image moderation.** In v1, cutscenes are text + TTS only, with no recorded voices. Cover text is rasterized, so the server cannot filter it; the client filters before drawing and the admin sees the final image.
14. **Story save abuse/integrity.** Saves are local only, and leaderboard scores from story mode are not submitted. Only solo and online modes post scores, already rate limited by the existing `/api/ugc/score`.

### Critical Files for Implementation
- /home/user/Bingo/src/studio/format.ts
- /home/user/Bingo/src/studio/play/session.ts (+ /home/user/Bingo/src/studio/play/vm.ts, /home/user/Bingo/src/studio/play/online.ts)
- /home/user/Bingo/server/ugc-hub.ts (+ /home/user/Bingo/server/ugc.ts, /home/user/Bingo/server/ugc-admin.ts, /home/user/Bingo/server/admin.html)
- /home/user/Bingo/server/mundo.ts and /home/user/Bingo/server/servers.ts (+ /home/user/Bingo/server/squad.ts)
- /home/user/Bingo/src/studio/ui/panels.ts (+ /home/user/Bingo/src/games/floresta/world/browser.ts, /home/user/Bingo/src/3d/cine/cine.ts)