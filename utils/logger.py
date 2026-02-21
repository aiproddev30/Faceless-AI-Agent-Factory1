import os
import sys
from loguru import logger

# Ensure storage directory exists
LOG_DIR = "storage/output"
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "pipeline.log")

# Configure Loguru
logger.remove()  # Remove default handler
logger.add(sys.stderr, level="INFO")
logger.add(
    LOG_FILE,
    rotation="5 MB",
    level="INFO",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}"
)
