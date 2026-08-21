import React, { useState, useCallback } from 'react';
import { User, Sparkles, FileText, Copy, Check } from 'lucide-react';

export interface ChatMessageData {
  id: string;
  role: 'user' | 'ai' | 'assistant'; // Added 'assistant' for broader compatibility
  content: string;
  timestamp: string;
  sources?: { id: string; url?: string; title: string }[];
}

interface ChatMessageProps {
  message: ChatMessageData;
  userName?: string;
  aiName?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = React.memo(({ 
  message, 
  userName = 'User',
  aiName = 'JARVIS' 
}) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  // Wrapped in useCallback and try/catch for safety and performance
  const handleCopy = useCallback(async () => {
    if (!message.content) return;
    
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text to clipboard:', err);
    }
  }, [message.content]);

  return (
    <div className={`flex flex-col w-full py-3 animate-in fade-in duration-500 ${isUser ? 'items-end pr-4 md:pr-8' : 'items-start pl-4 md:pl-8'}`}>
      
      {/* Sender Header */}
      <div className={`flex items-center gap-2 mb-1.5 ${isUser ? 'flex-row-reverse mr-2' : 'ml-2'}`}>
        <div className={`flex items-center justify-center w-6 h-6 rounded-full shadow-sm ${
          isUser 
            ? 'bg-zinc-800 border border-white/5' 
            : 'bg-amber-500/20 border border-amber-500/20'
        }`}>
          {isUser ? <User size={12} className="text-zinc-400" /> : <Sparkles size={12} className="text-amber-500" />}
        </div>
        <span className={`text-[12px] font-medium tracking-wide ${isUser ? 'text-zinc-400' : 'text-amber-500/90'}`}>
          {isUser ? userName : aiName}
        </span>
        <span className="text-[10px] text-zinc-600 font-light tracking-wider ml-1">
          {message.timestamp}
        </span>
      </div>

      {/* Bubble Content */}
      <div className="group relative flex flex-col max-w-[90%] md:max-w-[75%]">
        <div className={`px-5 py-3.5 rounded-[1.5rem] shadow-sm relative ${
          isUser 
            ? 'bg-amber-500/[0.08] border border-amber-500/20 text-zinc-100 rounded-br-sm' 
            : 'bg-white/[0.04] border border-white/[0.06] text-zinc-200 backdrop-blur-2xl rounded-bl-sm'
        }`}>
          
          {/* Copy Button (Only on AI messages, fades in on hover) */}
          {!isUser && (
            <button 
              onClick={handleCopy}
              aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
              className="absolute -right-10 top-2 opacity-0 group-hover:opacity-100 transition-all duration-200 p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-zinc-100 focus:outline-none"
              title="Copy to clipboard"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          )}

          <div className="text-[15px] leading-[1.75] whitespace-pre-wrap font-light tracking-wide">
            {message.content}
          </div>
        </div>

        {/* Citations / Sources */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 ml-2">
            {message.sources.map((source) => (
              <a
                key={source.id}
                href={source.url || '#'}
                target={source.url ? "_blank" : undefined}
                rel={source.url ? "noopener noreferrer" : undefined}
                className="group/source inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/30 backdrop-blur-sm border border-white/5 text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-white/10 hover:border-white/10 transition-all duration-300"
              >
                <FileText size={10} className="text-amber-500/70 group-hover/source:text-amber-400 transition-colors" strokeWidth={2} aria-hidden="true" />
                <span className="truncate max-w-[150px] font-light">
                  {source.title}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

    </div>
  );
});

// Required when using React.memo with anonymous functions
ChatMessage.displayName = 'ChatMessage';