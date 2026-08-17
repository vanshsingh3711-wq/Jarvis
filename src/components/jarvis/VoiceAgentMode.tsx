import React from 'react';
import { X, Mic } from 'lucide-react';

interface VoiceAgentModeProps {
  onClose: () => void;
}

export const VoiceAgentMode: React.FC<VoiceAgentModeProps> = ({ onClose }) => {
  return (
    <div className="flex flex-col items-center justify-center h-screen w-full bg-zinc-950 text-zinc-100 absolute inset-0 z-50">
      
      {/* Top Controls */}
      <div className="absolute top-6 right-6">
        <button 
          onClick={onClose}
          className="p-3 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-700"
          title="Exit Voice Mode"
        >
          <X size={24} />
        </button>
      </div>

      {/* Main Orb Placeholder */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md mx-auto">
        
        {/* Placeholder for Particle Orb */}
        <div className="relative w-64 h-64 flex items-center justify-center mb-12">
          {/* Static design representing the future orb */}
          <div className="absolute inset-0 rounded-full bg-zinc-900/50 border border-zinc-800 shadow-[0_0_40px_rgba(39,39,42,0.5)]"></div>
          <div className="absolute inset-4 rounded-full bg-zinc-800/50 border border-zinc-700 animate-pulse"></div>
          <div className="w-24 h-24 rounded-full bg-zinc-700 animate-ping opacity-20"></div>
          <span className="text-zinc-600 font-medium tracking-widest text-sm absolute z-10">ORB PLACEHOLDER</span>
        </div>

        {/* Status Text */}
        <h2 className="text-3xl font-light tracking-wide text-zinc-300 mb-2">Say something...</h2>
        <p className="text-sm text-zinc-500 mb-16">Listening to your voice</p>

        {/* Bottom Controls */}
        <div className="flex items-center gap-6">
          <button className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-950 hover:bg-zinc-200 transition-all shadow-lg hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-zinc-700">
            <Mic size={28} />
          </button>
        </div>
      </div>
      
    </div>
  );
};
