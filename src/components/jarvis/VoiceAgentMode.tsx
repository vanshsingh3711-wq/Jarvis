import React, { useState, useRef, useEffect } from 'react';
import { X, Mic, MicOff, Activity, ShieldAlert, Loader2, Sparkles } from 'lucide-react';
import { ParticleOrb, VoiceAgentState } from './ParticleOrb';

interface VoiceAgentModeProps {
  onClose: () => void;
}

export const VoiceAgentMode: React.FC<VoiceAgentModeProps> = ({ onClose }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [agentState, setAgentState] = useState<VoiceAgentState>('idle');
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(clearTimeout);
    };
  }, []);

  // Premium, conversational state mapping
  const getStateConfig = () => {
    if (isMuted) return { title: 'Paused', sub: 'Microphone is muted', color: 'bg-zinc-600', text: 'text-zinc-500', icon: <MicOff size={18} strokeWidth={1.5} /> };
    
    switch (agentState) {
      case 'listening': return { title: "I'm listening...", sub: 'Go ahead, Vansh', color: 'bg-amber-500', text: 'text-amber-500', icon: <Mic size={18} strokeWidth={1.5} /> };
      case 'processing': return { title: 'Thinking...', sub: 'Just a moment', color: 'bg-zinc-300', text: 'text-zinc-400', icon: <Loader2 size={18} className="animate-spin" strokeWidth={1.5} /> };
      case 'retrieving': return { title: 'Finding that...', sub: 'Checking my sources', color: 'bg-zinc-300', text: 'text-zinc-400', icon: <Sparkles size={18} className="animate-pulse" strokeWidth={1.5} /> };
      case 'answering': return { title: 'JARVIS', sub: 'Speaking', color: 'bg-amber-400', text: 'text-amber-400', icon: <Activity size={18} className="animate-bounce" strokeWidth={1.5} /> };
      case 'error': return { title: 'Connection lost', sub: 'Tap to try again', color: 'bg-red-500', text: 'text-red-500', icon: <ShieldAlert size={18} strokeWidth={1.5} /> };
      case 'idle':
      default: return { title: 'How can I help?', sub: 'Tap the mic to speak', color: 'bg-zinc-400', text: 'text-zinc-500', icon: <Mic size={18} strokeWidth={1.5} /> };
    }
  };

  const config = getStateConfig();

  const handleMicClick = () => {
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];

    if (isMuted) {
      setIsMuted(false);
      setAgentState('idle');
      return;
    }
    
    if (agentState === 'idle') {
      setAgentState('listening');
      // Mock an automatic flow
      timeoutRefs.current.push(setTimeout(() => setAgentState('processing'), 3000));
      timeoutRefs.current.push(setTimeout(() => setAgentState('retrieving'), 5000));
      timeoutRefs.current.push(setTimeout(() => setAgentState('answering'), 7000));
      timeoutRefs.current.push(setTimeout(() => setAgentState('idle'), 11000));
    } else {
      setIsMuted(true);
      setAgentState('idle');
    }
  };

  const setManualState = (state: VoiceAgentState) => {
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
    setIsMuted(false);
    setAgentState(state);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative">
      
      {/* --- Ambient Background Lighting --- */}
      <div 
        className={`absolute inset-0 z-0 opacity-15 blur-[120px] transition-colors duration-1000 ${config.color}`} 
        style={{ transform: 'scale(1.2)' }}
      />

      {/* Top Controls - Exit */}
      <div className="absolute top-6 right-6 z-50">
        <button 
          onClick={onClose}
          className="group flex items-center justify-center p-3 bg-white/[0.03] backdrop-blur-2xl border border-white/[0.05] rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition-all duration-300 focus:outline-none"
          title="Close Voice Mode"
        >
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-3xl mx-auto relative z-10 pt-12">
        
        {/* Particle Orb Container */}
        <div className={`relative w-full h-[35vh] min-h-[300px] flex items-center justify-center mb-10 transition-all duration-700 ${isMuted ? 'opacity-40 scale-95 grayscale' : 'opacity-100 scale-100'}`}>
          <ParticleOrb state={isMuted ? 'idle' : agentState} />
        </div>

        {/* Cinematic Status Text */}
        <div className="text-center space-y-4 mb-20 h-28">
          <div className="flex items-center justify-center gap-2.5 text-zinc-500">
            {config.icon}
            <span className="text-[13px] font-medium tracking-wide">
              {config.sub}
            </span>
          </div>
          <h2 className="text-4xl md:text-6xl font-extralight tracking-wide text-zinc-100 transition-all duration-500 drop-shadow-sm">
            {config.title}
          </h2>
        </div>

        {/* The Core Control Button (Microphone) */}
        <div className="relative flex items-center justify-center">
          {/* Soft pulsing outer rings when active */}
          {!isMuted && agentState !== 'idle' && (
            <>
              <div className={`absolute inset-0 rounded-full animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] opacity-20 ${config.color}`} />
              <div className={`absolute inset-0 rounded-full animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite_1s] opacity-10 ${config.color}`} />
            </>
          )}

          <button 
            onClick={handleMicClick}
            className={`relative z-10 w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center transition-all duration-500 backdrop-blur-2xl border focus:outline-none shadow-xl ${
              isMuted 
                ? 'bg-white/[0.02] border-white/[0.05] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300' 
                : 'bg-white/[0.05] border-white/10 text-zinc-100 hover:bg-white/[0.08] hover:scale-105'
            }`}
            title={isMuted ? "Initialize Audio" : "Mute Connection"}
          >
            {isMuted ? <MicOff size={28} strokeWidth={1.5} /> : <Mic size={28} strokeWidth={1.5} className={agentState === 'listening' ? 'animate-pulse text-amber-400' : ''} />}
          </button>
        </div>
      </div>

      {/* Developer/Mock Controls Terminal (Hidden entirely unless hovered) */}
      <div className="absolute bottom-8 w-full px-8 z-50 flex justify-center opacity-0 hover:opacity-100 transition-opacity duration-500">
        <div className="flex items-center gap-2 p-2 rounded-2xl bg-black/40 backdrop-blur-2xl border border-white/[0.05] shadow-2xl">
          <div className="px-3 border-r border-white/10 text-[10px] uppercase tracking-widest font-medium text-zinc-500">
            Dev Mode
          </div>
          <div className="flex gap-1 px-1">
            {(['idle', 'listening', 'processing', 'retrieving', 'answering', 'error'] as VoiceAgentState[]).map(s => (
              <button 
                key={s} 
                onClick={() => setManualState(s)}
                className={`px-3 py-1.5 rounded-xl text-[11px] capitalize font-medium transition-all duration-300 ${
                  agentState === s && !isMuted 
                    ? 'bg-white/10 text-zinc-100' 
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
      
    </div>
  );
};