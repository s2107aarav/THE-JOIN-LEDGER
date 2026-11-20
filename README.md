# The Join Ledger

Trace which source records a SQL join repeats or excludes and how each changes a chosen total. Use a calculated example, then load your own CSV or TSV files, select the measure and inspect the evidence.

The built-in example starts with five payments totaling 300. The raw join still returns five rows totaling 300. At O-17, two parcel matches repeat 120. At O-24, the inner parcel join excludes 120. In the workspace, select either movement to inspect the original rows. Compare a distinct-key parcel join to see how the answer depends on including unmatched orders.

[Live workspace](https://the-join-ledger.balancedounce.chatgpt.site/) · [Desktop screenshot](docs/screenshots/desktop.png) · [Mobile screenshot](docs/screenshots/mobile.png)

## Run locally

Use Node 22.23.2 and npm. Run:

```sh
npm ci
npm run dev
```

For a production build and verification:

```sh
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
```

Run the [example SQL](public/example/reproduce.sql) in SQLite to reproduce the worked case independently. [Orders](public/example/orders.csv), [payments](public/example/payments.csv) and [parcels](public/example/parcels.csv) are available as local inputs.

## Supported investigations

- A parent with one unique nonempty text key, and one or two detail tables matching it directly.
- INNER and LEFT joins, with one additive measure from any mounted source.
- Per-record evidence, per-key effects, scenario comparison and redacted Markdown reports.
- Exact decimals up to six fractional places, treated as signed BigInt values internally.

Queries with child-to-child joins, complex predicates, arbitrary SQL or other aggregate functions are outside this release. For representative evidence, include all relevant details for a small set of parent keys.

## Architecture and deployment

The static React view talks to a dedicated worker. The worker parses and validates local inputs, computes exact amounts from indexed match counts and computes original row combinations only for visible evidence. The independent test-only SQLite oracle executes joins over small records. The published app reads the chosen files locally and keeps private inputs in tab memory.

Deploy `dist` to Vercel or Cloudflare Pages, using the checked-in static security headers. See the [calculation method](docs/method.md), [privacy model](docs/privacy.md), [pilot and launch checklist](docs/validation.md) and [contribution guide](CONTRIBUTING.md).

MIT. The bundled font packages retain their upstream licences.
