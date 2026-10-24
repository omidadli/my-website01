/** Same bounded request validation in development and production. */
export const CHAT_MAX_QUESTION = 6000;
export function parseChatMessages(value: unknown): { messages: { role: 'user' | 'model'; content: string }[]; question: string; error?: string } {
  const invalid = (error: string) => ({ messages: [], question: '', error });
  if (!Array.isArray(value) || !value.length) return invalid('سوال خالی است.');
  const last = value[value.length - 1];
  if (!last || last.role !== 'user' || typeof last.content !== 'string') return invalid('آخرین پیام باید سؤال متنی کاربر باشد.');
  const question = last.content.trim();
  if (!question) return invalid('سوال خالی است.');
  if (question.length > CHAT_MAX_QUESTION) return invalid(`پیام باید حداکثر ${CHAT_MAX_QUESTION.toLocaleString('fa-IR')} نویسه باشد؛ لطفاً آن را کوتاه‌تر کنید.`);
  const messages = value.slice(-16).filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.content === 'string' && m.content.trim()).map(m => ({ role: m.role as 'user' | 'model', content: m.content.slice(0, 12000) }));
  messages[messages.length - 1].content = question;
  return { messages, question };
}

/** Keep product memories distinct even if clients accidentally reuse a session id. */
export function productConversationId(productId: string, sessionId: string): string {
  return `product:${productId}:${sessionId}`.slice(0, 120);
}
