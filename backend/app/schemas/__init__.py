"""
Schemas package — Pydantic request/response models organized by domain.

All schemas are re-exported here for backward compatibility.
New code can import directly from domain files:
    from app.schemas.user import UserOut
    from app.schemas.wallet import WalletAction
"""

from app.schemas.admin import *  # noqa: F401, F403
from app.schemas.cafe import *  # noqa: F401, F403
from app.schemas.communication import *  # noqa: F401, F403
from app.schemas.engagement import *  # noqa: F401, F403
from app.schemas.financial import *  # noqa: F401, F403
from app.schemas.game import *  # noqa: F401, F403
from app.schemas.pc import *  # noqa: F401, F403
from app.schemas.session import *  # noqa: F401, F403
from app.schemas.user import *  # noqa: F401, F403
from app.schemas.wallet import *  # noqa: F401, F403
