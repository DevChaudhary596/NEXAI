import sys
import os
import time
import logging

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from engine.core import GravimetricCore

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

def continuous_load_test(duration_seconds: int = 5):
    """
    Monitors thermal output and exotic energy leaks.
    Verifies they remain under containment thresholds.
    """
    print(f"--- Starting {duration_seconds}s Runtime Audit ---")
    core = GravimetricCore()
    core.initialize_field()
    
    start = time.time()
    ticks = 0
    while time.time() - start < duration_seconds:
        # Simulate continuous payload adjustments and exotic matter injection
        core.inject_exotic_matter(0.2)
        core.process_payload(8000.0)
        
        telemetry = core.get_telemetry()
        
        if telemetry.thermal_output > 80.0:
            logging.error(f"CRITICAL: Thermal output breached 80C threshold! Current: {telemetry.thermal_output}")
            break
            
        if telemetry.exotic_energy_leak > 5.0:
            logging.error(f"CRITICAL: Exotic energy leak breached 5J/s! Current: {telemetry.exotic_energy_leak}")
            break
            
        if ticks % 10 == 0:
            logging.info(f"Telemetry OK | Thermal: {telemetry.thermal_output:.1f}C | Leak: {telemetry.exotic_energy_leak:.3f}J/s")
            
        ticks += 1
        time.sleep(0.05)
        
    print("Runtime Audit completed successfully.")

if __name__ == "__main__":
    continuous_load_test(5)
