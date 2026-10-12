# Preparação Android / Samsung — Moments Forever

Estado em 2026-10-11, sobre a `master` (iOS 3.5 build 9, **não alterado**). Este documento mantém a auditoria e registra o que foi
implementado depois dela.

Convenção: **[VERIFICADO]** = conferido no código ou por um comando executado aqui. **[ASSUNÇÃO]** = dedução não confirmada.
**[MANUAL]** = só se confirma num aparelho Android real, no Play Console ou com credenciais suas.

## 1. Veredito: **BLOCKED** (falta compilar e testar; a arquitetura agora existe)

O que mudou desde a auditoria inicial: o projeto Android **existe**, o login Google/Facebook tem caminho nativo, o NFC está
declarado como opcional, as permissões de fotos foram enxugadas e os App Links estão preparados.

O que continua impedindo a publicação:

1. **Nenhum build Android foi executado.** Este ambiente não tem Android SDK e o download dele (`dl.google.com` e o Maven do Google,
   onde ficam o Android Gradle Plugin e as bibliotecas `androidx`) está bloqueado. O código novo em Java/Kotlin só teve a
   **sintaxe e os testes de lógica pura** verificados; **não foi compilado pelo Gradle**.
2. **Nada foi testado em aparelho** (TCL 50 XE 5G ou Samsung).
3. **Credenciais que só você tem:** chave de upload (`.jks`), conta e app no Play Console, SHA-256 do certificado de assinatura.
4. **Declarações do Play** (permissão de fotos, segurança dos dados, link de exclusão de conta, teste fechado se aplicável).

## 2. O que foi implementado

### Arquivos novos
| Arquivo | Para quê |
|---|---|
| `apps/web/android/**` | Projeto Android gerado por `npx cap add android` (Capacitor 8.5.2), com os ajustes abaixo |
| `packages/capacitor-native-auth/android/**` | Plugin Android do login (Chrome Custom Tabs): `MomentsNativeAuthPlugin.java`, `AuthUrls.java`, `build.gradle`, manifest, teste JUnit |
| `apps/web/android/app/src/main/java/com/momentsforever/app/AppLinkRules.java` + `MainActivity.java` | App Links: `MainActivity` abre no WebView os links compartilhados que passam em `AppLinkRules` |
| `apps/web/android/app/src/test/java/.../AppLinkRulesTest.java` | Teste JUnit das regras de links |
| `apps/web/android/app/src/main/res/xml/data_extraction_rules.xml` | Nada do armazenamento do app (cookies = sessão) vai para backup nem para troca de aparelho |
| `apps/web/scripts/generate-android-icons.mjs` | Gera ícones e tela de abertura a partir de `public/brand/logo.png` (o template trazia o ícone do Capacitor) |
| `apps/web/src/app/.well-known/assetlinks.json/route.ts` + `src/lib/android/app-links.ts` | `assetlinks.json` que lê o SHA-256 da variável de ambiente `ANDROID_APP_SHA256_FINGERPRINTS` (vazio `[]` até você configurar; nenhum valor inventado) |
| `apps/web/src/lib/android/app-links.test.ts` | Testes: fingerprint, rota, paridade das regras Java/manifest/iOS, permissões, SDK alvo ≥ 36 |
| `apps/web/src/lib/nfc/android-nfc.ts` + teste | Regras de NFC no Android (ver abaixo) |
| `docs/android-app-links.md` | Como obter e onde colocar o SHA-256 real |

### Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `apps/web/package.json`, `package-lock.json` | `@capacitor/android` **8.5.2** (exato); scripts `cap:sync:android`; `src/lib/android/*.test.ts` entra no `npm test` |
| `apps/web/src/lib/auth/native-oauth.ts` (+ teste) | `isNativeOAuthAvailable()` aceita **iOS ou Android** com o plugin presente (antes só iOS). iOS não muda |
| `packages/capacitor-native-auth/{package.json,src/index.ts,src/definitions.ts}` | Declara `capacitor.android` e a plataforma Android |
| `packages/capacitor-photo-library/android/**` | Remove `READ_MEDIA_VIDEO`; `count()` tolera `SecurityException`; AGP 8.13.0 como o template |
| `apps/web/src/lib/nfc/native-nfc.ts` | NFC no Android: checa status e não chama `startScan` (ver abaixo) |
| `apps/web/android/app/src/main/AndroidManifest.xml` | NFC, App Links, callback do login, sem backup, sem tráfego em texto puro |
| `apps/web/android/app/build.gradle` | `signingConfig` de release lida de propriedades fora do repositório |
| `apps/web/android/app/src/main/res/**` | Ícones e tela de abertura da marca (fundo `#121110`) |
| `docs/photo-library.md` | Seção Android atualizada |
| `.gitignore` | `*.jks` e `*.keystore` |

**Nada de iOS foi alterado** (`apps/web/ios/**`, `project.pbxproj`, certificados: intactos; `git status apps/web/ios` vazio;
`ios:version` continua 3.5 / build 9; `cap sync ios` não gera diferenças).

## 3. Verificações executadas e resultados

| Verificação | Resultado |
|---|---|
| `npm test` (apps/web) | **458 passando, 0 falhando, 16 pulados** (os 16 pulados já existiam) |
| `npm run typecheck` | OK |
| `npm run lint` | 5 erros e 1 aviso, **iguais aos de antes** e fora do Android (`passport-world-map`, `album-ui`, `album-carousel`, `lightbox-zoom-stage`, `r2-upload-warning-banner`); nos arquivos novos o lint passa |
| `npm run build` (produção, Next 16.3.5) | OK; a rota `/.well-known/assetlinks.json` aparece |
| `npm run ios:verify-plugins` | OK |
| `npx cap add android` / `npx cap sync android` | OK; o sync encontra **4 plugins**, incluindo `com.momentsforever.nativeauth.MomentsNativeAuthPlugin` |
| `npx cap sync ios` | OK, **sem alterar nenhum arquivo do iOS** |
| `npm ci --dry-run` (workspace web) | OK (lockfile em dia) |
| JUnit 4.13.2 na JVM (`javac` + `JUnitCore`), classes puras `AuthUrls` e `AppLinkRules` | **10 testes passando** (4 + 6) |
| Análise sintática (`JavacTask.parse`) de `MomentsNativeAuthPlugin.java` e `MainActivity.java` | OK |
| Assinaturas da API do Capacitor usadas pelo plugin (`saveCall`, `getSavedCall`, `releaseCall`, `setKeepAlive`, `handleOnNewIntent/Pause/Resume`, `Bridge.getServerUrl`) | Conferidas **contra o código-fonte do Capacitor 8.5.2** instalado |
| Comportamento da câmera/seletor de arquivos sem permissão | Lido em `BridgeWebChromeClient`: sem `CAMERA` declarada, `capture` usa o intent de câmera do sistema; sem `capture`, usa o seletor do sistema |
| **Compilação Gradle (debug e release), `.aab`, lint Android, testes instrumentados** | **NÃO executados** (sem Android SDK; Maven do Google bloqueado) |
| **Compilação do Kotlin** (plugin de fotos, plugin NFC de terceiros) | **NÃO executada** |
| **Qualquer teste em aparelho** | **NÃO executado** |

### SDK alvo e Gradle (do template real do Capacitor 8.5.2)
`minSdk 24`, `compileSdk 36`, `targetSdk 36`, AGP `8.13.0`, Gradle `8.14.3`, Java 21. O Google Play exige API alvo **36** (Android 16)
para apps novos e atualizações desde 31/08/2026 (prorrogação até 01/11/2026 pedida no Play Console). O valor **não foi reduzido** e um
teste falha se `targetSdkVersion` ficar abaixo de 36. Fontes:
[Play Console – API alvo](https://support.google.com/googleplay/android-developer/answer/11926878),
[developer.android.com – target SDK](https://developer.android.com/google/play/requirements/target-sdk).

Risco conhecido [ASSUNÇÃO]: os plugins `@exxili/capacitor-nfc` (terceiro) e `@capacitor-community/apple-sign-in` trazem módulos Android
que nunca foram compilados neste projeto; o NFC declara AGP 8.2.2 / Kotlin 2.1.21 no próprio `buildscript`. Se o primeiro build falhar
por versão de plugin, o conserto é pontual no `build.gradle` do plugin afetado.

## 4. Login Google e Facebook no Android

**Como funciona agora** (mesmo contrato JS do iOS: `MomentsNativeAuth.start({ url }) → { url }`; o fluxo web, o PKCE e a rota
`/auth/callback` não mudaram):

1. A página pede ao Supabase a URL de autorização (`signInWithOAuth`, `skipBrowserRedirect`, `redirectTo = com.momentsforever.app://auth/callback`; Google leva `prompt=select_account`). O **verificador PKCE fica nos cookies do WebView**.
2. O plugin valida que a URL é `https` e a abre num **Chrome Custom Tab** (não no WebView: o Google bloqueia OAuth em WebView embutido).
3. Ao terminar, o provedor redireciona para `com.momentsforever.app://auth/callback?code=…`. Um `intent-filter` da `MainActivity` (`singleTask`) recebe, e `handleOnNewIntent` resolve a chamada pendente com a URL.
4. A página valida de novo o formato (`parseNativeOAuthCallback`) e abre a rota existente `/auth/callback?code=…`, onde o servidor troca o código usando o verificador.

**Segurança:**
- O plugin **não registra, não guarda nem repassa** o código além de devolvê-lo à página; só um login fica pendente por vez e o callback só é aceito enquanto há um pendente e no formato exato (host `auth`, caminho `/callback`, sem usuário/porta).
- Outro app que registrasse o mesmo esquema veria o código, mas sem o verificador PKCE (que fica na página) ele não vale nada.
- Custom Tabs não avisam quando o usuário fecha a aba: voltar ao app sem o callback vira `CANCELLED` depois de 2 s de tolerância (`onNewIntent` costuma vir antes de `onResume`, mas alguns navegadores entregam o redirecionamento um instante depois de fechar a aba).
- Tokens e sessão ficam só nos cookies do WebView, que **não entram em backup** (`allowBackup=false` + `data_extraction_rules`).

**Limites [ASSUNÇÃO/MANUAL]:** se o Android matar o processo do app enquanto a aba está aberta, a chamada pendente se perde (a pessoa toca de novo em "Continuar com Google"). A tela de escolha de conta do Google depende de contas no Chrome. Nada disso foi executado em aparelho: **não afirmo que o login funciona** até o teste da seção 8.

## 5. NFC, fotos, App Links

- **NFC [VERIFICADO no código]:** `uses-permission NFC` e `uses-feature android.hardware.nfc required="false"` (o app instala em aparelhos sem NFC). Dois defeitos reais do uso no Android foram corrigidos na camada web: `startScan` é **rejeitado** pelo plugin no Android (a leitura falhava) e `writeNDEF` resolve na hora mesmo com NFC desligado ou ausente (a pessoa ficaria esperando). Agora, no Android, o app não chama `startScan` (o Android lê tags sempre) e confere `getStatus()` antes de ler ou gravar, com mensagem clara ("Este aparelho não tem NFC." / "O NFC está desligado…"). iOS não muda.
- **Fotos [VERIFICADO]:** uploads e câmera usam o seletor do sistema e não pedem permissão (`CAMERA` não é declarada). "Encontrar viagem" precisa de `READ_MEDIA_IMAGES` (+ `READ_MEDIA_VISUAL_USER_SELECTED` no Android 14+, `ACCESS_MEDIA_LOCATION`, `READ_EXTERNAL_STORAGE` até a API 32) porque o Photo Picker **não enumera** a biblioteca. `READ_MEDIA_VIDEO` foi **removida** (o app só lê fotos). Isso ainda exige a **declaração de permissões de fotos e vídeos** no Play Console [ASSUNÇÃO sobre o texto atual da política].
- **App Links:** filtro `autoVerify` para `/n/*`, `/a/*`, `/perfil`, `/perfil/*/album/*`; perfis públicos (`/{slug}`) continuam no navegador no Android. Só abrem o app depois que o `assetlinks.json` tiver o SHA-256 real (`docs/android-app-links.md`).
- **Áreas seguras:** o plugin `SystemBars` do Capacitor 8 (padrão `css`) dá padding nativo em WebView < 140 e valores corretos de `env(safe-area-inset-*)` em ≥ 140 com `viewport-fit=cover` (já usado pelo site). Com `targetSdk 36` o edge-to-edge é obrigatório: [MANUAL] conferir.
- **Ícones e abertura:** gerados a partir da arte da marca; o template trazia o ícone do Capacitor (reprovável).

## 6. Samsung / TCL: riscos e testes

Específicos da Samsung (hipóteses, não confirmadas): Samsung Internet como navegador padrão (links externos e o Custom Tab seguem o navegador padrão de Custom Tabs), "Dormir apps"/bateria do One UI, teclado Samsung, seletor "Galeria/Minha Galeria", pastas seguras. Gerais do Android: WebView desatualizado (< 140), edge-to-edge, botão voltar, rede instável. Não afirmo compatibilidade com nenhum modelo Galaxy nem com o TCL 50 XE 5G; confirme em Configurações → Sobre o telefone a versão do Android e, em Conexões, se o NFC existe.

## 7. Bloqueios para submeter ao Google Play

1. Compilar e testar (seção 1).
2. Declaração de permissões de fotos e vídeos (`READ_MEDIA_IMAGES`) — justificar "Encontrar viagem" ou trocar por Photo Picker.
3. Política de privacidade pública (`/politica-de-privacidade`): conferir se cobre fotos, localização das fotos (EXIF), contas e login de terceiros.
4. Exclusão de conta: existe no app (`/geral`); falta informar uma **URL web** no formulário de Segurança dos dados.
5. Segurança dos dados: fotos, localização aproximada derivada de EXIF, e-mail e identificadores; Supabase e Cloudflare R2 como operadores.
6. Teste fechado antes da produção para contas pessoais novas [ASSUNÇÃO: confirmar a regra atual no Console].
7. Conta de teste para a revisão (o app exige login).
8. Chave de upload e SHA-256 (seção 9).

## 8. Testes manuais no TCL 50 XE 5G (e em um Samsung)

Preparação: Configurações → Sobre o telefone → toque 7× em "Número da versão" → Opções do desenvolvedor → **Depuração USB**.

```bash
# no computador, com Android SDK + JDK 21 e o aparelho conectado
git checkout master && git pull origin master
npm ci
cd apps/web
npm run cap:sync:android
node scripts/generate-android-icons.mjs        # só se os ícones forem regenerados
cd android
./gradlew assembleDebug
adb devices                                     # o TCL deve aparecer como "device"
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb logcat | grep -i -E "Capacitor|MomentsNativeAuth"   # não cole códigos nem tokens ao pedir ajuda
```
Checklist: (a) abre e carrega o site; (b) e-mail/senha; (c) **Google**: Custom Tab abre, mostra contas, volta ao app já logado; cancelar fecha sem erro e dá para tentar de novo; (d) **Facebook** idem; (e) fechar e reabrir o app mantém a sessão; (f) enviar foto da galeria e da câmera; (g) "Encontrar viagem": pedir permissão, "acesso parcial" no Android 14+; (h) NFC desligado → mensagem; ligado → ler e gravar tag; (i) tag com `https://momentsforever.vercel.app/n/…` com o app fechado/aberto; (j) botão voltar (gestos e 3 botões); (k) teclado nos formulários sem cobrir o campo; (l) barra de navegação sobre o menu inferior; (m) sem rede e volta da rede; (n) app em segundo plano 30 min e retorno; (o) tablet/rotação, se houver.

App Links (depois do `assetlinks.json` configurado, ver `docs/android-app-links.md`):
```bash
adb shell pm verify-app-links --re-verify com.momentsforever.app
adb shell pm get-app-links com.momentsforever.app
adb shell am start -a android.intent.action.VIEW -d "https://momentsforever.vercel.app/a/CODIGO" com.momentsforever.app
# o callback do login só deve ser aceito com um login pendente (sem login iniciado, é ignorado):
adb shell am start -a android.intent.action.VIEW -d "com.momentsforever.app://auth/callback?code=teste" com.momentsforever.app
```
Samsung (se tiver um Galaxy): repetir (c), (d), (i) com **Samsung Internet** como navegador padrão e depois com Chrome; "Dormir apps" ligado por 30 min; teclado Samsung; seletor "Minha Galeria".

## 9. Gerar o `.aab` assinado

Pré-requisitos: JDK 21, Android SDK (`platform-tools`, `platforms;android-36`, `build-tools`), `ANDROID_HOME` ou `apps/web/android/local.properties` com `sdk.dir=...` (esse arquivo é ignorado pelo git).

```bash
# 1) Chave de upload — guarde FORA do repositório e faça cópia segura; nunca versione o .jks nem as senhas
keytool -genkeypair -v -keystore ~/moments-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000

# 2) Senhas FORA do repositório, em ~/.gradle/gradle.properties:
#    MOMENTS_UPLOAD_STORE_FILE=/caminho/absoluto/moments-upload.jks
#    MOMENTS_UPLOAD_STORE_PASSWORD=...
#    MOMENTS_UPLOAD_KEY_ALIAS=upload
#    MOMENTS_UPLOAD_KEY_PASSWORD=...

# 3) Versão do Android: apps/web/android/app/build.gradle -> versionCode (sobe +1 a cada envio) e versionName.
#    Hoje: versionCode 1 / versionName "1.0" (independente da versão do iOS).

# 4) Build
cd apps/web && npm ci && npm run cap:sync:android && cd android
./gradlew clean bundleRelease
# saída: app/build/outputs/bundle/release/app-release.aab

# 5) Conferir que está assinado (deve listar o certificado da chave de upload)
keytool -printcert -jarfile app/build/outputs/bundle/release/app-release.aab
```
Sem `MOMENTS_UPLOAD_STORE_FILE` o bundle sai **sem assinatura** e o Play Console o recusa.

## 10. Enviar ao Google Play Console (nada é publicado automaticamente)

1. **Criar app** (nome, idioma, App, gratuito/pago) e aceitar as políticas.
2. **Configurar o app:** política de privacidade (URL), acesso ao app (conta de teste), anúncios, classificação de conteúdo, público-alvo, **Segurança dos dados**, **declaração de permissões de fotos e vídeos**, URL de exclusão de conta.
3. **Integridade do app → Assinatura de apps:** ativar **Play App Signing** e enviar o `.aab` assinado com a chave de upload.
4. **Testes → Teste interno** (e **Teste fechado**, se exigido): criar versão, enviar o `.aab`, adicionar testadores, instalar pelo link.
5. Copiar o **SHA-256 do certificado de assinatura do app** (Integridade do app) para `ANDROID_APP_SHA256_FINGERPRINTS` no host e fazer novo deploy (`docs/android-app-links.md`); conferir os App Links no aparelho.
6. Ficha da loja (ícone 512×512, imagem de recursos, capturas, descrição).
7. Quando os testes passarem e o Console permitir, pedir **Produção** e enviar para revisão.

## 11. O que ainda preciso de você

- Executar a seção 8 (compilar e testar no TCL).
- Gerar a chave de upload e criar o app no Play Console.
- Informar o SHA-256 real (variável `ANDROID_APP_SHA256_FINGERPRINTS`).
- Dizer se quer manter `versionName "1.0"` ou alinhar com a versão pública do iOS.
- Decidir a justificativa (ou troca por Photo Picker) da permissão de fotos para "Encontrar viagem".

## 12. Teste no TCL 50 XE 5G e correções (branch `claude/android-prep`)

O teste real mostrou: NFC, câmera, upload e demais fluxos funcionando; três problemas. **Compilação Gradle ainda não executada aqui**: o Kotlin dos dois arquivos do plugin de fotos e o Java do plugin de login foram compilados com `kotlinc`/`javac` contra as classes reais do Android 16 (`android-all`) e *stubs* de `androidx` e do Capacitor (verifica sintaxe e tipos do código novo, não substitui o Gradle).

### 12.1 Login Google não volta ao app
- **O que foi verificado no código:** o fluxo iOS e o Android são idênticos na página (mesmo `signInWithOAuth` com `redirectTo = com.momentsforever.app://auth/callback`, PKCE no WebView, rota `/auth/callback`). A configuração do Supabase/Google que funciona no iOS vale para o Android: o iOS recebeu o `code` pelo mesmo redirect, então o Supabase aceita a URL. O que muda no Android é só quem entrega o redirect ao app: o navegador (Chrome Custom Tab) e o `intent-filter` da `MainActivity`.
- **Causa:** **não confirmada**. Não há log do aparelho e nenhuma falha determinística apareceu na leitura do código. Os pontos frágeis que existiam e foram tratados:
  1. A aba abria no navegador **padrão** do aparelho, que pode não suportar Custom Tabs; navegadores simples costumam não repassar o redirecionamento para um esquema próprio. Agora o plugin procura um navegador com Custom Tabs (`CustomTabsClient.getPackageName`, com o `<queries>` exigido no Android 11+) e usa esse.
  2. Se o navegador entregasse o callback **depois** de a aba fechar, a tolerância de 700 ms já tinha cancelado o login. Agora são 2 s.
  3. No Android **sem** o plugin disponível, o app caía no fluxo de redirecionamento no navegador do sistema, que **não pode funcionar** (o verificador PKCE fica no WebView) e deixava a pessoa presa no navegador. Agora aparece uma mensagem clara e esse fluxo não é iniciado (iOS não muda).
  4. O plugin passou a registrar no `logcat`, sem nunca imprimir a URL nem o código, o que ele fez em cada etapa.
- **Como saber o que aconteceu, se ainda falhar** (aparelho com depuração USB):
  ```bash
  adb logcat -c
  adb logcat -s MomentsNativeAuth:I Capacitor:I Capacitor/Console:I chromium:W
  ```
  Toque em "Continuar com Google" e procure estas linhas: `opening the login in a Custom Tab, provider=…` (o plugin foi chamado e qual navegador), `login callback received` (o app recebeu o redirecionamento), `back in the app without a callback: treated as cancelled` (voltou sem receber), `ignored a link on the app scheme…` (chegou uma URL fora do formato). Se a mensagem "O login com Google e Facebook não está disponível…" aparecer, o plugin não está presente nesse build (rode `npm run cap:sync:android` e reinstale). **Sem a primeira linha, o plugin nem foi chamado; sem `login callback received`, o navegador não entregou o redirecionamento ao app.** Me envie essas linhas (sem códigos).
- **Configuração externa (já feita para o iOS; confira, não é nova):** Supabase → Authentication → URL Configuration → **Redirect URLs** deve conter exatamente `com.momentsforever.app://auth/callback`. Google Cloud Console → Credenciais → seu cliente OAuth (Web) → **URIs de redirecionamento autorizados** deve conter `https://<ref-do-projeto>.supabase.co/auth/v1/callback`. Nenhum valor novo é necessário para o Android.

### 12.2 "Encontrar uma viagem" carrega sem fim
- **Causa (provável, não medida no aparelho):** no Android o GPS de **cada foto** é lido abrindo o arquivo (o MediaStore não tem coluna de GPS no Android 10+), e a busca pedia páginas de **4.000 fotos** de uma vez, sem mostrar progresso até a página inteira terminar e sem como cancelar: com milhares de fotos são minutos de "Procurando nas suas fotos…". Além disso, um erro dentro da thread nativa deixaria a chamada sem resposta.
- **Correção:** no Android a busca lê **300 fotos por vez** (progresso "N de M fotos lidas" a cada poucos segundos; "Cancelar" vale entre as páginas), lê o GPS de **4 fotos em paralelo**, e cada chamada nativa agora **rejeita com erro** em vez de ficar pendente. Uma página que passa de **2 minutos** vira a mensagem "Ler as fotos está demorando mais do que o normal. Toque em “Tentar de novo”." Permissão negada continua mostrando o aviso com "Abrir Ajustes"; biblioteca vazia mostra "Não encontramos fotos neste aparelho…". O iOS mantém páginas de 4.000.
- **Permissões:** continuam só `READ_MEDIA_IMAGES` (+ `READ_MEDIA_VISUAL_USER_SELECTED` no Android 14+, `ACCESS_MEDIA_LOCATION`). O Photo Picker não enumera a biblioteca, então não serve para descobrir viagens.
- O plugin registra no `logcat` (tag `MomentsPhotoLibrary`) a posição, quantas fotos foram lidas e quanto tempo o GPS levou, sem dados pessoais: `adb logcat -s MomentsPhotoLibrary:I`.

### 12.3 Confirmação do registro de NFC
- A tela agora mostra, **somente depois de o plugin confirmar a gravação**, a pílula verde já usada em "NFC vinculada" com **"Tag NFC registrada com sucesso!"** (e a pasta continua a mesma). Texto de espera sem "iPhone". No Android há **"Cancelar gravação"** (cancela também a gravação pendente no plugin, para a próxima tag tocada não ser sobrescrita) e o estado "Gravação cancelada. Nenhuma tag foi alterada." com "Tentar novamente"; erros continuam no aviso de erro.

### 12.4 Testes executados
`npm test` 474 passando / 0 falhando / 16 pulados (os de sempre); `typecheck`, `build` e `cap sync android` OK; lint igual ao de antes (5 erros e 1 aviso fora destes arquivos); JUnit na JVM das regras puras (10 testes). **Não executados:** Gradle, `.aab`, qualquer teste no aparelho.

### 12.5 O que testar de novo no TCL
Atualize e reinstale: `git pull`, `npm ci`, `npm run cap:sync:android`, `./gradlew assembleDebug`, `adb install -r …`. Então: (1) Google e Facebook, vendo o `logcat` acima; (2) "Encontrar uma viagem" com a biblioteca real: o contador sobe e termina em resultado, "sem fotos" ou erro; negue a permissão uma vez para ver o aviso; (3) gravar uma tag nova dentro de uma pasta: pílula verde só depois de tocar a tag; testar "Cancelar gravação" e NFC desligado.

## 13. Login ainda abre o navegador: causa raiz (versão do site que o app carrega)

**Causa raiz [VERIFICADO]:** o app Android (como o iOS) é só uma casca que **carrega o site de produção** (`server.url = https://momentsforever.vercel.app`). O JavaScript que decide entre o login nativo e o redirecionamento é o do **site em produção**, não o do APK. A produção é publicada pela `master`, e as correções Android estão na branch `claude/android-prep`:

| Onde | O que roda |
|---|---|
| Deployments do GitHub/Vercel, ambiente **Production** | commit `c418678` (a `master`, de 2026-10-10) |
| Deployments, ambiente **Preview** | `9ee1ca1` e `726a90e` (a branch `claude/android-prep`) |
| `native-oauth.ts` na `master` | `isNativeOAuthAvailable()` = `isNativeIosApp(...) && isPluginAvailable(...)`: **só iOS** |
| `native-oauth.ts` na branch | `isNativeMobileApp(...)` aceita iOS **e Android** |

Resultado no TCL: o APK novo tem o plugin (registrado, compilado e listado em `capacitor.plugins.json`), mas o site em produção ainda é o antigo, que nunca chama o plugin no Android. Cai no fluxo de redirecionamento, o Capacitor abre o provedor no navegador do sistema (`Bridge.launchIntent` → `ACTION_VIEW`) e o PKCE, que fica nos cookies do WebView, nunca é usado. Isso bate com os logs: **nenhuma** linha `opening the login in a Custom Tab` (o plugin nunca foi chamado) e nenhum `login callback received`. Pelo mesmo motivo **nenhuma** correção do site da rodada anterior está ativa no aparelho: login Android, busca de fotos em páginas menores/progresso/limite de tempo e a confirmação de NFC (todas são código web).

O aviso `Capacitor: Unable to read file at path public/plugins` é **inofensivo**: o Capacitor procura scripts de plugins Cordova em `assets/public/plugins` (`JSExport.getFilesContent`), que este projeto não tem.

**Verificado:** detecção de plataforma e `isPluginAvailable` na lógica da página (testes), plugin registrado em `capacitor.plugins.json`, módulo incluído em `capacitor.build.gradle`/`capacitor.settings.gradle`, plugin Java compilado contra o Android 16 (com stubs), código da página no bundle `next build`, mesma URL de redirect e configuração do Supabase que funcionam no iOS (o iOS recebeu o `code` por ela). **Não verificado:** build Gradle/APK (sem Android SDK neste ambiente) e o fluxo no aparelho.

### Como testar a branch no TCL sem publicar na produção
O site da branch já tem um deploy de Preview. Duas condições:
1. **Proteção de Preview da Vercel:** por padrão exige login da Vercel e o WebView abriria a tela de login dela. Para o teste, em Vercel → projeto → Settings → Deployment Protection, desligue "Vercel Authentication" para Preview (ou use uma exceção) e **religue depois**: com ela desligada, os previews ficam públicos.
2. **Variáveis do Supabase** (`NEXT_PUBLIC_SUPABASE_URL` e a chave pública) precisam existir no ambiente **Preview** do projeto.

Pegue a URL do deploy da branch (Vercel → Deployments → ramo `claude/android-prep`, ou o link "Visit" do commit `726a90e`) e gere o APK apontando para ela. **Use a URL sem barra no final e só para teste**:
```bash
git fetch origin && git checkout claude/android-prep && git pull
npm ci
cd apps/web
CAPACITOR_SERVER_URL="https://SEU-PREVIEW.vercel.app" npm run cap:sync:android
cat android/app/src/main/assets/capacitor.config.json | grep '"url"'   # confirme a URL do preview
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
**Antes de gerar qualquer build de loja**, volte ao padrão: `npm run cap:sync:android` **sem** `CAPACITOR_SERVER_URL` (aponta para a produção).

### Alternativa: levar o código web para a produção
Fazer o merge de `claude/android-prep` na `master` publica o site novo para **todos**, inclusive o app iOS 3.5 (9) que está com a Apple, porque ele também carrega o site remoto. As mudanças web desta branch preservam o comportamento iOS (portão do login iOS, páginas de 4.000 fotos no iOS, escrita NFC no iOS com os mesmos eventos), mas `native-nfc.ts` e `nfc-link-panel.tsx` mudam textos e a estrutura do fluxo de gravação também no iOS (por exemplo, "aparelho" no lugar de "iPhone" e a pílula de sucesso). Decisão sua, depois de testar no TCL.

### Lição para os próximos builds
Qualquer alteração em código web precisa estar **publicada** (produção ou Preview apontado por `CAPACITOR_SERVER_URL`) para aparecer no app; só mexer no plugin nativo e reinstalar o APK não basta. O `logcat` ajuda a distinguir: se `MomentsNativeAuth` não escreve nada ao tocar em "Continuar com Google", o site que o app carregou ainda não é o da branch.

### 13.1 `CAPACITOR_SERVER_URL` com formato errado (Markdown) e APK com a URL antiga
- **Origem:** a variável recebeu uma URL colada de um chat no formato Markdown, `[https://x](https://x)`. O `capacitor.config.ts` já rejeitava isso (o `cap sync` falha com código 1), mas o arquivo gerado **da vez anterior continua no lugar** e o `./gradlew assembleDebug`, que é outro comando, termina em `BUILD SUCCESSFUL` com a URL antiga dentro do APK. Reproduzido aqui.
- **Correção na fonte:** a regra da URL agora é uma função só (`src/lib/capacitor/server-url.ts`), usada por `capacitor.config.ts`: tira Markdown, `<...>` e aspas, aceita apenas `https://host` (sem usuário, caminho, query ou barra final) e **falha com mensagem clara** para qualquer outra coisa. Sem a variável, continua a produção (o iOS não muda: `cap sync ios` gera a mesma URL de antes).
- **Conferência automática:** `npm run cap:sync:android` agora termina com `android:check-config`, que lê de volta o JSON gerado e compara com `CAPACITOR_SERVER_URL` (pega o arquivo velho). Depois do Gradle, `npm run android:check-apk` abre o próprio APK (`assets/capacitor.config.json`) e confirma a URL embutida, comparando também com o último sync.
- **Uso:** `CAPACITOR_SERVER_URL="https://SEU-PREVIEW.vercel.app" npm run cap:sync:android` → `./gradlew assembleDebug` → `CAPACITOR_SERVER_URL="https://SEU-PREVIEW.vercel.app" npm run android:check-apk`. Para voltar à produção: `npm run cap:sync:android` sem a variável.

## 14. Loop de login com Google no Android: causa raiz e correção

**Sintoma (logs do TCL):** Chrome abre, o login termina, o Android reinicia o `MainActivity` com o deep link
`com.momentsforever.app://auth/callback?code=…` e a pessoa volta **deslogada**, em loop. Os logs não mostravam
"login callback received" nem uma sessão criada.

**Causa raiz (por leitura do código; a confirmação final é no aparelho):** o callback só era aproveitado se o
`PluginCall` guardado em memória ainda existisse (`handleOnNewIntent` retornava em silêncio com `pendingCallId == null`).
Com o Chrome na frente, um aparelho com pouca memória mata o processo ou o renderer do WebView: a página que esperava
o plugin deixa de existir e o código OAuth era descartado. Agravantes: (1) `/auth/callback` falhava para
`/login?error=…` e a tela de login nunca mostrava o erro (loop mudo); (2) cookies do WebView (verifier PKCE e sessão)
só vão ao disco de forma preguiçosa e podiam se perder com o processo; (3) a troca do código não era idempotente.

**Correção (mesmo fluxo, mesma biblioteca, PKCE mantido; nenhum segundo fluxo OAuth):**
- `MomentsNativeAuthPlugin.java`: registra o login em andamento (timestamp + `next` permitido, nunca o código) em
  SharedPreferences; `CookieManager.flush()` ao iniciar e ao pausar; o callback é consumido **uma única vez**, só se
  houver login recente (15 min), e encaminhado nativamente para a rota existente `/auth/callback?code=…` no WebView
  (`handled: true`), mesmo sem página/activity viva. Erro do provedor (sem código) segue para a página.
- `MainActivity.java`: descarta o deep link do OAuth em intents restauradas (`savedInstanceState != null`) e faz
  `flush()` dos cookies em `onPause`.
- `auth-callback.ts` / `route.ts`: lógica testável; se o mesmo código chegar duas vezes e já houver usuário, é sucesso;
  falhas viram `/login?error=auth_callback_failed&reason=no_verifier|exchange_failed` e o login mostra mensagem.
- `native-oauth.ts`: com `handled: true` a página não navega nem troca o código de novo.

**Logs úteis** (`adb logcat -s MomentsNativeAuth`; sem URL, código ou token): `opening the login in a Custom Tab`,
`login callback received: pendingCall=…, codePresent=…, forwardedToWebView=…`, `callback ignored: no login in progress`.
No servidor: `[auth/callback] code exchange failed: reason=…, errorCode=…`.

**Verificado no sandbox:** `npm test` (512 testes, 0 falhas), `tsc`, eslint (baseline: 5 erros + 1 aviso já existentes),
`npm run build`, `ios:verify-plugins`, JUnit (14) para `AuthUrls`/`AppLinkRules`, compilação javac do plugin e do
`MainActivity` contra `android-all` com stubs. `apps/web/ios` sem alterações.

**Não verificado (depende de você):** build Gradle/APK (SDK indisponível no sandbox) e o teste no TCL. O JS que o app
roda é o site implantado: a parte web (`/auth/callback`, mensagens) só vale no app após o deploy; um build de teste
deve apontar `CAPACITOR_SERVER_URL` para o Preview URL do commit com estas mudanças. Alterações não commitadas.
