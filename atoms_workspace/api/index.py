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
from google.genai.types import ThinkingConfig, ThinkingLevel
from google.adk.planners import BuiltInPlanner

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
    current_code: str = ""


class BuildRequest(BaseModel):
    design_plan: str
    current_code: str = ""


# Configure API Key (ADK automatically picks up GEMINI_API_KEY from environment)
api_key = os.environ.get("GEMINI_API_KEY", "")

thinking_config = ThinkingConfig(
    include_thoughts=True,
    thinking_level=ThinkingLevel.HIGH
)

# Step 2: Instantiate BuiltInPlanner
planner = BuiltInPlanner(
    thinking_config=thinking_config
)

# 1. Designer Agent
designer_agent = Agent(
    name="designer",
    model="gemini-3.5-flash-lite",
    instruction="""You are a UX/UI Product Designer. Your job is to read the user's request and output a detailed design plan.
Include layout structure, color palette, typography, and interactive elements. 
CRITICAL: DO NOT recommend or use Tailwind CDN (cdn.tailwindcss.com) as it causes MutationObserver errors. Recommend Vanilla CSS or other stable alternatives. Do not output code, only the design blueprint.""",
)
runner_designer = InMemoryRunner(agent=designer_agent)

# 2. Coder Agent
coder_agent = Agent(
    name="coder",
    model="gemini-3.5-flash-lite",
    instruction="""You are an Expert Web Developer. You receive a design plan and must generate a complete, runnable, single-file HTML application.
Requirements:
1. Output ONLY a complete HTML document. DO NOT use markdown formatting like ```html. Start immediately with <!DOCTYPE html>.
2. Must be self-contained: CSS and JS in the same file.
3. CRITICAL: DO NOT use Tailwind CDN (cdn.tailwindcss.com) as it is not for production and causes errors. Use Vanilla CSS.
4. Implement all logic and UI from the design plan.
5. If modifying existing code, ensure you preserve existing features (like limits, buttons) unless explicitly asked to remove them.""",
    planner=planner,
)
runner_coder = InMemoryRunner(agent=coder_agent)

# 3. QA Agent
qa_agent = Agent(
    name="qa",
    model="gemini-3.5-flash-lite",
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
        raise HTTPException(
            status_code=500, detail="GEMINI_API_KEY is not set in the environment.")

    async def event_generator():
        if req.current_plan:
            design_prompt = f"Previous Design Plan:\n{req.current_plan}\n\nCurrent Code (Do not output code, just plan how to modify it):\n{req.current_code}\n\nUser Modification Request:\n{req.prompt}\n\nPlease update the design plan accordingly. Explicitly state what features from the previous code must be preserved."
        else:
            design_prompt = f"Create a detailed design plan for this user request: {req.prompt}"

        session = await runner_designer.session_service.create_session(app_name=runner_designer.app_name, user_id="u1")
        content = Content(role="user", parts=[Part(text=design_prompt)])

        try:
            async for e in runner_designer.run_async(user_id="u1", session_id=session.id, new_message=content, run_config=run_config):
                if e.partial:
                    chunk = extract_text(e)
                    if chunk:
                        yield json.dumps({"chunk": chunk}) + "\n"
        except Exception as e:
            import traceback
            traceback.print_exc()
            yield json.dumps({"error": f"LLM/ADK Error: {str(e)}"}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@app.post("/api/build")
async def build_step(req: BuildRequest):
    if not api_key:
        raise HTTPException(
            status_code=500, detail="GEMINI_API_KEY is not set in the environment.")

    async def event_generator():
        # Step 2: Code
        if req.current_code:
            code_prompt = f"Previous Code:\n{req.current_code}\n\nDesign Plan:\n{req.design_plan}\n\nGenerate the updated, complete HTML file based on the plan. Retain previous features."
        else:
            code_prompt = f"Design Plan:\n{req.design_plan}\n\nGenerate the complete HTML file based on the plan."
        session_coder = await runner_coder.session_service.create_session(app_name=runner_coder.app_name, user_id="u1")
        content_coder = Content(role="user", parts=[Part(text=code_prompt)])

        draft_code = ""
        yield json.dumps({"status": "Coder agent is writing draft code..."}) + "\n"

        try:
            async for e in runner_coder.run_async(user_id="u1", session_id=session_coder.id, new_message=content_coder, run_config=run_config):
                if e.partial:
                    chunk = extract_text(e)
                    if chunk:
                        draft_code += chunk
                        yield json.dumps({"code_chunk": chunk, "stage": "coder"}) + "\n"
        except Exception as e:
            import traceback
            traceback.print_exc()
            yield json.dumps({"error": f"Coder Agent Error: {str(e)}"}) + "\n"
            return

        # Step 3: QA
        qa_prompt = f"Review and fix this code. Output the finalized HTML document.\n\nCode Draft:\n{draft_code}"
        session_qa = await runner_qa.session_service.create_session(app_name=runner_qa.app_name, user_id="u1")
        content_qa = Content(role="user", parts=[Part(text=qa_prompt)])

        yield json.dumps({"status": "QA agent is reviewing and finalizing...", "reset_code": True}) + "\n"

        try:
            async for e in runner_qa.run_async(user_id="u1", session_id=session_qa.id, new_message=content_qa, run_config=run_config):
                if e.partial:
                    chunk = extract_text(e)
                    if chunk:
                        yield json.dumps({"code_chunk": chunk, "stage": "qa"}) + "\n"
        except Exception as e:
            import traceback
            traceback.print_exc()
            yield json.dumps({"error": f"QA Agent Error: {str(e)}"}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Backend is running!"}


if os.path.exists("public"):
    app.mount("/", StaticFiles(directory="public", html=True), name="static")
