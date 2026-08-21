'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Menu, ShoppingBag, Map, GraduationCap, Phone, Sparkles } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation'; // Now properly utilized
import { ChatInput } from './ChatInput';
import { ChatMessage, ChatMessageData } from './ChatMessage';
import { ParticleOrb } from './ParticleOrb';
import { saveSession, generateSessionTitle } from './historyManager';

interface MainChatAreaProps {
  onOpenSidebar: () => void;
  onOpenVoiceMode: () => void;
  activeThreadId: string | null;
  setActiveThreadId: (id: string) => void;
  isVoiceMode?: boolean;
}

export const MainChatArea: React.FC<MainChatAreaProps> = ({ 
  onOpenSidebar, 
  onOpenVoiceMode, 
  activeThreadId, 
  setActiveThreadId, 
  isVoiceMode 
}) => {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userName, setUserName] = useState('User');
  
  const supabase = createClient();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserName(data.user.user_metadata?.name?.split(' ')[0] || data.user.email?.split('@')[0] || 'User');
      }
    });
  }, [supabase]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]); // Added isLoading so it scrolls when the typing indicator appears

  // Load history when activeThreadId changes
  useEffect(() => {
    if (!activeThreadId || isVoiceMode) {
      if (!activeThreadId) setMessages([]);
      return;
    }
    
    // Use AbortController to prevent race conditions if the user switches threads quickly
    const controller = new AbortController();
    setIsLoading(true);

    fetch(`${apiBaseUrl}/api/v1/voice/history/${activeThreadId}`, { 
      signal: controller.signal 
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch history');
        return res.json();
      })
      .then(data => {
        const history = data.chat_history || [];
        const loadedMessages: ChatMessageData[] = history.map((msg: any, i: number) => ({
          id: `hist-${i}`,
          role: msg.role === 'human' || msg.role === 'user' ? 'user' : 'ai',
          content: msg.content,
          timestamp: '', // Optional: format from your backend if available
        }));
        setMessages(loadedMessages);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error("[FRONTEND - MainChatArea] Failed to load history:", err);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => controller.abort(); // Cleanup on unmount or thread change
  }, [activeThreadId, isVoiceMode, apiBaseUrl]);

  // Updated signature to accept attachments from ChatInput
  const handleSendMessage = useCallback((userMessage: string, response: any, attachments?: File[]) => {
    if (response === null) {
      const attachmentText = attachments && attachments.length > 0 
        ? `\n\n[Attached ${attachments.length} file(s)]` 
        : '';
        
      const userMsg: ChatMessageData = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userMessage + attachmentText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, userMsg]);
      setIsLoading(true);
      return;
    }

    setIsLoading(false);
    
    if (!activeThreadId && response.thread_id) {
      setActiveThreadId(response.thread_id);
      saveSession({
        id: response.thread_id,
        title: generateSessionTitle(userMessage),
        date: new Date().toISOString(),
        icon: 'sparkle'
      });
    }

    const aiMsg: ChatMessageData = {
      id: `ai-${Date.now()}`,
      role: 'ai',
      content: response.answer || response.final_answer || "No response received.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      sources: response.citations?.map((cite: any, i: number) => ({
        id: cite.id || `src-${i}`,
        title: cite.content?.substring(0, 60) + '...' || `Source ${i + 1}`,
        url: cite.url
      })),
    };
    setMessages(prev => [...prev, aiMsg]);
  }, [activeThreadId, setActiveThreadId]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/sign-in');
  };

  const handleQuickActionClick = (prompt: string) => {
    // Note: To make this work seamlessly, you'll need to either lift the API fetch logic 
    // out of ChatInput.tsx into this file, OR pass this prompt down to ChatInput to auto-submit.
    console.log("Quick action triggered with prompt:", prompt);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent relative overflow-hidden">
      
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-4 md:px-8 border-b border-white/[0.04] flex-shrink-0 z-20 bg-black/20 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <button 
            onClick={onOpenSidebar}
            className="md:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-100 transition-colors rounded-xl hover:bg-white/5 focus:outline-none"
            aria-label="Open Sidebar"
          >
            <Menu size={22} strokeWidth={1.5} />
          </button>
          
          <div className="flex items-center gap-3">
            <h1 className="text-zinc-100 font-medium tracking-widest text-[15px] uppercase">
              JARVIS
            </h1>
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/[0.03] border border-white/[0.05]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
              </span>
              <span className="text-[9px] uppercase tracking-widest text-amber-500/80 font-medium">Sync Active</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center">
          <button 
            onClick={handleSignOut}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Conversation Feed */}
      <div 
        className="flex-1 overflow-y-auto jarvis-scrollbar relative z-10"
        style={{ 
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%)'
        }}
      >
        {messages.length === 0 ? (
          <div className="min-h-full flex flex-col items-center justify-center p-4 pb-36 md:p-8 md:pb-40 animate-in fade-in zoom-in-95 duration-1000">
            <div className="relative w-64 h-64 md:w-80 md:h-80 mb-2 drop-shadow-[0_0_30px_rgba(245,158,11,0.15)]">
              <ParticleOrb state="idle" />
            </div>

            <div className="text-center space-y-3 mb-10">
              <h2 className="text-3xl md:text-4xl font-light text-zinc-100 tracking-wide">
                {getGreeting()}, <span className="font-medium bg-clip-text text-transparent bg-gradient-to-r from-amber-200 to-amber-500">{userName}</span>.
              </h2>
              <p className="text-sm text-zinc-500 font-light tracking-wide max-w-md mx-auto">
                All systems initialized. What would you like to focus on today?
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
              <QuickAction 
                icon={<ShoppingBag />} 
                title="Review Dark Room Metrics" 
                desc="Fetch the latest Shopify storefront data"
                onClick={() => handleQuickActionClick("Fetch the latest Shopify storefront data for Dark Room")}
              />
              <QuickAction 
                icon={<Map />} 
                title="Plan Goa Event Logistics" 
                desc="Coordinate team itinerary for October"
                onClick={() => handleQuickActionClick("Coordinate team itinerary for the Goa event in October")}
              />
              <QuickAction 
                icon={<Phone />} 
                title="Prep Futwork Outreach" 
                desc="Review metrics for active tele-calling"
                onClick={() => handleQuickActionClick("Review metrics for active Futwork tele-calling")}
              />
              <QuickAction 
                icon={<GraduationCap />} 
                title="Resume IBM Coursework" 
                desc="Continue Full Stack modules on Coursera"
                onClick={() => handleQuickActionClick("Resume IBM Full Stack modules on Coursera")}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col pb-40 pt-6 max-w-4xl mx-auto w-full">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} userName={userName} />
            ))}
            
            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex gap-4 md:gap-5 px-4 md:px-8 py-5 bg-white/[0.02] backdrop-blur-xl rounded-3xl my-2 mx-2 md:mx-4 border border-white/[0.03] shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="shrink-0 pt-0.5">
                  <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-900/20 border border-amber-500/20 shadow-[0_4px_20px_rgba(245,158,11,0.1)]">
                    <Sparkles size={20} className="text-amber-500 animate-pulse" strokeWidth={1.5} />
                  </div>
                </div>
                <div className="flex-1 flex items-center gap-3 py-1">
                  <span className="text-amber-500/90 text-[15px] font-medium tracking-wide">JARVIS</span>
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-amber-500/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-amber-500/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-amber-500/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 w-full z-20 pb-6 pt-12 bg-gradient-to-t from-[#050505] via-[#050505]/95 to-transparent pointer-events-none">
        <div className="pointer-events-auto">
          <ChatInput 
            onVoiceClick={onOpenVoiceMode} 
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            activeThreadId={activeThreadId}
          />
        </div>
      </div>
    </div>
  );
};

// --- Helper Component for the Empty State ---
const QuickAction = ({ 
  icon, 
  title, 
  desc, 
  onClick 
}: { 
  icon: React.ReactNode, 
  title: string, 
  desc: string,
  onClick?: () => void
}) => (
  <button 
    onClick={onClick}
    className="group flex items-start gap-4 p-4 rounded-[1.25rem] bg-white/[0.02] border border-white/[0.04] hover:bg-amber-500/[0.04] hover:border-amber-500/20 transition-all duration-300 text-left focus:outline-none focus:ring-1 focus:ring-amber-500/30 shadow-sm hover:shadow-md"
  >
    <div className="p-2.5 rounded-2xl bg-white/[0.03] text-zinc-400 group-hover:text-amber-500 group-hover:bg-amber-500/10 group-hover:scale-110 transition-all duration-300">
      {React.cloneElement(icon as React.ReactElement<any>, { size: 20, strokeWidth: 1.5 })}
    </div>
    <div className="pt-0.5">
      <h3 className="text-[14px] font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors tracking-wide">{title}</h3>
      <p className="text-[12px] text-zinc-500 mt-1 font-light leading-relaxed">{desc}</p>
    </div>
  </button>
);