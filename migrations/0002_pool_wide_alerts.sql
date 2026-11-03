-- An alert now watches its whole pool: the spread between the dearest and the
-- cheapest token, whichever pair that is. No pair to store any more.
ALTER TABLE alerts DROP COLUMN token_a;
ALTER TABLE alerts DROP COLUMN token_b;
