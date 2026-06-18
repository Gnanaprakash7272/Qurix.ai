import os
import markdown
from playwright.async_api import async_playwright

async def generate_pdf(title: str, markdown_content: str) -> str:
    """
    Generates a PDF report from markdown content using Playwright.
    """
    # Convert markdown to HTML with support for tables and code blocks
    html_content = markdown.markdown(markdown_content, extensions=['tables', 'fenced_code'])
    
    # Add sleek styling
    styled_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>{title}</title>
        <style>
            body {{
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                line-height: 1.6;
                color: #2d3748;
                max-width: 900px;
                margin: 0 auto;
                padding: 20px;
            }}
            h1, h2, h3 {{ 
                color: #1a202c; 
                margin-top: 30px;
            }}
            h1 {{ 
                font-size: 2.5em; 
                text-align: center; 
                margin-bottom: 20px;
                border-bottom: 3px solid #e2e8f0;
                padding-bottom: 10px;
            }}
            h2 {{
                border-bottom: 1px solid #e2e8f0;
                padding-bottom: 8px;
            }}
            table {{ 
                border-collapse: collapse; 
                width: 100%; 
                margin: 20px 0; 
                font-size: 0.95em;
            }}
            th, td {{ 
                border: 1px solid #e2e8f0; 
                padding: 12px 15px; 
                text-align: left; 
            }}
            th {{ 
                background-color: #f7fafc; 
                font-weight: 600; 
                color: #4a5568;
                text-transform: uppercase;
                font-size: 0.85em;
                letter-spacing: 0.05em;
            }}
            tr:nth-child(even) {{
                background-color: #fbfbfc;
            }}
            pre {{ 
                background: #1a202c; 
                color: #e2e8f0;
                padding: 15px; 
                border-radius: 8px; 
                overflow-x: auto; 
                font-family: 'JetBrains Mono', monospace;
                font-size: 0.9em;
            }}
            code {{ 
                background: #edf2f7; 
                padding: 2px 6px; 
                border-radius: 4px; 
                font-family: 'JetBrains Mono', monospace; 
                font-size: 0.9em;
                color: #e53e3e;
            }}
            pre code {{
                background: transparent;
                color: inherit;
                padding: 0;
            }}
            blockquote {{
                border-left: 4px solid #4299e1;
                margin: 0;
                padding-left: 15px;
                color: #4a5568;
                font-style: italic;
            }}
            .header {{ 
                text-align: right; 
                margin-bottom: 40px; 
                color: #718096; 
                font-size: 0.85em; 
                text-transform: uppercase; 
                letter-spacing: 1.5px; 
                font-weight: 600;
            }}
            .footer {{ 
                margin-top: 60px;
                text-align: center; 
                color: #a0aec0; 
                font-size: 0.85em; 
                border-top: 1px solid #e2e8f0; 
                padding-top: 20px; 
            }}
        </style>
    </head>
    <body>
        <div class="header">Qorix AI Executive Report</div>
        <h1>{title}</h1>
        {html_content}
        <div class="footer">
            Generated autonomously by Qorix AI Intelligence Platform<br>
            &copy; {title}
        </div>
    </body>
    </html>
    """
    
    reports_dir = os.path.abspath(os.path.join(os.getcwd(), 'reports'))
    os.makedirs(reports_dir, exist_ok=True)
    
    # Safe filename
    safe_title = "".join(x for x in title if x.isalnum() or x in " -_").replace(" ", "_")
    filepath = os.path.join(reports_dir, f"{safe_title}.pdf")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.set_content(styled_html)
        await page.pdf(
            path=filepath, 
            format="A4", 
            margin={"top": "40px", "bottom": "60px", "left": "40px", "right": "40px"}, 
            print_background=True,
            display_header_footer=False
        )
        await browser.close()
        
    return filepath
