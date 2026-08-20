import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Mic, MicOff, Activity, ShieldAlert, Loader2, Sparkles, Check } from 'lucide-react';
import { ParticleOrb, VoiceAgentState } from './ParticleOrb';
import { saveSession, generateSessionTitle } from './historyManager';

interface VoiceAgentModeProps {
  onClose: () => void;
  activeThreadId: string | null;
  setActiveThreadId: (id: string) => void;
}

export const VoiceAgentMode: React.FC<VoiceAgentModeProps> = ({ onClose, activeThreadId, setActiveThreadId }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [agentState, setAgentState] = useState<VoiceAgentState>('idle');
  
  // Transcription States
  const [liveTranscript, setLiveTranscript] = useState("");
  const isListeningRef = useRef(false);
  const agentStateRef = useRef<VoiceAgentState>('idle');
  
  useEffect(() => {
    agentStateRef.current = agentState;
  }, [agentState]);
  
  // API Integration States
  const [needsValidation, setNeedsValidation] = useState(false);
  const [repromptMessage, setRepromptMessage] = useState("");
  const [userIntent, setUserIntent] = useState("");
  
  const [finalAnswer, setFinalAnswer] = useState("");
  const [citations, setCitations] = useState<any[]>([]);
  
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

  const SILENCE_THRESHOLD = 800; // 0.8s of silence triggers sending (faster response)
  const VOLUME_THRESHOLD = 20; // Sensitivity for VAD (increased to ignore background noise)

  const cleanupAudio = () => {
    console.log('[CLIENT VOICE] cleanupAudio called');
    console.log('[CLIENT VOICE] cleanup caller stack:');
    console.trace();
    if (checkAudioFrameRef.current) cancelAnimationFrame(checkAudioFrameRef.current);
    if (wsRef.current) {
        console.log('[CLIENT VOICE] closing websocket');
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
    console.log('[CLIENT VOICE] voice session started');
    const timer = setTimeout(() => {
       if (!isMuted && !isListeningRef.current) {
          startListening();
       }
    }, 500);

    return () => {
      console.log('[CLIENT VOICE] voice session stopped');
      clearTimeout(timer);
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
        // Nothing was actually said or it was background noise
        setAgentState('listening');
        return;
    }
    
    setAgentState('processing');
    console.log('[VOICE] query router: sending to backend', finalText);
    console.log('[VOICE] generation started');
    
    try {
      const formData = new FormData();
      formData.append('text_query', finalText);
      if (activeThreadId) {
        formData.append('thread_id', activeThreadId);
      }

      const response = await fetch('http://localhost:8000/api/v1/voice/query', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data = await response.json();
      console.log('[VOICE] generation completed', data);
      
      if (!activeThreadId && data.thread_id) {
        setActiveThreadId(data.thread_id);
        saveSession({
          id: data.thread_id,
          title: generateSessionTitle(data.query_text || "Voice Session"),
          date: new Date().toISOString(),
          icon: 'sparkle'
        });
      }

      if (data.status === 'needs_validation') {
        setRepromptMessage(data.reprompt_message);
        setUserIntent(data.query_text);
        setNeedsValidation(true);
        setAgentState('retrieving'); 
        speakAnswer("I'm not quite sure I caught that. Did you mean to say this?");
      } else if (data.status === "rejected_guardrail") {
        setFinalAnswer(data.answer || "Request rejected by guardrails.");
        setAgentState('answering');
        if (data.answer) await speakAnswer(data.answer);
      } else {
        setFinalAnswer(data.answer);
        setCitations(data.citations || []);
        
        // If discarded by intent router (e.g. NOT_DIRECTED_TO_ASSISTANT)
        if (data.answer === "" && data.status === "fast_reply") {
             setAgentState('listening');
             return;
        }

        setAgentState('answering');
        if (data.answer) {
          await speakAnswer(data.answer);
        } else {
          setAgentState('listening');
        }
      }
    } catch (e) {
      console.error(e);
      setAgentState('error');
    }
  };

  const startListening = async () => {
    // Force a fresh websocket connection every time we start listening
    if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
    }
    setAgentState('listening');
    isListeningRef.current = true;
    setFinalAnswer("");
    setCitations([]);
    setLiveTranscript("");
    finalTranscriptRef.current = "";
    setNeedsValidation(false);
    window.speechSynthesis.cancel();
    
    try {
      cleanupAudio();
      
      // Connect WebSocket
      console.log('[CLIENT VOICE] creating websocket');
      const ws = new WebSocket('ws://localhost:8000/api/v1/voice/stream');
      wsRef.current = ws;
      
      ws.onopen = () => {
          console.log('[CLIENT VOICE] websocket opened');
      };

      ws.onclose = (e) => {
          console.log('[CLIENT VOICE] websocket closed', e.code, e.reason);
      };
      
      ws.onmessage = (event) => {
         try {
             const data = JSON.parse(event.data);
             const type = data.message_type || data.type;
             if (type === 'partial_transcript') {
                 console.log('[VOICE] partial transcript:', data.text);
                 setLiveTranscript(data.text);
                 finalTranscriptRef.current = data.text;
             } else if (type === 'final_transcript' || type === 'committed_transcript') {
                 console.log('[VOICE] final transcript:', data.text);
                 finalTranscriptRef.current = data.text;
             } else {
                 console.log('[CLIENT VOICE] websocket message', data);
             }
         } catch (e) {
             console.error("WS Parse Error", e);
         }
      };
      
      console.log('[VOICE] microphone started');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      });
      console.log('[VOICE] microphone permission granted');
      console.log('[VOICE] audio stream active');
      
      audioStreamRef.current = stream;
      
      // Force 16kHz for ElevenLabs STT
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

      const checkTranscriptStability = () => {
         if (finalTranscriptRef.current && agentStateRef.current === 'listening') {
             if ((window as any).lastTranscript !== finalTranscriptRef.current) {
                 (window as any).lastTranscript = finalTranscriptRef.current;
                 (window as any).transcriptTime = Date.now();
             } else if (Date.now() - ((window as any).transcriptTime || Date.now()) > 1500) {
                 console.log('[VOICE] Transcript stable for 1.5s, submitting');
                 
                 const textToSubmit = finalTranscriptRef.current;
                 finalTranscriptRef.current = ""; // Reset to prevent double submission
                 (window as any).lastTranscript = "";
                 
                 if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                     wsRef.current.send(JSON.stringify({ type: "speech_end" }));
                 }
                 
                 setTimeout(() => {
                     handleFinalizedText(textToSubmit);
                 }, 100);
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

    try {
      console.log('[VOICE] TTS started');
      const response = await fetch('http://localhost:8000/api/v1/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (response.status === 204) throw new Error('TTS unavailable');
      if (!response.ok) throw new Error(`TTS returned ${response.status}`);

      const audioBlob = await response.blob();
      console.log('[VOICE] TTS audio received');
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        audioPlayerRef.current = null;
        
        startListening();
      };

      console.log('[VOICE] playback started');
      await audio.play();
      
    } catch {
      console.log('ElevenLabs TTS unavailable, using browser speech fallback');
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 0.95;
      
      utterance.onend = () => {
        startListening();
      };
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleResumeWorkflow = async () => {
    if (!activeThreadId || !userIntent.trim()) return;
    
    setNeedsValidation(false);
    setAgentState('processing');
    
    try {
      const response = await fetch('http://localhost:8000/api/v1/voice/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: activeThreadId,
          validated_intent: userIntent
        })
      });
      
      const data = await response.json();
      
      if (data.status === "success") {
        setFinalAnswer(data.answer);
        setCitations(data.citations);
        setAgentState('answering');
        speakAnswer(data.answer);
      } else {
        setFinalAnswer(data.answer || "Error processing request.");
        setAgentState('error');
      }
    } catch (error) {
      console.error("Resume Error:", error);
      setAgentState('error');
    }
  };

  const getStateConfig = () => {
    if (isMuted && agentState === 'idle') return { title: 'Paused', sub: 'Microphone is muted', color: 'bg-zinc-600', text: 'text-zinc-500', icon: <MicOff size={18} strokeWidth={1.5} /> };
    
    switch (agentState) {
      case 'listening': return { title: liveTranscript || "I'm listening...", sub: 'Speak normally. Auto-detecting silence.', color: 'bg-amber-500', text: 'text-amber-500', icon: <Mic size={18} strokeWidth={1.5} /> };
      case 'processing': return { title: 'Thinking...', sub: 'Processing your request', color: 'bg-zinc-300', text: 'text-zinc-400', icon: <Loader2 size={18} className="animate-spin" strokeWidth={1.5} /> };
      case 'retrieving': return { title: 'Clarification Needed', sub: 'Human-in-the-Loop', color: 'bg-blue-500', text: 'text-blue-400', icon: <Sparkles size={18} className="animate-pulse" strokeWidth={1.5} /> };
      case 'answering': return { title: 'JARVIS', sub: 'Answer Ready', color: 'bg-amber-400', text: 'text-amber-400', icon: <Activity size={18} className="animate-bounce" strokeWidth={1.5} /> };
      case 'error': return { title: 'Error', sub: 'Something went wrong', color: 'bg-red-500', text: 'text-red-500', icon: <ShieldAlert size={18} strokeWidth={1.5} /> };
      case 'idle':
      default: return { title: 'Initializing...', sub: 'Preparing microphone', color: 'bg-zinc-400', text: 'text-zinc-500', icon: <Loader2 size={18} className="animate-spin" strokeWidth={1.5} /> };
    }
  };

  const config = getStateConfig();

  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative">
      <div className={`absolute inset-0 z-0 opacity-15 blur-[120px] transition-colors duration-1000 ${config.color}`} style={{ transform: 'scale(1.2)' }} />

      <div className="absolute top-6 right-6 z-50">
        <button onClick={onClose} className="group flex items-center justify-center p-3 bg-white/[0.03] backdrop-blur-2xl border border-white/[0.05] rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition-all duration-300 focus:outline-none" title="Close Voice Mode">
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl mx-auto relative z-10 pt-12 px-6">
        
        <div className={`relative w-full h-[25vh] min-h-[200px] flex items-center justify-center mb-6 transition-all duration-700 ${isMuted && agentState === 'idle' ? 'opacity-40 scale-95 grayscale' : 'opacity-100 scale-100'}`}>
          <ParticleOrb state={isMuted && agentState === 'idle' ? 'idle' : agentState} />
        </div>

        {!needsValidation && !finalAnswer && (
          <div className="text-center space-y-4 mb-20 h-28 max-w-2xl">
            <div className="flex items-center justify-center gap-2.5 text-zinc-500">
              {config.icon}
              <span className="text-[13px] font-medium tracking-wide">{config.sub}</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-extralight tracking-wide text-zinc-100 transition-all duration-500 drop-shadow-sm line-clamp-3">
              {config.title}
            </h2>
          </div>
        )}

        {needsValidation && (
          <div className="w-full max-w-2xl bg-black/40 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-6 mb-12 animate-in fade-in slide-in-from-bottom-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400 mb-4">
              <ShieldAlert size={20} />
              <h3 className="font-medium text-lg">Clarification Needed</h3>
            </div>
            <p className="text-zinc-300 mb-6">{repromptMessage}</p>
            <div className="flex gap-3">
              <input 
                type="text" 
                value={userIntent}
                onChange={(e) => setUserIntent(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50"
                autoFocus
              />
              <button 
                onClick={handleResumeWorkflow}
                className="bg-amber-500 hover:bg-amber-400 text-black px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                <Check size={18} /> Confirm
              </button>
            </div>
          </div>
        )}

        {finalAnswer && !needsValidation && (
          <div className="w-full max-w-3xl bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-12 animate-in fade-in slide-in-from-bottom-4 shadow-2xl max-h-[40vh] overflow-y-auto custom-scrollbar">
            <h3 className="text-zinc-400 text-sm font-medium tracking-wider uppercase mb-4">JARVIS Response</h3>
            <p className="text-white text-lg leading-relaxed font-light mb-6">{finalAnswer}</p>
            
            {citations && citations.length > 0 && (
              <div className="border-t border-white/10 pt-4 mt-4">
                <h4 className="text-zinc-500 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Sparkles size={12} /> Sources
                </h4>
                <div className="space-y-2">
                  {citations.map((cite, i) => (
                    <div key={i} className="bg-white/5 rounded-lg p-3 text-sm text-zinc-300 border border-white/5">
                      <span className="text-amber-500/80 mr-2 text-xs">[{cite.id || i+1}]</span>
                      {cite.content}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="relative flex items-center justify-center pb-10">
          {!isMuted && agentState === 'listening' && (
            <>
              <div className={`absolute inset-0 rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite] opacity-30 ${config.color}`} />
              <div className={`absolute inset-0 rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite_1s] opacity-20 ${config.color}`} />
            </>
          )}

          <button 
            onClick={handleMicClick}
            className={`relative z-10 w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center transition-all duration-500 backdrop-blur-2xl border focus:outline-none shadow-xl ${
              isMuted 
                ? 'bg-white/[0.02] border-white/[0.05] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300' 
                : 'bg-white/[0.05] border-white/10 text-zinc-100 hover:bg-white/[0.08] hover:scale-105'
            } ${agentState === 'listening' ? 'bg-amber-500/20 border-amber-500/50' : ''}`}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {isMuted ? <MicOff size={28} strokeWidth={1.5} /> : <Mic size={28} strokeWidth={1.5} className={agentState === 'listening' ? 'animate-pulse text-amber-400' : ''} />}
          </button>
        </div>
      </div>
    </div>
  );
};
