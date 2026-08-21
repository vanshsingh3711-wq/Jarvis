import asyncio
import websockets
import os
import json
from dotenv import load_dotenv

load_dotenv()

async def test_stt():
    api_key = os.getenv("ELEVENLABS_API_KEY")
    url = f"wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token={api_key}"
    
    print("Testing connection with query parameter token...")
    try:
        async with websockets.connect(url) as ws:
            print("Connected.")
            msg = await ws.recv()
            print("Response:", msg)
    except Exception as e:
        print("Error with query parameter token:", e)

    url_auth = f"wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&AUTHORIZATION={api_key}"
    print("Testing connection with query parameter AUTHORIZATION...")
    try:
        async with websockets.connect(url_auth) as ws:
            print("Connected.")
            msg = await ws.recv()
            print("Response:", msg)
    except Exception as e:
        print("Error with query parameter AUTHORIZATION:", e)


if __name__ == "__main__":
    asyncio.run(test_stt())
