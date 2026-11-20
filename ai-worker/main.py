import re
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(
    title="TaskFlow AI Worker",
    description="Microservice for task summarization, keyword extraction, and priority classification",
    version="0.1.0",
)


# 1. Request Schema: Validated automatically by Pydantic when Go sends JSON
class AnalyzeTaskRequest(BaseModel):
    task_id: str = Field(..., description="UUID of the task from PostgreSQL")
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="")
    existing_tags: list[str] = Field(default_factory=list)


# 2. Response Schema: Guarantees strict snake_case JSON returned to Go
class AnalyzeTaskResponse(BaseModel):
    task_id: str
    ai_summary: str
    suggested_tags: list[str]
    priority_hint: str


@app.get("/api/v1/health")
async def health_check():
    return {"status": "healthy", "service": "taskflow-ai-worker"}


@app.post("/api/v1/analyze", response_model=AnalyzeTaskResponse)
async def analyze_task(payload: AnalyzeTaskRequest) -> AnalyzeTaskResponse:
    full_text = f"{payload.title}. {payload.description}".strip()

    # Generate concise summary
    sentences = [s.strip() for s in re.split(r"[.!?]+", full_text) if s.strip()]
    if len(sentences) > 1:
        summary = f"{sentences[0]} — {sentences[1][:90]}."
    else:
        summary = full_text[:130]

    # Auto-detect domain tags from keywords
    keyword_map = {
        "api": "backend",
        "go": "golang",
        "golang": "golang",
        "database": "database",
        "postgres": "database",
        "sql": "database",
        "ui": "frontend",
        "react": "frontend",
        "mobile": "android",
        "android": "android",
        "bug": "bugfix",
        "urgent": "high-priority",
        "deploy": "devops",
        "docker": "devops",
        "ai": "ai-ml",
    }

    detected_tags = set(tag.lower() for tag in payload.existing_tags)
    lower_text = full_text.lower()
    for keyword, tag in keyword_map.items():
        if re.search(rf"\b{keyword}\b", lower_text):
            detected_tags.add(tag)

    # Detect priority level
    urgent_words = {"urgent", "asap", "critical", "blocker", "crash", "fix"}
    priority = "high" if any(word in lower_text for word in urgent_words) else "normal"

    return AnalyzeTaskResponse(
        task_id=payload.task_id,
        ai_summary=summary,
        suggested_tags=sorted(list(detected_tags)),
        priority_hint=priority,
    )
