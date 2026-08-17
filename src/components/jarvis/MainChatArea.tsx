import React from 'react';
import { Menu, Sparkles } from 'lucide-react';
import { ChatInput } from './ChatInput';

interface MainChatAreaProps {
  onOpenSidebar: () => void;
  onOpenVoiceMode: () => void;
}

export const MainChatArea: React.FC<MainChatAreaProps> = ({ onOpenSidebar, onOpenVoiceMode }) => {
  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 relative overflow-hidden">
      {/* Header */}
      <header className="h-16 flex items-center px-4 md:px-8 border-b border-zinc-900/50 flex-shrink-0 z-10 bg-zinc-950/80 backdrop-blur-sm">
        <button 
          onClick={onOpenSidebar}
          className="md:hidden p-2 -ml-2 mr-2 text-zinc-400 hover:text-zinc-100 transition-colors rounded-lg hover:bg-zinc-900"
        >
          <Menu size={24} />
        </button>
        <h1 className="text-zinc-100 font-medium text-lg">JARVIS</h1>
      </header>

      {/* Main Conversation Feed */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="h-full flex items-center justify-center">
          <div className="text-center text-zinc-500 space-y-4">
            <h2 className="text-2xl font-semibold text-zinc-400">How can I assist you today?</h2>
            <p className="text-sm max-w-md mx-auto">
              I am your personal AI assistant. I can help with coding, analysis, and system operations.
            </p>
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="shrink-0 bg-zinc-950/80 backdrop-blur-sm relative z-10 border-t border-zinc-900/50 flex flex-col">
        <div className="w-full max-w-4xl mx-auto px-4 md:px-6 pt-4 flex justify-end">
          {/* Voice Agent Button */}
          <button 
            onClick={onOpenVoiceMode}
            className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-800 transition-colors py-1.5 px-3 rounded-full text-sm font-medium focus:outline-none focus:ring-2 focus:ring-zinc-700 shadow-sm"
          >
            <Sparkles size={16} className="text-zinc-400" />
            <span>Voice Agent</span>
          </button>
        </div>
        <ChatInput />
      </div>
    </div>
  );
};
