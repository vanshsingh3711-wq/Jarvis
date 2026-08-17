export interface ChatSession {
  id: string;
  title: string;
  date: 'today' | 'yesterday' | 'older';
}

export const mockChatHistory: ChatSession[] = [
  { id: '1', title: 'React Performance Tuning', date: 'today' },
  { id: '2', title: 'Explain Quantum Computing', date: 'today' },
  { id: '3', title: 'Debug Authentication API', date: 'today' },
  { id: '4', title: 'Write a poem about the sea', date: 'yesterday' },
  { id: '5', title: 'Brainstorm Startup Ideas', date: 'yesterday' },
  { id: '6', title: 'Analyze system logs', date: 'older' },
  { id: '7', title: 'Translate document to French', date: 'older' },
];
