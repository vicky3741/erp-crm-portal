import { MovementType, type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import { toSkipTake } from '../../utils/query';
import type { ListStockMovementsQuery } from './stock.schema';

export interface StockMovementRequest {
  productId: string;
  /** Always a positive number; `movementType` carries the direction. */
  quantity: number;
  movementType: MovementType;
  reason: string;
  createdById: string;
  referenceType?: string;
  referenceId?: string;
}

export interface InsufficientStockDetail {
  productId: string;
  productName: string;
  sku: string;
  requested: number;
  available: number;
  shortBy: number;
}

/**
 * The single point at which stock ever changes.
 *
 * Every caller — the manual adjustment endpoint, challan confirmation, challan
 * cancellation — goes through here, inside a transaction the caller owns. That
 * is what keeps `Product.currentStock` and the `StockMovement` log in
 * permanent agreement: there is no code path that writes one without the other.
 *
 * The decrement is guarded in the WHERE clause rather than by reading the stock
 * first and then writing it:
 *
 *   UPDATE products SET currentStock = currentStock - n
 *   WHERE id = ? AND currentStock >= n
 *
 * A read-then-write would let two concurrent requests both see "50 available"
 * and both dispatch 40. Here the database itself rejects the second one, so
 * stock cannot go negative no matter how the requests interleave.
 */
interface UpdatedProductRow {
  id: string;
  name: string;
  sku: string;
  currentStock: number;
  minStockAlert: number;
}

export async function applyStockMovement(tx: Prisma.TransactionClient, request: StockMovementRequest) {
  const { productId, quantity, movementType, reason, createdById, referenceType, referenceId } = request;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw AppError.badRequest('Stock movement quantity must be a whole number greater than zero');
  }

  // Guard, update and read-back in ONE statement.
  //
  // Doing this as findUnique + updateMany + findUnique meant four round trips to
  // the database while holding a row lock. Under concurrency later transactions
  // queued behind that lock long enough to hit the transaction timeout, so
  // requests that should have been cleanly accepted or cleanly rejected errored
  // instead. RETURNING collapses it to one.
  const rows =
    movementType === MovementType.OUT
      ? await tx.$queryRaw<UpdatedProductRow[]>`
          UPDATE "products"
             SET "currentStock" = "currentStock" - ${quantity},
                 "updatedAt" = NOW()
           WHERE "id" = ${productId}
             AND "isActive" = true
             AND "currentStock" >= ${quantity}
       RETURNING "id", "name", "sku", "currentStock", "minStockAlert"`
      : await tx.$queryRaw<UpdatedProductRow[]>`
          UPDATE "products"
             SET "currentStock" = "currentStock" + ${quantity},
                 "updatedAt" = NOW()
           WHERE "id" = ${productId}
             AND "isActive" = true
       RETURNING "id", "name", "sku", "currentStock", "minStockAlert"`;

  const updated = rows[0];

  // No row came back: work out which precondition failed. This costs an extra
  // query, but only on the failure path.
  if (!updated) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, sku: true, currentStock: true, isActive: true },
    });

    if (!product) throw AppError.notFound('Product not found');
    if (!product.isActive) {
      throw AppError.conflict(`${product.name} (${product.sku}) is deactivated and cannot move stock`);
    }

    const detail: InsufficientStockDetail = {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      requested: quantity,
      available: product.currentStock,
      shortBy: quantity - product.currentStock,
    };

    throw AppError.badRequest(
      `Insufficient stock for ${product.name} (${product.sku}): requested ${quantity}, only ${product.currentStock} available`,
      { insufficientStock: [detail] },
    );
  }

  const movement = await tx.stockMovement.create({
    data: {
      productId,
      quantityChanged: quantity,
      movementType,
      reason,
      balanceAfter: updated.currentStock,
      referenceType: referenceType ?? null,
      referenceId: referenceId ?? null,
      createdById,
    },
    select: {
      id: true,
      quantityChanged: true,
      movementType: true,
      reason: true,
      balanceAfter: true,
      referenceType: true,
      referenceId: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true, role: true } },
    },
  });

  return { product: updated, movement };
}

/**
 * Options for every interactive transaction that moves stock.
 *
 * The database is a managed instance in another region, so each statement costs
 * real latency, and concurrent writers to the same product queue behind its row
 * lock. Prisma's 5-second default is comfortable for a single request and too
 * tight for a burst of them; these values leave room for a queue without
 * letting a genuinely stuck transaction hold on indefinitely.
 */
export const STOCK_TX_OPTIONS = { timeout: 20_000, maxWait: 20_000 } as const;

/** Convenience wrapper for callers that are not already inside a transaction. */
export async function recordStockMovement(request: StockMovementRequest) {
  return prisma.$transaction((tx) => applyStockMovement(tx, request), STOCK_TX_OPTIONS);
}

const movementSelect = {
  id: true,
  quantityChanged: true,
  movementType: true,
  reason: true,
  balanceAfter: true,
  referenceType: true,
  referenceId: true,
  createdAt: true,
  product: { select: { id: true, name: true, sku: true, category: true } },
  createdBy: { select: { id: true, name: true, role: true } },
} satisfies Prisma.StockMovementSelect;

export async function listStockMovements(query: ListStockMovementsQuery) {
  const { productId, movementType, referenceType, from, to } = query;

  const where: Prisma.StockMovementWhereInput = {
    ...(productId ? { productId } : {}),
    ...(movementType ? { movementType } : {}),
    ...(referenceType ? { referenceType } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            // `to` is a date; include the whole of that day.
            ...(to ? { lte: new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) } : {}),
          },
        }
      : {}),
  };

  const [movements, total] = await prisma.$transaction([
    prisma.stockMovement.findMany({
      where,
      select: movementSelect,
      orderBy: { createdAt: query.sortOrder },
      ...toSkipTake(query),
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return { movements, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getStockSummary() {
  const [movementsIn, movementsOut, totalMovements] = await prisma.$transaction([
    prisma.stockMovement.count({ where: { movementType: MovementType.IN } }),
    prisma.stockMovement.count({ where: { movementType: MovementType.OUT } }),
    prisma.stockMovement.count(),
  ]);

  return { movementsIn, movementsOut, totalMovements };
}
