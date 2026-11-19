# Nematode's shared gestures

Terraform owns the Worker, its workers.dev endpoint, a hibernating WebSocket Durable Object and D1 database. There are no accounts, pairing screens,
codes or per-person installation steps. The public endpoint is baked into both app builds after deployment.
Deployed on 2026-11-19 at https://nematode-buddies.amaansyedali.workers.dev; this checkout includes that public endpoint.

## One-time deployment (developer only)

1. In Cloudflare, create an account, enable Workers and choose its workers.dev subdomain. Stay on the Free plan.
2. Make an account-scoped API token available as `CLOUDFLARE_API_TOKEN` with Workers Scripts Edit and D1 Edit.
   Set `TF_VAR_account_id` and `TF_VAR_workers_subdomain` locally. Do not put the token in source or app builds.
3. From the repository root:

```sh
terraform -chdir=cloudflare init
terraform -chdir=cloudflare plan -var=initialize_live_hub=true -out=deploy.tfplan
terraform -chdir=cloudflare apply deploy.tfplan
node scripts/configure-backend.mjs "$(terraform -chdir=cloudflare output -raw backend_url)"
```

Use `initialize_live_hub=true` only for the first deployment to a new account. Omit it for all subsequent plans; the existing namespace and its sockets remain in place.

4. Build the Mac and Windows apps normally. Both contain the same public URL in `src/backend.js`.
   She only installs/opens the app. Registration and recipient discovery happen automatically.

Keep Terraform state and its backups private and backed up. They are ignored by Git. D1 has `prevent_destroy`
to prevent accidental replacement/deletion during normal Terraform changes. Provider versions are locked.
The Worker creates its initial tables and indexes idempotently on first use; this is additive bootstrap, not
a general migration framework. Existing databases require `migrations/0002_appearance.sql` before deploying the appearance-aware Worker; production applied it on 2026-11-19. It only adds nullable JSON text columns and preserves all rows. Future schema changes need an explicit migration. Wrangler does not deploy
production; its configuration here is only for local runtime testing.

## How delivery works

- Each installation silently generates a random ID and 256-bit credential, persisted before registration.
  The credential stays in that app's local webview storage; D1 stores only its SHA-256 hash. Registration
  retries with the same identity, so a lost response doesn't create another user.
- `resolveRecipient()` in `worker.mjs` chooses the earliest registered *other* installation. This is the single
  place to change the routing policy. Explicit recipient IDs are already supported by the action API.
  A third installation participates too; this is deliberately open registration, not private invitation pairing.
  Reinstalling/clearing app data can create a new identity; old registrations are not automatically retired.
- `CloudConnection` saves outgoing actions locally before trying the network. If there is no other user yet,
  or the sender is offline, it retries later. Each action keeps its ID across retries.
- D1 keeps hearts/messages until the recipient acknowledges them. The app first saves downloaded gestures
  locally, then plays one visitor at a time when the user is recently active (under 60 seconds idle) and the
  computer is unlocked. Interaction with the fan or a thrown/held character postpones playback.
- The animation's completion callback records a durable local receipt. Receipts are retried until the server
  acknowledges them. If the user becomes inactive during the visit, the gesture stays pending for their return.
- Normal retries and restarts don't replay completed visits. A crash after showing a gesture but before
  recording its receipt can replay it: delivery favors not losing a gesture over an impossible guarantee of
  exactly-once visual playback. Delivered action rows are retained for idempotency; there is no pruning yet.
- Together/Separate is derived from the newest stored state action between the two clients. Returning clients
  apply only the latest state. The peer's current character comes from its profile, updated automatically.
- A hibernating `LiveHub` Durable Object sends authenticated WebSocket notifications after registration,
  profile changes and stored actions. The app fetches D1 data on connection, notification, send or receipt;
  idle apps do not poll HTTP. Existing polling clients remain compatible during updates.
- The socket sends a small ping every 30 seconds; Cloudflare auto-responds without waking the object.
  A missing pong or stale connection after sleep triggers reconnect and catch-up. Failures back off to 30
  seconds. A one-second local timer checks activity and pending work; it makes no idle network requests.
- Credentials travel in the WebSocket subprotocol header, never URL parameters. Only `nematode` is echoed
  in the handshake. The Worker authenticates the device before the hub tags its socket; notifications contain
  no user data, and D1 requests still require the device credential. No setup changes for either person.

`src/backend.js` contains the deployed public endpoint. An empty value disables networking for local-only previews. Browser `?demo` and Debug receive
commands also stay local; they never register test users or send gestures. Identity, pending sends, downloaded
messages and receipts share one persisted JSON document per backend URL. Storage errors are surfaced rather
than quietly replacing an identity. Removing that storage removes its offline queue and device credential.

## Tests

No Cloudflare credentials are needed for these checks:

```sh
node tests/cloud.mjs                 # HTTP handlers + real SQLite + two persistent client instances
node tests/social.mjs                # visual behaviors, including receipt completion callbacks
terraform -chdir=cloudflare validate
```

For Cloudflare's actual local Worker/D1 runtime, install Wrangler as a development tool, then start a fresh,
disposable database for each run (the routing tests deliberately expect no pre-existing users):

```sh
CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false npx wrangler dev --config cloudflare/wrangler.jsonc --local --port 8787 --persist-to "$(mktemp -d)"
# In another terminal:
BACKEND_TEST_URL=http://localhost:8787 node tests/cloud.mjs
BACKEND_TEST_URL=http://localhost:8787 node tests/social.mjs
# Use another fresh runtime/database for live connection tests:
BACKEND_TEST_URL=http://localhost:8787 node tests/live.mjs
```

The tests cover first-other routing, no recipient yet, explicit addressing, offline sender restart, inactive
receiver restart, lost POST responses, duplicate suppression, acknowledgements, latest shared state, forged
credentials, unauthorized acknowledgements and storage failure. They only accept a localhost runtime URL.
Native macOS compilation and a Windows-target check of the activity API passed; the real Windows app, real
lock/unlock behavior on both machines, and delivery between the two real machines still need verification.

Sources: [D1 transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/),
[Worker Terraform resource](https://registry.terraform.io/providers/cloudflare/cloudflare/5.20.0/docs/resources/workers_script),
[D1 Terraform resource](https://registry.terraform.io/providers/cloudflare/cloudflare/5.20.0/docs/resources/d1_database).


## Shared appearance

Profiles and actions carry a complete `appearance` JSON object, currently `{character, accessories:{hat}}`.
The Worker validates its character/slot IDs, size and depth, then preserves unknown future fields. Queued
actions save an immutable snapshot; live Together state returns the peer's current profile. Legacy clients
still send/receive the top-level `character` field and simply omit accessories. Renderer changes belong in
the app, not the server or gesture handlers. Tests cover snapshot preservation, live outfit changes,
unknown future fields, appearance validation, action-ID conflicts, and the additive database migration.
