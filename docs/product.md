# Produto

## Objetos principais

- **Coleção:** conjunto de memórias de uma pessoa.
- **Memória:** viagem independente, com identidade, período, capa, lugares e privacidade.
- **Lugar:** agrupamento revisável de fotos em uma região ou ponto visitado.
- **Momento:** foto associada a data, posição opcional e lugar opcional.
- **NFC:** vínculo físico de uma única memória que resolve diretamente para sua URL permanente.

## Jornadas essenciais

### Visitante

1. Toca no ímã ou abre o link.
2. Entra diretamente na memória associada, nunca apenas na homepage.
3. Vê fotos sem autenticação quando a memória é pública.
4. Navega em grid, tela cheia e mapa.
5. Consulta informações básicas sem transformar a memória em diário.
6. Pode sair e explorar outras memórias permitidas.

### Proprietário

1. Entra na conta e cria uma memória.
2. Toca em “Adicionar fotos” e seleciona biblioteca, álbum ou fotos permitidas.
3. Aguarda análise e agrupamento locais, sem upload.
4. Seleciona ou desmarca tudo, grupos ou fotos individuais.
5. Confirma somente o conteúdo desejado para envio.
6. Publica explicitamente e associa a URL ao NFC principal.

## Regras do produto

- Uma foto pode existir em uma memória no MVP.
- Toda nova memória é privada por padrão.
- Alterar título, capa ou fotos não altera a URL.
- No MVP, uma memória possui um NFC principal; múltiplas tags por memória ficam previstas para o futuro.
- Privada significa acesso do proprietário no MVP; convidados autorizados ficam para depois.
- A coleção pública é opt-in e não expõe memórias privadas.
- Localização exata pode existir para o proprietário, mas a visão pública usa lugar, posição aproximada ou mapa oculto.
- A página prioriza fotos, mapa e informações básicas, nessa ordem.

## Estados relevantes

Memória: rascunho, processando, publicada ou arquivada; visibilidade inicial privada. Publicar exige ação explícita. Uploads incompletos não são publicados. Exclusão usa período de recuperação antes da remoção definitiva.

## Decisões pendentes de produto

- A coleção do proprietário ficará somente privada no MVP ou terá publicação opt-in?
- Qual aproximação pública usar: lugar nomeado, centro do cluster ou coordenada arredondada?
- Qual é o período de recuperação após exclusão?
- O primeiro kit NFC será vendido já programado ou programado pelo app?
