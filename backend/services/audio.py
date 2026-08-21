import os
import io
import requests
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate

ELEVENLABS_VOICE_ID = "cgSgspJ2msm6clMCkdW9"

def text_to_speech(text: str) -> bytes | None:
    """
    Calls ElevenLabs TTS API to convert text to speech using the configured voice.
    Returns raw audio bytes (mp3) or None on failure.
    """
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        print("Warning: No ElevenLabs API key found, skipping TTS.")
        return None

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
    }
    body = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True
        }
    }

    try:
        response = requests.post(url, json=body, headers=headers, timeout=30)
        response.raise_for_status()
        return response.content
    except Exception as e:
        print(f"Error calling ElevenLabs TTS API: {e}")
        return None

def text_to_speech_stream(text: str):
    """
    Calls ElevenLabs TTS API to stream text to speech.
    Returns a generator yielding audio bytes.
    """
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        print("Warning: No ElevenLabs API key found, skipping TTS.")
        return None

    # Use the /stream endpoint for chunked streaming with lowest-latency settings
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}/stream?optimize_streaming_latency=4"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
    }
    body = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": False
        }
    }

    try:
        response = requests.post(url, json=body, headers=headers, stream=True, timeout=30)
        response.raise_for_status()
        return response.iter_content(chunk_size=1024)
    except Exception as e:
        print(f"Error calling ElevenLabs TTS API stream: {e}")
        return None


def transcribe_audio(audio_bytes: bytes) -> tuple[str, float]:
    """
    Calls OpenAI Whisper STT API to transcribe audio.
    Returns (transcript, confidence_score).
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Warning: No OpenAI API key found.")
        return ("Sorry, I couldn't transcribe the audio.", 0.2)

    url = "https://api.openai.com/v1/audio/transcriptions"
    headers = {
        "Authorization": f"Bearer {api_key}"
    }
    
    # The frontend records audio as webm; preserve the original format
    files = {
        "file": ("audio.webm", io.BytesIO(audio_bytes), "audio/webm")
    }
    data = {
        "model": "whisper-1"
    }
    
    try:
        response = requests.post(url, headers=headers, files=files, data=data)
        response.raise_for_status()
        result = response.json()
        transcript = result.get("text", "")
        # Whisper is highly accurate, default confidence high unless very short
        confidence = 0.95 if len(transcript) > 5 else 0.4
        return transcript, confidence
    except Exception as e:
        print(f"Error calling OpenAI Whisper API: {e}")
        # Fallback if audio transcription completely fails
        return ("Sorry, I couldn't transcribe the audio.", 0.2)

def clean_disfluencies(transcript: str, chat_history: list = None) -> str:
    """
    Uses a fast LLM to normalize transcript: remove "umm", "like", restarts, 
    and rewrite conversational references into a standalone query.
    """
    try:
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        
        history_str = ""
        if chat_history:
            history_str = "Chat History:\n" + "\n".join([f"{msg['role']}: {msg['content']}" for msg in chat_history]) + "\n\n"
            
        prompt = PromptTemplate.from_template(
            "You are a strict transcript cleaner and query rewriter for a RAG system.\n"
            "1. Remove disfluencies ('umm', 'like', sentence restarts).\n"
            "2. If the user's transcript contains references like 'it', 'he', or 'that', use the Chat History to replace them with the actual subject to form a standalone query.\n"
            "3. DO NOT translate the query. Output the cleaned text in the EXACT SAME LANGUAGE the user spoke in (e.g. if they speak Hindi, output Hindi).\n"
            "4. DO NOT answer the query. Only output the cleaned, standalone query text.\n\n"
            "{history}"
            "Transcript: {transcript}\n"
            "Cleaned Standalone Query:"
        )
        chain = prompt | llm
        result = chain.invoke({"transcript": transcript, "history": history_str})
        return result.content.strip()
    except Exception as e:
        print(f"Error in disfluency cleaning: {e}")
        return transcript
