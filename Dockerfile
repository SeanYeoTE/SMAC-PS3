# Backend (FastAPI + ps3 predictors), built from the repo root because
# app/ and ps3/ are siblings here, not nested under a backend/ folder.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY ps3/ ./ps3/

CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
