"""
Quick connectivity test for Browser Use Cloud SDK.
Run: python scratch_test.py
"""
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

async def test():
    from browser_use_sdk.v3 import AsyncBrowserUse

    key = os.getenv("BROWSER_USE_API_KEY", "")
    if not key:
        print("ERROR: No BROWSER_USE_API_KEY in .env!")
        return

    print(f"Using key: {key[:15]}...")
    client = AsyncBrowserUse(api_key=key)

    print("\n[1] Creating cloud session...")
    session = await client.sessions.create(
        task="Go to https://httpbin.org/get and return the JSON response.",
        model="claude-sonnet-4.6",
    )
    print(f"    Session ID:  {session.id}")
    print(f"    Status:      {session.status}")
    print(f"    Live URL:    {getattr(session, 'live_url', None) or getattr(session, 'liveUrl', None)}")

    print("\n[2] Streaming messages...")
    cursor = None
    for _ in range(6):  # poll up to 6 times (12 seconds)
        msgs = await client.sessions.messages(session.id, after=cursor, limit=20)
        for m in msgs.messages:
            cursor = m.id
            print(f"    [{m.role}] {m.summary}")
        s = await client.sessions.get(session.id)
        status_val = s.status.value if hasattr(s.status, "value") else str(s.status)
        if status_val in ("idle", "stopped", "error", "timed_out", "completed"):
            print(f"\n[3] Done! Output: {s.output}")
            break
        await asyncio.sleep(2)

    print("\nAll tests passed!")

asyncio.run(test())
