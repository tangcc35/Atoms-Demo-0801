from google.genai.types import Content, Part
import json
from fastapi.responses import StreamingResponse
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from fastapi.staticfiles import StaticFiles

from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner
from google.adk.agents.run_config import RunConfig, StreamingMode

run_config = RunConfig(streaming_mode=StreamingMode.SSE)

app = FastAPI(title="Atoms Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DesignRequest(BaseModel):
    prompt: str
    current_plan: str = ""


class BuildRequest(BaseModel):
    design_plan: str


# Configure API Key (ADK automatically picks up GEMINI_API_KEY from environment)
api_key = os.environ.get("GEMINI_API_KEY", "")

# 1. Designer Agent
designer_agent = Agent(
    name="designer",
    model="gemini-3.6-flash",
    instruction="""You are a UX/UI Product Designer. Your job is to read the user's request and output a detailed design plan.
Include layout structure, color palette, typography, interactive elements, and framework recommendations (e.g., Tailwind). Do not output code, only the design blueprint."""
)
runner_designer = InMemoryRunner(agent=designer_agent)

# 2. Coder Agent
coder_agent = Agent(
    name="coder",
    model="gemini-3.6-flash",
    instruction="""You are an Expert Web Developer. You receive a design plan and must generate a complete, runnable, single-file HTML application.
Requirements:
1. Output ONLY a complete HTML document. DO NOT use markdown formatting like ```html. Start immediately with <!DOCTYPE html>.
2. Must be self-contained: CSS and JS in the same file. Use CDNs (like Tailwind CSS) to save space.
3. Keep it concise to avoid truncation. Rely on frameworks via CDN instead of custom CSS.
4. Implement all logic and UI from the design plan."""
)
runner_coder = InMemoryRunner(agent=coder_agent)

# 3. QA Agent
qa_agent = Agent(
    name="qa",
    model="gemini-3.6-flash",
    instruction="""You are a QA Engineer and Code Reviewer. Review the provided HTML code for completeness, correct closing tags, working CDNs, and UI bugs.
Fix any issues and output ONLY the final, polished HTML document. Do not include markdown explanations outside the code block. It must start with <!DOCTYPE html>."""
)
runner_qa = InMemoryRunner(agent=qa_agent)


def extract_text(e) -> str:
    # Safely extract text from various ADK event structures
    if hasattr(e, 'text') and e.text:
        return e.text
    if hasattr(e, 'content') and e.content:
        if hasattr(e.content, 'text') and e.content.text:
            return e.content.text
        if hasattr(e.content, 'parts') and e.content.parts:
            text = ""
            for p in e.content.parts:
                if hasattr(p, 'text') and p.text:
                    text += p.text
            return text
    return ""


@app.post("/api/design")
async def design_step(req: DesignRequest):
    if not api_key:
        return {"design_plan": "Mock Design Plan because GEMINI_API_KEY is not set."}

    async def event_generator():
        if req.current_plan:
            design_prompt = f"Previous Design Plan:\n{req.current_plan}\n\nUser Modification Request:\n{req.prompt}\n\nPlease update the design plan accordingly."
        else:
            design_prompt = f"Create a detailed design plan for this user request: {req.prompt}"

        session = await runner_designer.session_service.create_session(app_name=runner_designer.app_name, user_id="u1")
        content = Content(role="user", parts=[Part(text=design_prompt)])

        async for e in runner_designer.run_async(user_id="u1", session_id=session.id, new_message=content, run_config=run_config):
            if e.partial:
                chunk = extract_text(e)
                if chunk:
                    yield json.dumps({"chunk": chunk}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@app.post("/api/build")
async def build_step(req: BuildRequest):
    if not api_key:
        return {"code": "<h1>Mock Code</h1>"}

    async def event_generator():
        # Step 2: Code
        code_prompt = f"Design Plan:\n{req.design_plan}\n\nGenerate the complete HTML file based on the plan."
        session_coder = await runner_coder.session_service.create_session(app_name=runner_coder.app_name, user_id="u1")
        content_coder = Content(role="user", parts=[Part(text=code_prompt)])

        draft_code = ""
        yield json.dumps({"status": "Coder agent is writing draft code..."}) + "\n"

        async for e in runner_coder.run_async(user_id="u1", session_id=session_coder.id, new_message=content_coder, run_config=run_config):
            if e.partial:
                chunk = extract_text(e)
                if chunk:
                    draft_code += chunk
                    yield json.dumps({"code_chunk": chunk, "stage": "coder"}) + "\n"

        # Step 3: QA
        qa_prompt = f"Review and fix this code. Output the finalized HTML document.\n\nCode Draft:\n{draft_code}"
        session_qa = await runner_qa.session_service.create_session(app_name=runner_qa.app_name, user_id="u1")
        content_qa = Content(role="user", parts=[Part(text=qa_prompt)])

        yield json.dumps({"status": "QA agent is reviewing and finalizing...", "reset_code": True}) + "\n"

        async for e in runner_qa.run_async(user_id="u1", session_id=session_qa.id, new_message=content_qa, run_config=run_config):
            if e.partial:
                chunk = extract_text(e)
                if chunk:
                    yield json.dumps({"code_chunk": chunk, "stage": "qa"}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Backend is running!"}


if os.path.exists("public"):
    app.mount("/", StaticFiles(directory="public", html=True), name="static")
