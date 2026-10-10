# Releases do app iOS: versão e build

Regra permanente. Vale para todo build enviado ao App Store Connect, por quem for (pessoa ou IA).

## Dois números, dois papéis

| | **Marketing Version** | **Build Number** |
|---|---|---|
| Chave no Xcode | `MARKETING_VERSION` | `CURRENT_PROJECT_VERSION` |
| É | a versão **pública** do app | o número **interno** exigido pela Apple |
| Exemplos | `3.1`, `3.2`, `4.0` | `4`, `5`, `6` |
| Muda quando | há uma versão nova para os usuários | **a cada build enviado** ao App Store Connect |

- Nunca use o Build Number como versão pública, nem o contrário.
- O Build Number sobe de **+1 em +1** e **nunca** é reutilizado, mesmo que o build anterior tenha sido rejeitado ou nunca publicado.
- A Marketing Version nunca diminui.

## Fonte da verdade

Só existe em um lugar: `apps/web/ios/App/App.xcodeproj/project.pbxproj` (um par para Debug e outro para Release, sempre iguais). O `Info.plist` apenas lê `$(MARKETING_VERSION)` e `$(CURRENT_PROJECT_VERSION)`.

- Não escreva a versão em código, `Info.plist`, `capacitor.config.ts`, `package.json` nem scripts.
- **A versão não aparece dentro do app** (nem no Perfil, nem em qualquer tela). Ela existe só na configuração do projeto e no App Store Connect.
- `apps/mobile` (Expo) é outro app e não segue esta regra.

## Antes de preparar qualquer build para o App Store Connect

Na pasta `apps/web`:

1. `npm run ios:version`: mostra a Marketing Version atual, o Build Number atual, o maior build já commitado no histórico do git e o **próximo build** sugerido.
2. Confirme no App Store Connect (TestFlight → Builds, e a versão em preparação) quais builds já existem. O git não enxerga builds enviados por fora dele; se houver um número maior lá, use um acima dele.
3. `npm run ios:version -- set <marketing> <build>`, por exemplo `set 3.2 5`. A ferramenta **recusa** build já usado (atual ou do histórico), build não inteiro e Marketing Version inválida ou menor que a atual. Pular números só gera um aviso.
4. `npm test`: os testes de `src/lib/release` garantem que Debug e Release concordam, que o `Info.plist` lê as variáveis, que o build não cai abaixo de um já commitado e que nenhum código do app lê a versão.
5. Só então commite e faça o build.

`npm run ios:version -- check` falha se o arquivo do projeto estiver inconsistente.

## Antes do Archive: dependências, `cap sync` e plugins nativos

O login Google/Facebook dentro do app depende do plugin nativo `MomentsNativeAuthPlugin`. O Capacitor só o registra se ele estiver em `packageClassList` do `capacitor.config.json` e linkado no binário. **Se faltar, não há erro nenhum**: o app cai em silêncio no login pelo Safari. Por isso, antes de **todo** Archive manual no Mac, a partir da raiz do repositório:

```bash
git checkout master && git pull origin master
npm ci                                   # instala dependências e cria os links de packages/*
cd apps/web
npm run cap:sync                         # = cap sync ios; gera capacitor.config.json e CapApp-SPM/Package.swift
npm run ios:verify-plugins               # tem de imprimir "OK: MomentsNativeAuthPlugin is registered…"
npm run ios:version                      # confira versão e build (próximo build nunca reutiliza um número)
```

- `capacitor.config.json` e `CapApp-SPM/Package.swift` são **gerados e ignorados pelo git**: o que está no seu Mac vale, não o que está no repositório. Rode o `cap sync` de novo sempre que atualizar o código, mesmo que nada nativo tenha mudado.
- `npm run ios:verify-plugins` falha com mensagem clara se `MomentsNativeAuthPlugin` não estiver registrado, se o pacote não estiver linkado em `CapApp-SPM/Package.swift` ou se a classe e o `jsName` do código Swift não baterem com o que o JS registra.
- Não faça o Archive se a verificação falhar.
- No Xcode: **Product → Clean Build Folder** (e, se o pacote do plugin foi atualizado, **File → Packages → Reset Package Caches**) antes de arquivar.

### Depois do Archive: confirme no app gerado

No Organizer, clique com o botão direito no archive → **Show in Finder** → botão direito → **Mostrar conteúdo do pacote**. O app fica em `Products/Applications/App.app`. Então:

```bash
cd apps/web
npm run ios:verify-plugins -- --app "/caminho/do/MeuApp.xcarchive/Products/Applications/App.app"
```

Esse comando confere o `capacitor.config.json` **dentro** do app e se o executável contém a classe do plugin. Só envie ao App Store Connect se terminar com `OK: … and present in the built app.`

### Teste no iPhone (TestFlight)

Toque em "Entrar com Google": deve abrir a folha de login por cima do app e fechar sozinha. Se abrir o Safari, o plugin não está nesse build.

## Xcode Cloud

Cada push em `master` dispara um build do Xcode Cloud. O `ci_scripts/ci_post_clone.sh` roda `npm ci` e `cap sync ios`, confere o plugin (registro em `packageClassList` e pacote em `CapApp-SPM/Package.swift`, mais o `ios:verify-plugins` completo quando o `tsx` está instalado) e falha o build se o plugin do login Google não estiver registrado. O Xcode Cloud costuma controlar a numeração dos builds que ele arquiva; confira no App Store Connect (workflow → número do próximo build) para que o número de lá não colida com o do projeto. O número do `pbxproj` continua sendo a referência para builds feitos no Xcode (Archive manual) e para o histórico.

## Histórico de releases

Registre aqui cada versão preparada. Atualize na mesma alteração que muda a versão.

| Marketing | Build | Situação |
|---|---|---|
| 1.0 | 1 | primeiro build do projeto iOS |
| 1.0 | 2 | rejeitado pela App Review (crash no iPad e Sign in with Apple) |
| 1.0 | 3 | preparado após a rejeição (o número 2 não foi reutilizado) |
| 3.1 | 4 | versão final com Sign in with Apple, NFC e correções. Preparada |
| 3.2 | 5 | publicada na App Store (o build 1 não foi reutilizado: segue a sequência depois do 4) |
| 3.3 | 6 | preparada: login Google/Facebook dentro do app (plugin nativo) e Universal Links |
| 3.4 | 7 | em preparação: resumo da jornada para o Instagram, plano personalizado e novo editor de capa. O último build enviado ao App Store Connect era o 4 (os builds 5 e 6 não chegaram lá); o 7 segue a regra de nunca reutilizar número |
