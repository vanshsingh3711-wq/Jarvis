import asyncio
import websockets
import json
import base64
import os

async def test_jarvis_stream():
    uri = "ws://127.0.0.1:8001/api/v1/voice/stream"
    try:
        async with websockets.connect(uri) as ws:
            print("Connected to Jarvis backend.")
            # Send a fake audio frame
            fake_pcm = b'\x00' * 4096
            b64_audio = base64.b64encode(fake_pcm).decode('utf-8')
            
            # The frontend sends binary data or json? 
            # In VoiceAgentMode.tsx it sends binary: ws.send(pcm16.buffer);
            await ws.send(fake_pcm)
            
            print("Sent fake binary audio. Waiting for responses...")
            while True:
                try:
                    res = await asyncio.wait_for(ws.recv(), timeout=5.0)
                    print("Received from backend:", res)
                except asyncio.TimeoutError:
                    print("Timeout waiting for response.")
                    break
    except Exception as e:
        print("Error connecting to backend:", e)

if __name__ == "__main__":
    asyncio.run(test_jarvis_stream())
