import os

# Tests never touch a real database or AI provider, even if a local .env exists.
os.environ["DATABASE_URL"] = ""
os.environ["GEMINI_API_KEY"] = ""
os.environ["ENVIRONMENT"] = "local"
