# Assets de terceiros — licenças

Os cenários 3D (cozinha, floresta, casa) **não usam nenhum arquivo de asset baixado**:
toda a geometria e todas as texturas são geradas em código no próprio dispositivo
(0 bytes adicionados ao APK).

| Asset | Origem | Licença |
|---|---|---|
| Geometria (móveis, panelas, árvores, toras, ingredientes) | procedural — `src/3d/common/geo.ts`, `src/games/cozinha/fps-*.ts`, `src/games/floresta/fps/models.ts`, `src/home3d/models.ts` | código do projeto |
| Texturas PBR (madeira, pedra, azulejo, inox escovado, casca, tecido + mapas de normais) | procedural em canvas — `src/3d/common/pbr.ts` | código do projeto |
| Mapa de ambiente para reflexos | `RoomEnvironment` de three.js (`three/examples/jsm`), gerado em tempo de execução via PMREM | MIT (three.js) |
| `RoundedBoxGeometry`, `mergeGeometries` | three.js `examples/jsm` (empacotados localmente) | MIT (three.js) |

Se no futuro algum modelo/textura externo for adicionado, usar **somente CC0**
(Poly Haven, Quaternius), registrar aqui: nome, URL de origem, licença e tamanho.

## Bloop Espelho (rastreamento de rosto, no aparelho)

| Asset | Origem | Licença | Tamanho |
|---|---|---|---|
| `public/mediapipe/face_landmarker.task` (Face Landmarker float16 v1, com blendshapes) | https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task | Apache-2.0 (Google MediaPipe) | 3,6 MB |
| `mediapipe/vision_wasm_internal.{js,wasm}` (copiados no build de `@mediapipe/tasks-vision@0.10.35` pelo `vite.config.ts`) | npm `@mediapipe/tasks-vision` | Apache-2.0 | 11,2 MB + 0,3 MB |

Tudo roda localmente; nenhuma imagem da câmera sai do aparelho.
