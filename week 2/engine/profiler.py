import time
import functools
import logging

logger = logging.getLogger(__name__)

def profile_execution(max_time_ms: float = 4.0):
    """
    Decorator to profile execution time of critical functions.
    Ensures response time remains under a specified threshold (e.g., 4 milliseconds).
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            result = func(*args, **kwargs)
            end_time = time.perf_counter()
            elapsed_ms = (end_time - start_time) * 1000.0
            
            if elapsed_ms > max_time_ms:
                logger.warning(f"Performance warning: {func.__name__} took {elapsed_ms:.4f} ms (threshold: {max_time_ms} ms)")
            else:
                logger.debug(f"{func.__name__} executed in {elapsed_ms:.4f} ms")
            
            return result
        return wrapper
    return decorator
