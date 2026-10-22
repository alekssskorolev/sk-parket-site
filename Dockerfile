FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.mjs config.seed.json ./
COPY --chown=node:node public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000 NODE_ENV=production DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "server.mjs"]
