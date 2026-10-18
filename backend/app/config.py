"""
ApexGuard Configuration & Dynamic Credential Manager.
Ensures that adding or modifying credentials in .env immediately activates
cloud integrations (Strands Decider 2B & Amazon Bedrock) without code changes.
"""

import os
from pathlib import Path
from typing import Optional, Dict

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent
ENV_FILE_PATH = WORKSPACE_ROOT / ".env"

_last_mtime: Optional[float] = None


def reload_env_if_modified():
    """Dynamically re-reads .env file if it has been created or changed."""
    global _last_mtime
    if ENV_FILE_PATH.exists():
        try:
            current_mtime = ENV_FILE_PATH.stat().st_mtime
            if _last_mtime != current_mtime:
                # Parse .env directly or via python-dotenv if installed
                try:
                    import dotenv
                    dotenv.load_dotenv(dotenv_path=ENV_FILE_PATH, override=True)
                except ImportError:
                    # Fallback manual parsing
                    with open(ENV_FILE_PATH, "r", encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if line and not line.startswith("#") and "=" in line:
                                k, v = line.split("=", 1)
                                os.environ[k.strip()] = v.strip().strip("'\"")
                _last_mtime = current_mtime
        except Exception:
            pass


class Settings:
    @property
    def strands_api_key(self) -> Optional[str]:
        reload_env_if_modified()
        return os.getenv("STRANDS_API_KEY") or os.getenv("STRANDS_DECIDER_KEY")

    @property
    def strands_endpoint(self) -> str:
        reload_env_if_modified()
        return os.getenv("STRANDS_ENDPOINT", "https://api.strands.ai/v1/decider-2b")

    @property
    def has_strands_credentials(self) -> bool:
        key = self.strands_api_key
        return bool(key and len(key.strip()) > 5)

    @property
    def aws_access_key_id(self) -> Optional[str]:
        reload_env_if_modified()
        return os.getenv("AWS_ACCESS_KEY_ID")

    @property
    def aws_secret_access_key(self) -> Optional[str]:
        reload_env_if_modified()
        return os.getenv("AWS_SECRET_ACCESS_KEY")

    @property
    def aws_region(self) -> str:
        reload_env_if_modified()
        return os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-east-1"))

    @property
    def bedrock_model_id(self) -> str:
        reload_env_if_modified()
        return os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")

    @property
    def has_bedrock_credentials(self) -> bool:
        reload_env_if_modified()
        ak = self.aws_access_key_id
        sk = self.aws_secret_access_key
        return bool(ak and sk and len(ak.strip()) > 5 and len(sk.strip()) > 5)


settings = Settings()
