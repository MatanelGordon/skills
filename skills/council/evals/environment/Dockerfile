# skills/council/evals/environment/Dockerfile
# The default eval image plus Node.js, for cases 1, 3, 4, 5, 7, 8, 12, 13
# (and 9, 11 if the agent checks a gate). The skill runs every mechanical gate
# through its Node helper script, so the with-skill arm calls `node`; without
# it the attempt is voided as an undeclared dependency.
FROM python:3.12-slim

RUN apt-get -o Acquire::Retries=3 update && \
    apt-get -o Acquire::Retries=3 install -y --no-install-recommends \
    bash curl git jq procps ripgrep nodejs npm \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /workspace/skills /workspace/input /workspace/output /logs/agent /logs/verifier
WORKDIR /workspace
