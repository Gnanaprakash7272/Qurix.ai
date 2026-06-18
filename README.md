# Autonomous Browser Agent

A minimal, powerful autonomous browser agent powered by **browser-use** and **Gemini 2.0**.

## 🚀 Overview

This agent accepts natural language goals, autonomously builds an execution plan, navigates the web, validates its own success, and recovers from failures using screenshots and a vision model. 

## 🛠️ Tech Stack

- **AI Engine**: `langchain-google-genai` (Gemini API)
- **Browser Automation**: `browser-use` (Playwright under the hood)
- **Language**: Python

## 💻 Installation

### 1. Install Dependencies
Make sure you are using a Python environment >= 3.11.

```bash
pip install -r requirements.txt
playwright install
```

### 2. Configure Environment variables
Create a `.env` file in the root directory and add your Gemini API Key:
```
GEMINI_API_KEY=your_api_key_here
```

### 3. Run the Agent
```bash
python src/main.py
```
