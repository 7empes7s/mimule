FROM node:22-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gh \
        git \
        jq \
        ripgrep \
        tmux \
    && rm -rf /var/lib/apt/lists/*

RUN printf '%s\n' \
    '#!/bin/sh' \
    'exec node /usr/lib/node_modules/@openai/codex/bin/codex.js "$@"' \
    > /usr/local/bin/codex \
    && chmod +x /usr/local/bin/codex \
    && printf '%s\n' \
    '#!/bin/sh' \
    'exec node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js "$@"' \
    > /usr/local/bin/claude \
    && chmod +x /usr/local/bin/claude
