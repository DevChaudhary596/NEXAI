from pydantic import BaseModel, Field
from typing import Tuple

class EngineTelemetry(BaseModel):
    """
    Structured telemetry for the engine's sensor array.
    """
    flux_density: float = Field(..., description="Current flux density in Teslas.")
    mass_displacement: float = Field(..., description="Simulated mass displacement in kilograms.")
    containment_risk_rating: float = Field(..., ge=0.0, le=10.0, description="Risk rating from 0.0 (safe) to 10.0 (critical).")
    thermal_output: float = Field(..., description="Thermal output in Celsius.")
    exotic_energy_leak: float = Field(..., description="Exotic energy leak in Joules/sec.")

class VectorInput(BaseModel):
    """
    Pilot's manual joystick/throttle input vectors.
    """
    pitch: float = Field(0.0, ge=-1.0, le=1.0)
    roll: float = Field(0.0, ge=-1.0, le=1.0)
    yaw: float = Field(0.0, ge=-1.0, le=1.0)
    throttle: float = Field(0.0, ge=0.0, le=1.0)

    def to_tuple(self) -> Tuple[float, float, float, float]:
        return (self.pitch, self.roll, self.yaw, self.throttle)
