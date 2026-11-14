"""Study-linked, manually entered calculator worksheets."""

import sqlalchemy as sa
from alembic import op

revision = "cac026111401"
down_revision = "acf12d309017"


def upgrade():
    op.create_table(
        "saved_calculations",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("pointing_id", sa.String(32), sa.ForeignKey("studies.id", ondelete="CASCADE")),
        sa.Column(
            "moderated_id", sa.String(32), sa.ForeignKey("usability_studies.id", ondelete="CASCADE")
        ),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created", sa.Integer(), nullable=False),
    )
    for key in ("pointing_id", "moderated_id"):
        op.create_index("ix_saved_calculations_" + key, "saved_calculations", [key])


def downgrade():
    op.drop_table("saved_calculations")
