# Porto Rico e outros territórios dos EUA: registros já salvos

**Causa.** O Nominatim responde `country: "Estados Unidos da América"` e `country_code: "us"` para San Juan, Vieques, Culebra
e demais territórios americanos (PR, VI, GU, AS, MP). Registros criados antes da correção guardam o nome do lugar e o
`country_code` como EUA. O código novo grava esses lugares como o território.

**Registros antigos já são exibidos corretamente sem alterar o banco.** O carregamento dos cards (Álbuns, Passaporte,
Mapa, compartilhamento) e das pastas da viagem usa as coordenadas do lugar: um lugar não confirmado pela pessoa, arquivado
como EUA (ou sem país) e **dentro** de um território vira o território (bandeira, código e nome). As coordenadas ficam no
servidor e não são enviadas ao navegador. Lugares com nome confirmado pela pessoa nunca são reatribuídos.

## Se quiser corrigir também os dados gravados (opcional, nada disso foi executado)

1. Identificar exatamente os lugares afetados (somente leitura):

```sql
select p.id, p.name, p.country_code, p.exact_latitude, p.exact_longitude
from public.places p
where p.confirmed_by_user = false
  and (p.country_code is null or upper(p.country_code) = 'US')
  and p.exact_latitude between 17.6 and 18.6      -- Porto Rico, Vieques, Culebra, Mona
  and p.exact_longitude between -68.1 and -65.1;
```

   Faça o mesmo com as caixas das Ilhas Virgens Americanas (17.6–18.42, −65.1 a −64.5), Guam (13.2–13.7, 144.5–145.0),
   Marianas do Norte (14.0–20.6, 144.8–146.2) e Samoa Americana (−14.6 a −11.0, −171.2 a −168.0). Essas caixas são as de
   `packages/shared/src/country-registry.ts`.

2. Conferir a lista e guardar uma cópia:

```sql
create table public._places_backup_territories as
select * from public.places where id in (/* ids conferidos */);
```

3. Corrigir só esses ids (idempotente; não mexe em datas, fotos, álbuns nem coordenadas):

```sql
update public.places
set country_code = 'PR',
    name = regexp_replace(name, '^(Estados Unidos( da Am[eé]rica)?|United States|USA)\s*,\s*', 'Porto Rico, ')
where id in (/* ids conferidos */)
  and confirmed_by_user = false;
```

   Os nomes dos álbuns (`albums.name`) que repetem "Estados Unidos da América, …" também são exibidos como Porto Rico pela
   regra acima; só altere-os no banco se quiser o dado gravado igual ao exibido.
