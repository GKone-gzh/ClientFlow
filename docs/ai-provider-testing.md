# Qwen Vision Provider Testing

## Scope

Phase 2 P4 uses the owner-selected Alibaba Cloud Model Studio model
`qwen3-vl-plus`. The real provider runs only in Supabase Edge Functions. The
mobile App never receives `DASHSCOPE_API_KEY` and never chooses a provider,
model, endpoint, prompt, or retry policy.

## Server configuration

Configure these values as Supabase server secrets, not local Expo variables:

```text
AI_PROVIDER=qwen
DASHSCOPE_API_KEY=<Alibaba Cloud Model Studio API key for China (Beijing)>
```

Do not add either value to `EXPO_PUBLIC_*`, `.env.local`, an Issue, test output,
or Git. Setting `AI_PROVIDER=stub` restores the configured Stub without changing
the App.

## Real Qwen smoke

`pnpm smoke:qwen` reuses the ignored `apps/mobile/.env.local` and
`apps/mobile/.env.intake-smoke.local` files used by the real Intake smoke. It
uploads the configured test screenshot, requires the server result to report
provider `qwen`, model `qwen3-vl-plus`, and status `needs_review`, validates the
result with the shared Zod Schema, confirms it, verifies idempotency and Client
Detail, and repeats the User A/B isolation checks.

The command prints only safe status fields, counts, provider/model, and elapsed
time. It does not print the extracted result, image path, account identifiers,
tokens, or credentials.

## Accuracy fixtures

`pnpm smoke:qwen:accuracy` reads five local paths from the ignored
`apps/mobile/.env.qwen-smoke.local` file:

```text
CLIENTFLOW_AI_TEST_IMAGE_COMPLETE=C:\absolute\path\complete.png
CLIENTFLOW_AI_TEST_IMAGE_MISSING_NAME=C:\absolute\path\missing-name.png
CLIENTFLOW_AI_TEST_IMAGE_AMOUNT_DATE=C:\absolute\path\amount-date.png
CLIENTFLOW_AI_TEST_IMAGE_MULTIPLE_REQUIREMENTS=C:\absolute\path\multiple.png
CLIENTFLOW_AI_TEST_IMAGE_AMBIGUOUS=C:\absolute\path\ambiguous.png
```

Fixtures must be synthetic or desensitized JPEG, PNG, or WebP files no larger
than 10 MiB. They should cover a complete request, omitted client name, explicit
amount and absolute date, multiple requirements, and ambiguous/conflicting
information. The automated acceptance checks placeholders, warnings, amount/date
presence, requirement count, Provider metadata, `needs_review`, and Schema
validity without printing extracted chat content.

Human review remains mandatory: compare each structured result with its source
screenshot and record missed requirements, invented facts, incorrect amounts or
dates, and warning quality in Issue #6. The stage does not claim 100 percent model
accuracy; it requires a safe, schema-valid result suitable for user Review.
