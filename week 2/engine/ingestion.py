import asyncio
import logging
from .telemetry import VectorInput
from .core import GravimetricCore

logger = logging.getLogger(__name__)

class VectorIngestionPipeline:
    def __init__(self, core: GravimetricCore):
        self.core = core
        self.running = False
        self.queue = asyncio.Queue()

    async def ingest_input(self, pitch: float, roll: float, yaw: float, throttle: float):
        """Simulates receiving joystick/throttle input from the pilot."""
        vector = VectorInput(pitch=pitch, roll=roll, yaw=yaw, throttle=throttle)
        await self.queue.put(vector)

    async def process_queue(self):
        """Continuously processes incoming vector inputs to update the core."""
        self.running = True
        logger.info("Vector ingestion pipeline started.")
        while self.running:
            try:
                # Wait for the next vector input
                vector = await self.queue.get()
                
                # Update core vectors
                self.core.update_vectors(vector)
                logger.debug(f"Applied new vector input: {vector}")
                
                self.queue.task_done()
            except asyncio.CancelledError:
                break
        logger.info("Vector ingestion pipeline stopped.")

    def stop(self):
        self.running = False
