import asyncio
import websockets

async def test():
    uri = "ws://127.0.0.1:8000/ws/webcam/platform2"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to WebSocket directly to 8000")
            await websocket.close()
    except Exception as e:
        print(f"Error direct: {e}")

    uri = "ws://127.0.0.1:5173/ws/webcam/platform2"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to WebSocket via Vite 5173")
            await websocket.close()
    except Exception as e:
        print(f"Error via Vite: {e}")

asyncio.run(test())
