export interface ChatSession {
  id: string;
  title: string;
  date: string; // ISO string
  icon: 'calendar' | 'briefcase' | 'sparkle';
}

const STORAGE_KEY = 'jarvis_chat_sessions';

export const getStoredSessions = (): ChatSession[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const sessions: ChatSession[] = JSON.parse(raw);
    
    // Optional: Sort by date descending
    sessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sessions;
  } catch (e) {
    console.error("Error reading sessions from localStorage", e);
    return [];
  }
};

export const saveSession = (session: ChatSession) => {
  if (typeof window === 'undefined') return;
  const sessions = getStoredSessions();
  
  // Update if exists, else prepend
  const existingIndex = sessions.findIndex(s => s.id === session.id);
  if (existingIndex >= 0) {
    sessions[existingIndex] = session;
  } else {
    sessions.unshift(session);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  window.dispatchEvent(new Event('sessionsUpdated'));
};

export const deleteSession = (id: string) => {
  if (typeof window === 'undefined') return;
  const sessions = getStoredSessions().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  window.dispatchEvent(new Event('sessionsUpdated'));
};

// Helper for generating short titles based on user query
export const generateSessionTitle = (query: string): string => {
  if (!query) return "New Conversation";
  const words = query.split(' ');
  if (words.length <= 4) return query;
  return words.slice(0, 4).join(' ') + '...';
};

// Helper to determine relative date string ('today', 'yesterday')
export const getRelativeDateString = (isoDate: string): string => {
  const d = new Date(isoDate);
  const now = new Date();
  
  // Reset times to midnight for date comparison
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  
  const diffTime = now.getTime() - d.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return d.toLocaleDateString();
};
