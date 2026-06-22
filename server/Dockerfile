# Portable container for the 0G proxy — works on Fly.io, Railway, Cloud Run, etc.
# (Render uses render.yaml at the repo root instead and doesn't need this.)
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=8787
EXPOSE 8787
CMD ["node", "index.js"]
