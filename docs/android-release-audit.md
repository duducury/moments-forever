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
- Custom Tabs não avisam quando o usuário fecha a aba: voltar ao app sem o callback vira `CANCELLED` depois de 700 ms (`onNewIntent` sempre vem antes de `onResume`).
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
