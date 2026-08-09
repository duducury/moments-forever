# Arquitetura

## Recomendação

Usar uma combinação de app mobile e web:

- **Mobile:** React Native + Expo Development Builds, inicialmente iOS.
- **Web:** Next.js com renderização no servidor para páginas públicas.
- **API:** serviço TypeScript modular, consumido por ambos os clientes.
- **Identidade e dados:** Supabase Auth + PostgreSQL/PostGIS + Row Level Security.
- **Mídia:** Cloudflare R2 privado, upload direto assinado e entrega por CDN/edge autorizada.
- **Mapas:** MapLibre com tiles gerenciados e provedor substituível.
- **Jobs:** fila gerenciada para limpeza, reconciliação e tarefas assíncronas.

Um monorepo pode compartilhar tipos, validações e cliente de API. Componentes visuais web/mobile não devem ser forçados a compartilhar implementação.

## Comparação de plataformas

### iOS nativo

Melhor integração com PhotoKit, memória, processamento em segundo plano e NFC. Em troca, exige Swift e uma segunda implementação futura para Android. É a escolha técnica mais forte caso testes revelem que o pipeline de centenas de fotos não é confiável em React Native.

### React Native / Expo

Melhor equilíbrio para uma equipe pequena e futuro Android. O seletor, metadados e upload são viáveis, mas o projeto exigirá Development Builds e possivelmente módulos nativos; Expo Go não basta. Deve ser validado com um protótipo de 500–2.000 fotos antes de consolidar a escolha.

### PWA

Boa para visualização e distribuição, ruim como importador principal no iPhone: acesso limitado à biblioteca, processamento em segundo plano frágil e Web NFC indisponível no iOS. Não atende sozinha ao produto.

### Combinação

Recomendada: web para acesso instantâneo via NFC e mobile para importar/administrar. Preserva a experiência sem instalação e usa capacidades nativas onde são necessárias.

## Supabase ou infraestrutura própria

### Opção A — Supabase Auth + PostgreSQL/PostGIS/RLS + R2

Entrega autenticação, recuperação de conta, sessões, banco gerenciado, backups e RLS sem construir esses sistemas. PostGIS atende mapas; R2 mantém mídia e egress separados. Exige políticas RLS testadas, controle da service role e monitoramento de limites/custos do Supabase.

### Opção B — Auth próprio + PostgreSQL próprio + R2

Oferece controle máximo e pode reduzir custo apenas em grande escala com equipe operacional madura. No MVP, aumenta risco de falhas em senha, sessão, recuperação, e-mail, backups, atualizações e disponibilidade. “Próprio” não é automaticamente mais barato ou seguro.

### Decisão do MVP

Adotar a Opção A. Clientes usam sessão Supabase e permissões mínimas. A API continua responsável por operações privilegiadas, publicação, cotas e URLs assinadas do R2. RLS é defesa obrigatória, não substituto de validação na API. A service role nunca chega aos clientes. Mídia não usa Supabase Storage.

## Fluxos

1. Mobile autentica com Supabase e cria memória privada em rascunho.
2. Dispositivo analisa arquivos autorizados e apresenta grupos.
3. API reserva ativos e emite uploads assinados com cotas.
4. Mobile envia derivados diretamente ao R2 e confirma checksums.
5. API publica somente ativos completos.
6. Publicação da memória exige ação explícita do proprietário.
7. NFC abre diretamente `/trip/{slug}`; web aplica visibilidade e recebe URLs de mídia autorizadas.

## Evolução por escala

- **100–1.000 usuários:** serviços gerenciados, uma API modular e jobs simples.
- **10.000:** réplicas de leitura, cache de páginas públicas, filas e observabilidade de custo.
- **100.000:** autoscaling, endpoints de mapa por viewport, particionamento operacional de jobs e CDN agressiva.
- **1.000.000:** separar serviços somente pelos gargalos medidos, particionar tabelas volumosas e distribuir mídia/regiões conforme tráfego.

PostgreSQL, objetos e API escalam separadamente. Não adotar microsserviços no MVP.

## Pontos de substituição

Contratos isolam autenticação, mapas, geocodificação, storage e fila. Isso reduz lock-in sem criar uma camada abstrata para tudo.
