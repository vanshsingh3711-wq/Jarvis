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

export interface SourceReference {
  id: string;
  title: string;
  url?: string;
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: SourceReference[];
}

export const mockMessages: ChatMessageData[] = [
  {
    id: '1',
    role: 'user',
    content: 'Can you analyze the performance bottleneck in our React application?',
    timestamp: '10:00 AM'
  },
  {
    id: '2',
    role: 'assistant',
    content: 'I\'ve analyzed the React performance traces. The primary bottleneck appears to be unnecessary re-renders in the `DataGrid` component. I noticed that the `columns` prop is being recreated on every render, causing all child cells to update even when data hasn\'t changed.\n\nTo fix this, we should memoize the `columns` definition using `useMemo`. Would you like me to show you the updated code?',
    timestamp: '10:01 AM',
    sources: [
      { id: 's1', title: 'React DevTools Trace', url: '#' },
      { id: 's2', title: 'DataGrid.tsx', url: '#' }
    ]
  },
  {
    id: '3',
    role: 'user',
    content: 'Yes, please provide the updated code.',
    timestamp: '10:03 AM'
  },
  {
    id: '4',
    role: 'assistant',
    content: 'Here is the refactored code using `useMemo`:\n\n```typescript\nimport React, { useMemo } from \'react\';\n\nconst MyComponent = ({ data }) => {\n  const columns = useMemo(() => [\n    { key: \'id\', label: \'ID\' },\n    { key: \'name\', label: \'Name\' }\n  ], []);\n\n  return <DataGrid data={data} columns={columns} />;\n};\n```\n\nThis will ensure the `columns` reference remains stable across renders unless its dependencies change.',
    timestamp: '10:04 AM'
  }
];
