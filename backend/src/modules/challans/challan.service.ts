import { ChallanStatus, MovementType, type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import { normaliseSearch, toSkipTake } from '../../utils/query';
import {
  applyStockMovement,
  STOCK_TX_OPTIONS,
  type InsufficientStockDetail,
} from '../stock/stock.service';
import type {
  CancelChallanInput,
  CreateChallanInput,
  ListChallansQuery,
  UpdateChallanInput,
} from './challan.schema';

const challanSelect = {
  id: true,
  challanNumber: true,
  status: true,
  customerId: true,
  customerName: true,
  customerMobile: true,
  customerBusinessName: true,
  totalQuantity: true,
  totalAmount: true,
  notes: true,
  confirmedAt: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, role: true } },
  confirmedBy: { select: { id: true, name: true, role: true } },
  cancelledBy: { select: { id: true, name: true, role: true } },
} satisfies Prisma.ChallanSelect;

const challanWithItemsSelect = {
  ...challanSelect,
  items: {
    orderBy: { productName: 'asc' },
    select: {
      id: true,
      productId: true,
      productName: true,
      productSku: true,
      productCategory: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
    },
  },
  customer: { select: { id: true, name: true, mobile: true, businessName: true, isActive: true } },
} satisfies Prisma.ChallanSelect;

/**
 * Issues the next challan number for the current month.
 *
 * The counter lives in its own table and is incremented inside the caller's
 * transaction, so two simultaneous creates cannot receive the same number. The
 * obvious alternative — `count() + 1` — is a race: both requests count the same
 * total and both build CH-202609-0007.
 */
async function nextChallanNumber(tx: Prisma.TransactionClient): Promise<string> {
  const now = new Date();
  const period = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const sequence = await tx.challanSequence.upsert({
    where: { period },
    create: { period, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });

  return `CH-${period}-${String(sequence.lastNumber).padStart(4, '0')}`;
}

interface ResolvedLine {
  productId: string;
  productName: string;
  productSku: string;
  productCategory: string;
  unitPrice: Prisma.Decimal;
  quantity: number;
  lineTotal: string;
}

/**
 * Turns {productId, quantity} pairs into full line items, copying the product's
 * name, SKU, category and price as they are right now.
 *
 * This snapshot is the point of the whole model. A challan is a dispatch
 * document: what left the warehouse, at what price, on what day. If it only
 * held a product id, renaming a product or repricing it next month would
 * silently rewrite every historical challan.
 */
async function resolveLines(
  tx: Prisma.TransactionClient,
  items: Array<{ productId: string; quantity: number }>,
): Promise<ResolvedLine[]> {
  const products = await tx.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
    select: { id: true, name: true, sku: true, category: true, unitPrice: true, isActive: true },
  });

  const byId = new Map(products.map((p) => [p.id, p]));

  const missing = items.filter((i) => !byId.has(i.productId));
  if (missing.length > 0) {
    throw AppError.badRequest(
      `${missing.length} product(s) on this challan do not exist`,
      { unknownProductIds: missing.map((m) => m.productId) },
    );
  }

  const inactive = items.filter((i) => !byId.get(i.productId)?.isActive);
  if (inactive.length > 0) {
    throw AppError.badRequest('A challan cannot include deactivated products', {
      inactiveProducts: inactive.map((i) => {
        const p = byId.get(i.productId)!;
        return { productId: p.id, name: p.name, sku: p.sku };
      }),
    });
  }

  return items.map((item) => {
    const product = byId.get(item.productId)!;
    return {
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      productCategory: product.category,
      unitPrice: product.unitPrice,
      quantity: item.quantity,
      lineTotal: product.unitPrice.mul(item.quantity).toFixed(2),
    };
  });
}

function totalsFor(lines: ResolvedLine[]) {
  return {
    totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
    totalAmount: lines.reduce((sum, l) => sum + Number(l.lineTotal), 0).toFixed(2),
  };
}

/**
 * Checks every line against available stock and reports ALL shortfalls at once.
 *
 * This is only for the error message. The actual guarantee that stock cannot go
 * negative lives in `applyStockMovement`, whose conditional UPDATE is evaluated
 * by the database at write time. Reporting shortfalls one at a time would force
 * a warehouse user to retry a ten-line challan ten times to discover every
 * problem.
 */
async function collectShortfalls(
  tx: Prisma.TransactionClient,
  lines: ResolvedLine[],
): Promise<InsufficientStockDetail[]> {
  const products = await tx.product.findMany({
    where: { id: { in: lines.map((l) => l.productId) } },
    select: { id: true, name: true, sku: true, currentStock: true },
  });

  const byId = new Map(products.map((p) => [p.id, p]));

  return lines.flatMap((line) => {
    const product = byId.get(line.productId);
    if (!product || product.currentStock >= line.quantity) return [];

    return [
      {
        productId: line.productId,
        productName: line.productName,
        sku: line.productSku,
        requested: line.quantity,
        available: product?.currentStock ?? 0,
        shortBy: line.quantity - (product?.currentStock ?? 0),
      },
    ];
  });
}

/** Deducts stock for every line and flips the challan to CONFIRMED. */
async function confirmWithinTransaction(
  tx: Prisma.TransactionClient,
  challanId: string,
  challanNumber: string,
  lines: ResolvedLine[],
  userId: string,
) {
  const shortfalls = await collectShortfalls(tx, lines);

  if (shortfalls.length > 0) {
    const summary = shortfalls
      .map((s) => `${s.productName} (${s.sku}): need ${s.requested}, have ${s.available}`)
      .join('; ');

    throw AppError.badRequest(
      `Cannot confirm ${challanNumber} — insufficient stock for ${shortfalls.length} item(s). ${summary}`,
      { insufficientStock: shortfalls },
    );
  }

  for (const line of lines) {
    await applyStockMovement(tx, {
      productId: line.productId,
      quantity: line.quantity,
      movementType: MovementType.OUT,
      reason: `Challan ${challanNumber} confirmed`,
      referenceType: 'CHALLAN',
      referenceId: challanId,
      createdById: userId,
    });
  }

  return tx.challan.update({
    where: { id: challanId },
    data: { status: ChallanStatus.CONFIRMED, confirmedAt: new Date(), confirmedById: userId },
    select: challanWithItemsSelect,
  });
}

export async function createChallan(input: CreateChallanInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, name: true, mobile: true, businessName: true, isActive: true },
    });

    if (!customer) throw AppError.badRequest('Customer not found');
    if (!customer.isActive) throw AppError.conflict('Cannot raise a challan for a deactivated customer');

    const lines = await resolveLines(tx, input.items);
    const totals = totalsFor(lines);
    const challanNumber = await nextChallanNumber(tx);

    const challan = await tx.challan.create({
      data: {
        challanNumber,
        status: ChallanStatus.DRAFT,
        customerId: customer.id,
        // Customer snapshot, for the same reason as the product snapshot.
        customerName: customer.name,
        customerMobile: customer.mobile,
        customerBusinessName: customer.businessName,
        ...totals,
        notes: input.notes ?? null,
        createdById: userId,
        items: { create: lines },
      },
      select: challanWithItemsSelect,
    });

    if (!input.confirm) return challan;

    return confirmWithinTransaction(tx, challan.id, challan.challanNumber, lines, userId);
  }, STOCK_TX_OPTIONS);
}

export async function confirmChallan(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const challan = await tx.challan.findUnique({
      where: { id },
      select: { id: true, challanNumber: true, status: true, items: true },
    });

    if (!challan) throw AppError.notFound('Challan not found');

    if (challan.status === ChallanStatus.CONFIRMED) {
      throw AppError.conflict(`${challan.challanNumber} is already confirmed`);
    }
    if (challan.status === ChallanStatus.CANCELLED) {
      throw AppError.conflict(`${challan.challanNumber} was cancelled and cannot be confirmed`);
    }

    // Re-resolve prices at confirmation time: the draft may have been sitting
    // for days, and the dispatch document should record what was actually
    // charged on the day the goods left.
    const lines = await resolveLines(
      tx,
      challan.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    );

    const totals = totalsFor(lines);

    await tx.challanItem.deleteMany({ where: { challanId: challan.id } });
    await tx.challanItem.createMany({ data: lines.map((l) => ({ ...l, challanId: challan.id })) });
    await tx.challan.update({ where: { id: challan.id }, data: totals });

    return confirmWithinTransaction(tx, challan.id, challan.challanNumber, lines, userId);
  }, STOCK_TX_OPTIONS);
}

/**
 * Cancelling a confirmed challan returns its stock, as IN movements that point
 * back at the challan. The goods came back, so the ledger says so — nothing is
 * ever deleted to make the numbers work.
 */
export async function cancelChallan(id: string, input: CancelChallanInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const challan = await tx.challan.findUnique({
      where: { id },
      select: { id: true, challanNumber: true, status: true, items: true },
    });

    if (!challan) throw AppError.notFound('Challan not found');
    if (challan.status === ChallanStatus.CANCELLED) {
      throw AppError.conflict(`${challan.challanNumber} is already cancelled`);
    }

    if (challan.status === ChallanStatus.CONFIRMED) {
      for (const item of challan.items) {
        await applyStockMovement(tx, {
          productId: item.productId,
          quantity: item.quantity,
          movementType: MovementType.IN,
          reason: `Challan ${challan.challanNumber} cancelled — stock returned`,
          referenceType: 'CHALLAN',
          referenceId: challan.id,
          createdById: userId,
        });
      }
    }

    return tx.challan.update({
      where: { id: challan.id },
      data: {
        status: ChallanStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: userId,
        cancelReason: input.reason,
      },
      select: challanWithItemsSelect,
    });
  }, STOCK_TX_OPTIONS);
}

/** Drafts are freely editable; confirmed and cancelled challans are immutable. */
export async function updateChallan(id: string, input: UpdateChallanInput) {
  return prisma.$transaction(async (tx) => {
    const challan = await tx.challan.findUnique({
      where: { id },
      select: { id: true, challanNumber: true, status: true },
    });

    if (!challan) throw AppError.notFound('Challan not found');

    if (challan.status !== ChallanStatus.DRAFT) {
      throw AppError.conflict(
        `${challan.challanNumber} is ${challan.status.toLowerCase()} and can no longer be edited. ` +
          'Cancel it and raise a new challan instead.',
      );
    }

    const data: Prisma.ChallanUpdateInput = {};

    if (input.notes !== undefined) data.notes = input.notes;

    if (input.customerId) {
      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, name: true, mobile: true, businessName: true, isActive: true },
      });

      if (!customer) throw AppError.badRequest('Customer not found');
      if (!customer.isActive) throw AppError.conflict('Cannot raise a challan for a deactivated customer');

      data.customer = { connect: { id: customer.id } };
      data.customerName = customer.name;
      data.customerMobile = customer.mobile;
      data.customerBusinessName = customer.businessName;
    }

    if (input.items) {
      const lines = await resolveLines(tx, input.items);
      const totals = totalsFor(lines);

      await tx.challanItem.deleteMany({ where: { challanId: challan.id } });
      await tx.challanItem.createMany({ data: lines.map((l) => ({ ...l, challanId: challan.id })) });

      data.totalQuantity = totals.totalQuantity;
      data.totalAmount = totals.totalAmount;
    }

    return tx.challan.update({ where: { id: challan.id }, data, select: challanWithItemsSelect });
  }, STOCK_TX_OPTIONS);
}

export async function listChallans(query: ListChallansQuery) {
  const { search, status, customerId, from, to, sortBy, sortOrder } = query;
  const term = normaliseSearch(search);

  const where: Prisma.ChallanWhereInput = {
    ...(status ? { status } : {}),
    ...(customerId ? { customerId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) } : {}),
          },
        }
      : {}),
    ...(term
      ? {
          OR: [
            { challanNumber: { contains: term, mode: 'insensitive' } },
            { customerName: { contains: term, mode: 'insensitive' } },
            { customerBusinessName: { contains: term, mode: 'insensitive' } },
            { customerMobile: { contains: term } },
          ],
        }
      : {}),
  };

  const [challans, total] = await prisma.$transaction([
    prisma.challan.findMany({
      where,
      select: { ...challanSelect, _count: { select: { items: true } } },
      orderBy: { [sortBy]: sortOrder },
      ...toSkipTake(query),
    }),
    prisma.challan.count({ where }),
  ]);

  return { challans, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getChallanById(id: string) {
  const challan = await prisma.challan.findUnique({ where: { id }, select: challanWithItemsSelect });
  if (!challan) throw AppError.notFound('Challan not found');

  // The stock movements this challan caused, so the document and the ledger
  // can be read side by side.
  const movements = await prisma.stockMovement.findMany({
    where: { referenceType: 'CHALLAN', referenceId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      quantityChanged: true,
      movementType: true,
      reason: true,
      balanceAfter: true,
      createdAt: true,
      product: { select: { id: true, name: true, sku: true } },
    },
  });

  return { ...challan, stockMovements: movements };
}

export async function getChallanSummary() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [total, drafts, confirmed, cancelled, today, confirmedValue] = await prisma.$transaction([
    prisma.challan.count(),
    prisma.challan.count({ where: { status: ChallanStatus.DRAFT } }),
    prisma.challan.count({ where: { status: ChallanStatus.CONFIRMED } }),
    prisma.challan.count({ where: { status: ChallanStatus.CANCELLED } }),
    prisma.challan.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.challan.aggregate({ where: { status: ChallanStatus.CONFIRMED }, _sum: { totalAmount: true } }),
  ]);

  return {
    total,
    drafts,
    confirmed,
    cancelled,
    createdToday: today,
    confirmedValue: confirmedValue._sum.totalAmount?.toFixed(2) ?? '0.00',
  };
}
