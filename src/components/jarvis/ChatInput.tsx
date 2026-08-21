'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Paperclip, ArrowUp, Headphones, Loader2, X, File } from 'lucide-react';

interface ChatInputProps {
  onVoiceClick?: () => void;
  onSendMessage?: (message: string, response: any, attachments?: File[]) => void;
  isLoading?: boolean;
  activeThreadId?: string | null;
  apiBaseUrl?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({ 
  onVoiceClick, 
  onSendMessage, 
  isLoading = false, 
  activeThreadId = null,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
}) => {
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isListening, setIsListening] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const isTyping = message.trim().length > 0 || files.length > 0;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [message]);

  // Voice Dictation (Web Speech API)
  const toggleDictation = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in your browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }
      setMessage((prev) => prev + (prev ? ' ' : '') + currentTranscript);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  // File Attachment Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selectedFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit Handler
  const handleSubmit = async () => {
    if ((!message.trim() && files.length === 0) || isLoading) return;

    const userMessage = message.trim();
    const attachedFiles = [...files];

    setMessage('');
    setFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    onSendMessage?.(userMessage, null, attachedFiles);

    try {
      const formData = new FormData();
      formData.append('text_query', userMessage);

      if (activeThreadId) {
        formData.append('thread_id', activeThreadId);
      }

      attachedFiles.forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch(`${apiBaseUrl}/api/v1/voice/query`, {
        method: 'POST',
        body: formData, // Browser sets multipart boundary automatically
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      onSendMessage?.(userMessage, data, attachedFiles);
    } catch (error) {
      console.error('[FRONTEND - ChatInput] Chat API Error:', error);
      onSendMessage?.(userMessage, { 
        status: "error", 
        answer: "Failed to connect to the backend. Make sure the server is running.",
        citations: [] 
      }, attachedFiles);
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
      <div className="relative flex flex-col bg-black/40 backdrop-blur-2xl border border-white/[0.06] rounded-[2rem] p-2 pl-4 focus-within:bg-black/60 focus-within:border-amber-500/30 focus-within:ring-4 focus-within:ring-amber-500/10 transition-all duration-300 shadow-lg">
        
        {/* File Previews */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-2 pt-2 pb-1">
            {files.map((file, idx) => (
              <div 
                key={`${file.name}-${idx}`} 
                className="flex items-center gap-1.5 bg-white/10 text-zinc-200 text-xs px-3 py-1.5 rounded-full border border-white/10"
              >
                <File size={14} className="text-amber-500" />
                <span className="truncate max-w-[120px]">{file.name}</span>
                <button 
                  onClick={() => removeFile(idx)}
                  className="hover:text-red-400 transition-colors ml-1"
                  aria-label="Remove attachment"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text Input Row */}
        <div className="flex items-end gap-2 w-full">
          {/* File Input */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            multiple 
          />
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 shrink-0 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-all duration-200 focus:outline-none mb-0.5"
            title="Add context or files"
            aria-label="Add context or files"
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

          {/* Action Buttons */}
          <div className="flex items-center gap-1 pr-1 mb-0.5">
            {/* Voice Dictation Button */}
            <button 
              type="button"
              onClick={toggleDictation}
              className={`p-3 shrink-0 rounded-full transition-all duration-200 focus:outline-none ${
                isListening 
                  ? 'text-amber-500 bg-amber-500/20 animate-pulse' 
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/10'
              }`}
              title={isListening ? 'Stop dictation' : 'Type with voice'}
              aria-label={isListening ? 'Stop dictation' : 'Type with voice'}
            >
              <Mic size={20} strokeWidth={1.5} />
            </button>

            {/* Submit / Voice Mode Button */}
            {isLoading ? (
              <div className="p-2.5 shrink-0 rounded-full flex items-center justify-center bg-amber-500/20 text-amber-500">
                <Loader2 size={22} strokeWidth={2} className="animate-spin" />
              </div>
            ) : isTyping ? (
              <button
                type="button"
                onClick={handleSubmit}
                className="p-2.5 shrink-0 rounded-full transition-all duration-300 focus:outline-none flex items-center justify-center bg-amber-500 text-black shadow-md hover:bg-amber-400 hover:scale-105 animate-in zoom-in duration-200"
                title="Send request"
                aria-label="Send message"
              >
                <ArrowUp size={22} strokeWidth={2.5} />
              </button>
            ) : (
              <button 
                type="button"
                onClick={onVoiceClick}
                className="relative p-3 shrink-0 rounded-full transition-all duration-300 focus:outline-none group bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 shadow-[0_4px_20px_rgba(245,158,11,0.15)] animate-in zoom-in duration-200"
                title="Start Voice Mode"
                aria-label="Start Voice Mode"
              >
                <Headphones size={20} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Disclaimer */}
      <div className="text-center mt-4">
        <p className="text-[11px] text-zinc-500 font-light tracking-wide">
          JARVIS can make mistakes. Please verify important information.
        </p>
      </div>
    </div>
  );
};