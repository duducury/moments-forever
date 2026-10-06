# ✨ Encontrar viagem / Encontrar fotos

Ajuda a pessoa a achar, nas fotos do próprio aparelho, viagens e fotos que ainda não estão no
Moments Forever. **Nada é importado nem criado sem a pessoa escolher e confirmar.**

## Onde fica
Dentro do menu próprio **Adicionar fotos** (Fototeca · Tirar foto · Escolher arquivos · ✨):

- fora de uma viagem (botão "Nova viagem" do perfil / barra inferior): **✨ Encontrar viagem**;
- dentro de uma viagem (`AddPhotosPanel`): **✨ Encontrar fotos**.

O menu nativo do iOS para `<input type="file">` não aceita uma quarta opção — por isso o menu próprio
(`components/add-photos-menu.tsx`). Sem o plugin nativo (navegador, PWA, app antigo da App Store) o
menu não aparece e o botão abre o seletor de arquivos direto, como sempre foi.

## Arquitetura
```
Web (Next, na Vercel)                                   Aparelho
 components/find-trips/find-trips-flow.tsx   ─┐
 lib/photo-library/*  (lógica pura, testada)  ├─ @moments-forever/capacitor-photo-library
 /api/me/photo-library-context  (o que já há) ─┘     ├─ iOS     PhotoKit
                                                      └─ Android MediaStore (+ ExifInterface)
```
O site hospedado nunca acessa a biblioteca: só o plugin nativo, dentro do app.

### Plugin (`packages/capacitor-photo-library`)
`checkPermission · requestPermission · presentLimitedLibraryPicker · getPhotoLibrarySummary ·
scanPhotoMetadata · getThumbnails · exportPhoto · openSettings`

- **Descoberta = só metadata** (`scanPhotoMetadata`): `localIdentifier`, data, GPS, largura/altura.
  Nenhum pixel é lido. Só fotos (não vídeos), sem capturas de tela, sem álbuns compartilhados do iCloud.
- **Miniaturas** só das fotos que a pessoa está vendo (`getThumbnails`, ≤ 60 por chamada).
- **Exportação** só das fotos escolhidas (`exportPhoto`): JPEG de até 1600 px com EXIF/GPS, uma por vez
  (memória constante). Segue pelo pipeline de sempre (`createNamedTripFromFiles` /
  `uploadFilesToAlbum` → miniaturas, R2, associação à viagem).
- iOS não usa as APIs deprecated de Moments e não tenta ler "Trips/Memories" do app Fotos.
- Android: Photo Picker **não** enumera a biblioteca, então a descoberta usa MediaStore. No Android 10+ o
  GPS não é coluna do MediaStore: é lido do EXIF de cada arquivo (`ACCESS_MEDIA_LOCATION`), página a página.

### Detecção (100% local — `lib/photo-library/discover-trips.ts`)
1. **Casa** = a área com fotos em mais dias diferentes. Fotos perto de casa (60 km) não são viagem.
2. Fotos longe de casa, em ordem de tempo, formam uma viagem até haver lacuna > 2 dias ou salto > 250 km
   (Paris 10–12 + Paris 13–15 → uma viagem; Paris → Roma → duas).
3. Fotos sem GPS entram pelo período da viagem; fotos sem data nunca entram.
4. Grupos pequenos (< 6 fotos ou < 3 com GPS) são descartados.
5. Só o **centro** de cada viagem vai ao servidor, para dar nome (`/api/geocode/reverse`, a mesma
   geocodificação de sempre) — nunca a biblioteca.

### Comparação com o que já existe (`match-existing.ts`, `candidates.ts`)
Conservadora: uma viagem encontrada é "a mesma" de uma existente só se **o período se sobrepõe (±2 dias) E o
lugar coincide** (≤ 150 km + raios), ou se a maioria das fotos já está guardada nela. Mesmo país com datas
diferentes **não** funde ("Brasil 2024" ≠ "Brasil 2026"): aparece como nova, com a dica "Parece com …".
Viagens que já existem aparecem em "Já no Moments Forever — com fotos novas" e só oferecem o que falta.

### Duplicados — `photos.source_asset_id`
- Guarda `'<plataforma>:<id nativo>'` (`ios:…` / `android:…`) **na própria linha da foto**.
- "Já está na viagem" é recalculado a cada vez com as fotos que existem agora. Se a foto for apagada, a linha
  (e o id) some e ela volta a ser sugerida. **Não existe lista permanente de "já importadas".**
- Fotos de antes da coluna (sem id): reconhecidas por lugar (≈150 m) + horário (tolerando o fuso do import) +
  formato. Sem GPS nos dois lados nunca são dadas como "já existentes": no pior caso aparece uma sugestão a mais,
  nunca uma foto escondida.
- Novas viagens passam pela RPC de importação (que não carrega o campo); o id é gravado logo depois por
  `POST /api/experiences/[id]/photos/source-assets` (best effort). Fotos em viagens existentes levam o campo
  direto no insert.
- Tolerante: sem a migration, tudo funciona, só sem lembrar a origem.

## Banco
`supabase/migrations/20261008100000_photo_source_asset_id.sql` (aplicar à mão): coluna nullable, CHECK de formato,
índice parcial. Repetível.

## iOS
- `Info.plist`: `NSPhotoLibraryUsageDescription` (leitura). Não precisa de `NSPhotoLibraryAddUsageDescription`
  nem de localização do aparelho.
- Estados: acesso total, limitado ("Escolher mais fotos"), negado/restrito ("Abrir Ajustes"), biblioteca vazia,
  cancelamento.
- O aviso automático do iOS para acesso limitado continua ligado (não foi adicionado
  `PHPhotoLibraryPreventAutomaticLimitedAccessAlert`).
- `ci_post_clone.sh` confere que o plugin entrou no `packageClassList` e no `CapApp-SPM/Package.swift`.
- Teste de build local apontando para outro site: `CAPACITOR_SERVER_URL=https://… npx cap sync ios`.

## Android
O repositório ainda não tem projeto Android. O código do plugin está pronto (`android/`), mas não foi compilado.
Para ativar: `npm i @capacitor/android@8.5.2 -w @moments-forever/web`, `npx cap add android`, `npx cap sync android`.
