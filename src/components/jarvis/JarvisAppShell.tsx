'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { MainChatArea } from './MainChatArea';
import { VoiceAgentMode } from './VoiceAgentMode';

export const JarvisAppShell: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // Trigger smooth entrance animation on load
  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <div className="relative flex h-screen w-full bg-[#050505] text-zinc-100 overflow-hidden font-sans selection:bg-amber-500/30 selection:text-amber-50">
      
      {/* --- Dynamic Ambient Background --- */}
      {/* The lighting physically moves and focuses when Voice Mode activates */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden transition-all duration-[1000ms] ease-in-out">
        {/* Primary Warm Glow */}
        <div 
          className={`absolute rounded-full mix-blend-screen transition-all duration-[1200ms] ease-in-out ${
            isVoiceMode 
              ? 'top-[20%] left-[20%] w-[60%] h-[60%] bg-amber-600/20 blur-[200px]' // Centers and intensifies
              : '-top-[25%] -left-[10%] w-[70%] h-[70%] bg-amber-900/10 blur-[150px]' // Rests in corner
          }`} 
        />
        {/* Secondary Cool/Neutral Glow */}
        <div 
          className={`absolute rounded-full mix-blend-screen transition-all duration-[1200ms] ease-in-out delay-75 ${
            isVoiceMode 
              ? 'bottom-[20%] right-[20%] w-[50%] h-[50%] bg-zinc-600/10 blur-[150px]'
              : '-bottom-[25%] -right-[10%] w-[60%] h-[60%] bg-zinc-800/30 blur-[150px]'
          }`} 
        />
        
        {/* Physical Texture Overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
        />
      </div>

      {/* --- Main App Layout (The "Glass Panel") --- */}
      {/* 
        Notice how it gains rounded corners and a ring border when scaling down. 
        This is the secret to making it feel like physical glass.
      */}
      <div 
        className={`relative z-10 flex h-full w-full transform origin-center transition-all duration-[800ms] cubic-bezier(0.2, 0.8, 0.2, 1) overflow-hidden ${
          !isMounted ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
        } ${
          isVoiceMode 
            ? 'scale-[0.93] opacity-40 blur-[6px] brightness-75 rounded-[2.5rem] ring-1 ring-white/10 pointer-events-none shadow-2xl' 
            : 'scale-100 opacity-100 blur-0 brightness-100 rounded-none ring-0 ring-transparent pointer-events-auto'
        }`}
      >
        <Sidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
          activeChatId={activeThreadId || undefined}
          onSelectChat={(id) => {
            setActiveThreadId(id);
            setIsSidebarOpen(false);
          }}
        />
        <MainChatArea 
          onOpenSidebar={() => setIsSidebarOpen(true)} 
          onOpenVoiceMode={() => setIsVoiceMode(true)}
          activeThreadId={activeThreadId}
          setActiveThreadId={setActiveThreadId}
          isVoiceMode={isVoiceMode}
        />
      </div>

      {/* --- Voice Mode Overlay --- */}
      {/* Heavy frosted glass that steps into the foreground */}
      <div 
        className={`absolute inset-0 z-50 flex items-center justify-center transition-all duration-[800ms] cubic-bezier(0.2, 0.8, 0.2, 1) ${
          isVoiceMode 
            ? 'opacity-100 pointer-events-auto backdrop-blur-2xl bg-black/20' 
            : 'opacity-0 pointer-events-none backdrop-blur-none bg-black/0'
        }`}
      >
        {isVoiceMode && (
          <div className="w-full h-full animate-in fade-in zoom-in-95 duration-700 ease-out">
            <VoiceAgentMode 
              onClose={() => setIsVoiceMode(false)} 
              activeThreadId={activeThreadId}
              setActiveThreadId={setActiveThreadId}
            />
          </div>
        )}
      </div>
    </div>
  );
};