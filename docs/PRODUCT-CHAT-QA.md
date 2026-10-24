# Product chat verification

All four products share the Persian Markdown renderer (RTL/justified prose,
LTR code, tables, sections), reading controls, error handling and request validation.
Their personas, keys, local transcripts and server memory remain product-specific.

## Before live use

- Production requires D1 and the existing `AUTH_SECRET` binding for access tokens.
- In the admin AI keys section, select the exact product, save its provider,
  API key, model and (for OpenAI-compatible providers) base URL.
- Run the existing single-key or “test all keys” action for that product.
- Products deliberately do not borrow `GEMINI_API_KEY` from the environment.
- A missing/unhealthy key returns `AI_UNAVAILABLE`, not a canned response.
  The route returns before updating trial counters or usage logs.

## Automated tests

`npm test` includes `scripts/product-chat.test.ts`. For each product it exercises
the real shared runner/provider adapters with mocked HTTP responses: section-key
isolation, OpenAI request shape, 429 failover to Gemini, per-slot model selection,
sticky healthy key, memory continuity and missing-key failure. These tests use
fake credentials and do not establish that a real account has valid credit or
that a production provider is reachable.

## Live acceptance (repeat for every product after deployment)

1. Pass the admin key test, then open the corresponding product chat.
2. Ask a role-specific question and a follow-up, then repeat the first question.
3. Confirm the follow-up uses context and the repeated question receives useful
   clarification rather than a canned answer (facts should remain consistent).
4. Check long Persian prose, a list, a table and code on mobile and desktop.
5. Reload/reopen: transcript survives. Start a new conversation: memory resets,
   but trial balance/subscription quota does not reset.
6. With a failing key in a safe test environment, verify explicit error,
   no canned answer and no coin/quota deduction. Retry must not duplicate the
   user's pending turn. Do not disable production keys merely to run this test.
7. Verify a second product never receives the first product's chat context.
