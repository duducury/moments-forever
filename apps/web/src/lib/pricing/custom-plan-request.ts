/** Digits only (country code + number), no "+" or formatting — wa.me's format. */
export const SALES_WHATSAPP_NUMBER = "12033947243";

export interface CustomPlanRequest {
  readonly name: string;
  readonly email: string;
  readonly trips: string;
  readonly photosPerTrip: string;
  readonly nfcTags: string;
}

/** Same sales WhatsApp as the other plans; the message carries what the person asked for. */
export function customPlanWhatsappHref(request: CustomPlanRequest): string {
  const message = [
    "Olá, quero montar um plano personalizado!",
    `Nome: ${request.name.trim()}`,
    `E-mail: ${request.email.trim()}`,
    `Viagens: ${request.trips.trim()}`,
    `Fotos por viagem: ${request.photosPerTrip.trim()}`,
    `Tags NFC: ${request.nfcTags.trim()}`,
  ].join("\n");
  return `https://wa.me/${SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
