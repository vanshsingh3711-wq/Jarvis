import asyncio
import websockets
import os

async def main():
    uri = "ws://localhost:8000/api/v1/voice/stream"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to server")
            
            # Send 8192 bytes of fake audio (PCM 16-bit, 16kHz mono)
            fake_audio = os.urandom(8192)
            await websocket.send(fake_audio)
            print("Sent audio bytes")
            
            # Wait for response
            while True:
                response = await websocket.recv()
                print(f"Received: {response}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
