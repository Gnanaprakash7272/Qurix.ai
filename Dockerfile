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

# Expose port
EXPOSE 8080

# Start the FastAPI server (Cloud Run uses the PORT env variable)
CMD uvicorn src.api:app --host 0.0.0.0 --port ${PORT:-8080}
