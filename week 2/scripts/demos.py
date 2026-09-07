import sys
import os
import asyncio
import logging

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from engine.core import GravimetricCore
from engine.safety import MassLimitExceededError, EmergencyLandingProtocol
from engine.ingestion import VectorIngestionPipeline

logging.basicConfig(level=logging.INFO)

async def Heavy_Cargo_Levitation():
    print("\n--- Running Heavy Cargo Levitation Demo ---")
    core = GravimetricCore()
    core.initialize_field()
    
    try:
        # Pushing the limit
        mass = 14000.0
        print(f"Loading {mass}kg of cargo...")
        core.process_payload(mass)
        print(core.get_telemetry())
        
        # Exceeding limit
        mass = 16000.0
        print(f"Loading {mass}kg of cargo...")
        core.process_payload(mass)
    except MassLimitExceededError as e:
        print(f"Caught Exception: {e}")
        EmergencyLandingProtocol.initiate(str(e))

async def High_Speed_Atmospheric_Hover():
    print("\n--- Running High Speed Atmospheric Hover Demo ---")
    core = GravimetricCore()
    core.initialize_field()
    
    pipeline = VectorIngestionPipeline(core)
    task = asyncio.create_task(pipeline.process_queue())
    
    # Simulate high speed pilot inputs
    print("Simulating rapid throttle vector adjustments...")
    await pipeline.ingest_input(pitch=0.1, roll=0.0, yaw=0.0, throttle=0.8)
    await asyncio.sleep(0.1)
    await pipeline.ingest_input(pitch=0.2, roll=0.1, yaw=0.0, throttle=1.0)
    await asyncio.sleep(0.1)
    
    print(core.get_telemetry())
    
    pipeline.stop()
    await pipeline.ingest_input(0,0,0,0) # push one more to unblock queue
    await task
    print("Demo complete.")

async def Space_Tether_Assist():
    print("\n--- Running Space Tether Assist Demo ---")
    core = GravimetricCore()
    core.initialize_field()
    
    # Low gravity scenario, long steady burn
    for i in range(5):
        core.inject_exotic_matter(0.5)
        core.process_payload(5000.0)
        print(f"T-plus {i} seconds telemetry:", core.get_telemetry().model_dump())
        await asyncio.sleep(0.1)
        
    print("Orbit established.")

if __name__ == "__main__":
    asyncio.run(Heavy_Cargo_Levitation())
    asyncio.run(High_Speed_Atmospheric_Hover())
    asyncio.run(Space_Tether_Assist())
