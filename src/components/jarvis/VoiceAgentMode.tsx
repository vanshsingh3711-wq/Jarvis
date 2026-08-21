import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Mic, MicOff, Activity, ShieldAlert, Loader2, Sparkles, Check, Volume2 } from 'lucide-react';
import { ParticleOrb, VoiceAgentState } from './ParticleOrb';
import { saveSession, generateSessionTitle } from './historyManager';

interface VoiceAgentModeProps {
  onClose: () => void;
  activeThreadId: string | null;
  setActiveThreadId: (id: string) => void;
}

interface VoiceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: any[];
}

// ─── Typewriter Text Component ───
const TypewriterText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    if (!text) return;

    let i = 0;
    const speed = Math.max(12, Math.min(30, 1500 / text.length)); // Adaptive speed
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text]);

  return (
    <span className={className}>
      {displayed}
      {!done && <span className="inline-block w-[2px] h-[1em] bg-amber-400/80 ml-0.5 align-middle animate-pulse" />}
    </span>
  );
};

// ─── Processing Dots Component ───
const ProcessingDots: React.FC = () => (
  <span className="voice-processing-dots inline-flex gap-1 ml-1">
    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
  </span>
);

// ─── Status Badge Component ───
const StatusBadge: React.FC<{ state: VoiceAgentState; isMuted: boolean }> = ({ state, isMuted }) => {
  const config = useMemo(() => {
    if (isMuted) return { color: 'bg-zinc-500', label: 'Muted' };
    switch (state) {
      case 'listening': return { color: 'bg-amber-500', label: 'Listening' };
      case 'processing': return { color: 'bg-blue-400', label: 'Processing' };
      case 'retrieving': return { color: 'bg-violet-400', label: 'Clarifying' };
      case 'answering': return { color: 'bg-emerald-400', label: 'Speaking' };
      case 'error': return { color: 'bg-red-500', label: 'Error' };
      default: return { color: 'bg-zinc-500', label: 'Ready' };
    }
  }, [state, isMuted]);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] backdrop-blur-xl border border-white/[0.06]">
      <div className={`w-2 h-2 rounded-full ${config.color} voice-dot-pulse`} />
      <span className="text-xs font-medium tracking-wider text-zinc-400 uppercase voice-state-text">
        {config.label}
      </span>
    </div>
  );
};

export const VoiceAgentMode: React.FC<VoiceAgentModeProps> = ({ onClose, activeThreadId, setActiveThreadId }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [agentState, setAgentState] = useState<VoiceAgentState>('idle');
  
  // Transcription States
  const [liveTranscript, setLiveTranscript] = useState("");
  const isListeningRef = useRef(false);
  const agentStateRef = useRef<VoiceAgentState>('idle');
  
  // Conversation History
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Ref to track the latest activeThreadId across closures
  const activeThreadIdRef = useRef<string | null>(activeThreadId);
  
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);
  
  useEffect(() => {
    agentStateRef.current = agentState;
  }, [agentState]);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveTranscript, agentState]);

  // Load history on mount if opening an existing thread
  useEffect(() => {
    if (activeThreadId && messages.length === 0) {
      fetch(`http://localhost:8000/api/v1/voice/history/${activeThreadId}`)
        .then(res => res.json())
        .then(data => {
          if (data.chat_history && data.chat_history.length > 0) {
            const loadedMessages: VoiceMessage[] = data.chat_history.map((msg: any, i: number) => ({
              id: `hist-${i}`,
              role: msg.role === 'human' || msg.role === 'user' ? 'user' : 'assistant',
              content: msg.content,
            }));
            setMessages(loadedMessages);
          }
        })
        .catch(err => console.error("[FRONTEND - VoiceAgent] Failed to load history:", err));
    }
  }, []);
  
  // API Integration States
  const [needsValidation, setNeedsValidation] = useState(false);
  const [repromptMessage, setRepromptMessage] = useState("");
  const [userIntent, setUserIntent] = useState("");
  
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Audio Recording Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const checkAudioFrameRef = useRef<number>(0);
  const silenceStartRef = useRef<number>(0);
  const isSpeakingRef = useRef<boolean>(false);
  const finalTranscriptRef = useRef<string>("");

  const cleanupAudio = () => {
    if (checkAudioFrameRef.current) cancelAnimationFrame(checkAudioFrameRef.current);
    if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
    }
    if (scriptNodeRef.current) {
        scriptNodeRef.current.disconnect();
        scriptNodeRef.current = null;
    }
    if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    audioStreamRef.current = null;
  };

  useEffect(() => {
    const timer = setTimeout(() => {
       if (!isMuted && !isListeningRef.current) {
          startListening();
       }
    }, 500);

    // ESC key to close
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      cleanupAudio();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  const handleFinalizedText = async (finalText: string) => {
    if (!finalText.trim()) {
        setAgentState('listening');
        return;
    }
    
    // Add user query to history
    const userMsgId = Date.now().toString() + "-user";
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: finalText }]);
    
    setAgentState('processing');
    
    try {
      const formData = new FormData();
      formData.append('text_query', finalText);
      if (activeThreadIdRef.current) {
        formData.append('thread_id', activeThreadIdRef.current);
      }

      const response = await fetch('http://localhost:8000/api/v1/voice/query', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const data = await response.json();
      
      if (!activeThreadIdRef.current && data.thread_id) {
        setActiveThreadId(data.thread_id);
        saveSession({
          id: data.thread_id,
          title: generateSessionTitle(data.query_text || "Voice Session"),
          date: new Date().toISOString(),
          icon: 'sparkle'
        });
        window.dispatchEvent(new Event('sessionsUpdated'));
      }

      if (data.status === 'needs_validation') {
        setRepromptMessage(data.reprompt_message);
        setUserIntent(data.query_text);
        setNeedsValidation(true);
        setAgentState('retrieving'); 
        speakAnswer("I'm not quite sure I caught that. Did you mean to say this?");
      } else if (data.status === "rejected_guardrail") {
        const answer = data.answer || "Request rejected by guardrails.";
        const astMsgId = Date.now().toString() + "-ast";
        setMessages(prev => [...prev, { id: astMsgId, role: 'assistant', content: answer }]);
        
        setAgentState('answering');
        if (answer) speakAnswer(answer);
      } else {
        if (data.answer === "" && data.status === "fast_reply") {
             setAgentState('listening');
             return;
        }

        const astMsgId = Date.now().toString() + "-ast";
        setMessages(prev => [...prev, { 
          id: astMsgId, 
          role: 'assistant', 
          content: data.answer,
          citations: data.citations || [] 
        }]);

        setAgentState('answering');
        if (data.answer) {
          speakAnswer(data.answer);
        } else {
          setAgentState('listening');
        }
      }
    } catch (e) {
      console.error("[FRONTEND - VoiceAgent] Error in handleFinalizedText:", e);
      setAgentState('error');
      // Auto-recover from error after 3s
      setTimeout(() => {
        setAgentState('idle');
        startListening();
      }, 3000);
    }
  };

  const startListening = async () => {
    if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
    }
    setAgentState('listening');
    isListeningRef.current = true;
    setLiveTranscript("");
    finalTranscriptRef.current = "";
    setNeedsValidation(false);
    setIsSpeaking(false);
    window.speechSynthesis.cancel();
    
    try {
      cleanupAudio();
      
      const ws = new WebSocket('ws://localhost:8000/api/v1/voice/stream');
      wsRef.current = ws;
      
      // Accumulated transcript segments
      const committedSegments: string[] = [];
      let currentPartial = '';
      
      ws.onopen = () => {};
      ws.onclose = () => {};
      
      ws.onmessage = (event) => {
         try {
             const data = JSON.parse(event.data);
             const type = data.message_type || data.type;
             
             if (type === 'partial_transcript') {
                 // Show accumulated committed segments + current partial
                 currentPartial = data.text || '';
                 const fullText = [...committedSegments, currentPartial].join(' ').trim();
                 setLiveTranscript(fullText);
                 finalTranscriptRef.current = fullText;
                 
             } else if (type === 'final_transcript') {
                 // A sentence/segment was finalized — accumulate it
                 const text = data.text || '';
                 if (text.trim()) {
                     committedSegments.push(text.trim());
                     currentPartial = '';
                     const fullText = committedSegments.join(' ').trim();
                     setLiveTranscript(fullText);
                     finalTranscriptRef.current = fullText;
                 }
                 
             } else if (type === 'committed_transcript') {
                 // Fully committed (by VAD or manual commit)
                 const text = data.text || '';
                 if (text.trim()) {
                     committedSegments.push(text.trim());
                     currentPartial = '';
                     const fullText = committedSegments.join(' ').trim();
                     setLiveTranscript(fullText);
                     finalTranscriptRef.current = fullText;
                 }
                 
             } else if (type === 'utterance_end') {
                 // ElevenLabs detected end of speech — submit immediately
                 const fullText = finalTranscriptRef.current;
                 if (fullText.trim() && agentStateRef.current === 'listening') {
                     finalTranscriptRef.current = '';
                     (window as any).lastTranscript = '';
                     handleFinalizedText(fullText);
                 }
             }
         } catch (e) {
             console.error("WS Parse Error", e);
         }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      });
      
      audioStreamRef.current = stream;
      
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      const bufferSize = 4096;
      const scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
      scriptNodeRef.current = scriptNode;
      
      scriptNode.onaudioprocess = (e) => {
         if (ws.readyState !== WebSocket.OPEN) return;
         
         const inputData = e.inputBuffer.getChannelData(0);
         const pcm16 = new Int16Array(inputData.length);
         for (let i = 0; i < inputData.length; i++) {
             const s = Math.max(-1, Math.min(1, inputData[i]));
             pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
         }
         
         ws.send(pcm16.buffer);
      };
      
      source.connect(scriptNode);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      scriptNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Wait for transcript to be stable for 2 seconds before submitting
      // This gives time for multi-sentence queries with natural pauses
      const SUBMIT_AFTER_SILENCE_MS = 2000;
      
      const checkTranscriptStability = () => {
         if (finalTranscriptRef.current && agentStateRef.current === 'listening') {
             if ((window as any).lastTranscript !== finalTranscriptRef.current) {
                 (window as any).lastTranscript = finalTranscriptRef.current;
                 (window as any).transcriptTime = Date.now();
             } else if (Date.now() - ((window as any).transcriptTime || Date.now()) > SUBMIT_AFTER_SILENCE_MS) {
                 const textToSubmit = finalTranscriptRef.current;
                 finalTranscriptRef.current = "";
                 (window as any).lastTranscript = "";
                 
                 if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                     wsRef.current.send(JSON.stringify({ type: "speech_end" }));
                 }
                 
                 handleFinalizedText(textToSubmit);
             }
         }
         checkAudioFrameRef.current = requestAnimationFrame(checkTranscriptStability);
      };
      
      checkTranscriptStability();

    } catch (e) {
      console.error("Microphone error", e);
      setAgentState('error');
    }
  };

  const stopListening = () => {
    isListeningRef.current = false;
    cleanupAudio();
    setAgentState(prev => (prev === 'listening' ? 'idle' : prev));
    setLiveTranscript("");
  };

  const handleMicClick = () => {
    if (isMuted) {
      setIsMuted(false);
      startListening();
    } else {
      setIsMuted(true);
      stopListening();
    }
  };

  const speakAnswer = async (text: string) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    window.speechSynthesis.cancel();
    setIsSpeaking(true);

    const fallbackSynthesis = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 0.95;
      
      utterance.onend = () => {
        setIsSpeaking(false);
        startListening();
      };
      
      window.speechSynthesis.speak(utterance);
    };

    try {
      const audioUrl = `http://localhost:8000/api/v1/voice/tts?text=${encodeURIComponent(text)}`;
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      
      audio.onended = () => {
        audioPlayerRef.current = null;
        setIsSpeaking(false);
        startListening();
      };

      audio.onerror = () => {
        fallbackSynthesis();
      };

      await audio.play();
      
    } catch (e) {
      console.error(e);
      fallbackSynthesis();
    }
  };

  const handleResumeWorkflow = async () => {
    if (!activeThreadIdRef.current || !userIntent.trim()) return;
    
    setNeedsValidation(false);
    setAgentState('processing');
    
    try {
      const response = await fetch('http://localhost:8000/api/v1/voice/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: activeThreadIdRef.current,
          validated_intent: userIntent
        })
      });
      
      const data = await response.json();
      
      if (data.status === "success") {
        const astMsgId = Date.now().toString() + "-ast";
        setMessages(prev => [...prev, { 
          id: astMsgId, 
          role: 'assistant', 
          content: data.answer,
          citations: data.citations || [] 
        }]);

        setAgentState('answering');
        speakAnswer(data.answer);
      } else {
        const astMsgId = Date.now().toString() + "-ast";
        setMessages(prev => [...prev, { id: astMsgId, role: 'assistant', content: data.answer || "Error processing request." }]);
        setAgentState('error');
      }
    } catch (error) {
      console.error("[FRONTEND - VoiceAgent] Resume Error:", error);
      setAgentState('error');
    }
  };

  // ─── Computed state config ───
  const stateConfig = useMemo(() => {
    if (isMuted && agentState === 'idle') return {
      title: 'Paused',
      sub: 'Tap microphone to resume',
      glowColor: 'bg-zinc-600',
      gradientFrom: 'from-zinc-800/20',
      gradientTo: 'to-zinc-900/20',
    };
    
    switch (agentState) {
      case 'listening': return {
        title: liveTranscript || "I'm listening...",
        sub: 'Speak naturally — silence auto-submits',
        glowColor: 'bg-amber-500',
        gradientFrom: 'from-amber-500/10',
        gradientTo: 'to-orange-600/5',
      };
      case 'processing': return {
        title: 'Thinking',
        sub: 'Processing your request',
        glowColor: 'bg-blue-500',
        gradientFrom: 'from-blue-500/10',
        gradientTo: 'to-indigo-600/5',
      };
      case 'retrieving': return {
        title: 'Clarification Needed',
        sub: 'Human-in-the-Loop',
        glowColor: 'bg-violet-500',
        gradientFrom: 'from-violet-500/10',
        gradientTo: 'to-purple-600/5',
      };
      case 'answering': return {
        title: 'JARVIS',
        sub: isSpeaking ? 'Speaking...' : 'Answer Ready',
        glowColor: 'bg-emerald-500',
        gradientFrom: 'from-emerald-500/10',
        gradientTo: 'to-teal-600/5',
      };
      case 'error': return {
        title: 'Error',
        sub: 'Recovering...',
        glowColor: 'bg-red-500',
        gradientFrom: 'from-red-500/10',
        gradientTo: 'to-rose-600/5',
      };
      default: return {
        title: 'Initializing...',
        sub: 'Preparing microphone',
        glowColor: 'bg-zinc-400',
        gradientFrom: 'from-zinc-500/10',
        gradientTo: 'to-zinc-600/5',
      };
    }
  }, [agentState, isMuted, liveTranscript, isSpeaking]);

  // ─── Mic button styles ───
  const micButtonClass = useMemo(() => {
    const base = "relative z-10 w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center backdrop-blur-2xl border focus:outline-none shadow-xl voice-mic-press";
    
    if (isMuted) {
      return `${base} bg-white/[0.02] border-white/[0.05] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300 transition-all duration-500`;
    }
    if (agentState === 'listening') {
      return `${base} bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30 hover:scale-105 transition-all duration-300`;
    }
    if (agentState === 'answering' && isSpeaking) {
      return `${base} bg-emerald-500/15 border-emerald-500/40 text-emerald-300 transition-all duration-500`;
    }
    return `${base} bg-white/[0.05] border-white/10 text-zinc-100 hover:bg-white/[0.08] hover:scale-105 transition-all duration-500`;
  }, [isMuted, agentState, isSpeaking]);

  // Are we currently showing a conversation history?
  const hasHistory = messages.length > 0 || liveTranscript !== "" || agentState === 'processing';

  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative overflow-hidden bg-black/40">
      
      {/* Animated ambient background glow */}
      <div 
        className={`absolute inset-0 z-0 voice-bg-glow voice-ambient-pulse ${stateConfig.glowColor}`}
        style={{ 
          filter: 'blur(140px)',
          transform: 'scale(1.3)',
          opacity: 0.15,
        }} 
      />
      
      {/* Subtle radial gradient overlay */}
      <div className={`absolute inset-0 z-0 bg-gradient-radial ${stateConfig.gradientFrom} ${stateConfig.gradientTo} to-transparent`} 
        style={{ background: `radial-gradient(ellipse at center, var(--tw-gradient-from) 0%, transparent 70%)` }}
      />

      {/* Close button */}
      <div className="absolute top-6 right-6 z-50 voice-fade-up" style={{ animationDelay: '0.1s' }}>
        <button 
          onClick={onClose} 
          className="voice-close-btn group flex items-center justify-center p-3 bg-white/[0.03] backdrop-blur-2xl border border-white/[0.05] rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] focus:outline-none" 
          title="Close Voice Mode"
        >
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>

      {/* Status badge — top center */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 voice-fade-up" style={{ animationDelay: '0.2s' }}>
        <StatusBadge state={agentState} isMuted={isMuted} />
      </div>

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col w-full max-w-4xl mx-auto relative z-10 pt-12 md:pt-16 px-4 h-full pb-8">
        
        {/* ─── Top Section: Particle Orb ─── */}
        <div className={`shrink-0 w-full flex items-center justify-center transition-all duration-700 ease-in-out z-10 ${
          hasHistory ? 'h-[15vh] min-h-[120px] scale-75' : 'h-[35vh] min-h-[250px] scale-100'
        }`}>
          <div className={`relative w-full h-full flex items-center justify-center transition-all duration-700 ease-out ${
            isMuted && agentState === 'idle' 
              ? 'opacity-30 grayscale' 
              : agentState === 'processing' 
                ? 'opacity-90 scale-95' 
                : agentState === 'answering' 
                  ? 'opacity-100 scale-105' 
                  : 'opacity-100'
          }`}>
            <ParticleOrb state={isMuted && agentState === 'idle' ? 'idle' : agentState} />
            
            {/* Listening ripple rings behind orb */}
            {!isMuted && agentState === 'listening' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-32 h-32 rounded-full border border-amber-500/20 voice-ripple" />
                <div className="absolute w-32 h-32 rounded-full border border-amber-500/15 voice-ripple-delayed" />
                <div className="absolute w-32 h-32 rounded-full border border-amber-500/10 voice-ripple-delayed-2" />
              </div>
            )}
          </div>
        </div>

        {/* ─── Center Initial State Text (when no history) ─── */}
        {!hasHistory && (
          <div className="flex-1 flex flex-col items-center justify-start pt-8 pointer-events-none z-0 voice-fade-up">
             <div className="text-center space-y-3">
                <h2 className="text-3xl md:text-4xl font-extralight tracking-wide text-zinc-100">
                   How can I help you?
                </h2>
                <p className="text-zinc-500 font-light tracking-wide">
                   Speak naturally. I'm listening.
                </p>
             </div>
          </div>
        )}

        {/* ─── Chat History Area ─── */}
        <div className={`flex-1 w-full max-w-3xl mx-auto overflow-y-auto custom-scrollbar flex flex-col gap-6 mb-4 px-2 transition-all duration-700 ${
          hasHistory ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 hidden'
        }`}>
          {messages.map((m, index) => (
            <div key={m.id} className={`flex flex-col w-full animate-in fade-in slide-in-from-bottom-4 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] px-5 py-4 rounded-3xl ${
                m.role === 'user' 
                  ? 'bg-amber-500/10 border border-amber-500/20 text-zinc-100 shadow-[0_0_15px_rgba(245,158,11,0.05)] rounded-tr-sm' 
                  : 'bg-white/[0.03] border border-white/[0.08] text-zinc-200 shadow-xl backdrop-blur-md rounded-tl-sm'
              }`}>
                {m.role === 'user' ? (
                  <span className="text-lg font-light leading-relaxed">{m.content}</span>
                ) : (
                  <div className="text-lg font-light leading-relaxed">
                    {index === messages.length - 1 && agentState === 'answering' ? (
                      <TypewriterText text={m.content} />
                    ) : (
                      <span>{m.content}</span>
                    )}
                  </div>
                )}
              </div>
              
              {/* Citations for assistant messages */}
              {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                <div className="mt-2.5 ml-2 text-xs text-zinc-500 flex gap-2 flex-wrap">
                  <Sparkles size={12} className="text-amber-500/50 mt-0.5" />
                  {m.citations.map((c, i) => (
                    <span key={i} className="bg-white/5 border border-white/5 px-2 py-1 rounded-md">
                      [{c.id || i+1}] {c.content.substring(0,30)}...
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Live Transcript Bubble (User is speaking) */}
          {agentState === 'listening' && liveTranscript && (
            <div className="flex flex-col items-end w-full animate-in fade-in slide-in-from-bottom-2">
              <div className="max-w-[85%] px-5 py-4 rounded-3xl rounded-tr-sm bg-amber-500/5 border border-amber-500/10 text-zinc-400 voice-transcript-shimmer">
                <span className="text-lg font-light leading-relaxed">{liveTranscript}</span>
              </div>
            </div>
          )}

          {/* Processing Indicator Bubble */}
          {agentState === 'processing' && (
            <div className="flex flex-col items-start w-full animate-in fade-in slide-in-from-bottom-2">
              <div className="max-w-[85%] px-5 py-4 rounded-3xl rounded-tl-sm bg-white/[0.02] border border-white/[0.04] text-zinc-400">
                <span className="text-lg font-light flex items-center gap-1">
                  Thinking<ProcessingDots />
                </span>
              </div>
            </div>
          )}

          {/* Human-in-the-Loop Clarification Card */}
          {needsValidation && (
            <div className="w-full flex justify-start animate-in fade-in slide-in-from-bottom-4">
              <div className="max-w-[85%] voice-glass-card bg-black/50 backdrop-blur-2xl border border-amber-500/20 rounded-3xl rounded-tl-sm p-6 shadow-2xl">
                <div className="flex items-center gap-3 text-amber-400 mb-4">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <ShieldAlert size={18} />
                  </div>
                  <h3 className="font-medium text-lg">Clarification Needed</h3>
                </div>
                <p className="text-zinc-300 mb-6 leading-relaxed text-lg font-light">{repromptMessage}</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input 
                    type="text" 
                    value={userIntent}
                    onChange={(e) => setUserIntent(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleResumeWorkflow()}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 transition-colors duration-300 placeholder:text-zinc-600"
                    placeholder="Edit your query..."
                    autoFocus
                  />
                  <button 
                    onClick={handleResumeWorkflow}
                    className="bg-amber-500 hover:bg-amber-400 text-black px-6 py-3 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Check size={18} /> Confirm
                  </button>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* ─── Bottom Section: Mic Button ─── */}
        <div className="shrink-0 relative flex items-center justify-center pb-2 voice-fade-up z-10" style={{ animationDelay: '0.15s' }}>
          {/* Listening ripple behind mic */}
          {!isMuted && agentState === 'listening' && (
            <>
              <div className="absolute w-16 h-16 md:w-20 md:h-20 rounded-full bg-amber-500/10 voice-ripple pointer-events-none" />
              <div className="absolute w-16 h-16 md:w-20 md:h-20 rounded-full bg-amber-500/8 voice-ripple-delayed pointer-events-none" />
            </>
          )}
          
          {/* Speaking indicator ring */}
          {agentState === 'answering' && isSpeaking && (
            <div className="absolute w-20 h-20 md:w-24 md:h-24 rounded-full border-2 border-transparent voice-glow-ring pointer-events-none"
              style={{
                borderImage: 'linear-gradient(135deg, rgba(52,211,153,0.5) 0%, transparent 50%, rgba(52,211,153,0.3) 100%) 1',
                borderRadius: '50%',
                borderWidth: '2px',
                borderStyle: 'solid',
                borderColor: 'rgba(52,211,153,0.15)',
              }}
            />
          )}

          <button 
            onClick={handleMicClick}
            className={micButtonClass}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {isMuted ? (
              <MicOff size={28} strokeWidth={1.5} />
            ) : agentState === 'answering' && isSpeaking ? (
              <Volume2 size={28} strokeWidth={1.5} className="text-emerald-300 animate-pulse" />
            ) : (
              <Mic size={28} strokeWidth={1.5} className={
                agentState === 'listening' ? 'text-amber-400 animate-pulse' : ''
              } />
            )}
          </button>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-zinc-600 text-[11px] tracking-wider voice-fade-up" style={{ animationDelay: '0.5s' }}>
          Press <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-zinc-500 font-mono text-[10px]">ESC</kbd> to close
        </div>

      </div>
    </div>
  );
};
