"""Input models reject unknown properties and bound collection and event payloads."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator

Method = Literal["mouse", "trackpad"]
Short = Annotated[str, Field(min_length=1, max_length=240)]
Text = Annotated[str, Field(max_length=8000)]
Dim = Annotated[int, Field(ge=8, le=1200)]
Point = Annotated[FiniteFloat, Field(ge=-20000, le=20000)]
Stamp = Annotated[FiniteFloat, Field(ge=0)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Protocol(Model):
    title: Short = "Mouse and trackpad pointing study"
    question: Text = "How does input method affect target acquisition time, accuracy, and effort?"
    hypotheses: Text = "Movement time increases with index of difficulty. Mean first-attempt latency differs between input methods."
    description: Text = "A within-participant comparison of mouse and trackpad pointing."
    independent_variables: Text = "Confirmed input method, target width, and target distance"
    dependent_variables: Text = (
        "First-attempt movement time, first-attempt accuracy, acquisition time, and effort"
    )
    control_variables: Text = (
        "Same screen, seating, pointer settings, and browser throughout both blocks"
    )
    inclusion_criteria: Text = (
        "Adults able to consent, with a desktop or laptop and access to both study devices"
    )
    exclusion_criteria: Text = "Document protocol deviations and interruptions. Keep raw trial records."
    sample_size: int = Field(24, ge=1, le=10000)
    recruitment_target: int = Field(24, ge=1, le=10000)
    sample_justification: Text = (
        "Feasibility pilot. Estimate participant-level variation before powering a confirmatory study."
    )
    widths: list[Dim] = Field(default_factory=lambda: [24, 40, 64], min_length=1, max_length=12)
    distances: list[Dim] = Field(default_factory=lambda: [150, 300, 450], min_length=1, max_length=12)
    repetitions: int = Field(1, ge=1, le=20)
    practice_trials: int = Field(2, ge=0, le=10)
    break_interval: int = Field(9, ge=0, le=200)
    protocol_version: Short = "1.0"
    retention_days: int = Field(90, ge=1, le=730)
    status: Literal["draft", "active", "completed"] = "draft"
    randomization: Literal["counterbalanced-blocks"] = "counterbalanced-blocks"
    record_trajectory: bool = True

    @model_validator(mode="after")
    def design(self):
        if len(set(self.widths)) != len(self.widths) or len(set(self.distances)) != len(self.distances):
            raise ValueError("Dimensions must be unique.")
        if max(self.widths) / 2 + 32 >= min(self.distances):
            raise ValueError("Start and destination targets must be separated.")
        if len(self.widths) * len(self.distances) * self.repetitions > 300:
            raise ValueError("Limit each experimental block to 300 trials.")
        if self.status == "active" and not all(
            [self.question, self.hypotheses, self.sample_justification]
        ):
            raise ValueError("Active protocols need a question, hypotheses and sample justification.")
        return self


class Enrollment(Model):
    study_id: str
    protocol_version: Short
    consent: Literal[True]
    enrollment_key: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")] | None = None


class Environment(Model):
    device_category: Short | None = None
    os: Short | None = None
    browser: Annotated[str, Field(max_length=1024)] | None = None
    screen_width: int | None = Field(None, gt=0, le=40000)
    screen_height: int | None = Field(None, gt=0, le=40000)
    pixel_ratio: FiniteFloat | None = Field(None, gt=0, le=32)
    familiarity: Short | None = None
    dominant_hand: Short | None = None
    accessibility: Annotated[str, Field(max_length=500)] | None = None
    confirmed_method: Method | None = None


class Details(Model):
    metadata: Environment


class Event(Model):
    type: Literal["down", "up", "move"]
    x: Point
    y: Point
    t: Stamp


class Attempt(Model):
    start_x: Point
    start_y: Point
    start_center_x: Point | None = None
    start_center_y: Point | None = None
    start_width: FiniteFloat | None = Field(None, gt=0)
    target_x: Point
    target_y: Point
    target_width: FiniteFloat = Field(gt=0)
    started_at_ms: Stamp
    ended_at_ms: Stamp
    events: list[Event] = Field(min_length=1, max_length=50000)
    outcome: Literal["completed", "interrupted"]
    interruption_reason: Short | None = None
    input_method: Method


class Effort(Model):
    effort_mouse: int = Field(ge=1, le=7)
    effort_trackpad: int = Field(ge=1, le=7)


class Management(Model):
    eligibility: Literal["pending", "eligible", "excluded"] | None = None
    notes: Annotated[str, Field(max_length=2000)] | None = None
    exclusion_reason: Annotated[str, Field(max_length=1000)] | None = None
    verified_methods: list[Method] | None = Field(None, max_length=2)


class Password(Model):
    password: Annotated[str, Field(max_length=1024)]


class StudyView(Protocol):
    id: str
    created_at: int


class Slot(Model):
    sequence: int
    input_method: Method
    width: int
    distance: int
    practice: bool


class RunSummary(Model):
    id: str
    study_id: str
    participant_id: str
    protocol_version: str
    status: Literal["in_progress", "completed", "withdrawn"]
    order: list[Method]
    next_sequence: int
    completed_trials: int
    trial_count: int
    total_trials: int
    started_at: str
    consent_at: int
    expires_at: int
    metadata: dict
    effort: dict
    break_interval: int


class EnrolledProtocol(Protocol):
    id: str


class ParticipantView(RunSummary):
    protocol: EnrolledProtocol
    schedule: list[Slot]
    record_trajectory: bool


class EnrollmentView(ParticipantView):
    token: str


class ManagedRun(RunSummary):
    notes: str
    eligibility: Literal["pending", "eligible", "excluded"]
    verified_methods: list[Method]
    exclusion_reason: str = ""


class Receipt(Model):
    next_sequence: int
    status: Literal["in_progress", "completed", "withdrawn"]
