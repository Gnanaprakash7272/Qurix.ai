import asyncio
import os
import sys
import io
from dotenv import load_dotenv
from browser_use import Agent
from browser_use.llm import ChatGoogle

# Fix Windows console emoji printing error
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv()

import logging
logging.getLogger("browser_use").setLevel(logging.DEBUG)

async def main():
    # Make sure you have GEMINI_API_KEY set in your .env file
    # browser-use 0.13.1 uses its own custom LLM wrappers, not LangChain's!
    llm = ChatGoogle(model="gemini-2.5-flash")
    
    # Define the task
    print("\n🌐 Welcome to your Autonomous Browser Agent!")
    print("Type 'exit' or 'quit' to stop.")
    
    while True:
        task = input("\n🤖 Enter a task for the agent: ")
        
        if task.lower() in ['exit', 'quit']:
            print("Goodbye!")
            break
            
        if not task.strip():
            continue
            
        # Initialize the browser-use agent
        agent = Agent(
            task=task,
            llm=llm
        )
        
        # Run the agent
        print(f"Starting agent with task: '{task}'")
        try:
            result = await agent.run()
            print("\n--- Final Result ---")
            print(result)
        except Exception as e:
            print(f"\n❌ An error occurred: {e}")

if __name__ == "__main__":
    asyncio.run(main())
