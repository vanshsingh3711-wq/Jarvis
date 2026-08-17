'use client';

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { MainChatArea } from './MainChatArea';
import { VoiceAgentMode } from './VoiceAgentMode';

export const JarvisAppShell: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);

  if (isVoiceMode) {
    return <VoiceAgentMode onClose={() => setIsVoiceMode(false)} />;
  }

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans selection:bg-zinc-800">
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />
      <MainChatArea 
        onOpenSidebar={() => setIsSidebarOpen(true)} 
        onOpenVoiceMode={() => setIsVoiceMode(true)}
      />
    </div>
  );
};
