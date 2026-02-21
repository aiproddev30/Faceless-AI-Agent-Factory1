import os
from dotenv import load_dotenv

def load_config():
    """Loads environment variables from .env file."""
    load_dotenv()
    
    config = {
        "openai_api_key": os.environ.get("OPENAI_API_KEY"),
        "log_level": os.environ.get("LOG_LEVEL", "INFO")
    }
    
    return config
