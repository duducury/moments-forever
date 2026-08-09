# IA

## Papel

IA deve reduzir trabalho sem substituir decisão do usuário. O MVP preserva dados e pontos de extensão, mas usa agrupamento determinístico.

## Capacidades futuras

- Reconhecimento e sugestão de lugares.
- Pontuação estética e sugestão de capa.
- Deduplicação semântica e seleção de melhores fotos.
- Resumos, timeline e vídeos.
- Identificação de restaurantes, hotéis e pontos turísticos.

## Preparação arquitetural

- Manter metadados normalizados e versões do algoritmo.
- Registrar sugestões separadas das confirmações humanas.
- Jobs assíncronos idempotentes com estado, custo e cancelamento.
- Vetores e rótulos derivados não entram no modelo principal até haver caso validado.
- Provedores ficam atrás de contratos específicos, sem acoplar o domínio.

## Guardrails

- Opt-in explícito quando pixels saírem do ambiente já esperado.
- Nunca treinar modelos com mídia do usuário sem consentimento específico.
- Sugestões são editáveis, explicáveis quando possível e não publicam sozinhas.
- GPS, rostos e inferências sensíveis recebem política de retenção.
- Orçamento por conta, fila, rate limit e métricas evitam custo inesperado.

## Não fazer no MVP

Não enviar toda foto a modelos, criar embeddings preventivamente ou prometer reconhecimento confiável. Primeiro medir o valor do agrupamento local e as correções feitas pelos usuários.
