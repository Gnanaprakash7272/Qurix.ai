# Stage 1: Build React Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/ui
COPY ui/package*.json ./
RUN npm install
COPY ui/ ./
RUN npm run build

# Stage 2: Build Python Backend
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies needed for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browser binaries
RUN python -m playwright install chromium
RUN python -m playwright install-deps chromium

# Copy application code
COPY . .

# Copy built frontend from Stage 1 to the location FastAPI expects
COPY --from=frontend-builder /app/ui/dist /app/ui/dist

# Expose the default Render port
EXPOSE 10000

# Start the FastAPI server using the PORT environment variable provided by Render
CMD python -m uvicorn src.api:app --host 0.0.0.0 --port $PORT
