# Vercel Python Serverless entrypoint for FastAPI
# Exposes `app` for Vercel to serve

import sys
from pathlib import Path

# Ensure parent (backend root) is on sys.path so `import app.*` works
CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
