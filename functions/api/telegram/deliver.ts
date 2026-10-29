import { handleDeliver, type TelegramEnv } from '../telegram';
import { logEvent } from '../../../lib/telegram/store';
import { hydratePaymentEnv } from '../../../lib/payment/gateway';

export const onRequest = async (context: { request: Request; env: TelegramEnv }): Promise<Response> => {
  const { request } = context;
  const env = (await hydratePaymentEnv(context.env as any).catch(() => context.env)) as TelegramEnv;
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  try {
    return await handleDeliver(request, env);
  } catch (e: any) {
    const message = String(e?.message || e);
    await logEvent(env, 'deliver_error', message).catch(() => null);
    return new Response(JSON.stringify({ ok: false, error: 'deliver_failed', message: message.slice(0, 300) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
};
