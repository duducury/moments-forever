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
- Título: bandeira + nome em serifa grande; a última palavra do nome vai na cor de acento. Abaixo, país/estado em caixa alta cobre; depois data e quantidade de fotos, cada uma com ícone (calendário e imagem).
- Decoração: rota tracejada e um pequeno avião (SVG inline, cor de acento, opacidade baixa) atrás do título; `pointer-events: none`, `aria-hidden`, `z-index` atrás do texto, menor no celular. Mantê-la leve: sem imagem, sem animação.
- Mapa: cantos de 22 px, borda cobre sutil e sombra; funções preservadas (marcadores de fotos, zoom, “Ver mapa completo”).
- Galeria: no celular continua de ponta a ponta (grade de 2 px); no desktop os quadros ganham 10 px de espaço e 14 px de raio.
- O botão “Escolher capa” não é exibido dentro da viagem nem do lugar. A foto de capa continua nos dados e nos cartões do perfil.

**Viagem (`/trip/{slug}`, `/perfil/{viagem}`)**: bandeira + “Cidade, País”, título grande e etiquetas de data, fotos e lugares, com um fio fino cobre/salmão embaixo.

Não reintroduzir cartão ou altura fixa no cabeçalho, nem dados de exemplo da referência: tudo vem dos dados reais.

## Conteúdo e estados

Tratar explicitamente coleção vazia, memória sem GPS, EXIF ausente, upload pausado, link privado, indisponibilidade e exclusão. Nunca insinuar que análise local reconheceu um lugar com certeza quando apenas estimou um grupo.

## Validação antes de código

Prototipar e testar: toque NFC até primeira foto, navegação com uma mão, revisão de 500 fotos, memória privada e mapa sem geolocalização completa.
