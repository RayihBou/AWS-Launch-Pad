# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

# Stage 1: Download arm64 dependencies on any host architecture
FROM python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --target /deps \
    --platform manylinux2014_aarch64 \
    --platform linux_aarch64 \
    --only-binary=:all: \
    --python-version 312 \
    --implementation cp \
    --abi cp312 \
    -r requirements.txt

# Stage 2: arm64 runtime image (COPY only, no RUN)
FROM --platform=linux/arm64 python:3.12-slim
WORKDIR /app
COPY --from=builder /deps /usr/local/lib/python3.12/site-packages/
COPY app.py .
EXPOSE 8080
CMD ["python", "app.py"]
