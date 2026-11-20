# Calculation method

A case has a parent P with a unique nonempty text identifier and one or two independent detail tables. Each detail table joins directly to P on its selected text key. The selected measure is one additive numeric field from one table. Join rules and results describe the imported extract.

## Why the engine can count without expanding the join

For a parent key, count the matching records in each child. An INNER child contributes that many positions. A LEFT child contributes at least one, with a NULL-extended position when no child matches. The joined output rows at that key are the product of the two factors, omitting any absent branch.

Every parent appears once for every combination. A selected child record already occupies one position in its own branch, so it appears once per position in the other branch. A child with an empty key or no parent match has zero appearances. The same factor applies to every measure record at the same key.

For each original measure record, additive movement is its value times (appearances minus one). Repeated records, excluded records and preserved records form a partition. Original zero and NULL measurements receive structural classifications. A repeated negative amount can lower the sum. A dropped negative amount can raise it. Rank by total absolute per-record movement to expose offsetting changes.

Arithmetic uses signed integers scaled to six decimal places. NULL contributes zero to the accounting identity. The SQL total remains NULL when no non-NULL value occurs. SQL SUM differences and additive movements are labelled separately. Source totals cover the entire selected source, including orphaned records.

## Comparing a scenario

An alternative can change INNER or LEFT on either child and reduce at most one non-measure child to distinct non-NULL keys. For a matching key, the reduced child contributes a single logical match backed by its original records. The match does not choose any one of those records to survive. Report authors choose which rule answers their question.

## Local input

Upload or paste UTF-8 CSV or TSV with one header row. LF and CRLF record separators, quoted delimiters, doubled quotes and embedded line breaks are accepted. Field values retain spaces, case, leading zeroes and Unicode representation. A decoded empty key or amount is NULL. Use signed decimals with up to 12 integer and six fractional digits. Each extract should include all relevant children for a small set of root identifiers.

The combined limits are 5 MiB, 50,000 data rows, 400,000 data cells and 500,000 raw separator characters. Per-table limits include 40 columns, 16 KiB per decoded field and the parser's 128 KiB record guard. Separators inside quotes count toward the raw limit. Header-only tables are valid. Duplicate or blank headers, wrong record widths, blank lines, invalid UTF-8 and malformed quotes are refused.

## Correctness checks

The test suite executes equivalent materialized joins in SQLite over small independently staged records. It compares source-record appearances, per-key amounts, NULL behavior, row counts and evidence. A 1,200-configuration deterministic sweep covers all owner roles, mixed join rules and distinct-key scenarios. A separate closed-form case exercises 100 million hypothetical result rows and inspects 12 witnesses.

SQLite's native integer SUM is used only for bounded test magnitudes. The product uses BigInt for larger exact sums. The browser build contains no SQL runtime.
