# Moments Forever

**Slogan:** “Colecione momentos, não coisas.”

**Experiência principal:** “Toque no ímã. Reviva a memória.”

Moments Forever transforma viagens e outras lembranças em experiências digitais acessadas por objetos físicos, inicialmente ímãs NFC. Cada NFC representa uma única experiência/álbum e sempre abre diretamente sua URL permanente; a partir dela, o visitante pode explorar outras experiências permitidas.

## Princípios

- Fotografia como protagonista; interface simples, emocional e mobile first.
- Prioridade da experiência: fotos, mapa e somente então informações básicas.
- Visualização pública sem login; administração sempre autenticada.
- Toda nova experiência é privada até o proprietário publicá-la.
- Processamento local antes do upload; originais não são armazenados automaticamente.
- Custos de mídia, banda e mapas são limites de produto, não detalhes posteriores.
- Não é planejador de viagens, rede social nem substituto do Google Photos.

## MVP

Conta, coleção, criação e edição de experiência, importação assistida com metadados locais, upload confirmado de imagens otimizadas, galeria, mapa, página pública/privada, URL permanente e associação administrativa de NFC.

## Stack recomendada

React Native com Expo Development Builds no mobile, Next.js no web, API TypeScript modular, Supabase Auth + PostgreSQL/PostGIS/RLS, Cloudflare R2 e CDN/edge para mídia, e MapLibre para mapas.

## Decisões permanentes

- App mobile + web público, compartilhando contratos e domínio, não a interface.
- No MVP, uma experiência possui um NFC principal; ele contém somente sua URL HTTPS direta.
- Slug canônico imutável: NFC nunca aponta apenas para a homepage.
- Derivados de imagem são os ativos principais; original será opcional no futuro.
- Localização exata permanece privada; a visão pública usa lugar ou posição aproximada.
- Acesso a mídia privada nunca depende de URL obscura.
- IA, vídeo, pagamentos e recursos sociais ficam fora do MVP.
