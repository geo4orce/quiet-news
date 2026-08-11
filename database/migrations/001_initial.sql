BEGIN;

CREATE TABLE generation_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attempt_day DATE NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    openai_response_id TEXT,
    openai_request_id TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    web_search_calls SMALLINT,
    error_code TEXT,
    CONSTRAINT generation_attempts_status_check
      CHECK (status IN ('started', 'succeeded', 'failed'))
);

CREATE INDEX generation_attempts_attempt_day_idx
    ON generation_attempts (attempt_day);

CREATE TABLE editions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generation_attempt_id BIGINT NOT NULL UNIQUE
      REFERENCES generation_attempts (id),
    payload JSONB NOT NULL
);

COMMIT;
