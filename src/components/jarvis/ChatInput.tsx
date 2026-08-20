'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Paperclip, ArrowUp, Headphones, Loader2 } from 'lucide-react';

interface ChatInputProps {
  onVoiceClick?: () => void;
  onSendMessage?: (message: string, response: any) => void;
  isLoading?: boolean;
  activeThreadId?: string | null;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onVoiceClick, onSendMessage, isLoading = false, activeThreadId = null }) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isTyping = message.trim().length > 0;

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [message]);

  const handleSubmit = async () => {
    if (!message.trim() || isLoading) return;
    const userMessage = message.trim();
    setMessage('');
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Immediately notify parent of the user message (response will come later)
    onSendMessage?.(userMessage, null);

    try {
      const boundary = crypto.randomUUID();
      let body = `--${boundary}\r\nContent-Disposition: form-data; name="text_query"\r\n\r\n${userMessage}\r\n`;
      
      if (activeThreadId) {
        body += `--${boundary}\r\nContent-Disposition: form-data; name="thread_id"\r\n\r\n${activeThreadId}\r\n`;
      }
      
      body += `--${boundary}--\r\n`;

      const response = await fetch('http://localhost:8000/api/v1/voice/query', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body: body
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      // Notify parent of the AI response
      onSendMessage?.(userMessage, data);
    } catch (error) {
      console.error("Chat API Error:", error);
      onSendMessage?.(userMessage, { 
        status: "error", 
        answer: "Failed to connect to the backend. Make sure the server is running on port 8000.",
        citations: [] 
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-4 md:p-6 bg-transparent">
      
      {/* 
        Main Input Container
        Deeply rounded "Executive Pill" design with soft glassmorphism
      */}
      <div className="relative flex items-end gap-2 bg-black/40 backdrop-blur-2xl border border-white/[0.06] rounded-[2rem] p-2 pl-4 focus-within:bg-black/60 focus-within:border-amber-500/30 focus-within:ring-4 focus-within:ring-amber-500/10 transition-all duration-300 shadow-lg">
        
        {/* Attachment Button */}
        <button 
          className="p-3 shrink-0 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-all duration-200 focus:outline-none mb-0.5"
          title="Add context or files"
        >
          <Paperclip size={20} strokeWidth={1.5} />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask JARVIS to help with your day..."
          disabled={isLoading}
          className="flex-1 max-h-[150px] bg-transparent border-0 resize-none py-3.5 px-2 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-0 custom-scrollbar text-[15px] leading-relaxed font-light disabled:opacity-50"
          rows={1}
        />

        {/* Right Side Action Buttons */}
        <div className="flex items-center gap-1 pr-1 mb-0.5">
          
          {/* 
            Dictation / Voice Typing Button 
          */}
          <button 
            onClick={() => console.log('Start dictation')}
            className="p-3 shrink-0 rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-all duration-200 focus:outline-none"
            title="Type with voice"
          >
            <Mic size={20} strokeWidth={1.5} />
          </button>

          {/* 
            Voice Mode or Send Button
            Swaps between Live Voice Mode and Send depending on if the user is typing
          */}
          {isLoading ? (
            <div className="p-2.5 shrink-0 rounded-full flex items-center justify-center bg-amber-500/20 text-amber-500">
              <Loader2 size={22} strokeWidth={2} className="animate-spin" />
            </div>
          ) : isTyping ? (
            <button
              onClick={handleSubmit}
              className="p-2.5 shrink-0 rounded-full transition-all duration-300 focus:outline-none flex items-center justify-center bg-amber-500 text-black shadow-md hover:bg-amber-400 hover:scale-105 animate-in zoom-in duration-200"
              title="Send request"
            >
              <ArrowUp size={22} strokeWidth={2.5} />
            </button>
          ) : (
            <button 
              onClick={onVoiceClick}
              className="relative p-3 shrink-0 rounded-full transition-all duration-300 focus:outline-none group bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 shadow-[0_4px_20px_rgba(245,158,11,0.15)] animate-in zoom-in duration-200"
              title="Start Voice Mode"
            >
              <Headphones size={20} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
      
      {/* Clean, subtle disclaimer */}
      <div className="text-center mt-4">
        <p className="text-[11px] text-zinc-500 font-light tracking-wide">
          JARVIS can make mistakes. Please verify important information.
        </p>
      </div>
    </div>
  );
};