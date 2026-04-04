FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

ENV MODEL_ID=anthropic.claude-sonnet-4-20250514-v1:0
ENV LANGUAGE=en
ENV GATEWAY_ENDPOINT=""

CMD ["python", "app.py"]
