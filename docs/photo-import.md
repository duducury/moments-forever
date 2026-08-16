# Importação de fotos

## Papel no produto

A importação assistida é uma experiência central do MVP, não um upload em massa. O produto deve ajudar o usuário a compreender e selecionar a viagem antes de transmitir qualquer foto.

## Restrição essencial

No iOS, o usuário controla quais itens o app pode acessar. “Analisar a biblioteca” não significa acesso silencioso a tudo. O fluxo deve usar PhotoKit/seletor nativo, explicar permissões limitadas e funcionar quando metadados estiverem ausentes.

## Protótipo Stage 2 — web

Decisão aprovada: esta etapa existe somente na rota web `/import`, com tipos
serializáveis e regras puras compartilhadas. O app mobile continua sendo o
produto oficial e não muda nesta etapa. O protótipo não faz upload, chamadas de
backend, geocodificação, IA, publicação nem armazenamento remoto.

O navegador recebe apenas os arquivos escolhidos no seletor do sistema; isso
não equivale a uma API de álbum ou biblioteca do iPhone. `exifr` lê localmente
um conjunto restrito de campos. `DateTimeOriginal` é a primeira opção e
`CreateDate` a segunda. `File.lastModified` é somente fallback explicitamente
rotulado como data de modificação do arquivo — nunca é apresentado como data de
captura. Sem essas fontes, a data permanece `null`.

### Agrupamento padrão

As regras são determinísticas, na prioridade: local + proximidade temporal,
local, data e desconhecido. A distância é Haversine e o índice espacial evita
comparar indiscriminadamente todos os pares. Os padrões são raio de **2 km** e
janela de **6 horas**. Grupos geográficos recebem somente “Local 1”, “Local 2”
etc.; coordenadas arredondadas a 2 casas podem ser habilitadas por configuração,
mas cidade e ponto turístico nunca são inventados. Fotos sem GPS são agrupadas
pela data disponível, e ausências continuam identificadas como desconhecidas.
O fingerprint local (nome, bytes, modificação e tipo) apenas sinaliza possíveis
duplicatas; nenhum arquivo é descartado.

### Revisão manual dos grupos

O resultado automático é uma sugestão local e revisável. Após a análise, a tela
mantém uma cópia editável dos grupos sem recalcular nem alterar a regra de
2 km + 6 horas. Em um modo explícito de organização, o usuário pode mover fotos,
dividir ou criar grupos, unir grupos e usar o bucket “Desconhecido”.

A seleção usada para organizar é independente da seleção que define quais fotos
continuarão na importação. Operações preservam os IDs e metadados das fotos,
removem grupos vazios e mantêm cada foto em exatamente um grupo. Grupos alterados
manualmente deixam de afirmar agregados automáticos de local ou data. Toda essa
revisão continua somente no dispositivo e é descartada ao reiniciar o fluxo.

### Worker e memória

O Web Worker processa sequencialmente em blocos de 8, publica progresso por
item e isola falhas. Quando disponíveis, `createImageBitmap` e
`OffscreenCanvas` geram prévias JPEG de até 320 px; bitmaps são fechados após o
uso. Sem esse suporte, a grade cria URLs dos arquivos originais somente para a
página expandida de até 24 itens. A prévia grande existe apenas para a foto
ativa. Toda URL é revogada em desmontagem, reset, fechamento ou saída da página.
As referências `File` ficam em registro local e o estado React guarda apenas
metadados serializáveis.

HEIC e RAW podem não decodificar ou não expor todo o EXIF conforme navegador e
codec do sistema; o item mantém campos nulos e avisos honestos. No iOS web, o
seletor, codecs, memória e execução de Worker continuam sujeitos ao Safari. A
integração nativa com PhotoKit fica para uma etapa mobile futura.

## Pipeline alvo do produto

1. Usuário toca em “Adicionar fotos”.
2. Autoriza biblioteca, álbum ou seleção pelo sistema operacional.
3. App indexa somente os ativos permitidos, sem upload.
4. Extrai data/hora, GPS, dimensões, bytes, formato e EXIF disponível.
5. Normaliza fuso horário com cautela e sinaliza duplicatas por fingerprint local; checksum de conteúdo fica para uma etapa futura.
6. Propõe uma viagem e seus lugares por intervalos temporais e proximidade.
7. Mostra grupos com nome sugerido, quantidade e fotos.
8. Usuário pode selecionar tudo, desmarcar tudo, selecionar/desmarcar grupo e alternar fotos individuais.
9. Usuário revisa nomes, une ou separa grupos e remove localização quando quiser.
10. App estima volume final; somente itens selecionados geram derivados e upload após confirmação.

Cidade e país não estão garantidos no EXIF. Geocodificação reversa pode enviar coordenadas selecionadas, em lotes e com consentimento, sem enviar pixels. Resultados são sugestões editáveis e cacheadas.

## Geocodificação reversa (Nominatim)

Após o agrupamento por GPS, o servidor consulta o Nominatim/OSM **uma vez por
lugar/cluster** (nunca por foto). Somente latitude/longitude são enviados.

- Política: máx. 1 req/s, User-Agent identificando o app, cache agressivo.
- Resultado útil (ilha/cidade/município — não vilarejo OSM) grava em `places.name` se
  `canApplySuggestedPlaceName` permitir.
- Falha/timeout/429 não quebra o import; permanece o fallback `Lugar N`
  (legado: `Local N` ainda é tratado como genérico).
- Viagens antigas: `POST /api/experiences/[id]/identify-places` (“Identificar
  lugares”).
- Cache: memória do processo + reuso de `places` já nomeados do mesmo usuário
  (sem migration neste estágio).

Uma importação = **uma** Experience (viagem). Grupos GPS são **lugares** (pastas)
dentro dela, não viagens. No `/perfil`, a grade lista essas pastas/lugares (álbuns raiz). Clicar numa
pasta abre `/perfil/[slug]/album/[id]` com mapa e fotos só daquele lugar —
não há página intermediária da Experience completa.
Adicionar fotos numa viagem existente (`placement: "gps"`) reutiliza/cria
lugares na mesma Experience.

A UI resolve: nome confirmado → sugestão em `places.name` → fallback `Lugar N`.
Renomear um álbum confirma o place ligado e não altera o GPS.

### Destino na web (`/import`)

Depois de escolher as fotos, criar um álbum novo ou adicionar a um álbum
existente **encerra** o fluxo: não há etapa seguinte de juntar/organizar lugares.
A revisão de grupos GPS permanece só no caminho completo de análise (ex.: primeira
viagem sem álbuns ainda).

## Upload

- Gerar derivados em fila limitada para não esgotar memória/bateria.
- Não enviar itens desmarcados nem gerar trabalho remoto para eles.
- Persistir sessão e estado por item para pausar e retomar.
- Upload direto assinado, idempotente e verificado por checksum.
- Permitir continuar em primeiro plano; processamento prolongado em background depende das regras do iOS e não pode ser prometido.
- Publicar a memória somente com itens confirmados; falhas parciais permanecem revisáveis.

## Casos críticos de teste

500–2.000 fotos, iCloud com ativos não baixados, permissão limitada, HEIC, RAW, screenshots, Live Photos, fotos editadas, EXIF removido, fusos diferentes, GPS incorreto, pouca bateria, pouco espaço, troca de rede e encerramento do app.

## Privacidade

Análise local não gera telemetria com coordenadas brutas. Logs removem nomes, hashes e GPS. O usuário vê quais campos serão usados e pode remover localização antes de publicar.
