import asyncio
import websockets
import os
import json
from dotenv import load_dotenv

load_dotenv()

async def test_stt():
    api_key = os.getenv("ELEVENLABS_API_KEY")
    url = f"wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime"
    
    print("Testing connection with LiveKit STT pattern...")
    try:
        url_with_params = f"{url}&audio_format=pcm_16000&sample_rate=16000"
        async with websockets.connect(
            url_with_params,
            additional_headers={"Authorization": api_key, "xi-api-key": api_key}
        ) as ws:
            print("Connected.")
            # Send keep-alive or audio chunk
            await ws.send(json.dumps({
                "message_type": "input_audio_chunk",
                "audio_base_64": "",
                "commit": False
            }))
            
            async for res in ws:
                print("Response:", res)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(test_stt())
