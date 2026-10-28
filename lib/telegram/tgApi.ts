/**
 * lib/telegram/tgApi.ts — Telegram Bot API client for Cloudflare Workers/Pages.
 * Same behaviour as telegram-bot/lib/tg.mjs (the self-hosted Node variant).
 */

export interface TgKeyboardButton {
  text: string;
  request_contact?: boolean;
  url?: string;
  callback_data?: string;
}

export const escapeHtml = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const API = (token: string) => `https://api.telegram.org/bot${token}`;

export async function tgCall<T = any>(token: string, method: string, payload: Record<string, unknown> = {}): Promise<{ ok: boolean; result?: T; error_code?: number; description?: string }> {
  try {
    const res = await fetch(`${API(token)}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e: any) {
    return { ok: false, description: String(e?.message || e || 'network') };
  }
}

export async function tgCallOk<T = any>(token: string, method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const j = await tgCall<T>(token, method, payload);
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.error_code || ''} ${j.description || ''}`);
  return j.result as T;
}

/** Split long messages under Telegram's 4096 limit at paragraph edges. */
export function chunkMessage(text: string, limit = 4000): string[] {
  const s = String(text || '');
  if (s.length <= limit) return [s];
  const parts: string[] = [];
  let rest = s;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest) parts.push(rest);
  return parts;
}

export const sendMessage = async (token: string, chatId: string | number, text: string, extra: Record<string, unknown> = {}): Promise<void> => {
  for (const part of chunkMessage(text)) {
    await tgCall(token, 'sendMessage', { chat_id: chatId, text: part, parse_mode: 'HTML', ...extra });
  }
};

export const editMessageText = (token: string, chatId: string | number, messageId: number, text: string, extra: Record<string, unknown> = {}) =>
  tgCall(token, 'editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', ...extra });

export const answerCallback = (token: string, callbackQueryId: string, text = '', showAlert = false) =>
  tgCall(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId, text, show_alert: showAlert });

/** Download a Telegram file (receipt photo) as base64. */
export const downloadFileBase64 = async (token: string, fileId: string): Promise<{ base64: string; mime: string } | null> => {
  const info = await tgCall<{ file_path: string }>(token, 'getFile', { file_id: fileId });
  if (!info.ok || !info.result?.file_path) return null;
  const res = await fetch(`${API(token)}/${info.result.file_path}`);
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return { base64: btoa(bin), mime: 'image/jpeg' };
};

/* ----------------------------- keyboards ----------------------------- */

export const sharePhoneKeyboard = (text = '📱 اشتراک شماره تلفن من') => ({
  keyboard: [[{ text, request_contact: true }], [{ text: '❌ انصراف' }]],
  resize_keyboard: true,
  one_time_keyboard: true,
});

export const mainMenuKeyboard = () => ({
  keyboard: [
    [{ text: '📱 احراز هویت شماره' }, { text: '🛒 خرید اشتراک' }],
    [{ text: '🎁 اشتراک‌های من' }, { text: '📦 سفارش‌ها' }],
    [{ text: '💬 پشتیبانی' }, { text: '❓ راهنما' }],
  ],
  resize_keyboard: true,
});

export const removeKeyboard = () => ({ remove_keyboard: true });

export const inlineKeyboard = (rows: TgKeyboardButton[][]) => ({
  inline_keyboard: rows.map((row) =>
    row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.callback_data }))
  ),
});
