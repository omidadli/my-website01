/**
 * chatStorage: A dedicated LocalStorage wrapper to persist the last 5 chat messages
 * in ChatWidget / AssistantPanel, ensuring users retain conversation context on page refresh.
 */

export interface StoredChatMsg {
  role: 'user' | 'model';
  content: string;
}

const CHAT_STORAGE_KEY = 'nd_chat_recent_messages_v1';
const MAX_MESSAGES = 5;

export const chatStorage = {
  /**
   * Retrieves the last saved messages from localStorage.
   * Returns empty array if none found or in case of parsing errors.
   */
  loadMessages: (): StoredChatMsg[] => {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        // Enforce max 5 items
        return parsed.slice(-MAX_MESSAGES).filter(
          (m): m is StoredChatMsg =>
            m &&
            typeof m.content === 'string' &&
            (m.role === 'user' || m.role === 'model')
        );
      }
      return [];
    } catch (err) {
      console.warn('Failed to load chat history from localStorage', err);
      return [];
    }
  },

  /**
   * Saves the list of messages, strictly persisting only the last 5.
   */
  saveMessages: (messages: StoredChatMsg[]): void => {
    if (typeof window === 'undefined') return;
    try {
      const last5 = messages.slice(-MAX_MESSAGES);
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(last5));
    } catch (err) {
      console.warn('Failed to save chat history to localStorage', err);
    }
  },

  /**
   * Clears the saved chat messages from localStorage.
   */
  clearMessages: (): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // ignore
    }
  },
};

/* -------------------------------------------------------------------------
 * Conversation session ids.
 *
 * The server keeps a per-session memory of the conversation (so the AI can
 * review the previous chats — even after switching to a backup API key — and
 * continue naturally). The client only has to send a stable id for the
 * conversation; it is stored next to the messages and rotated after a few days
 * of inactivity so a new chat starts as a genuinely new conversation.
 * ----------------------------------------------------------------------- */

const SESSION_KEY = 'nd_chat_sessions_v1';
const SESSION_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days of silence = new conversation

const newId = (): string => {
  try {
    return (crypto as any)?.randomUUID?.() || `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  } catch {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
};

/**
 * Stable session id for a conversation scope ('site', 'business-therapist', …).
 * Rotates automatically when the previous session is older than SESSION_TTL_MS.
 */
export const getChatSessionId = (scope = 'site'): string => {
  if (typeof window === 'undefined') return `s-${scope}`;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const map: Record<string, { id: string; updatedAt: number }> = raw ? JSON.parse(raw) : {};
    const current = map[scope];
    const fresh = current && typeof current.id === 'string' && Date.now() - (current.updatedAt || 0) < SESSION_TTL_MS;
    const id = fresh ? current!.id : newId();
    map[scope] = { id, updatedAt: Date.now() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(map));
    return id;
  } catch {
    return `s-${scope}`;
  }
};

/** Forget a conversation (used when the user clears the chat). */
export const resetChatSession = (scope = 'site'): string => {
  const id = newId();
  if (typeof window === 'undefined') return id;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const map: Record<string, { id: string; updatedAt: number }> = raw ? JSON.parse(raw) : {};
    map[scope] = { id, updatedAt: Date.now() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  return id;
};
