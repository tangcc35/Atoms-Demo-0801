from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner
import asyncio

root = Agent(name='a', model='gemini-3.6-flash', instruction='say hello')
runner = InMemoryRunner(agent=root)

async def main():
    async for e in runner.run_async(new_message='hello'):
        print(type(e), getattr(e, 'text', 'NO TEXT'))

asyncio.run(main())
