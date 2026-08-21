import time
import uuid
from fastapi import APIRouter, UploadFile, File, Form, Request, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import asyncio
import json
import os
import websockets
import base64
from fastapi import WebSocket, WebSocketDisconnect

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

@router.websocket("/stream")
async def websocket_stream(websocket: WebSocket):
    print("[VOICE] frontend connected")
    await websocket.accept()
    
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        await websocket.close(code=1011, reason="No ELEVENLABS_API_KEY configured")
        print("[VOICE] session closed")
        return

    # Use the ElevenLabs Realtime STT model with VAD for automatic end-of-speech detection
    url = f"wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_16000"
    
    try:
        print(f"[VOICE] STT connecting to {url}")
        # Connect to ElevenLabs via websockets using xi-api-key header
        async with websockets.connect(
            url, 
            additional_headers={"xi-api-key": api_key}
        ) as eleven_ws:
            print("[VOICE] STT connected")
            
            async def receive_from_frontend():
                try:
                    while True:
                        data = await websocket.receive()
                        msg_type = data.get("type")
                        
                        if msg_type == "websocket.disconnect":
                            code = data.get("code", 1000)
                            print(f"[VOICE] frontend disconnected: {code}")
                            break
                            
                        if "bytes" in data:
                            bytes_len = len(data["bytes"])
                            sample_count = bytes_len // 2
                            print(f"[VOICE][DEBUG] audio received from frontend: {bytes_len} bytes")
                            b64_audio = base64.b64encode(data["bytes"]).decode('utf-8')
                            try:
                                await eleven_ws.send(json.dumps({
                                    "message_type": "input_audio_chunk",
                                    "audio_base_64": b64_audio
                                }))
                                print(f"[VOICE][DEBUG] Sent audio_chunk to ElevenLabs ({len(b64_audio)} chars b64)")
                            except Exception as e:
                                print(f"[VOICE][ERROR] Failed to send audio to ElevenLabs: {e}")
                        elif "text" in data:
                            try:
                                msg = json.loads(data["text"])
                                if msg.get("type") == "speech_end":
                                    await eleven_ws.send(json.dumps({
                                        "message_type": "input_audio_chunk",
                                        "audio_base_64": "",
                                        "commit": True
                                    }))
                                    print("[VOICE][DEBUG] Sent commit to ElevenLabs")
                                else:
                                    await eleven_ws.send(data["text"])
                                    print(f"[VOICE][DEBUG] Sent text message to ElevenLabs: {data['text']}")
                            except json.JSONDecodeError:
                                await eleven_ws.send(json.dumps({"user_audio_chunk": data["text"]}))
                                print("[VOICE][DEBUG] Sent raw text as user_audio_chunk")
                except WebSocketDisconnect as e:
                    print(f"[VOICE][INFO] frontend disconnected with code: {e.code}")
                except asyncio.CancelledError:
                    print(f"[VOICE][INFO] receive_from_frontend cancelled")
                except Exception as e:
                    print(f"[VOICE][ERROR] Error receiving from frontend: {e}")

            async def receive_from_elevenlabs():
                try:
                    print("[VOICE][DEBUG] Started receive_from_elevenlabs loop")
                    async for message in eleven_ws:
                        print(f"[VOICE][DEBUG] Received raw message from ElevenLabs: {message[:200]}...")
                        try:
                            evt = json.loads(message)
                            evt_type = evt.get("message_type") or evt.get("type") or "unknown"
                            print(f"[VOICE][DEBUG] Parsed transcript event: {evt_type}")
                            if evt_type == "input_error" or evt.get("error"):
                                print("[VOICE][ERROR] ElevenLabs input error:", json.dumps(evt, indent=2))
                            await websocket.send_json(evt)
                        except json.JSONDecodeError:
                            print("[VOICE][WARN] transcript event: raw text, forwarding to frontend")
                            await websocket.send_text(message)
                    print("[VOICE][DEBUG] ElevenLabs websocket async for loop ended cleanly")
                except websockets.exceptions.ConnectionClosed as e:
                    print(f"[VOICE][INFO] STT disconnected remotely: code={e.code}, reason={e.reason}")
                except asyncio.CancelledError:
                    print("[VOICE][INFO] receive_from_elevenlabs cancelled")
                except Exception as e:
                    print(f"[VOICE][ERROR] Error receiving from ElevenLabs: {e}")
                    
            # Run both tasks concurrently
            frontend_task = asyncio.create_task(receive_from_frontend())
            elevenlabs_task = asyncio.create_task(receive_from_elevenlabs())
            
            # Wait for either task to finish
            done, pending = await asyncio.wait(
                [frontend_task, elevenlabs_task],
                return_when=asyncio.FIRST_COMPLETED
            )
            
            # Cancel the remaining task cleanly
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    except websockets.exceptions.InvalidStatusCode as e:
        print(f"[VOICE] STT connection rejected: {e.status_code}")
    except Exception as e:
        print(f"ElevenLabs WebSocket error: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
        print("[VOICE] session closed")

@router.post("/query", response_model=RAGResponse)
async def process_voice_query(
    request: Request,
    audio_file: UploadFile = File(None),
    text_query: Optional[str] = Form(None),
    thread_id: Optional[str] = Form(None)
):
    """
    Starts the LangGraph workflow.
    """
    trace = request.state.trace
    t0 = time.time()
    
    print(f"[BACKEND - /query] Received request. text_query: '{text_query}', audio_file present: {bool(audio_file)}, thread_id: {thread_id}")

    if audio_file:
        audio_bytes = await audio_file.read()
        transcript, confidence = audio.transcribe_audio(audio_bytes)
    elif text_query:
        transcript = text_query
        confidence = 1.0
    else:
        print("[BACKEND - /query] Error: No audio_file or text_query provided")
        raise HTTPException(status_code=400, detail="Must provide audio_file or text_query")
        
    print(f"[BACKEND - /query] Extracted transcript: '{transcript}' with confidence {confidence}")
    trace["stages"]["stt"] = round((time.time() - t0) * 1000, 2)

    # Initialize Graph State
    active_thread_id = thread_id if thread_id else str(uuid.uuid4())
    config = {"configurable": {"thread_id": active_thread_id}}
    
    initial_state = {
        "raw_transcript": transcript,
        "stt_confidence": confidence,
        "hallucination_retries": 0,
        "status": "processing"
    }

    t0 = time.time()
    print(f"[BACKEND - /query] Starting LangGraph execution for thread {active_thread_id}")
    # Run the graph until completion or until it hits an interrupt (Human-in-the-Loop)
    for event in rag_app.stream(initial_state, config=config, stream_mode="values"):
        current_state = event
        print(f"[BACKEND - /query] Graph emitted state update, current status: {current_state.get('status')}")
        
    print(f"[BACKEND - /query] Graph execution finished in {round((time.time() - t0) * 1000, 2)}ms")
    trace["stages"]["graph_execution"] = round((time.time() - t0) * 1000, 2)

    # Check if the graph paused for Human Validation
    snapshot = rag_app.get_state(config)
    next_node = snapshot.next
    
    if "intent_validator" in next_node:
        return RAGResponse(
            thread_id=active_thread_id,
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
        thread_id=active_thread_id,
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
        print("[BACKEND - /tts] Error: Empty text provided")
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    
    print(f"[BACKEND - /tts] Generating TTS for text: '{body.text[:50]}...'")
    audio_bytes = audio.text_to_speech(body.text)
    
    if audio_bytes is None:
        print("[BACKEND - /tts] TTS generation returned None, returning 204")
        # TTS unavailable — frontend will fall back to browser speechSynthesis
        return Response(status_code=204)
    
    print(f"[BACKEND - /tts] TTS generation successful, returning {len(audio_bytes)} bytes")
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=jarvis_speech.mp3"}
    )

@router.get("/tts")
async def text_to_speech_get_endpoint(text: str):
    """
    Streams text to speech using ElevenLabs TTS for lower latency playback on the client.
    """
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
        
    print(f"[BACKEND - GET /tts] Generating stream TTS for text: '{text[:50]}...'")
    audio_stream = audio.text_to_speech_stream(text)
    
    if audio_stream is None:
        print("[BACKEND - GET /tts] TTS stream unavailable, returning 204")
        return Response(status_code=204)
        
    return StreamingResponse(
        audio_stream, 
        media_type="audio/mpeg"
    )

@router.get("/history/{thread_id}")
async def get_thread_history(thread_id: str):
    """
    Retrieves the chat history for a given thread_id from the LangGraph checkpointer.
    """
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = rag_app.get_state(config)
    
    
    # If the thread doesn't exist, return empty
    if not snapshot or not snapshot.values:
        print(f"[BACKEND - /history] No history found for thread {thread_id}")
        return {"chat_history": []}
        
    chat_history = snapshot.values.get("chat_history", [])
    print(f"[BACKEND - /history] Returning {len(chat_history)} history messages for thread {thread_id}")
    return {"chat_history": chat_history}
