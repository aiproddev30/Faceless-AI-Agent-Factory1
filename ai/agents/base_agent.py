from abc import ABC, abstractmethod
from ai.utils.retry import retry_decorator
from ai.utils.logger import logger


class BaseAgent(ABC):
    def __init__(self, name: str):
        self.name = name

    @retry_decorator
    async def execute(self, data: dict) -> dict:
        logger.info(f"Agent {self.name} starting execution...")
        try:
            result = await self._run(data)
            logger.info(f"Agent {self.name} execution successful.")
            return result
        except Exception as e:
            logger.error(f"Agent {self.name} failed: {str(e)}")
            raise e

    @abstractmethod
    async def _run(self, data: dict) -> dict:
        """Internal execution logic to be implemented by subclasses"""
        pass

