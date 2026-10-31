from pathlib import Path
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    # Supabase (or any Postgres) connection string, e.g.
    # postgresql://postgres.xxxx:password@aws-0-region.pooler.supabase.com:5432/postgres
    database_url: str

    secret_key: str = "dev-secret-change-me"
    access_token_minutes: int = 60 * 12

    # SQLAlchemy connection pool sizing - see database.py for why the total
    # (db_pool_size + db_max_overflow) must stay below the hosted pooler's own
    # client limit rather than matching it. Overridable per deployment so a
    # host with a larger limit (or the transaction-mode pooler on port 6543)
    # can raise it without a code change.
    db_pool_size: int = 3
    db_max_overflow: int = 7
    db_pool_timeout_seconds: int = 20

    # Not used by the app yet — kept for future Supabase Storage/Auth API calls,
    # as opposed to database_url which is the direct Postgres connection we use today.
    supabase_url: str = ""
    supabase_secret_key: str = ""

    # "null" (the Origin browsers send for a sandboxed iframe or file:// page) was
    # previously included here - combined with allow_credentials=True on the
    # CORSMiddleware below, that's a real misconfiguration regardless of today's
    # Bearer-token (not cookie-based) auth, so it's never included by default now.
    cors_origins: str = "http://localhost:5500,http://127.0.0.1:5500"

    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""
    # Top-level R2 folder every new upload/thumbnail is written under (env
    # CLOUDINARY_FOLDER; the name predates R2). All images moved out of the retired
    # "sai_kumar_studio" folder in Oct 2026 and that folder is being deleted, so
    # this default must not point back at it - main.py warns at startup if it does.
    cloudinary_folder: str = "skds_0438a7a87e"

    # Cloudflare R2 (replacing Cloudinary as the image store)
    r2_account_id: str = ""
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_bucket: str = ""
    r2_public_base_url: str = ""  # e.g. https://pub-xxxx.r2.dev or a bound custom domain, no trailing slash

    admin_email: str = "owner@saikumarstudio.in"
    admin_password: str = "ChangeMe@2026"
    admin_name: str = "Studio Owner"

    # Razorpay — falls back to a built-in mock mode (no real charges) while these are unset.
    razorpay_key_id: str = "rzp_test_placeholder"
    razorpay_key_secret: str = "rzp_secret_placeholder"
    razorpay_webhook_secret: str = "whsec_placeholder"

    # SMTP — while unconfigured, request_otp() only proceeds if debug_otp is also
    # explicitly enabled, and even then logs the OTP server-side rather than ever
    # returning it in the API response (see routers/auth.py).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Sai Kumar Studio"
    smtp_use_tls: bool = True

    # Defaults False - a deployment must opt in (and only matters when SMTP is also
    # unconfigured; see routers/auth.py's request_otp()).
    debug_otp: bool = False
    refresh_token_days: int = 14

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def cloudinary_configured(self) -> bool:
        return bool(self.cloudinary_cloud_name and self.cloudinary_api_key and self.cloudinary_api_secret)

    @property
    def r2_configured(self) -> bool:
        return bool(
            self.r2_account_id
            and self.r2_access_key
            and self.r2_secret_key
            and self.r2_bucket
            and self.r2_public_base_url
        )

    @property
    def razorpay_mock(self) -> bool:
        return self.razorpay_key_id in ("", "rzp_test_placeholder")

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password and self.smtp_from_email)


@lru_cache
def get_settings() -> Settings:
    return Settings()
