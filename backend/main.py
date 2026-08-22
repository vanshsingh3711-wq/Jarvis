import time
import json
from dotenv import load_dotenv

# Load environment variables before anything else
load_dotenv()
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from routers import voice_rag

app = FastAPI(
    title="Voice-Native RAG API",
    description="Backend for handling Hinglish voice queries, hybrid retrieval, and guardrails.",
    version="1.0.0"
)

# Allow Next.js frontend to communicate
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom middleware for latency logging and structured JSON traces
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    
    # We can inject a trace object into the request state to collect stage latencies
    request.state.trace = {
        "endpoint": request.url.path,
        "stages": {},
        "total_latency_ms": 0
    }
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    process_time_ms = round(process_time * 1000, 2)
    
    request.state.trace["total_latency_ms"] = process_time_ms
    
    # Print structured JSON trace for demo purposes
    if request.url.path.startswith("/api/v1/voice"):
        print("\n--- Structured JSON Trace ---")
        print(json.dumps(request.state.trace, indent=2))
        print("-----------------------------\n")
        
    response.headers["X-Process-Time"] = str(process_time)
    return response

app.include_router(voice_rag.router, prefix="/api/v1/voice")

@app.get("/")
def read_root():
    return {"message": "Jarvis Backend is running! 🚀"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
