# NFC

## Modelo

Cada NFC representa uma única memória/álbum e abre diretamente essa memória, nunca somente a homepage. O NFC guarda apenas sua URL HTTPS canônica:

`https://momentsforever.vercel.app/trip/{slug-imutavel}`

Fotos, tokens, dados privados e lógica não ficam na tag. A URL resolve no web, com ou sem app instalado. Depois de entrar, o visitante pode navegar para outras memórias que tenha permissão para ver.

## Cardinalidade

Uma tag aponta para exatamente um álbum raiz (destino) — nunca para "a viagem inteira" de forma ambígua. Uma experiência/viagem pode ter vários álbuns raiz (ex.: "Dubai" e "Bali" na mesma importação); cada um é uma memória própria e pode ter sua própria tag, independente das demais. `nfc_tags.album_id` é o identificador operacional real; `trip_id` (a experiência) é mantido para contexto/RLS, mas a resolução do link (`/n/[token]`) sempre usa o `album_id` gravado, nunca "o primeiro álbum da experiência".

## Permanência

O slug é identidade pública imutável. Alterações de título, capa, conteúdo, lugar e privacidade não mudam a URL. Slugs não são reciclados. Migração de domínio exige redirects de longo prazo e manutenção do domínio antigo.

## MVP operacional

- Criar memória e URL.
- Copiar e testar URL.
- Registrar o NFC principal associado à memória.
- Programar tags por ferramenta/processo externo.
- Verificar leitura em iPhone e Android.

Escrita e leitura NFC dentro do app ficam fora do MVP web. No app nativo iOS/Android (`apps/web/ios`, via Capacitor — ver `apps/web/capacitor.config.ts`), a gravação já é possível usando Core NFC / Android NFC através do plugin `@exxili/capacitor-nfc`, com fallback para Web NFC (Chrome/Android) e "copiar link" no Safari comum. Ver `src/lib/nfc/native-nfc.ts`.

## Tags

Usar tags NDEF compatíveis, com capacidade suficiente para a URL. Depois de gravada e testada, a tag pode ser bloqueada somente se o processo de substituição estiver definido. Tag bloqueada impede reprogramação; tag desbloqueada permite adulteração física.

## Segurança

NFC não autentica visitante e não torna uma memória privada acessível. Slug não é segredo. Memória privada exige sessão/concessão; ao abrir sem autorização, a página revela o mínimo. Rate limiting e detecção de abuso protegem URLs públicas.

## Questões antes da produção física

- Tags serão bloqueadas contra escrita?
- Quem programa, testa e substitui tags defeituosas?
- Haverá identificador de inventário separado da URL?
- O domínio canônico está decidido e protegido para uso de longo prazo?
