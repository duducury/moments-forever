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

A capa e primeiras thumbnails têm prioridade. Grid usa carregamento virtualizado e imagens responsivas. A galeria e o lightbox seguem a ordem de posição; a capa fica só no hero, sem pular para o início da grelha. Em tela cheia só a foto tocada está visível até o gesto; as vizinhas não ficam no DOM em descanso (isso fazia a primeira abrir a segunda e a última a penúltima no iPhone). Mapa só busca dados do viewport e nível de zoom. Na página de álbum, o HTML crítico (capa + galeria) não espera o bloco “Veja também”; MapLibre do mapa em destaque entra após idle para não competir com as primeiras fotos. No perfil (`/{nome}`), Destaques entram com o grid; só o mapa inferior faz stream e o MapLibre carrega perto do viewport.

## Conteúdo e estados

Tratar explicitamente coleção vazia, memória sem GPS, EXIF ausente, upload pausado, link privado, indisponibilidade e exclusão. Nunca insinuar que análise local reconheceu um lugar com certeza quando apenas estimou um grupo.

## Validação antes de código

Prototipar e testar: toque NFC até primeira foto, navegação com uma mão, revisão de 500 fotos, memória privada e mapa sem geolocalização completa.
