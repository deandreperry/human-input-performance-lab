"""Remember the latest aggregate report generation per study."""

import sqlalchemy as sa
from alembic import op

revision = "e61ce11938d7"
down_revision = "cb53121d5185"


def upgrade() -> None:
    op.add_column("studies", sa.Column("last_report_at", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("studies", "last_report_at")
