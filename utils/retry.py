from tenacity import retry, stop_after_attempt, wait_exponential
from utils.logger import logger

def log_retry_attempt(retry_state):
    logger.warning(f"Retrying call... Attempt #{retry_state.attempt_number}. Delay: {retry_state.next_action.sleep}s")

retry_decorator = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    before_sleep=log_retry_attempt,
    reraise=True
)
