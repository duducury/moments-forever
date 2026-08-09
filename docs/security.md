# Segurança e privacidade

## Modelo de ameaça

Principais riscos: acesso cruzado entre usuários, mídia privada cacheada/publicada, URLs assinadas vazadas, enumeração de slugs, upload malicioso, abuso de banda, exposição de GPS, conta tomada e exclusão irreversível.

## Controles obrigatórios

- Supabase Auth com sessões revogáveis e opção futura de MFA/passkeys; não construir autenticação própria no MVP.
- Autorização por objeto em toda leitura e escrita; RLS obrigatória e testada.
- Service role exclusiva do servidor, nunca incorporada no mobile ou web público.
- Bucket privado; entrega de mídia passa por decisão de acesso.
- URLs assinadas curtas, escopo mínimo e chaves de objeto aleatórias.
- Validação de tipo real, dimensões, bytes, checksum e limites no upload.
- Rate limits por IP, conta e operação; cotas reservadas antes do envio.
- Segredos somente no servidor, rotação e ambientes isolados.
- TLS, criptografia gerenciada em repouso, backups e restauração testada.
- Auditoria de login, visibilidade, concessões, exclusão e NFC.

## Privacidade de localização

EXIF é removido dos arquivos entregues. GPS exato fica em campos privados acessíveis ao proprietário. A projeção pública padrão usa lugar confirmado ou posição aproximada, nunca copia automaticamente a coordenada exata. Uma memória pública com pins individuais pode revelar residência, rotina ou presença; a configuração permite somente lugares ou mapa oculto.

## Cache e mudanças de visibilidade

Toda memória nasce privada. Publicar exige ação explícita. Trocar pública para privada exige invalidar páginas, tokens e cache de mídia. Conteúdo privado não usa cache público compartilhado. Testes automatizados cobrem transições de visibilidade, precisão geográfica e acesso cruzado.

## Dados e conformidade

Coletar o mínimo, definir retenção, exportação, exclusão e contato de privacidade. Planejar LGPD/GDPR conforme mercados, inclusive consentimento, base legal, subprocessadores e atendimento ao titular. Telemetria não contém URLs assinadas, GPS bruto, EXIF ou nomes de arquivo.

## Resposta e operação

Alertas para picos de egress, falhas de autorização e uploads anormais. Runbooks cobrem revogação, incidente de mídia, restauração e indisponibilidade. Dependências e imagens são atualizadas com processo controlado.

## Testes de lançamento

Matriz proprietário/visitante/outro usuário, slug enumerado, ID alterado, URL expirada, cache após privatização, upload disfarçado, objeto órfão e exclusão/restauração.
