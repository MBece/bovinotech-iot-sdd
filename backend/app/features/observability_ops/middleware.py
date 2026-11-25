import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.features.observability_ops.service import ops_service


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Read incoming X-Correlation-ID or generate new UUID
        correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
        
        # Attach to request state for downstream handlers
        request.state.correlation_id = correlation_id

        # Record incoming request log
        ops_service.log_event(
            "INFO",
            correlation_id,
            f"HTTP {request.method} {request.url.path}",
            {"path": request.url.path, "method": request.method},
        )

        response: Response = await call_next(request)

        # Propagate back in response headers
        response.headers["x-correlation-id"] = correlation_id
        return response
