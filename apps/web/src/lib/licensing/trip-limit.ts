export const NO_ACTIVE_LICENSE_MESSAGE =
  "Você precisa ativar uma key para criar uma viagem.";

/**
 * What the person sees when the server refuses a new trip because the
 * account's plan is used up. `limit` is the account's total allowance (keys
 * stack, so it is the sum over every active key); when it can't be read the
 * message stays correct without the number.
 */
export function tripLimitMessage(limit: number | null | undefined): string {
  if (typeof limit === "number" && Number.isFinite(limit) && limit >= 0) {
    const noun = limit === 1 ? "viagem" : "viagens";
    return `Você atingiu o limite de ${limit} ${noun} do seu plano atual. Ative uma nova key para continuar criando viagens.`;
  }
  return "Você atingiu o limite de viagens do seu plano atual. Ative uma nova key para continuar criando viagens.";
}
