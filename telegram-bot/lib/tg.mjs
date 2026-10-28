/**
 * Minimal Telegram Bot API client — zero-dependency (fetch + FormData).
 * Docs: https://core.telegram.org/bots/api
 */
import fs from 'node:fs';
import path from 'node:path';

const API = (token) => `https://api.telegram.org/bot${token}`;

/** Escape user-supplied text for HTML parse_mode (never trust user input). */
export const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Low-level call. Throws on transport errors; returns { ok, result, description }. */
export async function tgCall(token, method, payload = {}) {
  const res = await fetch(`${API(token)}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

/** Call and throw a readable error when ok=false. */
export async function tgCallOk(token, method, payload = {}) {
  const j = await tgCall(token, method, payload);
  if (!j.ok) throw new Error(`Telegram ${method} failed: ${j.error_code} ${j.description}`);
  return j.result;
}

/** Split long messages under Telegram's 4096-char limit (at paragraph edges). */
export function chunkMessage(text, limit = 4000) {
  const s = String(text || '');
  if (s.length <= limit) return [s];
  const parts = [];
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

export const sendMessage = async (token, chatId, text, extra = {}) => {
  const out = [];
  for (const part of chunkMessage(text)) {
    out.push(await tgCallOk(token, 'sendMessage', { chat_id: chatId, text: part, ...extra }));
  }
  return out;
};

export const editMessageText = (token, chatId, messageId, text, extra = {}) =>
  tgCallOk(token, 'editMessageText', { chat_id: chatId, message_id: messageId, text, ...extra });

export const answerCallback = (token, callbackQueryId, text = '', showAlert = false) =>
  tgCall(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId, text, show_alert: showAlert });

export const sendChatAction = (token, chatId, action = 'typing') =>
  tgCall(token, 'sendChatAction', { chat_id: chatId, action });

/** Document by file_id (re-send an uploaded file) or by public URL. */
export const sendDocument = async (token, chatId, { fileId, url, filename, caption } = {}) => {
  const payload = { chat_id: chatId };
  if (caption) payload.caption = caption;
  if (fileId) return tgCallOk(token, 'sendDocument', { ...payload, document: fileId });
  if (url) return tgCallOk(token, 'sendDocument', { ...payload, document: url, ...(filename ? { file_name: filename } : {}) });
  throw new Error('sendDocument needs fileId or url');
};

/** Upload a local file (e.g. an invoice) as multipart/form-data. */
export const sendLocalDocument = async (token, chatId, filePath, caption = '') => {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  if (caption) form.set('caption', caption);
  form.set('document', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  const res = await fetch(`${API(token)}/sendDocument`, { method: 'POST', body: form });
  return res.json();
};

export const getFileLink = async (token, fileId) => {
  const j = await tgCallOk(token, 'getFile', { file_id: fileId });
  return `https://api.telegram.org/file/bot${token}/${j.file_path}`;
};

export const getMe = (token) => tgCallOk(token, 'getMe');

export const deleteWebhook = (token) => tgCallOk(token, 'deleteWebhook', { drop_pending_updates: false });

export const setWebhook = (token, url, secretToken) =>
  tgCallOk(token, 'setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message', 'callback_query', 'my_chat_member'],
    drop_pending_updates: false,
  });

/* ---------------- keyboards ---------------- */

/** Reply keyboard with ONE magic button that asks Telegram for the phone. */
export const sharePhoneKeyboard = (text = '📱 اشتراک شماره تلفن من') => ({
  keyboard: [[{ text, request_contact: true, resize_keyboard: true }], [{ text: '❌ انصراف' }]],
  resize_keyboard: true,
  one_time_keyboard: true,
  is_persistent: false,
});

export const mainMenuKeyboard = () => ({
  keyboard: [
    [{ text: '📱 احراز هویت شماره' }, { text: '🎁 محصولات من' }],
    [{ text: '📦 سفارش‌ها و تحویل' }, { text: '💬 پشتیبانی' }],
    [{ text: '❓ راهنما' }],
  ],
  resize_keyboard: true,
});

export const removeKeyboard = () => ({ remove_keyboard: true });

/** Inline keyboard from rows of { text, data } / { text, url }. */
export const inlineKeyboard = (rows) => ({
  inline_keyboard: rows.map((row) => row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))),
});
