import React, { useState, useRef, useEffect } from 'react';
import { X, Mic, MicOff, Activity, ShieldAlert, Loader2, Sparkles, Check, Send } from 'lucide-react';
import { ParticleOrb, VoiceAgentState } from './ParticleOrb';

interface VoiceAgentModeProps {
  onClose: () => void;
}

export const VoiceAgentMode: React.FC<VoiceAgentModeProps> = ({ onClose }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [agentState, setAgentState] = useState<VoiceAgentState>('idle');
  
  // API Integration States
  const [threadId, setThreadId] = useState<string | null>(null);
  const [needsValidation, setNeedsValidation] = useState(false);
  const [repromptMessage, setRepromptMessage] = useState("");
  const [userIntent, setUserIntent] = useState("");
  
  const [finalAnswer, setFinalAnswer] = useState("");
  const [citations, setCitations] = useState<any[]>([]);
  
  // Audio Recording Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  const getStateConfig = () => {
    if (isMuted) return { title: 'Paused', sub: 'Microphone is muted', color: 'bg-zinc-600', text: 'text-zinc-500', icon: <MicOff size={18} strokeWidth={1.5} /> };
    
    switch (agentState) {
      case 'listening': return { title: "I'm listening...", sub: 'Tap mic to stop', color: 'bg-amber-500', text: 'text-amber-500', icon: <Mic size={18} strokeWidth={1.5} /> };
      case 'processing': return { title: 'Thinking...', sub: 'Transcribing & Processing', color: 'bg-zinc-300', text: 'text-zinc-400', icon: <Loader2 size={18} className="animate-spin" strokeWidth={1.5} /> };
      case 'retrieving': return { title: 'Clarification Needed', sub: 'Human-in-the-Loop', color: 'bg-blue-500', text: 'text-blue-400', icon: <Sparkles size={18} className="animate-pulse" strokeWidth={1.5} /> };
      case 'answering': return { title: 'JARVIS', sub: 'Answer Ready', color: 'bg-amber-400', text: 'text-amber-400', icon: <Activity size={18} className="animate-bounce" strokeWidth={1.5} /> };
      case 'error': return { title: 'Error', sub: 'Something went wrong', color: 'bg-red-500', text: 'text-red-500', icon: <ShieldAlert size={18} strokeWidth={1.5} /> };
      case 'idle':
      default: return { title: 'How can I help?', sub: 'Tap the mic to speak', color: 'bg-zinc-400', text: 'text-zinc-500', icon: <Mic size={18} strokeWidth={1.5} /> };
    }
  };

  const config = getStateConfig();

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendAudioToBackend(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setAgentState('listening');
      setFinalAnswer("");
      setCitations([]);
      setNeedsValidation(false);
      window.speechSynthesis.cancel();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setAgentState('error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setAgentState('processing');
    }
  };

  const handleMicClick = () => {
    if (isMuted) {
      setIsMuted(false);
      setAgentState('idle');
      return;
    }
    
    if (agentState === 'idle' || agentState === 'answering' || agentState === 'error') {
      startRecording();
    } else if (agentState === 'listening') {
      stopRecording();
    } else {
      setIsMuted(true);
      setAgentState('idle');
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    }
  };

  const speakAnswer = async (text: string) => {
    // Stop any currently playing audio
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    window.speechSynthesis.cancel();

    try {
      const response = await fetch('http://localhost:8000/api/v1/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (response.status === 204) {
        // TTS unavailable — fall back to browser speech
        throw new Error('TTS unavailable');
      }

      if (!response.ok) {
        throw new Error(`TTS returned ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        audioPlayerRef.current = null;
      };

      await audio.play();
    } catch {
      // Fallback: browser built-in speech synthesis
      console.log('ElevenLabs TTS unavailable, using browser speech fallback');
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  };

  const sendAudioToBackend = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('audio_file', audioBlob, 'recording.webm');

      const response = await fetch('http://localhost:8000/api/v1/voice/query', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.status === "needs_validation") {
        setThreadId(data.thread_id);
        setRepromptMessage(data.reprompt_message);
        setUserIntent(data.query_text);
        setNeedsValidation(true);
        setAgentState('retrieving'); // Using retrieving state visually for HITL pause
        speakAnswer("I'm not quite sure I caught that. Did you mean to say this?");
      } else if (data.status === "rejected_guardrail") {
        setFinalAnswer(data.answer || "Request rejected by guardrails.");
        setAgentState('answering');
      } else {
        // "success" or any other completed status
        setFinalAnswer(data.answer);
        setCitations(data.citations || []);
        setAgentState('answering');
        if (data.answer) speakAnswer(data.answer);
      }
    } catch (error) {
      console.error("API Error:", error);
      setAgentState('error');
    }
  };

  const handleResumeWorkflow = async () => {
    if (!threadId || !userIntent.trim()) return;
    
    setNeedsValidation(false);
    setAgentState('processing');
    
    try {
      const response = await fetch('http://localhost:8000/api/v1/voice/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
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

  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative">
      {/* --- Ambient Background Lighting --- */}
      <div className={`absolute inset-0 z-0 opacity-15 blur-[120px] transition-colors duration-1000 ${config.color}`} style={{ transform: 'scale(1.2)' }} />

      {/* Top Controls - Exit */}
      <div className="absolute top-6 right-6 z-50">
        <button onClick={onClose} className="group flex items-center justify-center p-3 bg-white/[0.03] backdrop-blur-2xl border border-white/[0.05] rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition-all duration-300 focus:outline-none" title="Close Voice Mode">
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl mx-auto relative z-10 pt-12 px-6">
        
        {/* Particle Orb Container */}
        <div className={`relative w-full h-[25vh] min-h-[200px] flex items-center justify-center mb-6 transition-all duration-700 ${isMuted ? 'opacity-40 scale-95 grayscale' : 'opacity-100 scale-100'}`}>
          <ParticleOrb state={isMuted ? 'idle' : agentState} />
        </div>

        {/* Cinematic Status Text */}
        {!needsValidation && !finalAnswer && (
          <div className="text-center space-y-4 mb-20 h-28">
            <div className="flex items-center justify-center gap-2.5 text-zinc-500">
              {config.icon}
              <span className="text-[13px] font-medium tracking-wide">{config.sub}</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-extralight tracking-wide text-zinc-100 transition-all duration-500 drop-shadow-sm">
              {config.title}
            </h2>
          </div>
        )}

        {/* Human-in-the-Loop Validation UI */}
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

        {/* Final Answer Display */}
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

        {/* The Core Control Button (Microphone) */}
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
            title={agentState === 'listening' ? 'Stop Recording' : isMuted ? "Initialize Audio" : "Start Recording"}
          >
            {isMuted ? <MicOff size={28} strokeWidth={1.5} /> : <Mic size={28} strokeWidth={1.5} className={agentState === 'listening' ? 'animate-pulse text-amber-400' : ''} />}
          </button>
        </div>
      </div>
    </div>
  );
};