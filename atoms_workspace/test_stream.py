from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part
import asyncio

root = Agent(name='a', model='gemini-3.6-flash', instruction='say hello to the world')
runner = InMemoryRunner(agent=root, app_name='a')

async def main():
    session = await runner.session_service.create_session(app_name="a", user_id="u1")
    content = Content(parts=[Part(text='hello')])
    async for e in runner.run_async(user_id='u1', session_id=session.id, new_message=content):
        print("EVENT:", type(e).__name__)
        if hasattr(e, 'text') and e.text:
            print("TEXT:", repr(e.text))
        if hasattr(e, 'part') and hasattr(e.part, 'text') and e.part.text:
            print("PART TEXT:", repr(e.part.text))
        if hasattr(e, 'content') and hasattr(e.content, 'text'):
            print("CONTENT TEXT:", repr(e.content.text))

asyncio.run(main())
