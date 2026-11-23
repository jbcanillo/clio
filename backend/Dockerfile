FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    COPILOTKIT_TELEMETRY_DISABLED=true \
    DO_NOT_TRACK=1
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
USER node
EXPOSE 4000
CMD ["node", "src/index.js"]
