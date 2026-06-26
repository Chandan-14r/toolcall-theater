# Use official Node.js runtime as parent image
FROM node:20-bookworm-slim

# Set working directory inside container
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including Playwright
RUN npm ci

# Install Playwright browser binaries for chromium
RUN npx playwright install chromium

# Copy app source code
COPY . .

# Expose server port
EXPOSE 8080

# Run the startup script
CMD ["npm", "start"]
