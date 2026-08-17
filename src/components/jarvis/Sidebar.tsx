import React from 'react';
import { Bot, MessageSquare, Search, Settings, User, Plus } from 'lucide-react';
import { mockChatHistory, ChatSession } from './MockData';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const todayChats = mockChatHistory.filter((chat) => chat.date === 'today');
  const yesterdayChats = mockChatHistory.filter((chat) => chat.date === 'yesterday');

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden" 
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <div 
        className={`fixed top-0 left-0 z-50 h-full w-72 bg-zinc-950 border-r border-zinc-800 flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 md:static ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header Area */}
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center gap-3 px-2 py-2 text-zinc-100">
            <div className="bg-zinc-100 text-zinc-950 p-1.5 rounded-lg">
              <Bot size={24} strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-lg tracking-wide">JARVIS</span>
          </div>

          <button className="flex items-center justify-center gap-2 w-full bg-zinc-100 text-zinc-950 hover:bg-zinc-200 transition-colors py-2.5 px-4 rounded-lg font-medium">
            <Plus size={18} />
            <span>New Chat</span>
          </button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input 
              type="text" 
              placeholder="Search history..." 
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 pl-9 pr-4 text-sm text-zinc-300 focus:outline-none focus:border-zinc-700 transition-colors"
            />
          </div>
        </div>

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-zinc-500 mb-2 px-2 uppercase tracking-wider">Today</h3>
            <div className="flex flex-col gap-1">
              {todayChats.map((chat) => (
                <HistoryItem key={chat.id} chat={chat} />
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xs font-semibold text-zinc-500 mb-2 px-2 uppercase tracking-wider">Yesterday</h3>
            <div className="flex flex-col gap-1">
              {yesterdayChats.map((chat) => (
                <HistoryItem key={chat.id} chat={chat} />
              ))}
            </div>
          </div>
        </div>

        {/* Footer Settings/Profile */}
        <div className="p-4 border-t border-zinc-800">
          <button className="flex items-center gap-3 w-full p-2 hover:bg-zinc-900 rounded-lg text-zinc-300 transition-colors">
            <Settings size={18} />
            <span className="text-sm font-medium">Settings</span>
          </button>
          <button className="flex items-center gap-3 w-full p-2 hover:bg-zinc-900 rounded-lg text-zinc-300 transition-colors mt-1">
            <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
              <User size={14} />
            </div>
            <span className="text-sm font-medium">Profile</span>
          </button>
        </div>
      </div>
    </>
  );
};

const HistoryItem: React.FC<{ chat: ChatSession }> = ({ chat }) => {
  return (
    <button className="flex items-center gap-3 w-full text-left p-2 hover:bg-zinc-900 rounded-lg text-zinc-300 transition-colors group">
      <MessageSquare size={16} className="text-zinc-500 group-hover:text-zinc-300 shrink-0" />
      <span className="text-sm truncate">{chat.title}</span>
    </button>
  );
};
