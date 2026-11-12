# Research API contracts

`openapi.json` is generated from the FastAPI routes and Pydantic models. Run from the repository root after editing the API:

```sh
.venv/bin/python -m backend.hip.export_schema
```

The interactive reference is also available at the backend's `/docs` path. Session credentials are private. The researcher uses an HttpOnly session cookie scoped to `/api`. Participants use a separate bearer token restricted to a single enrollment. [Data dictionary](DATA_DICTIONARY.md)
