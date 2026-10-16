# UI e experiência

## Direção

Premium, calma e fotográfica. Muito espaço, tipografia legível, paleta curta, superfícies discretas e movimento que esclarece navegação. A marca não deve competir com as imagens.

## Estrutura

### Memória pública

Capa e identidade curta, seguida imediatamente pela galeria. A hierarquia é: fotos, mapa e informações básicas. Não há diário, painel ou estatísticas excessivas. Um caminho discreto permite sair e explorar outras memórias permitidas.

### Galeria em grid

Visão rápida de todas as fotos, com thumbnails responsivas, densidade equilibrada e poucos controles. A fotografia ocupa a maior parte da tela.

### Galeria em tela cheia

Imagem em tela cheia, gesto horizontal, zoom previsível, fundo neutro e controles que desaparecem. Metadados ficam secundários.

### Coleção

Capas grandes, título, local e período. Contagens de memórias, países e cidades aparecem uma vez, sem dashboard.

### Importação

Fluxo principal de administração: “Adicionar fotos”, selecionar, analisar localmente, revisar grupos, alternar seleção total/grupo/foto, confirmar e acompanhar envio. Nunca apresentar apenas “Upload de 500 fotos”. O usuário sempre entende o que será enviado.

## Design system inicial

- Tokens para espaço, cor, raio, tipografia, elevação e duração.
- Alvos de toque de pelo menos 44 × 44 pt.
- Contraste WCAG AA, foco visível, texto alternativo e suporte a movimento reduzido.
- Skeletons proporcionais evitam saltos; imagens usam proporção conhecida.
- Animações curtas e interrompíveis; nenhuma bloqueia ações.

## Performance percebida

No atalho da tela inicial do iPhone, o primeiro quadro é a marca escura (ícone, slogan e pulso), nunca uma tela branca. O HTML de `/perfil` e `/{nome}` pinta na hora; a sessão e os dados do perfil resolvem por baixo do splash. `apple-touch-startup-image` precisa estar no HTML estático e no tamanho exato do aparelho. Salvar um host único `*.vercel.app` da Vercel (com SSO) abre uma tela branca de login — usar o domínio estável. Depois do deploy em produção, o ícone antigo da Home tem de ser apagado e o site real salvo de novo.

A capa e primeiras thumbnails têm prioridade. Grid usa carregamento virtualizado e imagens responsivas. A galeria e o lightbox seguem a ordem de posição; a página do lugar não mostra mais capa (ver “Cabeçalho da viagem e do lugar”). Em tela cheia só a foto tocada está visível até o gesto; as vizinhas não ficam no DOM em descanso (isso fazia a primeira abrir a segunda e a última a penúltima no iPhone). Mapa só busca dados do viewport e nível de zoom. Na página de álbum, o HTML crítico (cabeçalho + galeria) não espera o bloco “Veja também”; MapLibre do mapa em destaque entra após idle para não competir com as primeiras fotos. No perfil (`/{nome}`), Destaques entram com o grid; só o mapa inferior faz stream e o MapLibre carrega perto do viewport.

## Cabeçalho da viagem e do lugar

Referência visual: app de viagem premium, fundo escuro com acentos cobre/salmão (`--accent`), bordas sutis, cantos arredondados consistentes. Funciona nos temas escuro e claro porque usa só variáveis do tema. Não há foto de capa nem cartão (fundo, borda, sombra ou altura fixa) no topo.

**Lugar (`.../album/{id}`)**
- Desktop (≥ 720 px): título e detalhes à esquerda, mapa à direita, lado a lado, texto centralizado na altura do mapa. Celular (< 720 px): título e detalhes empilhados acima do mapa, com fonte própria (não é o desktop encolhido).
- Título: bandeira + nome em serifa grande; a última palavra do nome vai na cor de acento. Abaixo, país/estado em caixa alta cobre; depois data **em números** (dd/mm/aaaa – dd/mm/aaaa) e quantidade de fotos, cada uma com ícone (calendário e imagem).
- Decoração (`trip-route-art.tsx`): fundo genérico em SVG inline atrás do título, escuro e atmosférico, como um diário de viagem de luxo. Camadas: brilho quente de bronze/cobre atrás do título; continentes reconhecíveis como massas suaves iluminadas em bronze (gradiente radial, sem contorno técnico, com um halo desfocado e uma linha de costa quase invisível); duas famílias de curvas de nível topográficas perto da borda inferior; uma rota de voo tracejada elegante terminando num avião pequeno em salmão (girado na direção da rota e afastado do texto); uma segunda rota pontilhada bem discreta; e um detalhe de bússola perto da borda. **Sem pinos, marcadores de cidade ou rótulos**: a mesma arte serve para qualquer país, cidade ou viagem, não representa dados geográficos da viagem e não substitui o mapa interativo ao lado.
  - Contornos: `src/lib/geo/world-outline.ts` é gerado por `node scripts/build-world-outline.mjs` a partir de `public/geo/land-v1.json` (equiretangular, simplificado e suavizado com curvas quadráticas, ~21 KB). Não editar à mão; para mudar o detalhe, ajustar `TOLERANCE`/`MIN_AREA` no script e regenerar.
  - Cores: derivadas de `--accent` pelas variáveis `--route-1..3` em `.albumHeroRoute` (tema claro: tons mais escuros e opacidade menor). Uma máscara radial deixa o efeito mais forte ao redor do título e o esmaece até zero antes das bordas. A intensidade é deliberadamente baixa (continentes ~10–20 % de opacidade): o fundo não pode competir com título, data e contagem de fotos. Responsivo (`preserveAspectRatio="slice"` recorta em vez de achatar; no celular parte do desenho sai do enquadramento).
  - Regras: `aria-hidden`, `pointer-events: none`, `z-index: -1`, sem animação e sem dependências; um único filtro de desfoque estático.
- Mapa: cantos de 22 px, borda cobre sutil e sombra; funções preservadas (marcadores de fotos, zoom, “Ver mapa completo”).
- Galeria: **não faz parte deste design e não deve ser alterada**. Segue o estilo Instagram (3 colunas, quadros quadrados cortados em cover, 2 px de espaço, sem cantos arredondados, de ponta a ponta no celular), com as mesmas interações e o mesmo carregamento.
- Botões de ação (o cartão “Sobre essa viagem” está descrito na seção própria abaixo): “+ Adicionar fotos” é a ação primária (preenchida em cobre, com sombra quente); as demais são pílulas discretas de 42 px, com o mesmo espaçamento; ações e permissões não mudaram.
- O botão “Escolher capa” não é exibido dentro da viagem nem do lugar. A foto de capa continua nos dados e nos cartões do perfil.

**Viagem (`/trip/{slug}`, `/perfil/{viagem}`)**: bandeira + “Cidade, País”, título grande e etiquetas de data, fotos e lugares, com um fio fino cobre/salmão embaixo.

Não reintroduzir cartão ou altura fixa no cabeçalho, nem dados de exemplo da referência: tudo vem dos dados reais.

## Seção “Sobre essa viagem”

Experimento de design (em teste no Preview; decidir se fica antes de ir ao ar). Referência: composição editorial escura, **sem cartão** (sem fundo preenchido, borda ou sombra; a seção se funde ao fundo da página, escuro ou claro).

- **Rótulo e rota:** “SOBRE ESSA VIAGEM” em caixa alta cobre/salmão; dele sai uma **rota tracejada curva** que atravessa a largura da seção e termina num **pequeno avião** apontado para cima e à direita (SVG inline, sem animação).
- **Texto:** a história inteira é um único parágrafo em **serifa elegante, com um só tamanho (≈1,1–1,3 rem), uma só cor (marfim quente) e entrelinha ~1,65**, quebrando naturalmente; sem destaque de palavras em cobre (“Ler mais” se passar de 220 caracteres). Só o rótulo é cobre.
- **Detalhes:** localização discreta (ícone de pino; cidade e país da viagem; a data não se repete aqui) e “Editar história” como pílula **transparente, borda fina cobre e ícone de lápis** (só o dono).
- **Polaroids:** de 1 a 2 fotos **reais do próprio lugar** (a escolhida em “Editar história” — a mesma foto de capa do lugar — na frente, com uma **fita adesiva** no topo, inclinada ~3°; outra foto atrás, inclinada ~6° para o outro lado), molduras brancas com borda inferior grossa e sombra suave; sem fotos, só texto. Nada de nome de destino ou bandeira dentro das molduras. Decorativas (`aria-hidden`).
- **Carimbo dinâmico** (`trip-stamp.tsx`; lógica em `src/lib/geo/stamp-landmark.ts`): selo postal + carimbo circular, em SVG gerado a partir dos dados do destino, em traço fino cobre com desgaste de tinta (filtro de ruído), ~34 % de opacidade, atrás das fotos, `aria-hidden`, sem interação. O **selo** traz o nome da cidade (`primaryCity`; se faltar, o nome do lugar), em caixa alta e encolhido/cortado com “…” se longo, e o país embaixo; o **carimbo circular** traz o país em arco, estrelas, ticks e ondas de cancelamento. A **ilustração do selo** segue esta ordem de confiança, sem nada inventado:
  1. **Monumento**, só quando a cidade é reconhecida com certeza: hoje Dubai (Burj Khalifa), Paris (Torre Eiffel) e Londres (Big Ben). Reconhecimento, em ordem: (a) cada parte do nome do lugar separada por vírgula (“Emirados Árabes Unidos, Deira”): nome exato da cidade, primeira palavra de um nome curto (“Dubai Marina”) ou um bairro inequívoco no país certo (Deira, Montmartre, Westminster…); um país conhecido e diferente cancela (“Paris, Texas” não é Paris); (b) o **centro GPS das fotos do lugar** dentro de uma caixa urbana da cidade (não pega Sharjah nem Abu Dhabi como Dubai). Para outra cidade: incluir em `CITY_LANDMARKS` e desenhar a silhueta em `Landmark`.
  2. **Contorno real do estado (EUA) ou do país**, para qualquer destino cujo país seja conhecido (`stampShapeKey`): vem de `public/geo/stamp-shapes-v1.json` (~88 KB, ~30 KB comprimido, cache de 1 dia), gerado por `node scripts/build-stamp-shapes.mjs` a partir de `public/geo/admin-v1.json` (contornos de ~207 países e 52 estados/territórios dos EUA, simplificados; ilhas pequenas e territórios distantes são omitidos, e EUA/França mostram só o território principal). O arquivo é buscado uma vez por sessão e só quando o carimbo precisa dele; enquanto carrega, ou se falhar, aparece a bússola.
  3. **Bússola genérica** com o nome real, quando o país não é conhecido.
  Nada de destino fixo no componente; sem imagem por destino.
- **Responsivo:** rótulo e rota ocupam a largura toda; texto à esquerda e Polaroids à direita (≈ 41 % da largura, menos quando a história é longa); o carimbo desce no celular para não tocar no texto. Dois temas via variáveis. A galeria Instagram não é afetada.

## Nomes dos lugares (pastas)

Os nomes salvos seguem “País, Localidade” (ex.: “Emirados Árabes Unidos, Dubai”) e vários módulos (passaporte, perfil, jornada) dependem desse formato; ele não muda. A **exibição** sofre dois ajustes centrais em `packages/shared`:

- **Bairro conhecido vira a cidade** (`coarsenTravelLabel`, usado por `resolveLocationDisplayName` em todo lugar): “Emirados Árabes Unidos, Deira” aparece como “… Dubai”. Só vale com o país certo (Deira no Quênia não muda) e a lista (`DISTRICT_CITIES`) é pequena e inequívoca; novos bairros entram ali.
- **Ordem “Cidade, País” na página da viagem/lugar** (`placeLabelCityFirst`, aplicado em `loadTripAlbums`): “Emirados Árabes Unidos, Dubai” aparece como “Dubai, Emirados Árabes Unidos”. Só inverte quando a primeira parte é um país e a segunda não; “Cleveland, OH” e títulos escolhidos pelo dono ficam como estão. O cabeçalho, as migalhas, os cartões de lugar e o carimbo usam esse nome; `parsePlaceParts` aceita as duas ordens.

## Passaporte: ordem das seções

Identidade e estatísticas → livro do passaporte (capa “Passport · Toque para abrir”) → “Cada foto conta uma história” (pilha de Polaroids) → jornada → **Meu mundo** (mapa e “Você conhece X% do mundo”) → Conquistas. “Meu mundo” fica logo acima de Conquistas.

## Passaporte: “Cada foto conta uma _história_”

Seção logo abaixo do livro do passaporte (a capa “Passport”), no passaporte (`/passaporte` e o passaporte público `/{perfil}/passaporte`), com o título em itálico serifado editorial (Iowan Old Style / Palatino nos aparelhos Apple, Georgia como alternativa; só fontes do sistema; “história” em cobre; classe `.highlightsTitle`) e uma **pilha de Polaroids com fotos reais do dono do passaporte** (`PassportHighlights` → `PolaroidStack`, em `src/app/perfil/polaroid-stack.tsx`). O carrossel “Destaques” do perfil **não mudou**. A seção carrega por streaming (Suspense) para a consulta das fotos não atrasar o passaporte, reservando a altura (`.polaroidSkeleton`); sem fotos, a seção não aparece. As fotos vêm de `loadOwnerCarouselPhotos` (amostra aleatória entre os álbuns), até 6.

- **Animação “stacked photos”:** as fotos ficam empilhadas no mesmo lugar (uma célula de grade) e **uma por vez** desliza 120 % para o lado e volta, indo para trás; o resto do tempo a pilha fica parada. Sem Sass: como os keyframes dependem de `$n` (quantidade de fotos, conhecida só na execução), `src/lib/perfil/polaroid-keyframes.ts` calcula as porcentagens e o componente injeta o CSS (`@keyframes mf-polaroid-slide-N`, `…-z-N`, `…-z-last-N`): `slide` — `50/n %` → `translateX(120%)`, `0 %`, `100/n %` e `100 %` → `translateX(0)`, sempre com `rotate(var(--r))`; `z-order` — `z-index: 1` de `50/n %` a `100/n %`, volta a 2 em `100 − 100/n %` (a última foto usa `z-order-last`, que volta em `100 − 50/n %`; `steps(1)`). Cada cartão recebe `--i`, `--n`, `--r` (rotação estável de −19° a 20°, do id da foto) e `animation-delay: calc((1 − i) / n × d)`; `--d` = fotos × 2 s.
- **Polaroid:** moldura marfim (`#f5efe3`), proporção 1 : 1,2, sombra suave. A legenda mostra **bandeira e destino** quando o lugar da foto é conhecido (`shortPlaceCaption`) e, ao lado, o **ano** da captura (menor e mais claro; sem data, não aparece); sem destino, só o ano ou nada — nada é inventado. Cada foto é um link para a pasta da viagem.
- **Responsivo:** largura da Polaroid `--pw` = `clamp(128px, 40vw, 232px)` no celular (pilha + deslize = 2,2 × `--pw` cabe na página) e `clamp(210px, 26vw, 264px)` a partir de 720 px.
- **Pausas e acessibilidade:** para ao passar o mouse/focar, fora da tela (`IntersectionObserver`) e com `prefers-reduced-motion` (pilha estática levemente aberta). Miniatura primeiro; a versão grande só com a seção visível; sem dependências novas.

## Conteúdo e estados

Tratar explicitamente coleção vazia, memória sem GPS, EXIF ausente, upload pausado, link privado, indisponibilidade e exclusão. Nunca insinuar que análise local reconheceu um lugar com certeza quando apenas estimou um grupo.

## Validação antes de código

Prototipar e testar: toque NFC até primeira foto, navegação com uma mão, revisão de 500 fotos, memória privada e mapa sem geolocalização completa.
