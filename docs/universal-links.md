# Universal Links e login dentro do app (3.3)

Dois comportamentos nativos do app iOS, ambos **sem criar telas novas**: o app só carrega as rotas que o site já tem.

## 1. Universal Links

`https://momentsforever.vercel.app/...`

- **App instalado** → o iOS abre o app e o `SceneDelegate` carrega a rota no mesmo WebView.
- **App não instalado** → é um link `https` comum: abre no navegador. Nada no site depende do app.

### O que abre o app

| Link | Rota |
|---|---|
| `/n/*` | NFC (continua com a página "Abrindo…" e `/api/nfc-link`) |
| `/a/*` | link curto de álbum |
| `/perfil` | perfil do dono |
| `/perfil/*/album/*` | álbum público |
| `/{slug}`, `/{slug}/mapa`, `/{slug}/passaporte` | perfil público |

Todo o resto fica na web: home, `/login`, `/auth/*`, `/ativar`, `/import`, `/geral`, `/admin`, `/api/*`, `/trip/*`, `/viagens`, `/mapa`, `/passaporte`, `/privacidade`, `/politica-de-privacidade`, `/perfil/{slug}` (só redireciona), arquivos estáticos (`/*.*`), `/_next`, `/.well-known`.

### Fonte única

`apps/web/src/lib/ios/universal-links.ts` gera:

- o arquivo servido em `/.well-known/apple-app-site-association` (`src/app/.well-known/apple-app-site-association/route.ts`);
- a lista que o Swift confere de novo antes de carregar um link (`UniversalLinkRouter`, em `ios/App/App/SceneDelegate.swift`, entre os marcadores `BEGIN/END AASA RULES`).

**Mudou a lista?** Atualize o bloco do Swift igual ao TypeScript — o teste `universal-links.test.ts` falha se os dois divergirem.

### Rota nova no site

`universal-links.test.ts` varre `src/app/*` e `public/*`. Uma pasta ou arquivo novo que **abriria o app sem querer** (por cair no `/{slug}`) faz o teste falhar. Decida:

- fica na web → inclua o nome em `EXTRA_WEB_ONLY_ROOTS` (ou em `RESERVED_PROFILE_SLUGS`, se também não pode ser slug de perfil);
- deve abrir o app → inclua em `OPEN_FIRST` e em `OPENS_APP_ROOTS` do teste.

### Segurança no app

O Swift só abre um link se: `https`, host exato `momentsforever.vercel.app`, sem usuário/senha/porta, sem `//`, `\`, `..` ou caracteres de controle, e o caminho (já decodificado) passa nas regras acima. A URL carregada usa sempre a origem do próprio app (`server.url`), nunca o host do link. Link inválido é ignorado.

### Configuração fora do código

- **Apple Developer** → Identifiers → `com.momentsforever.app` → capability **Associated Domains** ligada.
- O AASA precisa estar **no ar antes** de instalar o build (o iOS baixa na instalação e guarda cache). Conferir: `curl -sI https://momentsforever.vercel.app/.well-known/apple-app-site-association` → `200`, `content-type: application/json`, sem redirect.
- Limites do iOS: digitar o link no Safari, ou tocar num link do próprio site dentro do Safari, não abre o app.

## 2. Login Google/Facebook dentro do app

No app, o login roda na folha do sistema (`ASWebAuthenticationSession`), pelo plugin local `packages/capacitor-native-auth`, e termina no app.

1. `signInWithOAuth(redirectTo = com.momentsforever.app://auth/callback, skipBrowserRedirect)` — o verificador PKCE fica no WebView.
2. A folha abre o login (Google/Facebook via Supabase) e fecha sozinha ao voltar para `com.momentsforever.app://auth/callback?code=…`.
3. `lib/auth/native-oauth.ts` valida a URL (esquema, host e caminho exatos; só aceita o `code`).
4. O WebView abre a rota **existente** `/auth/callback?code=…` → sessão → `/perfil` (ou `/ativar`).

- Na web, o fluxo é o de sempre (`origin/auth/callback`). Apple continua nativo.
- Apps instalados antes (3.2 ou anterior) não têm o plugin e seguem o fluxo antigo (`isNativeOAuthAvailable()`).
- O esquema `com.momentsforever.app` está declarado em `CFBundleURLTypes` (`Info.plist`), por segurança. O callback chega ao plugin pelo `completionHandler` da sessão. Se outro app ou página abrir esse esquema, o iOS entrega a URL ao `SceneDelegate`, que repassa ao Capacitor; nada no app a consome (não há listener de URL no JS).
- Se o login for fechado ou negado (`access_denied`), o app mostra "O login foi cancelado. Tente novamente." e permanece na tela de login.

### Configuração fora do código

- **Supabase** → Authentication → URL Configuration → **Redirect URLs**: adicionar `com.momentsforever.app://auth/callback` (mantendo as atuais). Sem isso o Supabase manda para o Site URL e a folha não conclui.
