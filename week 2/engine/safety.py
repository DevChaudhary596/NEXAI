import logging

logger = logging.getLogger(__name__)

class MassLimitExceededError(Exception):
    """Exception raised when payload mass limits are breached."""
    pass

class ContainmentBreachError(Exception):
    """Exception raised when thermal or energy leak thresholds are breached."""
    pass

class EmergencyLandingProtocol:
    @staticmethod
    def initiate(reason: str):
        """
        Gracefully reduces power and safely stabilizes the payload.
        """
        logger.critical(f"EMERGENCY LANDING PROTOCOL INITIATED. Reason: {reason}")
        logger.info("Executing slow-descent field vectors...")
        logger.info("Venting exotic matter reserves securely...")
        logger.info("Payload stabilized and grounded safely.")
        return True
