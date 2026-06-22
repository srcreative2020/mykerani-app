-- Concurrent bank-statement batch inserts raced on getOrCreateCategoryId
-- (select-then-insert, no DB-side uniqueness on (workspace_id, name)),
-- producing duplicate category rows under concurrent load. Merge each
-- duplicate group onto its earliest-created (canonical) row before adding a
-- uniqueness guarantee.

WITH canonical AS (
  SELECT workspace_id, name, min(created_at) AS min_created_at
  FROM public.general_ledger_categories
  GROUP BY workspace_id, name
  HAVING count(*) > 1
),
canonical_id AS (
  SELECT DISTINCT ON (g.workspace_id, g.name)
    g.workspace_id, g.name, g.id AS canonical_id
  FROM public.general_ledger_categories g
  JOIN canonical c ON c.workspace_id = g.workspace_id AND c.name = g.name AND c.min_created_at = g.created_at
  ORDER BY g.workspace_id, g.name, g.id
),
dupes AS (
  SELECT g.id AS dupe_id, ci.canonical_id
  FROM public.general_ledger_categories g
  JOIN canonical_id ci ON ci.workspace_id = g.workspace_id AND ci.name = g.name
  WHERE g.id <> ci.canonical_id
)
UPDATE public.income_records r
SET category_id = d.canonical_id
FROM dupes d
WHERE r.category_id = d.dupe_id;

WITH canonical AS (
  SELECT workspace_id, name, min(created_at) AS min_created_at
  FROM public.general_ledger_categories
  GROUP BY workspace_id, name
  HAVING count(*) > 1
),
canonical_id AS (
  SELECT DISTINCT ON (g.workspace_id, g.name)
    g.workspace_id, g.name, g.id AS canonical_id
  FROM public.general_ledger_categories g
  JOIN canonical c ON c.workspace_id = g.workspace_id AND c.name = g.name AND c.min_created_at = g.created_at
  ORDER BY g.workspace_id, g.name, g.id
),
dupes AS (
  SELECT g.id AS dupe_id, ci.canonical_id
  FROM public.general_ledger_categories g
  JOIN canonical_id ci ON ci.workspace_id = g.workspace_id AND ci.name = g.name
  WHERE g.id <> ci.canonical_id
)
UPDATE public.expense_records r
SET category_id = d.canonical_id
FROM dupes d
WHERE r.category_id = d.dupe_id;

WITH canonical AS (
  SELECT workspace_id, name, min(created_at) AS min_created_at
  FROM public.general_ledger_categories
  GROUP BY workspace_id, name
  HAVING count(*) > 1
),
canonical_id AS (
  SELECT DISTINCT ON (g.workspace_id, g.name)
    g.workspace_id, g.name, g.id AS canonical_id
  FROM public.general_ledger_categories g
  JOIN canonical c ON c.workspace_id = g.workspace_id AND c.name = g.name AND c.min_created_at = g.created_at
  ORDER BY g.workspace_id, g.name, g.id
),
dupes AS (
  SELECT g.id AS dupe_id, ci.canonical_id
  FROM public.general_ledger_categories g
  JOIN canonical_id ci ON ci.workspace_id = g.workspace_id AND ci.name = g.name
  WHERE g.id <> ci.canonical_id
)
UPDATE public.receivables r
SET category_id = d.canonical_id
FROM dupes d
WHERE r.category_id = d.dupe_id;

WITH canonical AS (
  SELECT workspace_id, name, min(created_at) AS min_created_at
  FROM public.general_ledger_categories
  GROUP BY workspace_id, name
  HAVING count(*) > 1
),
canonical_id AS (
  SELECT DISTINCT ON (g.workspace_id, g.name)
    g.workspace_id, g.name, g.id AS canonical_id
  FROM public.general_ledger_categories g
  JOIN canonical c ON c.workspace_id = g.workspace_id AND c.name = g.name AND c.min_created_at = g.created_at
  ORDER BY g.workspace_id, g.name, g.id
),
dupes AS (
  SELECT g.id AS dupe_id, ci.canonical_id
  FROM public.general_ledger_categories g
  JOIN canonical_id ci ON ci.workspace_id = g.workspace_id AND ci.name = g.name
  WHERE g.id <> ci.canonical_id
)
UPDATE public.payables r
SET category_id = d.canonical_id
FROM dupes d
WHERE r.category_id = d.dupe_id;

-- Delete the orphaned duplicate category rows (no longer referenced).
WITH canonical AS (
  SELECT workspace_id, name, min(created_at) AS min_created_at
  FROM public.general_ledger_categories
  GROUP BY workspace_id, name
  HAVING count(*) > 1
),
canonical_id AS (
  SELECT DISTINCT ON (g.workspace_id, g.name)
    g.workspace_id, g.name, g.id AS canonical_id
  FROM public.general_ledger_categories g
  JOIN canonical c ON c.workspace_id = g.workspace_id AND c.name = g.name AND c.min_created_at = g.created_at
  ORDER BY g.workspace_id, g.name, g.id
)
DELETE FROM public.general_ledger_categories g
USING canonical_id ci
WHERE ci.workspace_id = g.workspace_id AND ci.name = g.name AND g.id <> ci.canonical_id;

-- Guarantee uniqueness so future concurrent batch inserts can't race.
CREATE UNIQUE INDEX IF NOT EXISTS uq_general_ledger_categories_workspace_name
    ON public.general_ledger_categories (workspace_id, name);
