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
    <div 
      className={`group relative py-5 flex gap-4 md:gap-5 px-4 md:px-8 transition-all duration-300 ${
        isUser 
          ? 'hover:bg-white/[0.01]' 
          : 'bg-white/[0.02] backdrop-blur-xl rounded-3xl my-2 mx-2 md:mx-4 border border-white/[0.03] shadow-sm'
      }`}
    >
      {/* Avatar Column */}
      <div className="shrink-0 pt-0.5">
        {isUser ? (
          <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-b from-zinc-800 to-zinc-900 border border-white/5 shadow-inner">
            <User size={18} className="text-zinc-400" strokeWidth={1.5} aria-hidden="true" />
          </div>
        ) : (
          <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-900/20 border border-amber-500/20 shadow-[0_4px_20px_rgba(245,158,11,0.1)]">
            <Sparkles size={20} className="text-amber-500" strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Content Column */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5 py-1">
        
        {/* Header (Name, Timestamp, Actions) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-3">
            <span className={`text-[15px] font-medium tracking-wide ${isUser ? 'text-zinc-200' : 'text-amber-500/90'}`}>
              {isUser ? userName : aiName}
            </span>
            <span className="text-[11px] text-zinc-500 font-light tracking-wider">
              {message.timestamp}
            </span>
          </div>

          {/* Copy Button (Only on AI messages, fades in on hover) */}
          {!isUser && (
            <button 
              onClick={handleCopy}
              aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
              className="opacity-0 group-hover:opacity-100 transition-all duration-200 p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-zinc-100 focus:outline-none"
              title="Copy to clipboard"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          )}
        </div>

        {/* Message Body */}
        {/* Note: If your AI returns Markdown, consider replacing this div with a package like 'react-markdown' */}
        <div className="text-zinc-300 text-[15px] leading-[1.75] whitespace-pre-wrap font-light tracking-wide mt-0.5">
          {message.content}
        </div>

        {/* Citations / Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-4 flex flex-col gap-2.5">
            <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest pl-1">
              References
            </div>
            <div className="flex flex-wrap gap-2">
              {message.sources.map((source) => (
                <a
                  key={source.id}
                  href={source.url || '#'}
                  target={source.url ? "_blank" : undefined}
                  rel={source.url ? "noopener noreferrer" : undefined}
                  className="group/source inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/30 backdrop-blur-sm border border-white/5 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-white/10 hover:border-white/10 transition-all duration-300"
                >
                  <FileText size={12} className="text-amber-500/70 group-hover/source:text-amber-400 transition-colors" strokeWidth={2} aria-hidden="true" />
                  <span className="truncate max-w-[200px] font-light">
                    {source.title}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// Required when using React.memo with anonymous functions
ChatMessage.displayName = 'ChatMessage';