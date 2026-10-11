# Android App Links (`assetlinks.json`)

Faz links compartilhados do site abrirem o app Android, como os Universal Links do iOS (`docs/universal-links.md`).
Sem a configuração abaixo **nada quebra**: os links continuam abrindo no navegador.

## O que abre o app

Só os links feitos para compartilhar (lista em `AppLinkRules.OPEN_PATTERNS`, no `AndroidManifest.xml` e em
`OPEN_FIRST` de `apps/web/src/lib/ios/universal-links.ts`; um teste mantém as três iguais):

| Link | Rota |
|---|---|
| `/n/*` | tag NFC |
| `/a/*` | link curto de álbum |
| `/perfil` | perfil do dono |
| `/perfil/*/album/*` | álbum público |

Diferença do iOS: **páginas de perfil público (`/{slug}`) continuam no navegador no Android**. O filtro de intent do Android só
sabe incluir caminhos; não consegue dizer "tudo, menos login, admin, API…" como o iOS.

O app confere de novo cada link (`AppLinkRules`, só `https`, host exato, sem usuário/porta, sem `..`/`//`) e sempre carrega a
rota na origem do próprio app, nunca no host escrito no link. O callback do login (`com.momentsforever.app://auth/callback`) não
é tratado aqui; é do plugin `MomentsNativeAuth`.

## Onde entra o SHA-256 do certificado (valor real, não está no repositório)

O arquivo servido em `https://momentsforever.vercel.app/.well-known/assetlinks.json` vem de
`apps/web/src/app/.well-known/assetlinks.json/route.ts` e lê a variável de ambiente
**`ANDROID_APP_SHA256_FINGERPRINTS`** (um ou mais SHA-256, separados por vírgula). Sem a variável, o arquivo é `[]`.
Nenhum valor é inventado: fingerprints malformados são ignorados.

1. **Certificado de assinatura do Play** (o que vale para quem instala pela Play Store):
   Play Console → seu app → **Test and release → App integrity → Play app signing** (em português: *Testar e lançar → Integridade do
   app → Assinatura de apps*) → **App signing key certificate → SHA-256 certificate fingerprint**.
2. **Chave de upload** (builds instalados fora da Play, por exemplo `adb install` de um `.apk` assinado com ela):
   ```bash
   keytool -list -v -keystore ~/moments-upload.jks -alias upload   # copie a linha "SHA256:"
   ```
3. **Build de debug** (só para testar no seu aparelho; é o certificado de debug da sua máquina):
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   ```
4. No painel do host (Vercel → Project → Settings → Environment Variables), crie `ANDROID_APP_SHA256_FINGERPRINTS` para
   **Production** com os valores, por exemplo `AA:BB:…:FF,11:22:…:99`, e faça **um novo deploy** (o arquivo é gerado no build).

## Conferir

```bash
curl -s https://momentsforever.vercel.app/.well-known/assetlinks.json
# deve listar com.momentsforever.app e o(s) seu(s) SHA-256 (nunca []).
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://momentsforever.vercel.app&relation=delegate_permission/common.handle_all_urls"
```
No aparelho (USB debugging ligado), com o app instalado:
```bash
adb shell pm verify-app-links --re-verify com.momentsforever.app
adb shell pm get-app-links com.momentsforever.app          # host momentsforever.vercel.app deve estar "verified"
adb shell am start -a android.intent.action.VIEW -d "https://momentsforever.vercel.app/a/CODIGO" com.momentsforever.app
```
Se o domínio aparecer "none"/"1024" (não verificado): o fingerprint não bate com o certificado que assinou o app instalado.
