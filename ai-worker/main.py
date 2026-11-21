"""TaskFlow AI Worker.

Exposes a synchronous ``POST /api/v1/analyze`` endpoint and, in the background,
consumes the durable ``taskflow:ai_jobs`` Redis Stream as part of the
``ai-workers`` consumer group. Each job is analyzed and the result is PATCHed
back to the Go API's internal callback, then acknowledged with XACK.

Delivery semantics are at-least-once: a message is only XACKed after Go has
persisted the result (or reported the task no longer exists). Messages left
pending by a crashed worker are reclaimed via XAUTOCLAIM, and poison messages
are moved to a dead-letter stream after ``MAX_DELIVERIES`` attempts.
"""

import asyncio
import json
import logging
import os
import re
import socket
from contextlib import asynccontextmanager, suppress
from typing import Any, Dict, List, Optional, Tuple

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI
from pydantic import BaseModel, Field
from redis.exceptions import ResponseError

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
GO_API_URL = os.getenv("GO_API_URL", "http://localhost:8080").rstrip("/")
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "")

STREAM_KEY = os.getenv("AI_JOBS_STREAM", "taskflow:ai_jobs")
DEAD_LETTER_STREAM = f"{STREAM_KEY}:dead"
CONSUMER_GROUP = os.getenv("AI_CONSUMER_GROUP", "ai-workers")
CONSUMER_NAME = os.getenv("AI_CONSUMER_NAME", f"{socket.gethostname()}-{os.getpid()}")

BATCH_SIZE = int(os.getenv("AI_BATCH_SIZE", "16"))
BLOCK_MS = int(os.getenv("AI_BLOCK_MS", "5000"))
CLAIM_IDLE_MS = int(os.getenv("AI_CLAIM_IDLE_MS", "60000"))
MAX_DELIVERIES = int(os.getenv("AI_MAX_DELIVERIES", "5"))
CONSUMER_ENABLED = os.getenv("AI_CONSUMER_ENABLED", "true").lower() in ("1", "true", "yes")

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
log = logging.getLogger("taskflow.ai_worker")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class AnalyzeTaskRequest(BaseModel):
    task_id: str = Field(..., description="UUID of the task from PostgreSQL")
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="")
    existing_tags: List[str] = Field(default_factory=list)


class AnalyzeTaskResponse(BaseModel):
    task_id: str
    ai_summary: str
    suggested_tags: List[str]
    priority_hint: str


# ---------------------------------------------------------------------------
# Analysis (pure, CPU-light)
# ---------------------------------------------------------------------------

KEYWORD_TAGS = {
    "api": "backend",
    "go": "golang",
    "golang": "golang",
    "database": "database",
    "postgres": "database",
    "sql": "database",
    "redis": "database",
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
URGENT_WORDS = {"urgent", "asap", "critical", "blocker", "crash", "fix"}


def analyze_task(payload: AnalyzeTaskRequest) -> AnalyzeTaskResponse:
    full_text = f"{payload.title}. {payload.description}".strip()

    sentences = [s.strip() for s in re.split(r"[.!?]+", full_text) if s.strip()]
    if len(sentences) > 1:
        summary = f"{sentences[0]} — {sentences[1][:90]}."
    else:
        summary = full_text[:130]

    detected_tags = {tag.lower() for tag in payload.existing_tags if tag.strip()}
    lower_text = full_text.lower()
    for keyword, tag in KEYWORD_TAGS.items():
        if re.search(rf"\b{keyword}\b", lower_text):
            detected_tags.add(tag)

    priority = "high" if any(word in lower_text for word in URGENT_WORDS) else "normal"

    return AnalyzeTaskResponse(
        task_id=payload.task_id,
        ai_summary=summary,
        suggested_tags=sorted(detected_tags),
        priority_hint=priority,
    )


# ---------------------------------------------------------------------------
# Redis Stream consumer
# ---------------------------------------------------------------------------


class _Permanent(Exception):
    """Job can never succeed (malformed payload); dead-letter immediately."""


def _parse_job(fields: Dict[str, str]) -> AnalyzeTaskRequest:
    try:
        tags_raw = fields.get("tags") or "[]"
        tags = json.loads(tags_raw)
        if not isinstance(tags, list):
            tags = []
        return AnalyzeTaskRequest(
            task_id=fields["task_id"],
            title=fields.get("title", ""),
            description=fields.get("description", ""),
            existing_tags=[str(t) for t in tags],
        )
    except Exception as exc:  # KeyError, JSONDecodeError, ValidationError
        raise _Permanent(f"malformed job payload: {exc}") from exc


class StreamConsumer:
    def __init__(self, rdb: aioredis.Redis, http: httpx.AsyncClient) -> None:
        self.rdb = rdb
        self.http = http
        self._stop = asyncio.Event()

    def stop(self) -> None:
        self._stop.set()

    async def ensure_group(self) -> None:
        try:
            await self.rdb.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
            log.info("created consumer group %s on %s", CONSUMER_GROUP, STREAM_KEY)
        except ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    async def run(self) -> None:
        log.info("consumer %s starting (group=%s stream=%s)", CONSUMER_NAME, CONSUMER_GROUP, STREAM_KEY)
        backoff = 1.0
        while not self._stop.is_set():
            try:
                await self.ensure_group()
                await self._reclaim_stale()

                resp = await self.rdb.xreadgroup(
                    groupname=CONSUMER_GROUP,
                    consumername=CONSUMER_NAME,
                    streams={STREAM_KEY: ">"},
                    count=BATCH_SIZE,
                    block=BLOCK_MS,
                )
                for _stream, messages in resp or []:
                    await self._process_batch(messages)
                backoff = 1.0
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("consumer loop error; retrying in %.1fs", backoff)
                with suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(self._stop.wait(), timeout=backoff)
                backoff = min(backoff * 2, 30.0)
        log.info("consumer %s stopped", CONSUMER_NAME)

    async def _reclaim_stale(self) -> None:
        """Take over jobs left pending by crashed/stalled consumers."""
        result = await self.rdb.xautoclaim(
            STREAM_KEY,
            CONSUMER_GROUP,
            CONSUMER_NAME,
            min_idle_time=CLAIM_IDLE_MS,
            start_id="0-0",
            count=BATCH_SIZE,
        )
        claimed = [m for m in (result[1] if result else []) if m and m[1] is not None]
        if not claimed:
            return

        # Look up delivery counts so poison messages don't retry forever.
        pending = await self.rdb.xpending_range(
            STREAM_KEY, CONSUMER_GROUP, min=claimed[0][0], max=claimed[-1][0],
            count=len(claimed) * 2, consumername=CONSUMER_NAME,
        )
        deliveries = {p["message_id"]: p["times_delivered"] for p in pending}

        retry: List[Tuple[str, Dict[str, str]]] = []
        for msg_id, fields in claimed:
            if deliveries.get(msg_id, 0) > MAX_DELIVERIES:
                await self._dead_letter(msg_id, fields, f"exceeded {MAX_DELIVERIES} deliveries")
            else:
                retry.append((msg_id, fields))

        if retry:
            log.info("reclaimed %d stale job(s)", len(retry))
            await self._process_batch(retry)

    async def _process_batch(self, messages: List[Tuple[str, Dict[str, str]]]) -> None:
        await asyncio.gather(*(self._process_one(mid, f) for mid, f in messages))

    async def _process_one(self, msg_id: str, fields: Dict[str, str]) -> None:
        try:
            job = _parse_job(fields)
            result = analyze_task(job)
            acked = await self._post_result(result)
        except _Permanent as exc:
            await self._dead_letter(msg_id, fields, str(exc))
            return
        except Exception:
            log.exception("job %s failed; will be retried after %dms", msg_id, CLAIM_IDLE_MS)
            return

        if acked:
            await self.rdb.xack(STREAM_KEY, CONSUMER_GROUP, msg_id)

    async def _post_result(self, result: AnalyzeTaskResponse) -> bool:
        """Returns True when the job is finished and safe to XACK."""
        url = f"{GO_API_URL}/api/v1/internal/tasks/{result.task_id}/ai"
        resp = await self.http.patch(
            url,
            json={"ai_summary": result.ai_summary, "suggested_tags": result.suggested_tags},
            headers={"X-Internal-Secret": INTERNAL_SECRET},
        )
        if resp.status_code in (200, 204):
            log.info("task %s enriched (priority=%s)", result.task_id, result.priority_hint)
            return True
        if resp.status_code == 404:
            log.info("task %s no longer exists; dropping job", result.task_id)
            return True
        if resp.status_code in (400, 422):
            raise _Permanent(f"Go API rejected payload: {resp.status_code} {resp.text[:200]}")
        # 401/503/5xx: leave pending so another attempt happens via XAUTOCLAIM.
        log.warning("callback for task %s returned %d; leaving pending", result.task_id, resp.status_code)
        return False

    async def _dead_letter(self, msg_id: str, fields: Dict[str, str], reason: str) -> None:
        log.error("dead-lettering job %s: %s", msg_id, reason)
        pipe = self.rdb.pipeline(transaction=True)
        pipe.xadd(DEAD_LETTER_STREAM, {**fields, "original_id": msg_id, "error": reason[:500]})
        pipe.xack(STREAM_KEY, CONSUMER_GROUP, msg_id)
        await pipe.execute()


# ---------------------------------------------------------------------------
# FastAPI app & lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    rdb: Optional[aioredis.Redis] = None
    http: Optional[httpx.AsyncClient] = None
    consumer: Optional[StreamConsumer] = None
    task: Optional["asyncio.Task[Any]"] = None

    if CONSUMER_ENABLED:
        if not INTERNAL_SECRET:
            log.warning("INTERNAL_SECRET is empty; Go API will reject callbacks")
        rdb = aioredis.from_url(REDIS_URL, decode_responses=True, health_check_interval=30)
        http = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0),
            limits=httpx.Limits(max_connections=BATCH_SIZE * 2, max_keepalive_connections=BATCH_SIZE),
        )
        consumer = StreamConsumer(rdb, http)
        task = asyncio.create_task(consumer.run(), name="redis-stream-consumer")

    app.state.consumer_task = task
    try:
        yield
    finally:
        if consumer:
            consumer.stop()
        if task:
            # XREADGROUP may be blocking for up to BLOCK_MS; cancel if it doesn't exit promptly.
            try:
                await asyncio.wait_for(task, timeout=(BLOCK_MS / 1000) + 2)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
        if http:
            await http.aclose()
        if rdb:
            await rdb.aclose()


app = FastAPI(
    title="TaskFlow AI Worker",
    description="Microservice for task summarization, keyword extraction, and priority classification",
    version="0.2.0",
    lifespan=lifespan,
)


@app.get("/api/v1/health")
async def health_check():
    task = getattr(app.state, "consumer_task", None)
    consumer_state = "disabled"
    if task is not None:
        consumer_state = "running" if not task.done() else "stopped"
    return {"status": "healthy", "service": "taskflow-ai-worker", "consumer": consumer_state}


@app.post("/api/v1/analyze", response_model=AnalyzeTaskResponse)
async def analyze_endpoint(payload: AnalyzeTaskRequest) -> AnalyzeTaskResponse:
    return analyze_task(payload)
