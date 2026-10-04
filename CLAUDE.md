# Moments Forever

Leia `PROJECT.md` e as decisões em `/docs` antes de alterar o projeto.

## Release iOS (regra permanente)

Antes de preparar qualquer build para o App Store Connect, siga **`docs/releasing.md`**:

- `MARKETING_VERSION` = versão pública (3.1, 3.2, 4.0…). `CURRENT_PROJECT_VERSION` = build interno, **+1 a cada build enviado, nunca reutilizado**.
- Fonte da verdade: `apps/web/ios/App/App.xcodeproj/project.pbxproj`. Use `npm run ios:version` (em `apps/web`) para ver o estado e `-- set <marketing> <build>` para alterar; não edite versões à mão nem as escreva em outros arquivos.
- Nunca mostre a versão dentro do app.
