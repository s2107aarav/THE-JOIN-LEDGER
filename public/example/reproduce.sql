-- Synthetic five-payment probe for SQLite. Values are whole dollars.
WITH
  orders(k) AS (VALUES ('O-17'), ('O-24'), ('O-31')),
  payments(k, v) AS (
    VALUES ('O-17', 70), ('O-17', 50), ('O-24', 90), ('O-24', 30), ('O-31', 60)
  ),
  parcels(k, ref) AS (VALUES ('O-17', 'p1'), ('O-17', 'p2'), ('O-31', 'p3')),
  original AS (SELECT k, SUM(v) AS amount FROM payments GROUP BY k),
  joined AS (
    SELECT o.k, SUM(p.v) AS amount
    FROM orders AS o
    JOIN payments AS p ON p.k = o.k
    JOIN parcels AS s ON s.k = o.k
    GROUP BY o.k
  )
SELECT original.k, original.amount AS source_amount, joined.amount AS joined_sum,
       COALESCE(joined.amount, 0) - original.amount AS signed_movement
FROM original LEFT JOIN joined ON joined.k = original.k
ORDER BY original.k;
