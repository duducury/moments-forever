# Mapas

## Tecnologia

MapLibre no web e mobile, com provedor de tiles vetoriais configurável. Começar com serviço gerenciado e termos claros para uso público; não hospedar tiles no MVP. PostGIS mantém os dados próprios. Geocodificação e tiles têm contratos separados para evitar lock-in.

## Mapa da experiência (Stage 1 web)

Há **um único mapa por viagem** (`/trip/[slug]`), com todos os GPS da Experience.
Clique em um pin/cluster: `flyTo` suave + preview de miniaturas no próprio mapa.
“Abrir lugar” navega para `/trip/[slug]/album/[albumId]`. Zoom out volta a mostrar
todos os locais. Páginas de álbum não hospedam mapa próprio — apenas linkam o
mapa da viagem. Tiles permanecem claros (CARTO Voyager) mesmo em Dark Mode.

## Hierarquia por zoom

- **Zoom distante:** exatamente um pin ou cluster representativo por memória visível, como Dubai, Bali ou New York.
- **Zoom médio:** lugares confirmados daquela memória, como Burj Khalifa, Dubai Mall e Museum of the Future.
- **Zoom próximo:** pins individuais das fotos autorizadas dentro do viewport.

Essa progressão é regra do produto. Limites numéricos de zoom, densidade da tela e viewport serão calibrados para preservá-la. Clustering é obrigatório quando necessário; centenas de pins individuais nunca aparecem em zoom distante.

## Consulta e renderização

O cliente envia bounding box, zoom e contexto autorizado. A API retorna somente o nível correspondente — memória, lugar ou foto — com IDs estáveis, coordenadas, contagens e thumbnail pequena quando apropriado. PostGIS filtra por viewport; clustering começa no servidor quando o volume exigir e pode ser cacheado para memórias públicas.

Mapa nunca recebe originais nem a lista inteira de fotos em zoom distante. Thumbnails carregam sob demanda. Marcadores são acessíveis e a galeria oferece alternativa ao conteúdo espacial.

## Mapa mundial

Países e cidades são derivados de lugares confirmados, não de inferência silenciosa. O destaque de país é sutil. Selecionar um país filtra memórias permitidas e depois cidades. Contagens agregadas não podem revelar memória privada.

## Privacidade

O proprietário vê posição exata quando disponível. Visitantes públicos recebem por padrão o lugar confirmado ou uma posição aproximada, nunca GPS exato automático. O proprietário pode escolher entre posição aproximada, somente lugares ou mapa oculto na visualização pública. A mudança de precisão ou visibilidade invalida caches relacionados.

## Custo e resiliência

- Restringir chaves por domínio/app e monitorar requisições por sessão.
- Cachear tiles conforme licença e respostas agregadas próprias.
- Buscar apenas após movimento estabilizado e cancelar requests obsoletos.
- Definir teto mensal e fallback sem mapa, mantendo a galeria funcional.
- Não usar geocodificação a cada visualização; resolver uma vez e cachear.

## Validação

Testar memórias sem GPS, milhares de fotos no mesmo lugar, viagens multilocalidade, antimeridiano, zoom rápido, conexão ruim e transições de privacidade.
