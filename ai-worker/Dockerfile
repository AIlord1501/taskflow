FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN groupadd --system --gid 10001 taskflow \
 && useradd --system --uid 10001 --gid taskflow --no-create-home taskflow

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY main.py .

USER taskflow

EXPOSE 8001

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8001/api/v1/health', timeout=2).status == 200 else 1)"

# One process per container: each replica is a distinct Redis consumer, and
# horizontal scaling is done with `deploy.replicas` rather than uvicorn workers.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--proxy-headers", "--no-access-log"]
