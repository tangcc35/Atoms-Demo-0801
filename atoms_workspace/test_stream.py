from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.genai.types import Content, Part
import asyncio
import os

root = Agent(name='a', model='gemini-3.6-flash', instruction='say hello to the world in 5 sentences')
runner = InMemoryRunner(agent=root, app_name='a')
run_config = RunConfig(streaming_mode=StreamingMode.SSE)

async def main():
    if not os.environ.get("GEMINI_API_KEY"):
        print("GEMINI_API_KEY is missing")
        return
    session = await runner.session_service.create_session(app_name="a", user_id="u1")
    content = Content(parts=[Part(text='hello')])
    async for e in runner.run_async(user_id='u1', session_id=session.id, new_message=content, run_config=run_config):
        print(f"EVENT: partial={e.partial}, text={repr(e.text if hasattr(e, 'text') else None)}")
        if hasattr(e, 'content') and e.content and e.content.parts:
            for p in e.content.parts:
                if p.text:
                    print(f"  PART text: {repr(p.text)}")

if __name__ == "__main__":
    asyncio.run(main())

