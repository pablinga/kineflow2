import { createMercadoPagoWebhookHandler } from "@/lib/mercadopago-webhook";

// Ruta oficial: es la configurada en el panel de Mercado Pago (con www).
export const POST = createMercadoPagoWebhookHandler("/api/mercadopago/webhook");
