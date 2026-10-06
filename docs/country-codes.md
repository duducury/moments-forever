# Países: bandeiras e carimbos do passaporte

Fonte da verdade: `places.country_code` (ISO 3166-1 alpha-2, nulo = ainda não resolvido).

- Ao importar/adicionar fotos, o código vem do geocoder (`address.country_code`) para as
  coordenadas do lugar; se o nome do lugar já traz o país, ele é usado sem rede
  (`apps/web/src/lib/location/place-country-code.ts`).
- Lugares antigos são preenchidos uma vez, quando o dono abre o perfil ou o passaporte
  (no máximo 3 consultas ao geocoder por abertura).
- Leitura (`load-owner-place-cards.ts`): código gravado, com o nome do lugar como reserva;
  se o usuário renomeou o lugar (`confirmed_by_user`), o nome tem prioridade.
- Nomes → código usam a tabela gerada `packages/shared/src/country-names.generated.ts`
  (todos os países ISO, via `node packages/shared/scripts/build-country-names.mjs`).
  Não adicione países à mão: o teste `country-coverage.test.ts` garante a cobertura.
- Tudo é "melhor esforço": sem a coluna (migration não aplicada) o app continua
  funcionando só pelo nome.
