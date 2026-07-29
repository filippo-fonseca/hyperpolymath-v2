# JARVIS over text message (Twilio SMS/MMS)

Text your Kiwi number and you get the same assistant you get on the web: the same
tools, the same memory, the reply delivered as a text. Green bubble, not blue.

The channel is **off by default**. Nothing is answered until you turn it on in
`/settings#messaging`, and the toggle is checked before a turn is started, so a
message arriving while the channel is closed costs nothing at all.

---

## How it fits together

```
Twilio  ──POST──▶  /api/jarvis/sms          transport edge: verify, ack, hand off
                        │
                        ▼
                   processInboundSms        ledger, allowlist, settings gate
                        │
                        ▼
                   runChannelTurn           key, hints, history, persistence
                        │
                        ▼
                   runJarvisTurnStream      the engine, unchanged
```

Every JARVIS entrypoint already funnelled into `runJarvisTurnStream`, which knows
nothing about HTTP or a device. What was duplicated sat one level above it, so
that layer became `lib/jarvis/run-channel-turn.ts` and each channel became a thin
wrapper: the web console, the paired-device text bar and now SMS all call the
same function with different transport callbacks.

Two consequences worth knowing:

- **Memory is shared.** History comes from `buildRecentHistory(userId)`, which
  reads the same `jarvis_turns` table the console writes. A turn you started by
  text is visible in the web console, and a reference you made there resolves in
  a text a minute later.
- **A second channel is cheap.** A self-hosted iMessage bridge, or anything else
  that carries text both ways, plugs in behind the same seam without touching the
  engine or the core.

---

## Setup

1. **Buy a number** in the Twilio console (Phone Numbers → Buy a number) with SMS
   capability. In the US you also need a registered 10DLC campaign before Twilio
   will deliver to consumer handsets; allow a few days for approval.

2. **Point the number at the webhook.** In the number's Messaging configuration,
   set "A message comes in" to `POST https://<your-domain>/api/jarvis/sms`.

3. **Set the environment variables** (see the table below). At minimum:
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` and
   `JARVIS_SMS_OWNER_NUMBER`.

4. **Apply migration `0039_jarvis_sms.sql`.** It adds the `users.sms_jarvis_*`
   columns and the `jarvis_sms_events` ledger. It is idempotent, so a re-run is
   safe.

5. **Turn it on** in `/settings#messaging`. The section shows the allowlisted
   senders, the number replies come from, and the outcome of the last message
   handled.

6. **Test it** by texting the number. `JARVIS_SMS_DRY_RUN=true` runs the entire
   inbound path (verification, ledger, turn, reply construction) and logs the
   outbound message instead of sending it, which is the cheap way to confirm
   wiring before spending anything.

---

## Environment variables

| Variable | Required | What it does |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | yes | Account SID, used for the outbound REST call. |
| `TWILIO_AUTH_TOKEN` | yes | Signing secret. Verifies inbound webhooks and authenticates outbound sends. Without it the webhook returns 500, never 200. |
| `TWILIO_FROM_NUMBER` | yes* | The E.164 number replies come from. Also the loop-breaker: a message appearing to come from this number is never answered. |
| `TWILIO_MESSAGING_SERVICE_SID` | no | Preferred over `TWILIO_FROM_NUMBER` when set; Twilio picks the sender from the pool. |
| `TWILIO_WEBHOOK_URL` | no | Absolute URL override used when rebuilding the signed string. Set it when the public URL differs from what the proxy headers reconstruct. |
| `JARVIS_SMS_OWNER_NUMBER` | yes* | Your handset. Becomes the default allowlist of one. |
| `JARVIS_SMS_ALLOWED_SENDERS` | no | Comma-separated E.164 allowlist. Overrides the owner-only default. |
| `JARVIS_SMS_DEFAULT_COUNTRY_CODE` | no | Dial prefix applied to a bare national number during normalization. Defaults to `+1`. |
| `JARVIS_SMS_DRY_RUN` | no | `true` logs outbound messages instead of sending them. |
| `JARVIS_SMS_RESPONSE_TWIML` | no | `true` answers the webhook with an empty TwiML document instead of a JSON envelope, which silences Twilio's content-type warning. |
| `JARVIS_SMS_SKIP_SIGNATURE_VERIFICATION` | no | Test-only escape hatch, mirroring `AGENTMAIL_SKIP_WEBHOOK_VERIFICATION`. Never set it in production. |
| `JARVIS_OWNER_EMAIL` | no | Which account inbound texts are routed to. Defaults to the owner address in `lib/auth/owner.ts`. |

\* Either `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID` is required for
replies to send. `JARVIS_SMS_OWNER_NUMBER` is required unless you set
`JARVIS_SMS_ALLOWED_SENDERS` explicitly.

---

## Security model

**The signature is the authentication. The phone number is not.** A sender id on
an SMS is trivially forged, so `From` may filter but must never select an
identity. What proves an inbound request really came from Twilio is the HMAC-SHA1
`X-Twilio-Signature` over the exact bytes of the request, verified before the body
is parsed. If the signing secret is absent the route fails closed with a 500,
because a webhook that answers cheerfully without verifying is an open door to
anyone who learns the URL.

The allowlist sits on top of that: it decides which of the humans who can reach
your Twilio number are allowed to drive the assistant. Both must hold.

The account an inbound text speaks for is resolved from `JARVIS_OWNER_EMAIL`,
falling back to the single account on a single-user install. It is never derived
from the sender's number.

---

## The ledger

Every inbound message gets exactly one row in `jarvis_sms_events`, keyed on
Twilio's `MessageSid`. That primary key is the replay lock: Twilio retries a
webhook it considers failed, and the insert conflicting means the retry stops
before it can spend a second turn or file a duplicate task.

The row also records **why** a message went unanswered, so silence is always
explained rather than looking like a bug:

| status | meaning |
|---|---|
| `received` | accepted, turn in flight |
| `ignored_sender` | not in the allowlist, or a loopback from our own number |
| `disabled` | the settings toggle is off; no Anthropic call was made |
| `done` | replied |
| `error` | the turn or the send failed; `error` carries the detail |

---

## Behaviour on a text channel

- **No streaming.** The whole turn is joined server side, then split into as few
  messages as the 1500-character segment allows, breaking on sentence ends before
  line breaks before spaces.
- **A slow turn gets an interim line.** A text message shows no typing indicator,
  so a turn still running after 20 seconds gets one short acknowledgement. The
  real answer still follows.
- **A pure tool turn still replies.** When the model files something without
  writing prose, the reply falls back to a receipt line ("Created 2 tasks") rather
  than sending nothing.
- **Inbound media is not read.** An MMS attachment is acknowledged honestly; JARVIS
  cannot open it yet.

---

## Known limits

- **Web only.** The settings toggle is exposed on the web app; mobile parity is a
  follow-up.
- **Captures created by text are stamped `source_device = "SMS"`** rather than
  carrying a dedicated `source_channel = "sms"`, which would require a change to
  the executor's provenance denormalization.
