# Optional memory layer (MEMORY_BACKEND=basic-memory). AGPL-3.0, run unmodified.
FROM python:3.12-slim
RUN pip install --no-cache-dir basic-memory==1.0.0
ENV BASIC_MEMORY_HOME=/vault \
    BASIC_MEMORY_CONFIG_DIR=/config
VOLUME ["/config"]
EXPOSE 8765
# No authentication on this transport: never publish this port; keep it on the internal network.
CMD ["basic-memory", "mcp", "--transport", "streamable-http", "--host", "0.0.0.0", "--port", "8765"]
