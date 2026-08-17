'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic } from 'lucide-react';

export const ChatInput: React.FC = () => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSubmit = () => {
    if (!message.trim()) return;
    // Mock submission
    console.log('Submitted message:', message);
    setMessage('');
    
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 bg-zinc-950">
      <div className="relative flex items-end gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-2 focus-within:ring-1 focus-within:ring-zinc-700 focus-within:border-zinc-700 transition-all duration-200 shadow-sm">
        
        {/* Microphone Button (Voice Interface Placeholder) */}
        <button 
          className="p-3 shrink-0 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors group relative focus:outline-none focus:ring-2 focus:ring-zinc-700"
          title="Voice input"
        >
          <Mic size={20} />
          {/* Subtle pulse ring for aesthetics on hover */}
          <div className="absolute inset-0 rounded-xl border border-zinc-700/50 scale-110 opacity-0 group-hover:animate-ping duration-1000 hidden md:block"></div>
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message JARVIS..."
          className="flex-1 max-h-[200px] bg-transparent border-0 resize-none py-3 px-2 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-0 custom-scrollbar leading-relaxed"
          rows={1}
        />

        {/* Send Button */}
        <button
          onClick={handleSubmit}
          disabled={!message.trim()}
          className="p-3 shrink-0 rounded-xl bg-zinc-100 text-zinc-950 disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 hover:bg-zinc-200 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-700"
          title="Send message (Enter)"
        >
          <Send size={20} className="ml-0.5" />
        </button>
      </div>
      <div className="text-center mt-3">
        <p className="text-xs text-zinc-500">
          JARVIS can make mistakes. Consider verifying important information.
        </p>
      </div>
    </div>
  );
};
