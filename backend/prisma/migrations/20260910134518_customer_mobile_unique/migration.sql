-- Mobile is how this business identifies a customer. Enforcing it at the
-- database level means two concurrent creates cannot both succeed; the
-- application check exists only to return a friendlier message.

-- DropIndex
DROP INDEX "customers_mobile_idx";

-- CreateIndex
CREATE UNIQUE INDEX "customers_mobile_key" ON "customers"("mobile");