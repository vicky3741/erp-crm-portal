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
export async function applyStockMovement(tx: Prisma.TransactionClient, request: StockMovementRequest) {
  const { productId, quantity, movementType, reason, createdById, referenceType, referenceId } = request;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw AppError.badRequest('Stock movement quantity must be a whole number greater than zero');
  }

  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, sku: true, currentStock: true, isActive: true },
  });

  if (!product) throw AppError.notFound('Product not found');
  if (!product.isActive) {
    throw AppError.conflict(`${product.name} (${product.sku}) is deactivated and cannot move stock`);
  }

  if (movementType === MovementType.OUT) {
    const guarded = await tx.product.updateMany({
      where: { id: productId, currentStock: { gte: quantity } },
      data: { currentStock: { decrement: quantity } },
    });

    // Zero rows updated means the guard rejected it: stock moved underneath us,
    // or there was never enough to begin with.
    if (guarded.count === 0) {
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
  } else {
    await tx.product.update({
      where: { id: productId },
      data: { currentStock: { increment: quantity } },
    });
  }

  // Read back inside the same transaction so balanceAfter is the level this
  // movement actually produced.
  const updated = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    select: { id: true, name: true, sku: true, currentStock: true, minStockAlert: true },
  });

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

/** Convenience wrapper for callers that are not already inside a transaction. */
export async function recordStockMovement(request: StockMovementRequest) {
  return prisma.$transaction((tx) => applyStockMovement(tx, request));
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
