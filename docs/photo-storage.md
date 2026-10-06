# Armazenamento de fotos

## Princípio

O MVP guarda somente derivados adequados à experiência, nunca originais. As prioridades, nesta ordem, são baixo custo, boa qualidade, carregamento rápido, segurança e escalabilidade. Dimensão e qualidade perceptual importam mais que uma meta fixa de kilobytes.

## Variantes

- **Thumbnail:** grids, clusters, mapa e previews pequenos; lado maior ~640 px (WebP/JPEG no dispositivo).
- **Preview:** visualização normal/tela cheia e capas; lado maior ~1.600 px (WebP/JPEG no dispositivo). Fotos mais antigas podem ainda estar em JPEG ~2.048 px até reprocessamento.
- **Original:** proibido no fluxo do MVP; extensão futura premium com consentimento, cota, preço e retenção próprios.

### Compatibilidade de chave R2 (MVP)

No bucket, o objeto sob a variante de caminho `original` **é o preview** (não o arquivo da câmera). O cliente continua pedindo `variant=full` / IndexedDB `full` para esse ativo. Renomear a chave na API (`preview`) fica como follow-up; fotos já enviadas antes desta regra podem ainda ser originais de câmera até reprocessamento.

### Entrega rápida (cliente)

O HTML já inclui `<img src="/api/media/{id}?variant=…">` no primeiro paint (SSR), sem esperar IndexedDB nem URLs assinadas. Visitantes baixam na hora; no aparelho que importou, blobs locais substituem o proxy quando existirem. No lightbox a miniatura do grid permanece visível (é a foto) até o preview `full` estar decodificado. Em descanso só a foto aberta está no DOM (tela cheia, sem transform). Vizinhas só montam no gesto, deslocadas em pixels (`±largura do palco`). Um trilho de 3 slides no Safari pintava a única vizinha existente: primeira abria a segunda, última abria a penúltima. Não há tela preta nem placeholder cinza entre uma foto e outra. Prefetch e setas não circulam da última para a primeira. `/api/media/[id]` entrega os **bytes** (não um 302) com cache CDN longo para fotos de perfil público. Prefetch de bytes full fica só na janela atual ± vizinhas. Cards de perfil usam thumbnail (~640 px); capa/hero e lightbox usam o preview. Fotos novas são WebP quando o aparelho consegue gerar.

Formatos modernos podem ser negociados no web, mantendo fallback amplamente compatível. HEIC/RAW precisam de orientação, cor e conversão testadas. Metadados úteis vão ao banco; EXIF e GPS são removidos dos arquivos entregues.

## Pipeline

1. Dispositivo normaliza orientação e gera derivados (thumb + preview).
2. Calcula checksum, dimensões e bytes (dos derivados).
3. API valida cota e emite URLs assinadas curtas.
4. Upload vai diretamente ao R2, com retomada quando necessário.
5. Confirmação torna o ativo elegível para publicação.
6. Job remove sessões expiradas e objetos órfãos.

Processamento no servidor é fallback e verificação, não caminho padrão do MVP.

## CORS do bucket (upload direto)

O navegador (ou o WebView do app iOS) faz o `PUT` **direto no R2**, com a URL assinada por `/api/media/upload-url` (`apps/web/src/lib/storage/r2.ts`). Isso só funciona se o CORS do bucket permitir a origem da página que está enviando. Sem isso o upload falha, a foto fica só no aparelho (IndexedDB) e o registro em `photos` fica com `storage_key` nulo — na web aparece um quadrado com "?".

**Configuração atual de referência:** `docs/r2-cors.json`. Cole em Cloudflare → R2 → o bucket → Settings → CORS Policy.

- **Origem:** é a origem da página, não do R2. No app iOS (Capacitor) é a origem de `server.url` em `apps/web/capacitor.config.ts`: `https://momentsforever.vercel.app` por padrão, ou o valor de `CAPACITOR_SERVER_URL` quando um build de teste aponta para outro endereço. Produção web e app da App Store usam a mesma origem, então a regra acima basta para eles.
- **Método:** só `PUT`. A leitura passa por `/api/media`, não pelo R2 direto.
- **Header:** o navegador envia `Content-Type` (não é um header "simples" para `image/jpeg`, por isso há preflight). A URL assinada assina apenas o `host`, então nenhum outro header é exigido.
- **Preview da Vercel (só para testar):** cada deploy tem uma origem diferente (`https://moments-forever-<hash>-<time>.vercel.app`). Para testar um build do iPhone apontado para um preview, adicione **a origem exata daquele deploy** em `AllowedOrigins` e remova depois. Não use curinga: isso liberaria o upload para qualquer site. A alternativa sem mexer no CORS é testar o app apontado para produção.
- **Se o upload falhar**, a mensagem do app já mostra a origem usada ("Origem deste app: …"): é ela que precisa estar na regra. As fotos continuam no aparelho e o app oferece "Tentar enviar novamente" (e o `PendingR2Sync` tenta de novo ao abrir a viagem, na mesma origem em que foram adicionadas — o IndexedDB é por origem).

## Entrega

Bucket não é público. Uma camada edge valida acesso:

- mídia pública pode usar cache CDN longo e chaves versionadas;
- mídia privada usa autorização curta e não entra em cache público compartilhado;
- mapa, grids e cards de perfil recebem somente thumbnails;
- capas grandes (hero do álbum) e lightbox usam o preview (`full` / chave `original`);
- `/api/media/{id}` entrega os bytes (URL estável, cacheável); fotos de perfil público podem ir ao CDN; fotos só do dono ficam em cache privado;
- URLs de objeto não revelam usuário, local ou título.

Cloudflare R2 armazena a mídia, separado do Supabase Auth/PostgreSQL. Isso evita usar o banco ou Supabase Storage para arquivos pesados. R2 reduz egress dentro do ecossistema Cloudflare, mas operações, transformação e fornecedor continuam sendo custos/risco. O modelo de `media_variants` e o contrato de storage permitem adicionar `original` ou migrar fornecedor sem redesenhar memórias.

## Controle de custo

- Cotas por conta, memória, importação e período.
- Reserva de bytes antes do upload e limite de concorrência.
- Imagens responsivas; nunca entregar preview grande para célula pequena.
- Cache imutável por versão e proteção contra hotlink/abuso.
- Métricas de bytes armazenados, enviados, cache hit e operações por conta.
- Rate limit e orçamento para transformações; evitar transformação arbitrária por URL.

## Decisões a validar

Qualidade e dimensões finais exigem comparação visual em telas Retina, fotografias noturnas e panoramas. A política futura de original deve definir exportação, responsabilidade de backup e cobrança antes de ser oferecida.
