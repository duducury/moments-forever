# MVP

## Objetivo

Validar o ciclo essencial: criar uma memória privada, transformar uma seleção de fotos em uma experiência visual, publicá-la e abri-la diretamente por um ímã NFC.

## Incluído

- Cadastro, login, recuperação de conta e sessão com Supabase Auth.
- Coleção privada do proprietário.
- Criar e editar uma memória privada por padrão; publicar exige confirmação.
- Título, país, cidade, período, capa, descrição opcional e visibilidade.
- Fluxo “Adicionar fotos” com seleção de biblioteca, álbum ou fotos permitidas no iOS.
- Leitura local de data, GPS, dimensões, tamanho, formato e EXIF disponível.
- Agrupamento local por tempo e proximidade, com nomes sugeridos e revisão antes do envio.
- Selecionar/desmarcar tudo, grupo ou foto individual.
- Geração de thumbnail e preview; upload direto após confirmação.
- Grid, foto em tela cheia e navegação anterior/próxima.
- Mapa progressivo: memórias no zoom distante, lugares no médio e fotos no próximo, com clustering.
- Localização exata para o proprietário e representação pública aproximada.
- Página pública sem login e memória privada acessível somente ao proprietário.
- Slug permanente e NFC principal abrindo diretamente a memória.
- Operações, limites e métricas básicas de custo e falha.

## Fora do MVP

- Vídeos, armazenamento automático de originais e backup da biblioteca.
- Convites, compartilhamento privado entre contas e coleção pública completa.
- IA avançada, reconhecimento de pontos turísticos, seleção estética e vídeos automáticos.
- Escrita/leitura NFC dentro do app; kits podem ser programados externamente.
- Android, Apple Watch, PWA de administração, edição avançada de imagens e offline completo.
- Feed, comentários, curtidas, seguidores e mensagens.
- Pagamentos, planos pagos e logística de produtos físicos.
- Timeline automática, diário, restaurantes, hotéis e planejamento.

## Critérios de sucesso

- Uma memória de centenas de fotos pode ser revisada sem enviar arquivos antes da confirmação.
- Somente fotos selecionadas são enviadas.
- O primeiro conteúdo visual público carrega rapidamente em rede móvel.
- Nenhum teste de autorização permite acesso cruzado a memória ou mídia privada.
- Nenhuma consulta pública retorna automaticamente GPS exato.
- Custos por memória e por visualização são mensuráveis.
- O NFC abre diretamente a memória e sua URL continua válida após as edições.

## Guardrails iniciais

Limites configuráveis de fotos por importação, tamanho processado, concorrência de upload e armazenamento por conta. Os valores finais dependem de testes reais de qualidade, memória e custo.
