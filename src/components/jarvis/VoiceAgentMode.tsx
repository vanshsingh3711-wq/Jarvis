import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Mic, MicOff, Activity, ShieldAlert, Loader2, Sparkles, Check, Volume2, CornerDownLeft } from 'lucide-react';
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
    const speed = Math.max(12, Math.min(25, 1500 / text.length)); // Smooth adaptive speed
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
      {!done && (
        <span className="inline-block w-[3px] h-[1em] bg-amber-500/80 ml-1 rounded-full align-middle animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
      )}
    </span>
  );
};

// ─── Processing Dots Component ───
const ProcessingDots: React.FC = () => (
  <span className="inline-flex items-center gap-1.5 ml-3 h-[1em]">
    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-[bounce_1s_infinite] shadow-sm" style={{ animationDelay: '0ms' }} />
    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-[bounce_1s_infinite] shadow-sm" style={{ animationDelay: '150ms' }} />
    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-[bounce_1s_infinite] shadow-sm" style={{ animationDelay: '300ms' }} />
  </span>
);

// ─── Status Badge Component ───
const StatusBadge: React.FC<{ state: VoiceAgentState; isMuted: boolean }> = ({ state, isMuted }) => {
  const config = useMemo(() => {
    if (isMuted) return { color: 'bg-zinc-600', shadow: 'shadow-none', label: 'MUTED' };
    switch (state) {
      case 'listening': return { color: 'bg-amber-500', shadow: 'shadow-[0_0_10px_rgba(245,158,11,0.5)]', label: 'LISTENING' };
      case 'processing': return { color: 'bg-blue-400', shadow: 'shadow-[0_0_10px_rgba(96,165,250,0.5)]', label: 'PROCESSING' };
      case 'retrieving': return { color: 'bg-violet-400', shadow: 'shadow-[0_0_10px_rgba(167,139,250,0.5)]', label: 'CLARIFYING' };
      case 'answering': return { color: 'bg-emerald-400', shadow: 'shadow-[0_0_10px_rgba(52,211,153,0.5)]', label: 'SPEAKING' };
      case 'error': return { color: 'bg-red-500', shadow: 'shadow-[0_0_10px_rgba(239,68,68,0.5)]', label: 'ERROR' };
      default: return { color: 'bg-zinc-500', shadow: 'shadow-none', label: 'READY' };
    }
  }, [state, isMuted]);

  return (
    <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-black/40 backdrop-blur-2xl border border-white/10 shadow-lg transition-all duration-500">
      <div className={`relative flex items-center justify-center w-2 h-2`}>
        {state !== 'idle' && !isMuted && (
          <div className={`absolute inset-0 rounded-full animate-ping opacity-50 ${config.color}`} />
        )}
        <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${config.color} ${config.shadow}`} />
      </div>
      <span className="text-[10px] font-mono tracking-widest text-zinc-300 transition-colors duration-300">
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
      
      const committedSegments: string[] = [];
      let currentPartial = '';
      
      ws.onopen = () => {};
      ws.onclose = () => {};
      
      ws.onmessage = (event) => {
         try {
             const data = JSON.parse(event.data);
             const type = data.message_type || data.type;
             
             if (type === 'partial_transcript') {
                 currentPartial = data.text || '';
                 const fullText = [...committedSegments, currentPartial].join(' ').trim();
                 setLiveTranscript(fullText);
                 finalTranscriptRef.current = fullText;
                 
             } else if (type === 'final_transcript' || type === 'committed_transcript') {
                 const text = data.text || '';
                 if (text.trim()) {
                     committedSegments.push(text.trim());
                     currentPartial = '';
                     const fullText = committedSegments.join(' ').trim();
                     setLiveTranscript(fullText);
                     finalTranscriptRef.current = fullText;
                 }
                 
             } else if (type === 'utterance_end') {
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

      audio.onerror = () => fallbackSynthesis();
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

  // ─── Computed State Configuration ───
  const stateConfig = useMemo(() => {
    if (isMuted && agentState === 'idle') return { glowColor: 'bg-zinc-600', gradientFrom: 'from-zinc-800/20', gradientTo: 'to-zinc-900/10' };
    switch (agentState) {
      case 'listening': return { glowColor: 'bg-amber-500', gradientFrom: 'from-amber-600/15', gradientTo: 'to-amber-900/5' };
      case 'processing': return { glowColor: 'bg-blue-500', gradientFrom: 'from-blue-600/15', gradientTo: 'to-blue-900/5' };
      case 'retrieving': return { glowColor: 'bg-violet-500', gradientFrom: 'from-violet-600/15', gradientTo: 'to-purple-900/5' };
      case 'answering': return { glowColor: 'bg-emerald-500', gradientFrom: 'from-emerald-600/15', gradientTo: 'to-teal-900/5' };
      case 'error': return { glowColor: 'bg-red-500', gradientFrom: 'from-red-600/15', gradientTo: 'to-rose-900/5' };
      default: return { glowColor: 'bg-zinc-400', gradientFrom: 'from-zinc-600/15', gradientTo: 'to-zinc-800/5' };
    }
  }, [agentState, isMuted]);

  // Are we currently showing a conversation history?
  const hasHistory = messages.length > 0 || liveTranscript !== "" || agentState === 'processing';

  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative overflow-hidden bg-black/40">
      
      {/* ─── Environmental Lighting ─── */}
      <div 
        className={`absolute inset-0 z-0 transition-colors duration-[1500ms] ease-in-out ${stateConfig.glowColor}`}
        style={{ filter: 'blur(160px)', transform: 'scale(1.2)', opacity: 0.12 }} 
      />
      <div className={`absolute inset-0 z-0 transition-colors duration-[1500ms] ease-in-out bg-gradient-radial ${stateConfig.gradientFrom} ${stateConfig.gradientTo} to-transparent`} 
        style={{ background: `radial-gradient(circle at 50% 40%, var(--tw-gradient-from) 0%, transparent 60%)` }}
      />

      {/* ─── Top Controls ─── */}
      <div className="absolute top-6 right-6 z-50 animate-in fade-in zoom-in duration-500">
        <button 
          onClick={onClose} 
          className="group flex items-center justify-center p-3 bg-white/[0.03] backdrop-blur-2xl border border-white/[0.06] rounded-full text-zinc-400 hover:text-white hover:bg-white/10 hover:border-white/10 transition-all duration-300 focus:outline-none shadow-lg" 
          title="Close Voice Mode"
        >
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>

      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-500">
        <StatusBadge state={agentState} isMuted={isMuted} />
      </div>

      {/* ─── Main Content Area ─── */}
      <div className="flex-1 flex flex-col w-full max-w-4xl mx-auto relative z-10 pt-12 md:pt-20 px-4 h-full pb-8">
        
        {/* Particle Orb (Dynamic Sizing based on History) */}
        <div className={`shrink-0 w-full flex items-center justify-center transition-all duration-[1000ms] cubic-bezier(0.2, 0.8, 0.2, 1) z-10 ${
          hasHistory ? 'h-[10vh] min-h-[100px] scale-75 opacity-90' : 'h-[35vh] min-h-[300px] scale-100 opacity-100'
        }`}>
          <div className={`relative w-full h-full flex items-center justify-center transition-all duration-700 ease-out ${
            isMuted && agentState === 'idle' ? 'opacity-30 grayscale' : 'opacity-100'
          }`}>
            <ParticleOrb state={isMuted && agentState === 'idle' ? 'idle' : agentState} />
            
            {/* Ambient Listening Rings */}
            {!isMuted && agentState === 'listening' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="absolute w-40 h-40 rounded-full border border-amber-500/20 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
                <div className="absolute w-40 h-40 rounded-full border border-amber-500/10 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite_1s]" />
              </div>
            )}
          </div>
        </div>

        {/* Initial Greeting (Visible only when empty) */}
        {!hasHistory && (
          <div className="flex-1 flex flex-col items-center justify-start pt-6 pointer-events-none z-0 animate-in fade-in slide-in-from-bottom-8 duration-1000">
             <div className="text-center space-y-4">
                <h2 className="text-4xl md:text-5xl font-extralight tracking-wide text-zinc-100 drop-shadow-sm">
                   How can I help?
                </h2>
                <p className="text-zinc-400 font-light tracking-wide text-[15px]">
                   Speak naturally. I'll take care of the rest.
                </p>
             </div>
          </div>
        )}

        {/* ─── Chat History Stream ─── */}
        <div className={`flex-1 w-full max-w-3xl mx-auto overflow-y-auto scrollbar-hide flex flex-col gap-6 mb-4 px-2 transition-all duration-[1000ms] cubic-bezier(0.2, 0.8, 0.2, 1) ${
          hasHistory ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12 hidden'
        }`}
        style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)' }}>
          
          {messages.map((m, index) => (
            <div key={m.id} className={`flex flex-col w-full animate-in fade-in slide-in-from-bottom-6 duration-500 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] px-6 py-4 rounded-[1.5rem] ${
                m.role === 'user' 
                  ? 'bg-amber-500/[0.08] border border-amber-500/20 text-zinc-100 shadow-sm rounded-br-sm' 
                  : 'bg-white/[0.04] border border-white/[0.06] text-zinc-200 shadow-lg backdrop-blur-2xl rounded-bl-sm'
              }`}>
                {m.role === 'user' ? (
                  <span className="text-[17px] font-light leading-relaxed">{m.content}</span>
                ) : (
                  <div className="text-[17px] font-light leading-relaxed">
                    {index === messages.length - 1 && agentState === 'answering' ? (
                      <TypewriterText text={m.content} />
                    ) : (
                      <span>{m.content}</span>
                    )}
                  </div>
                )}
              </div>
              
              {/* Sleek Citations */}
              {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                <div className="mt-3 ml-2 flex flex-wrap gap-2">
                  {m.citations.map((c, i) => (
                    <span key={i} className="flex items-center gap-1.5 bg-black/30 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full text-[11px] text-zinc-400">
                      <Sparkles size={10} className="text-amber-500/70" />
                      [{c.id || i+1}] {c.content.substring(0,25)}...
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Live User Transcript */}
          {agentState === 'listening' && liveTranscript && (
            <div className="flex flex-col items-end w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="max-w-[85%] px-6 py-4 rounded-[1.5rem] rounded-br-sm bg-amber-500/[0.03] border border-amber-500/10 text-zinc-400">
                <span className="text-[17px] font-light leading-relaxed italic">{liveTranscript}</span>
              </div>
            </div>
          )}

          {/* Processing State Bubble */}
          {agentState === 'processing' && (
            <div className="flex flex-col items-start w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="max-w-[85%] px-6 py-4 rounded-[1.5rem] rounded-tl-sm bg-white/[0.02] border border-white/[0.04] text-zinc-400 shadow-sm backdrop-blur-md">
                <span className="text-[17px] font-light flex items-center gap-2">
                  Thinking <ProcessingDots />
                </span>
              </div>
            </div>
          )}

          {/* ─── Premium Human-in-the-Loop Card ─── */}
          {needsValidation && (
            <div className="w-full flex justify-start animate-in fade-in zoom-in-95 duration-500 mt-2">
              <div className="max-w-[90%] md:max-w-[80%] bg-black/60 backdrop-blur-3xl border border-amber-500/30 rounded-[2rem] rounded-tl-sm p-6 md:p-8 shadow-[0_20px_60px_-15px_rgba(245,158,11,0.2)]">
                
                <div className="flex items-center gap-3 text-amber-400 mb-5">
                  <div className="p-2.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                    <ShieldAlert size={18} strokeWidth={2} />
                  </div>
                  <h3 className="font-medium text-[17px] tracking-wide">Clarification Needed</h3>
                </div>
                
                <p className="text-zinc-200 mb-6 leading-relaxed text-[17px] font-light">
                  {repromptMessage}
                </p>
                
                <div className="flex flex-col sm:flex-row gap-3 mt-4">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      value={userIntent}
                      onChange={(e) => setUserIntent(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleResumeWorkflow()}
                      className="w-full bg-white/[0.03] border border-white/10 hover:border-white/20 focus:border-amber-500/50 focus:bg-white/[0.05] focus:ring-4 focus:ring-amber-500/10 transition-all duration-300 rounded-[1.25rem] px-5 py-3.5 text-zinc-100 font-light outline-none placeholder:text-zinc-600"
                      placeholder="Type your clarification..."
                      autoFocus
                    />
                    <CornerDownLeft size={14} className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-600 hidden sm:block" />
                  </div>
                  
                  <button 
                    onClick={handleResumeWorkflow}
                    className="bg-amber-500 text-black font-medium px-8 py-3.5 rounded-[1.25rem] flex items-center justify-center gap-2.5 hover:bg-amber-400 hover:scale-[1.03] active:scale-[0.97] transition-all duration-300 shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                  >
                    Confirm <Check size={18} strokeWidth={2.5} />
                  </button>
                </div>

              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-6" />
        </div>

        {/* ─── Bottom Mic Control ─── */}
        <div className="shrink-0 relative flex flex-col items-center justify-center pb-4 z-10">
          <button 
            onClick={handleMicClick}
            className={`relative z-10 w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center backdrop-blur-2xl border transition-all duration-500 focus:outline-none ${
              isMuted 
                ? 'bg-white/[0.02] border-white/[0.05] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300 shadow-sm'
                : agentState === 'listening'
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 shadow-[0_0_40px_rgba(245,158,11,0.2)] hover:scale-105 hover:bg-amber-500/20'
                  : agentState === 'answering' && isSpeaking
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.2)]'
                    : 'bg-white/[0.04] border-white/10 text-zinc-100 hover:bg-white/[0.08] hover:scale-105 shadow-xl'
            }`}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {isMuted ? (
              <MicOff size={28} strokeWidth={1.5} />
            ) : agentState === 'answering' && isSpeaking ? (
              <Volume2 size={28} strokeWidth={1.5} className="text-emerald-300 animate-pulse" />
            ) : (
              <Mic size={28} strokeWidth={1.5} className={agentState === 'listening' ? 'animate-pulse text-amber-400' : ''} />
            )}
          </button>
          
          <div className="mt-5 text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-medium opacity-70">
            Press <kbd className="font-mono text-amber-500/70">ESC</kbd> to exit
          </div>
        </div>

      </div>
    </div>
  );
};