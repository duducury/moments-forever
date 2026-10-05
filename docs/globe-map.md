# Globo do mapa (/mapa e mapa público do perfil)

Experiência visual: espaço profundo → Terra colorida → fronteiras discretas →
poucos nomes → as viagens do usuário (pins). Só o visual; pins, agrupamento,
rotação, zoom e dados do mapa não mudam.

## Camadas (MapLibre, projeção globe)

| Camada | Origem | Papel |
|---|---|---|
| `ocean` | cor sólida | fundo azul; é o que aparece se a textura não carregar |
| `bluemarble` | NASA Blue Marble (GIBS, domínio público) | a Terra colorida (zoom 0–8) |
| `globe-borders` | `public/geo/borders-v1.json` | só fronteiras terrestres entre países (sem costa) |
| `globe-regions-t1/t2` | `public/geo/places-v1.json` | nomes de estados/regiões (16 países) |
| `globe-countries-t1..t4` | idem | nomes de países |
| `globe-cities-t1..t4` | idem | cidades (ponto + nome) |

Não há ruas, estradas nem o raster do OpenStreetMap. **Zoom máximo: 7**
(a textura da NASA não tem detalhe além disso).

## Quantidade de labels por zoom

Cada lugar tem um *tier* (1 = mais importante); a camada de cada tier só existe a
partir de um zoom (`src/lib/map/globe-labels.ts`). Dentro de um tier, a colisão do
MapLibre mantém o mais importante (`s`) e esconde o que se sobrepõe. Ordem de
prioridade: cidades > países > regiões.

| Zoom | Aparece |
|---|---|
| 1,1 | os ~20 maiores países |
| 2,2 | ~37 cidades principais |
| 2,4 / 3,4 | mais países; capitais grandes e destinos |
| 3,9 | regiões dos países grandes (BR, EUA, CA, AU, MX, AR, CN, IN, ID) |
| 3,6 / 4,4 | países médios; cidades de 1,5M+ |
| 4,8 / 4,9 / 5,6 | países pequenos; regiões dos países compactos; cidades menores |
| 5,4 → 6,4 | nomes de países somem |

## Dados geográficos (locais, sem API em produção)

Gerados por `apps/web/scripts/build-globe-geo.mjs` a partir de pacotes npm e
**commitados** em `apps/web/public/geo/` (a produção só serve arquivos estáticos):

- **Fronteiras e países:** Natural Earth 1:50m via `world-atlas` (domínio público).
- **Nomes de países em português:** `i18n-iso-countries` (+ ajustes para o português do Brasil).
- **Cidades:** GeoNames via `all-the-cities` (CC BY 4.0 — creditado na atribuição do mapa),
  filtradas (capitais, grandes cidades, destinos de viagem curados) e sem vizinhas a 70 km.
- **Regiões:** `country-state-city` (centroides) com nomes em português curados.

As fontes dos nomes (Noto Sans, SIL OFL) são arquivos de glifos em `public/fonts/`,
gerados por `scripts/build-globe-fonts.mjs`. Nada disso é dependência do app: as
duas ferramentas rodam com `npm i` fora do projeto (veja o cabeçalho de cada script).

## Parallax do espaço

O fundo (`globe-space-backdrop.tsx`) segue o **movimento real da câmera** do
MapLibre (evento `move`: arraste, inércia, voo, zoom), sem detectar toque. A cada
`move` calcula-se quanto a superfície no centro deslizou na tela
(`globeSurfaceShift`, escala mercator do centro) e cada camada recebe uma fração:
estrelas próximas 18%, médias 12%, distantes 7%, nebulosa 3%. O deslocamento é
suavizado (meia-vida de 110 ms) e o laço só roda enquanto o céu ainda está
alcançando o globo. Estrelas são tiles repetidos (nunca acaba o céu); a nebulosa é
limitada. Com `prefers-reduced-motion` o fundo fica parado.
