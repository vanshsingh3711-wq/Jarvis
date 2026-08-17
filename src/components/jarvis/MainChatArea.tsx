import React, { useRef, useEffect } from 'react';
import { Menu, ShoppingBag, Map, GraduationCap, Phone, Sparkles } from 'lucide-react';
import { ChatInput } from './ChatInput';
import { ChatMessage, ChatMessageData } from './ChatMessage';
import { ParticleOrb } from './ParticleOrb';
import { UserButton } from '@clerk/nextjs';
// import { mockMessages } from './MockData';

// --- MOCK DATA (Remove this in your actual code) ---
const mockMessages: ChatMessageData[] = []; 
// ---------------------------------------------------

interface MainChatAreaProps {
  onOpenSidebar: () => void;
  onOpenVoiceMode: () => void;
}

export const MainChatArea: React.FC<MainChatAreaProps> = ({ onOpenSidebar, onOpenVoiceMode }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [mockMessages]);

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent relative overflow-hidden">
      
      {/* Header - Floating & Minimal */}
      <header className="h-16 flex items-center justify-between px-4 md:px-8 border-b border-white/[0.04] flex-shrink-0 z-20 bg-black/20 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <button 
            onClick={onOpenSidebar}
            className="md:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-100 transition-colors rounded-xl hover:bg-white/5 focus:outline-none"
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
          <UserButton appearance={{ elements: { userButtonAvatarBox: "w-8 h-8 rounded-full border border-white/10" } }} />
        </div>
      </header>

      {/* Main Conversation Feed */}
      {/* Replaced 'scrollbar-hide' with 'jarvis-scrollbar' */}
      <div 
        className="flex-1 overflow-y-auto jarvis-scrollbar relative z-10"
        style={{ 
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%)'
        }}
      >
        {mockMessages.length === 0 ? (
          /* --- Anticipatory Empty State --- */
          <div className="min-h-full flex flex-col items-center justify-center p-4 pb-36 md:p-8 md:pb-40 animate-in fade-in zoom-in-95 duration-1000">
            
            <div className="relative w-64 h-64 md:w-80 md:h-80 mb-2 drop-shadow-[0_0_30px_rgba(245,158,11,0.15)]">
              <ParticleOrb state="idle" />
            </div>

            <div className="text-center space-y-3 mb-10">
              <h2 className="text-3xl md:text-4xl font-light text-zinc-100 tracking-wide">
                Good morning, <span className="font-medium bg-clip-text text-transparent bg-gradient-to-r from-amber-200 to-amber-500">Vansh</span>.
              </h2>
              <p className="text-sm text-zinc-500 font-light tracking-wide max-w-md mx-auto">
                All systems initialized. What would you like to focus on today?
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
              <QuickAction icon={<ShoppingBag />} title="Review Dark Room Metrics" desc="Fetch the latest Shopify storefront data" />
              <QuickAction icon={<Map />} title="Plan Goa Event Logistics" desc="Coordinate team itinerary for October" />
              <QuickAction icon={<Phone />} title="Prep Futwork Outreach" desc="Review metrics for active tele-calling" />
              <QuickAction icon={<GraduationCap />} title="Resume IBM Coursework" desc="Continue Full Stack modules on Coursera" />
            </div>
          </div>
        ) : (
          /* --- Populated Chat Feed --- */
          /* Increased bottom padding (pb-40) so the last message fully clears the floating input area */
          <div className="flex flex-col pb-40 pt-6 max-w-4xl mx-auto w-full">
            {mockMessages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area (Floating over the background) */}
      <div className="absolute bottom-0 left-0 w-full z-20 pb-6 pt-12 bg-gradient-to-t from-[#050505] via-[#050505]/95 to-transparent pointer-events-none">
        <div className="pointer-events-auto">
          <ChatInput onVoiceClick={onOpenVoiceMode} />
        </div>
      </div>
    </div>
  );
};

// --- Helper Component for the Empty State ---
const QuickAction = ({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) => (
  <button className="group flex items-start gap-4 p-4 rounded-[1.25rem] bg-white/[0.02] border border-white/[0.04] hover:bg-amber-500/[0.04] hover:border-amber-500/20 transition-all duration-300 text-left focus:outline-none focus:ring-1 focus:ring-amber-500/30 shadow-sm hover:shadow-md">
    <div className="p-2.5 rounded-2xl bg-white/[0.03] text-zinc-400 group-hover:text-amber-500 group-hover:bg-amber-500/10 group-hover:scale-110 transition-all duration-300">
      {React.cloneElement(icon as React.ReactElement<any>, { size: 20, strokeWidth: 1.5 })}
    </div>
    <div className="pt-0.5">
      <h3 className="text-[14px] font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors tracking-wide">{title}</h3>
      <p className="text-[12px] text-zinc-500 mt-1 font-light leading-relaxed">{desc}</p>
    </div>
  </button>
);