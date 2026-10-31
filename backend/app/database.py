from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings

settings = get_settings()

# pool_size + max_overflow is the ceiling on connections this process can hold
# open at once, and it has to stay UNDER the hosted pooler's own client limit,
# not equal to it. Supabase's session-mode pooler caps this project at 15
# clients in total; the previous 5 + 10 = 15 matched that exactly, leaving no
# room for anything else that legitimately connects to the same project - a
# deploy that briefly overlaps the old process, a psql/seed/migration script,
# or a developer's local backend. Once over the limit the pooler refuses the
# connection outright (EMAXCONNSESSION), which surfaced as an HTTP 500 to
# whichever customer happened to be checking out (8 concurrent requests was
# enough to trigger it). 3 + 7 = 10 keeps a third of the budget free while
# still allowing more concurrency than this app's traffic needs; pool_timeout
# makes a request wait briefly for a free connection instead of immediately
# demanding a new one from the pooler.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout_seconds,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
