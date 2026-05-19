# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

FROM --platform=linux/arm64 python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --target /deps -r requirements.txt

FROM --platform=linux/arm64 python:3.12-slim
RUN useradd -r -s /bin/false appuser
RUN mkdir -p /tmp/.aws && chown appuser:appuser /tmp/.aws
WORKDIR /app
COPY --from=builder /deps /usr/local/lib/python3.12/site-packages/
COPY app.py .
USER appuser
EXPOSE 8080
CMD ["python", "app.py"]
