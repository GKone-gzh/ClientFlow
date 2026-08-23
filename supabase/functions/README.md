# ClientFlow Edge Functions

All functions accept `POST` JSON, require `Authorization: Bearer <access-token>`,
and return the public contract value directly. Errors use `ContractErrorShape`.

## App integration

1. Call `prepare-upload` with `PrepareUploadInput`.
2. Upload the bytes with
   `supabase.storage.from("chat-screenshots").uploadToSignedUrl(storagePath, signedUploadToken, file)`.
3. Call `mark-uploaded` with `{ uploadId }`. The backend derives ownership from
   the session and verifies the stored object before returning an `uploaded` record.
4. Call `request-extraction` with `RequestExtractionInput` after confirmation.
5. Poll `get-extraction` with `GetExtractionInput` until the returned
   `AIExtraction.status` is `needs_review` or `failed`.
6. Call `confirm-extraction` with `ConfirmExtractionInput`. Retrying the same
   extraction returns the original `ConfirmExtractionResult` IDs.

The bucket is private, accepts only JPEG, PNG, and WebP, and has a 10 MiB limit.
The server verifies the stored object size and MIME type during `mark-uploaded`
and again before extraction. The App never submits an owner ID or storage path
to the confirmation endpoint.

## Server environment

- `SUPABASE_URL`: Supabase project URL. Supplied automatically when deployed.
- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, or the default entry in
  `SUPABASE_SECRET_KEYS`: server-only key used to verify user tokens, create an
  RLS-bound client carrying the verified user's Authorization, and access
  private Storage/ingestion metadata. Never expose it to the App.
- `AI_PROVIDER_STUB_RESULT_JSON`: server-only JSON returned by the Phase 1 AI
  stub. It must pass `AIExtractionResultSchema`; invalid or absent values fail
  extraction without storing the raw value.
- `AI_PROVIDER`: server-only provider selector. Supported values are `stub` and
  `qwen`; missing values default to `stub` so deployments never begin paid AI
  calls implicitly.
- `DASHSCOPE_API_KEY`: server-only Alibaba Cloud Model Studio key required only
  when `AI_PROVIDER=qwen`. The Qwen adapter uses the China (Beijing) endpoint
  and the owner-selected fixed model `qwen3-vl-plus`. Never expose this value
  through `EXPO_PUBLIC_*`, logs, errors, Issues, or test snapshots.
