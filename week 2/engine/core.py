import time
import logging
from .telemetry import EngineTelemetry, VectorInput
from .profiler import profile_execution
from .safety import MassLimitExceededError, EmergencyLandingProtocol

logger = logging.getLogger(__name__)

class GravimetricCore:
    MAX_PAYLOAD_MASS = 15000.0  # kg

    def __init__(self):
        self.state = {
            "stabilized": False,
            "flux_density": 0.0,
            "mass_displacement": 0.0,
            "thermal_output": 25.0,
            "exotic_energy_leak": 0.0,
            "containment_risk": 0.0
        }
        self.vector_input = VectorInput()
        
    def initialize_field(self):
        """Cold start for gravity-well stabilization."""
        logger.info("Initializing Gravimetric Core field...")
        self.state["stabilized"] = True
        self.state["flux_density"] = 1.2
        logger.info("Field stabilized.")

    @profile_execution(max_time_ms=4.0)
    def inject_exotic_matter(self, amount: float):
        """Injects exotic matter, dynamically updating the gravimetric field vectors."""
        # Simulated workload (e.g. 1ms processing)
        time.sleep(0.001)
        self.state["flux_density"] += amount * 0.5
        self.state["exotic_energy_leak"] += amount * 0.01
        self.state["thermal_output"] += amount * 2.0
        
    @profile_execution(max_time_ms=4.0)
    def cooling_array_cycle(self):
        """Runs the cooling array to manage thermal output."""
        time.sleep(0.001)
        if self.state["thermal_output"] > 30.0:
            self.state["thermal_output"] -= 5.0

    def update_vectors(self, vectors: VectorInput):
        """Update gravimetric field vectors dynamically based on ingestion pipeline."""
        self.vector_input = vectors
        # Adjust flux density based on throttle
        target_flux = 1.0 + (vectors.throttle * 5.0)
        self.inject_exotic_matter((target_flux - self.state["flux_density"]) * 0.1)

    def process_payload(self, mass: float):
        """Process the payload mass. Throws exception if limits exceeded."""
        self.state["mass_displacement"] = mass
        if mass > self.MAX_PAYLOAD_MASS:
            self.state["containment_risk"] = 10.0
            raise MassLimitExceededError(f"Payload mass {mass}kg exceeds safe limit of {self.MAX_PAYLOAD_MASS}kg.")
        
        # Adjust containment risk based on mass and thermal
        risk = (mass / self.MAX_PAYLOAD_MASS) * 5.0 + (self.state["thermal_output"] / 100.0) * 5.0
        self.state["containment_risk"] = min(10.0, max(0.0, risk))
        
        # Self-correction: cooling cycle
        self.cooling_array_cycle()

    def get_telemetry(self) -> EngineTelemetry:
        """Returns structured telemetry data."""
        return EngineTelemetry(
            flux_density=self.state["flux_density"],
            mass_displacement=self.state["mass_displacement"],
            containment_risk_rating=self.state["containment_risk"],
            thermal_output=self.state["thermal_output"],
            exotic_energy_leak=self.state["exotic_energy_leak"]
        )
