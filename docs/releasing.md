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

## Xcode Cloud

Cada push em `master` dispara um build do Xcode Cloud. O Xcode Cloud costuma controlar a numeração dos builds que ele arquiva; confira no App Store Connect (workflow → número do próximo build) para que o número de lá não colida com o do projeto. O número do `pbxproj` continua sendo a referência para builds feitos no Xcode (Archive manual) e para o histórico.

## Histórico de releases

Registre aqui cada versão preparada. Atualize na mesma alteração que muda a versão.

| Marketing | Build | Situação |
|---|---|---|
| 1.0 | 1 | primeiro build do projeto iOS |
| 1.0 | 2 | rejeitado pela App Review (crash no iPad e Sign in with Apple) |
| 1.0 | 3 | preparado após a rejeição (o número 2 não foi reutilizado) |
| 3.1 | 4 | versão final com Sign in with Apple, NFC e correções. Preparada |
