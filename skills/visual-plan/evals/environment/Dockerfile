# The default eval image plus Node.js, so the checker in scripts/ can run in
# cases 4 to 7. Built for both arms, so the baseline has the same tools.
FROM python:3.12-slim

RUN apt-get -o Acquire::Retries=3 update && \
    apt-get -o Acquire::Retries=3 install -y --no-install-recommends \
    bash curl git jq procps ripgrep nodejs npm \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /workspace/skills /workspace/input /workspace/output /logs/agent /logs/verifier
WORKDIR /workspace
