type Turn = { role: 'user' | 'model'; content: string };
/** Retrying a failed delivery must not duplicate the user's turn in AI history. */
export function nextChatMessages(messages: Turn[], question: string, failedQuestion: string | null): Turn[] {
  const last = messages[messages.length - 1];
  if (failedQuestion === question && last?.role === 'user' && last.content === question) return [...messages];
  return [...messages, { role: 'user', content: question }];
}
