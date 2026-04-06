FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir \
    strands-agents \
    strands-agents-tools \
    boto3 \
    mcp \
    bedrock-agentcore

COPY app.py .

EXPOSE 8080
CMD ["python", "app.py"]
