# NFC

## Modelo

Cada NFC representa uma única memória/álbum e abre diretamente essa memória, nunca somente a homepage. O NFC guarda apenas sua URL HTTPS canônica:

`https://momentsforever.com/trip/{slug-imutavel}`

Fotos, tokens, dados privados e lógica não ficam na tag. A URL resolve no web, com ou sem app instalado. Depois de entrar, o visitante pode navegar para outras memórias que tenha permissão para ver.

## Cardinalidade

No MVP: uma memória possui um NFC principal. O modelo permite futuramente várias tags apontando para a mesma memória, cada uma com identidade operacional própria. Uma tag nunca aponta para várias memórias.

## Permanência

O slug é identidade pública imutável. Alterações de título, capa, conteúdo, lugar e privacidade não mudam a URL. Slugs não são reciclados. Migração de domínio exige redirects de longo prazo e manutenção do domínio antigo.

## MVP operacional

- Criar memória e URL.
- Copiar e testar URL.
- Registrar o NFC principal associado à memória.
- Programar tags por ferramenta/processo externo.
- Verificar leitura em iPhone e Android.

Escrita e leitura NFC dentro do app ficam fora do MVP. Isso evita módulos nativos e permissões antes de validar o kit físico.

## Tags

Usar tags NDEF compatíveis, com capacidade suficiente para a URL. Depois de gravada e testada, a tag pode ser bloqueada somente se o processo de substituição estiver definido. Tag bloqueada impede reprogramação; tag desbloqueada permite adulteração física.

## Segurança

NFC não autentica visitante e não torna uma memória privada acessível. Slug não é segredo. Memória privada exige sessão/concessão; ao abrir sem autorização, a página revela o mínimo. Rate limiting e detecção de abuso protegem URLs públicas.

## Questões antes da produção física

- Tags serão bloqueadas contra escrita?
- Quem programa, testa e substitui tags defeituosas?
- Haverá identificador de inventário separado da URL?
- O domínio canônico está decidido e protegido para uso de longo prazo?
