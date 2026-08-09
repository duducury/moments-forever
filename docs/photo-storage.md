# Armazenamento de fotos

## Princípio

O MVP guarda somente derivados adequados à experiência, nunca originais. As prioridades, nesta ordem, são baixo custo, boa qualidade, carregamento rápido, segurança e escalabilidade. Dimensão e qualidade perceptual importam mais que uma meta fixa de kilobytes.

## Variantes

- **Thumbnail:** grids, clusters e previews; tamanhos responsivos pequenos.
- **Preview:** visualização normal/tela cheia, com lado maior inicialmente próximo de 2.048 px.
- **Original:** proibido no fluxo do MVP; extensão futura premium com consentimento, cota, preço e retenção próprios.

Formatos modernos podem ser negociados no web, mantendo fallback amplamente compatível. HEIC/RAW precisam de orientação, cor e conversão testadas. Metadados úteis vão ao banco; EXIF e GPS são removidos dos arquivos entregues.

## Pipeline

1. Dispositivo normaliza orientação e gera derivados.
2. Calcula checksum, dimensões e bytes.
3. API valida cota e emite URLs assinadas curtas.
4. Upload vai diretamente ao R2, com retomada quando necessário.
5. Confirmação torna o ativo elegível para publicação.
6. Job remove sessões expiradas e objetos órfãos.

Processamento no servidor é fallback e verificação, não caminho padrão do MVP.

## Entrega

Bucket não é público. Uma camada edge valida acesso:

- mídia pública pode usar cache CDN longo e chaves versionadas;
- mídia privada usa autorização curta e não entra em cache público compartilhado;
- mapa recebe somente thumbnails;
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
