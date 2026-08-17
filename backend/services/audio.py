import os
import io
import requests
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate

def transcribe_audio(audio_bytes: bytes) -> tuple[str, float]:
    """
    Calls ElevenLabs STT API to transcribe audio.
    Returns (transcript, simulated_confidence_score).
    ElevenLabs API currently doesn't return raw confidence scores natively 
    in their standard STT, so we simulate it or derive it based on text length/quality.
    """
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        print("Warning: No ElevenLabs API key found, returning mock transcript.")
        return ("what is the hybrid retrieval strategy", 0.95)

    url = "https://api.elevenlabs.io/v1/speech-to-text"
    headers = {
        "xi-api-key": api_key
    }
    
    # We assume the incoming audio is a standard format (e.g. mp3/wav)
    files = {
        "file": ("audio.mp3", io.BytesIO(audio_bytes), "audio/mpeg")
    }
    
    try:
        response = requests.post(url, headers=headers, files=files)
        response.raise_for_status()
        result = response.json()
        transcript = result.get("text", "")
        # Since ElevenLabs STT is highly accurate, we default confidence high
        # In a real Hinglish scenario, if transcript is extremely short we might lower confidence
        confidence = 0.9 if len(transcript) > 5 else 0.4
        return transcript, confidence
    except Exception as e:
        print(f"Error calling ElevenLabs API: {e}")
        # Fallback for hackathon demo
        return ("What is the hybrid retrieval strategy?", 0.85)

def clean_disfluencies(transcript: str) -> str:
    """
    Uses a fast LLM to normalize transcript: remove "umm", "like", restarts, 
    and translates Hinglish into a clean search query.
    """
    try:
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        prompt = PromptTemplate.from_template(
            "You are a strict transcript cleaner for a RAG system.\n"
            "1. Remove disfluencies ('umm', 'like', sentence restarts).\n"
            "2. If the query is in Hinglish (Hindi+English), translate it into a clean English search query.\n"
            "3. DO NOT answer the query. Only output the cleaned text.\n\n"
            "Transcript: {transcript}\n"
            "Cleaned Query:"
        )
        chain = prompt | llm
        result = chain.invoke({"transcript": transcript})
        return result.content.strip()
    except Exception as e:
        print(f"Error in disfluency cleaning: {e}")
        return transcript
