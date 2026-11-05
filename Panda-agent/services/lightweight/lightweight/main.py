import os
import secrets

from .app import create_app
from .openrouter import PROFILES_V1, configured_profile

# An unconfigured secret cannot authenticate a BFF and the provider remains OFF.
configured = os.environ.get('PANDA_LIGHTWEIGHT_SECRET', '').encode('utf-8')
secret = configured if len(configured) >= 32 else secrets.token_bytes(32)
profile_name = os.environ.get('PANDA_LIGHTWEIGHT_PROFILE', '')
provider = None
if profile_name in PROFILES_V1:
    api_key = os.environ.get('PANDA_LIGHTWEIGHT_OPENROUTER_KEY', '')
    if api_key and len(configured) >= 32:
        provider = configured_profile(profile_name, api_key)
app = create_app(secret=secret, journal_path=os.environ.get('PANDA_LIGHTWEIGHT_JOURNAL', '/data/lightweight.sqlite'), provider=provider)
