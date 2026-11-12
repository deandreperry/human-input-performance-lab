"""Ordered usability protocols and private observer timelines."""

import sqlalchemy as sa
from alembic import op

revision = "acf12d309017"
down_revision = "e61ce11938d7"


def upgrade():
    op.create_table(
        "usability_studies",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("protocol", sa.JSON(), nullable=False),
        sa.Column("created", sa.Integer(), nullable=False),
    )
    op.create_table(
        "usability_sessions",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("study_id", sa.String(32), sa.ForeignKey("usability_studies.id"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("consent_at", sa.Integer(), nullable=False),
        sa.Column("expires", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("phase", sa.String(16), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("timeline", sa.JSON(), nullable=False),
    )
    for key in ("study_id", "expires"):
        op.create_index("ix_usability_sessions_" + key, "usability_sessions", [key])


def downgrade():
    op.drop_table("usability_sessions")
    op.drop_table("usability_studies")
