# Launch and user validation

## Release checks

Run the type check, differential suite, browser matrix and hosted smoke test. Check the page and worker headers, verify custom input/export using synthetic secret markers and confirm rollback on the selected host. Record target timings with the browser, device and network. Use a keyboard and screen reader to complete the main workflow. Preserve source and documentation links.

## Local benchmark

On an Apple M1 with 8 GiB RAM and Chromium 156, the 50,000-row, 427,799-byte case measured 333 ms p95 from Analyze to inspectable ledger and 35 ms p95 for a cached scenario comparison across 20 runs. The worst of five emulated mobile visits was 937 ms to open the first record, using 4 Mbps down, 1 Mbps up, 80 ms latency and 2× CPU slowdown. These measurements used the local production preview. Run `node tests/benchmark.mjs` against port 4175, or set `LEDGER_TEST_URL` to benchmark a public deployment.

## WhatsApp invitation

> I’m testing The Join Ledger, a browser tool for debugging SQL reports. If you’ve used JOIN and GROUP BY, could you try an example and then a fresh five-minute case? Open [public URL], follow the payments, and tell me where you got stuck. Please use the sample files I send. You won’t need to sign in or share your own data.

At two minutes, ask why the opening totals agree and request one original record behind each effect. Next give unfamiliar headers and records for a comparable case. Ask for payments on shipped orders, counting each payment once. Success is naming both affected groups, both signed effects, a witness and the inclusion rule within five minutes without hints.

For observer use, the two held-out datasets use payment groups 20/40, 75, −5 and 35/15, 65, −10. In both, the three parcel counts are 2, 0 and 1. Expected source, raw and distinct-inner totals are 130/115/55 and 105/90/40 respectively.

Recruit at least six reporting practitioners through alumni or SQL communities. Counterbalance tool and fixture order, supplying ready-to-query SQL data alongside files. Time import, diagnosis and explanation separately. Count six of eight qualified fresh product attempts as a usable early result. Target four of six paired practitioners getting an equally or more accurate result faster, with a median time reduction of 25%. Record extract preparation and unsupported query shapes. Observe voluntary use over 14 days and ask once at the end. Avoid collecting source data or screenshots of real reports.
