import { createMercadoPagoWebhookHandler } from "@/lib/mercadopago-webhook";

// Alias de /api/mercadopago/webhook (la oficial). Se loguea con su ruta para
// confirmar que no le llega nada antes de borrarla.
export const POST = createMercadoPagoWebhookHandler("/api/billing/webhook");
