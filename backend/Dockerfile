FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    COPILOTKIT_TELEMETRY_DISABLED=true \
    DO_NOT_TRACK=1
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
# Named volumes inherit this ownership on first use; without it /vault and /data would be root-owned.
RUN mkdir -p /vault /data && chown node:node /vault /data
USER node
EXPOSE 4000
CMD ["node", "src/index.js"]
