import time
import uuid
from fastapi import APIRouter, UploadFile, File, Form, Request, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from services import audio
from services.graph import rag_app, GraphState

router = APIRouter()

class RAGResponse(BaseModel):
    thread_id: str
    status: str
    query_text: str
    cleaned_query: str
    answer: str
    citations: List[Dict[str, Any]]
    reprompt_message: Optional[str] = None

class ResumeRequest(BaseModel):
    thread_id: str
    validated_intent: str

@router.post("/query", response_model=RAGResponse)
async def process_voice_query(
    request: Request,
    audio_file: UploadFile = File(None),
    text_query: Optional[str] = Form(None)
):
    """
    Starts the LangGraph workflow.
    """
    trace = request.state.trace
    t0 = time.time()
    
    if audio_file:
        audio_bytes = await audio_file.read()
        transcript, confidence = audio.transcribe_audio(audio_bytes)
    elif text_query:
        transcript = text_query
        confidence = 1.0
    else:
        raise HTTPException(status_code=400, detail="Must provide audio_file or text_query")
        
    trace["stages"]["stt"] = round((time.time() - t0) * 1000, 2)

    # Initialize Graph State
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    
    initial_state = {
        "raw_transcript": transcript,
        "stt_confidence": confidence,
        "hallucination_retries": 0,
        "status": "processing"
    }

    t0 = time.time()
    # Run the graph until completion or until it hits an interrupt (Human-in-the-Loop)
    for event in rag_app.stream(initial_state, config=config, stream_mode="values"):
        current_state = event
        
    trace["stages"]["graph_execution"] = round((time.time() - t0) * 1000, 2)

    # Check if the graph paused for Human Validation
    snapshot = rag_app.get_state(config)
    next_node = snapshot.next
    
    if "intent_validator" in next_node:
        return RAGResponse(
            thread_id=thread_id,
            status="needs_validation",
            query_text=transcript,
            cleaned_query=current_state.get("cleaned_query", transcript),
            answer="",
            citations=[],
            reprompt_message="Did you mean: " + current_state.get("cleaned_query", transcript)
        )

    # If it completed normally or hit a guardrail refusal
    # Normalize status: anything that isn't a known non-success state is "success"
    raw_status = current_state.get("status", "success")
    final_status = raw_status if raw_status in ("rejected_guardrail",) else "success"
    
    return RAGResponse(
        thread_id=thread_id,
        status=final_status,
        query_text=transcript,
        cleaned_query=current_state.get("cleaned_query", transcript),
        answer=current_state.get("final_answer", ""),
        citations=current_state.get("citations", [])
    )

@router.post("/resume", response_model=RAGResponse)
async def resume_voice_query(request: Request, body: ResumeRequest):
    """
    Resumes a paused LangGraph workflow after a human validates/edits the intent.
    """
    config = {"configurable": {"thread_id": body.thread_id}}
    snapshot = rag_app.get_state(config)
    
    if not snapshot.next:
        raise HTTPException(status_code=400, detail="No active graph state found for this thread.")

    # Update the state with the human-validated intent
    rag_app.update_state(config, {"cleaned_query": body.validated_intent})

    # Resume the graph
    for event in rag_app.stream(None, config=config, stream_mode="values"):
        current_state = event

    return RAGResponse(
        thread_id=body.thread_id,
        status=current_state.get("status", "success"),
        query_text=current_state.get("raw_transcript", ""),
        cleaned_query=current_state.get("cleaned_query", ""),
        answer=current_state.get("final_answer", ""),
        citations=current_state.get("citations", [])
    )

class TTSRequest(BaseModel):
    text: str

@router.post("/tts")
async def text_to_speech_endpoint(body: TTSRequest):
    """
    Converts text to speech using ElevenLabs TTS with the configured JARVIS voice.
    Returns audio/mpeg bytes.
    """
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    
    audio_bytes = audio.text_to_speech(body.text)
    
    if audio_bytes is None:
        # TTS unavailable — frontend will fall back to browser speechSynthesis
        return Response(status_code=204)
    
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=jarvis_speech.mp3"}
    )
