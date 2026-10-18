# Use official Playwright image matching Playwright v1.55.0 with Node and Chromium dependencies
FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

# Copy package definitions
COPY package*.json ./

# Install dependencies
RUN npm ci

# Ensure Chromium is installed in container
RUN npx playwright install chromium

# Copy application files
COPY . .

# Build TypeScript server and Vite frontend
RUN npm run build

# Render supplies PORT dynamically (default 10000)
ENV PORT=10000
ENV NODE_ENV=production
ENV HOST=0.0.0.0

EXPOSE 10000

# Run the unified server
CMD ["npm", "start"]
