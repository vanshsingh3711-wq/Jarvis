import asyncio
import websockets
import os
import json
from dotenv import load_dotenv

load_dotenv()

async def test_stt():
    api_key = os.getenv("ELEVENLABS_API_KEY")
    url = f"wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime"
    
    print("Testing connection with xi-api-key...")
    try:
        async with websockets.connect(
            url,
            additional_headers={"xi-api-key": api_key}
        ) as ws:
            print("Connected.")
            msg = await ws.recv()
            print("Response:", msg)
    except Exception as e:
        print("Error with xi-api-key:", e)

    print("\nTesting connection with Authorization...")
    try:
        async with websockets.connect(
            url,
            additional_headers={"Authorization": api_key}
        ) as ws:
            print("Connected.")
            msg = await ws.recv()
            print("Response:", msg)
    except Exception as e:
        print("Error with Authorization:", e)

    print("\nTesting connection with Authorization: Bearer...")
    try:
        async with websockets.connect(
            url,
            additional_headers={"Authorization": f"Bearer {api_key}"}
        ) as ws:
            print("Connected.")
            msg = await ws.recv()
            print("Response:", msg)
    except Exception as e:
        print("Error with Authorization: Bearer:", e)

if __name__ == "__main__":
    asyncio.run(test_stt())
