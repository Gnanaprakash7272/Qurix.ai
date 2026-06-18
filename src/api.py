import asyncio
import os
import io
import sys
import csv
import json
import logging
import hashlib
import sqlite3
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import RedirectResponse
from authlib.integrations.starlette_client import OAuth
from dotenv import load_dotenv
from pydantic import BaseModel
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime

try:
    from src.pdf_generator import generate_pdf
except ImportError:
    from pdf_generator import generate_pdf

# Fix Windows console emoji printing error
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("qorix")

# ─────────────────────────────────────────────
# Database Setup
# ─────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect('aether.db')
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS scraped_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT,
            source_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task TEXT NOT NULL,
            model TEXT NOT NULL,
            final_result TEXT,
            status TEXT DEFAULT 'running',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            step_number INTEGER,
            url TEXT,
            thinking TEXT,
            next_goal TEXT,
            actions TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task TEXT NOT NULL,
            model TEXT NOT NULL,
            api_key TEXT,
            interval_minutes INTEGER,
            cron_expr TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# ─────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────
app = FastAPI(title="Qorix AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SessionMiddleware, secret_key=os.getenv("SESSION_SECRET_KEY", "super-secret-key-qorix"), https_only=True)

oauth = OAuth()
oauth.register(
    name='google',
    client_id=os.getenv("GOOGLE_CLIENT_ID", ""),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET", ""),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)

oauth.register(
    name='github',
    client_id=os.getenv("GITHUB_CLIENT_ID", ""),
    client_secret=os.getenv("GITHUB_CLIENT_SECRET", ""),
    access_token_url='https://github.com/login/oauth/access_token',
    access_token_params=None,
    authorize_url='https://github.com/login/oauth/authorize',
    authorize_params=None,
    api_base_url='https://api.github.com/',
    client_kwargs={'scope': 'user:email'}
)

os.makedirs('exports', exist_ok=True)
app.mount("/exports", StaticFiles(directory="exports"), name="exports")

scheduler = AsyncIOScheduler()

async def execute_scheduled_task(task_str: str, model_name: str, gemini_api_key: str):
    logger.info(f"Running scheduled task: {task_str}")
    
    # Save session to DB
    conn = sqlite3.connect('aether.db')
    c = conn.cursor()
    c.execute('INSERT INTO sessions (task, model, status) VALUES (?, ?, ?)', (task_str, model_name, "running"))
    db_session_id = c.lastrowid
    conn.commit()
    conn.close()

    browser = None
    try:
        from browser_use import Agent, Browser, ChatGoogle
        
        effective_key = gemini_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not effective_key:
            logger.error("No Gemini API key set for scheduled task!")
            return

        gemini_model = model_name
        valid_models = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']
        if not gemini_model or gemini_model not in valid_models:
            gemini_model = "gemini-2.5-flash"

        llm = ChatGoogle(model=gemini_model, api_key=effective_key)
        browser = Browser(headless=True, disable_security=True)

        agent = Agent(
            task=task_str,
            llm=llm,
            browser=browser
        )
        
        history = await agent.run()
        final_output = history.final_result() or "Task completed successfully."

        db = sqlite3.connect('aether.db')
        db.execute('UPDATE sessions SET final_result = ?, status = ? WHERE id = ?',
                   (final_output, 'completed', db_session_id))
        db.commit()
        db.close()
        logger.info(f"Scheduled task {db_session_id} completed.")
    except Exception as e:
        logger.error(f"Scheduled task error: {e}")
        try:
            db = sqlite3.connect('aether.db')
            db.execute('UPDATE sessions SET status = ?, final_result = ? WHERE id = ?',
                       ('error', str(e), db_session_id))
            db.commit()
            db.close()
        except Exception:
            pass
    finally:
        if browser:
            try:
                await browser.close()
            except Exception:
                pass

@app.on_event("startup")
async def start_scheduler():
    scheduler.start()
    # Load schedules from DB
    try:
        conn = sqlite3.connect('aether.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM schedules')
        schedules = c.fetchall()
        for sched in schedules:
            if sched['interval_minutes']:
                scheduler.add_job(
                    execute_scheduled_task, 
                    IntervalTrigger(minutes=sched['interval_minutes']), 
                    args=[sched['task'], sched['model'], sched['api_key']], 
                    id=str(sched['id'])
                )
    except Exception as e:
        logger.error(f"Error loading schedules: {e}")
    finally:
        conn.close()

@app.on_event("shutdown")
async def shutdown_scheduler():
    scheduler.shutdown()

class AuthRequest(BaseModel):
    email: str
    password: str

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

# ─────────────────────────────────────────────
# Auth Endpoints
# ─────────────────────────────────────────────
@app.post("/api/auth/register")
async def register(req: AuthRequest):
    conn = sqlite3.connect('aether.db')
    c = conn.cursor()
    c.execute('SELECT id FROM users WHERE email = ?', (req.email,))
    if c.fetchone():
        conn.close()
        return {"success": False, "message": "Email already exists"}
    pwd_hash = hash_password(req.password)
    try:
        c.execute('INSERT INTO users (email, password_hash) VALUES (?, ?)', (req.email, pwd_hash))
        conn.commit()
        conn.close()
        return {"success": True, "message": "User registered successfully"}
    except Exception as e:
        conn.close()
        return {"success": False, "message": f"Registration failed: {e}"}

@app.post("/api/auth/login")
async def login(req: AuthRequest):
    conn = sqlite3.connect('aether.db')
    c = conn.cursor()
    pwd_hash = hash_password(req.password)
    c.execute('SELECT id FROM users WHERE email = ? AND password_hash = ?', (req.email, pwd_hash))
    user = c.fetchone()
    conn.close()
    if user:
        return {"success": True, "token": f"token_{user[0]}"}
    return {"success": False, "message": "Invalid credentials"}

@app.get("/api/auth/login/{provider}")
async def oauth_login(provider: str, request: Request):
    client = oauth.create_client(provider)
    if not client:
        return {"error": "Invalid provider"}
    
    # Dynamically build the redirect URI using the host that the user accessed
    redirect_uri = f"{request.url.scheme}://{request.url.netloc}/api/auth/callback/{provider}"
    return await client.authorize_redirect(request, redirect_uri)

@app.get("/api/auth/callback/{provider}")
async def oauth_callback(provider: str, request: Request):
    client = oauth.create_client(provider)
    if not client:
        return {"error": "Invalid provider"}
    
    try:
        token = await client.authorize_access_token(request)
    except Exception as e:
        return {"error": f"OAuth authorization failed: {e}"}
        
    email = None
    if provider == 'google':
        user_info = token.get('userinfo')
        if not user_info:
            user_info = await client.parse_id_token(request, token)
        email = user_info.get('email')
    elif provider == 'github':
        resp = await client.get('user/emails', token=token)
        emails = resp.json()
        print("GITHUB EMAILS RESP:", emails)
        email = next((e['email'] for e in emails if e.get('primary')), emails[0]['email']) if emails else None

    print("RESOLVED EMAIL:", email)
    if not email:
        return {"error": "Could not fetch email", "details": emails}

    # Register/Login the user
    conn = sqlite3.connect('aether.db')
    c = conn.cursor()
    c.execute('SELECT id FROM users WHERE email = ?', (email,))
    user = c.fetchone()
    if not user:
        c.execute('INSERT INTO users (email, password_hash) VALUES (?, ?)', (email, 'oauth_placeholder'))
        conn.commit()
    conn.close()

    # Generate token
    auth_token = f"oauth_token_{email}"
    
    # Redirect to frontend with token and email
    frontend_url = f"{request.url.scheme}://{request.url.netloc}"
    if "localhost:8000" in frontend_url or "127.0.0.1:8000" in frontend_url:
        frontend_url = "http://localhost:5175"
        
    return RedirectResponse(url=f"{frontend_url}/?token={auth_token}&email={email}")

# ─────────────────────────────────────────────
# Data Endpoints
# ─────────────────────────────────────────────
@app.get("/api/data/scraped")
async def get_scraped_data():
    try:
        conn = sqlite3.connect('aether.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT id, content, source_url, created_at FROM scraped_data ORDER BY created_at DESC')
        rows = c.fetchall()
        conn.close()
        return {"success": True, "data": [dict(row) for row in rows]}
    except Exception as e:
        return {"success": False, "message": f"Error fetching data: {str(e)}"}

@app.get("/api/history")
async def get_history():
    try:
        conn = sqlite3.connect('aether.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM sessions ORDER BY created_at DESC')
        sessions = [dict(row) for row in c.fetchall()]
        for session in sessions:
            c.execute('SELECT * FROM steps WHERE session_id = ? ORDER BY step_number ASC', (session['id'],))
            session['steps'] = [dict(row) for row in c.fetchall()]
        conn.close()
        return {"success": True, "data": sessions}
    except Exception as e:
        return {"success": False, "message": f"Error fetching history: {str(e)}"}

# ─────────────────────────────────────────────
# Scheduling Endpoints
# ─────────────────────────────────────────────
class ScheduleRequest(BaseModel):
    task: str
    model: str
    api_key: str = ""
    interval_minutes: int

@app.post("/api/schedules")
async def create_schedule(req: ScheduleRequest):
    try:
        conn = sqlite3.connect('aether.db')
        c = conn.cursor()
        c.execute('INSERT INTO schedules (task, model, api_key, interval_minutes) VALUES (?, ?, ?, ?)',
                  (req.task, req.model, req.api_key, req.interval_minutes))
        sched_id = c.lastrowid
        conn.commit()
        conn.close()
        
        scheduler.add_job(
            execute_scheduled_task, 
            IntervalTrigger(minutes=req.interval_minutes), 
            args=[req.task, req.model, req.api_key], 
            id=str(sched_id)
        )
        return {"success": True, "message": "Schedule created"}
    except Exception as e:
        return {"success": False, "message": f"Failed: {e}"}

@app.get("/api/schedules")
async def get_schedules():
    try:
        conn = sqlite3.connect('aether.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM schedules ORDER BY created_at DESC')
        rows = c.fetchall()
        conn.close()
        return {"success": True, "data": [dict(row) for row in rows]}
    except Exception as e:
        return {"success": False, "message": f"Error: {e}"}

@app.delete("/api/schedules/{sched_id}")
async def delete_schedule(sched_id: int):
    try:
        conn = sqlite3.connect('aether.db')
        c = conn.cursor()
        c.execute('DELETE FROM schedules WHERE id = ?', (sched_id,))
        conn.commit()
        conn.close()
        
        try:
            scheduler.remove_job(str(sched_id))
        except Exception:
            pass
            
        return {"success": True}
    except Exception as e:
        return {"success": False, "message": f"Error: {e}"}

# ─────────────────────────────────────────────
# Main Agent WebSocket — Browser Use Cloud SDK
# ─────────────────────────────────────────────
@app.websocket("/api/agent/ws")
async def agent_websocket(websocket: WebSocket):
    await websocket.accept()

    current_agent_task = None

    try:
        async def run_local_agent(task_str: str, model_name: str, user_api_key: str, ws: WebSocket):
            nonlocal current_agent_task

            # Save session to DB
            conn = sqlite3.connect('aether.db')
            c = conn.cursor()
            c.execute('INSERT INTO sessions (task, model) VALUES (?, ?)', (task_str, model_name))
            db_session_id = c.lastrowid
            conn.commit()
            conn.close()

            browser = None
            try:
                from browser_use import Agent, Browser, ChatGoogle

                # Resolve key
                effective_key = user_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
                if not effective_key:
                    await ws.send_json({"type": "error", "message": "No Gemini API key found! Go to Settings and enter your API key, or add GEMINI_API_KEY to your Render environment."})
                    return

                # Auto-correct model
                gemini_model = model_name
                valid_models = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']
                if not gemini_model or gemini_model not in valid_models:
                    gemini_model = "gemini-2.5-flash"

                await ws.send_json({
                    "type": "status",
                    "message": f"🤖 Initializing Gemini Agent with {gemini_model}..."
                })

                # Initialize LLM
                llm = ChatGoogle(model=gemini_model, api_key=effective_key)

                # Initialize local Browser in headless mode
                browser = Browser(headless=True, disable_security=True)

                # Callback for each step
                async def on_step(state, output, step_number):
                    screenshot_data = None
                    if state.screenshot:
                        if state.screenshot.startswith('data:image'):
                            screenshot_data = state.screenshot
                        else:
                            screenshot_data = f"data:image/png;base64,{state.screenshot}"

                    actions_list = []
                    if output.action:
                        for act in output.action:
                            act_dict = act.model_dump() if hasattr(act, 'model_dump') else {}
                            actions_list.append(act_dict)

                    step_update = {
                        "type": "step",
                        "step": step_number,
                        "url": state.url or "",
                        "thinking": output.thinking or "",
                        "evaluation": output.evaluation_previous_goal or "",
                        "memory": output.memory or "",
                        "next_goal": output.next_goal or "",
                        "actions": actions_list,
                        "screenshot": screenshot_data
                    }
                    
                    # Insert step into database
                    try:
                        conn = sqlite3.connect('aether.db')
                        c = conn.cursor()
                        c.execute('''
                            INSERT INTO steps (session_id, step_number, url, thinking, next_goal, actions)
                            VALUES (?, ?, ?, ?, ?, ?)
                        ''', (
                            db_session_id,
                            step_number,
                            state.url or "",
                            output.thinking or "",
                            output.next_goal or "",
                            json.dumps(actions_list)
                        ))
                        conn.commit()
                        conn.close()
                    except Exception as db_err:
                        logger.error(f"DB step save error: {db_err}")

                    await ws.send_json(step_update)

                agent = Agent(
                    task=task_str,
                    llm=llm,
                    browser=browser,
                    register_new_step_callback=on_step
                )

                await ws.send_json({
                    "type": "status",
                    "message": "🖥️ Starting local browser session..."
                })

                history = await agent.run()
                final_output = history.final_result() or "Task completed successfully."

                # Update DB
                try:
                    db = sqlite3.connect('aether.db')
                    db.execute('UPDATE sessions SET final_result = ?, status = ? WHERE id = ?',
                               (final_output, 'completed', db_session_id))
                    db.commit()
                    db.close()
                except Exception as e:
                    logger.error(f"DB update error: {e}")

                await ws.send_json({
                    "type": "result",
                    "success": True,
                    "message": "Task finished",
                    "result": final_output
                })

            except asyncio.CancelledError:
                try:
                    db = sqlite3.connect('aether.db')
                    db.execute('UPDATE sessions SET status = ? WHERE id = ?', ('stopped', db_session_id))
                    db.commit()
                    db.close()
                except Exception:
                    pass
                await ws.send_json({"type": "error", "message": "Task stopped by user."})

            except Exception as e:
                error_msg = str(e)
                logger.error(f"Agent execution error: {error_msg}")
                try:
                    db = sqlite3.connect('aether.db')
                    db.execute('UPDATE sessions SET status = ?, final_result = ? WHERE id = ?',
                               ('error', error_msg, db_session_id))
                    db.commit()
                    db.close()
                except Exception:
                    pass
                await ws.send_json({"type": "error", "message": f"Error: {error_msg}"})
            finally:
                if browser:
                    try:
                        await browser.close()
                    except Exception as close_err:
                        logger.error(f"Error closing browser: {close_err}")
                current_agent_task = None

        # ─── WebSocket message loop ───
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "stop":
                if current_agent_task and not current_agent_task.done():
                    current_agent_task.cancel()
                continue

            task_str = data.get("task")
            if not task_str:
                continue

            # The user's Gemini API key from the UI Settings
            user_api_key = data.get("api_key", "")
            model_name = data.get("model", "gemini-2.5-flash")

            # Cancel any existing task
            if current_agent_task and not current_agent_task.done():
                current_agent_task.cancel()
                await asyncio.sleep(0.5)

            current_agent_task = asyncio.create_task(
                run_local_agent(task_str, model_name, user_api_key, websocket)
            )

    except WebSocketDisconnect:
        logger.info("Client disconnected")
        if current_agent_task and not current_agent_task.done():
            current_agent_task.cancel()
    except Exception as e:
        logger.error(f"WebSocket error: {e}")

from fastapi.staticfiles import StaticFiles
import os

# Serve the React frontend in production
if os.path.isdir("ui/dist"):
    app.mount("/", StaticFiles(directory="ui/dist", html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
