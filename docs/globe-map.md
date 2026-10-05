# Globo do mapa (/mapa e mapa público do perfil)

Experiência visual: espaço profundo → Terra colorida → fronteiras discretas →
poucos nomes → as viagens do usuário (pins). Só o visual; pins, agrupamento,
rotação, zoom e dados do mapa não mudam.

## Camadas (MapLibre, projeção globe)

Estilo cartográfico natural (inspirado no Apple Maps): oceano azul, terra em tons
naturais por clima — verde nas áreas úmidas, areia nas áridas, taiga escura,
tundra cinza, gelo branco — relevo sutil e fronteiras discretas. Sem textura de
satélite/foto, sem países coloridos, sem ruas, sem borda azul em volta do globo.

| Camada | Origem | Papel |
|---|---|---|
| `globe-ocean` | cor sólida | oceano |
| `globe-land` | `public/geo/land-v1.json` | cobertura natural (11 grupos climáticos) recortada na costa real |
| `globe-relief-shadow/light` | `public/geo/ranges-v1.json` | cordilheiras como linhas suaves e borradas (luz à esquerda) |
| `globe-borders` | `public/geo/borders-v1.json` | só fronteiras terrestres entre países, bem discretas |
| `globe-regions-t1/t2` | `public/geo/places-v1.json` | nomes de estados/regiões (16 países) |
| `globe-countries-t1..t4` | idem | nomes de países |
| `globe-cities-t1..t4` | idem | cidades (ponto + nome) |

Grupos de `globe-land` (propriedade `t`, mesma ordem de `LAND_PALETTE`): 0 floresta
tropical · 1 savana · 2 deserto quente · 3 deserto frio · 4 estepe · 5 mediterrâneo ·
6 temperado · 7 continental · 8 taiga · 9 tundra · 10 gelo.

Texto escuro com halo branco suave. Uma sombra suave (luz no canto superior
esquerdo, lado oposto um pouco mais escuro) fica sobre o globo e sob os pins.
**Zoom máximo: 7.**

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

- **Costa, fronteiras e países:** Natural Earth 1:50m via `world-atlas` (domínio público).
  Os polígonos que cruzam a linha de data (Rússia/Chukotka, Fiji, Antártida) são
  cortados em ±180° pelo gerador — sem isso viram uma faixa atravessando o mundo.
- **Cobertura da terra:** classificação climática Köppen–Geiger, 0,5°, via
  `koppen-climate-lookup` (Kottek et al. 2006; Rubel et al. 2017 — creditada aqui):
  agrupada em 11 classes, suavizada (desfoque + corte de cantos), traçada com
  `d3-contour` e recortada na costa real com `clipper-lib`.
- **Relevo:** linhas das principais cordilheiras escritas à mão no gerador (`RANGES`).
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
estrelas próximas 55%, médias 38%, distantes 22%, nebulosa 12%
(`PARALLAX_DEPTH`). O deslocamento é suavizado (meia-vida de 110 ms) e o laço só
roda enquanto o céu ainda está alcançando o globo. Estrelas são tiles repetidos
(nunca acaba o céu); a nebulosa é limitada. O fundo é bem escuro (quase preto).
Com `prefers-reduced-motion` o fundo fica parado.
