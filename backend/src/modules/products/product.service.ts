import { MovementType, type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import { normaliseSearch, toSkipTake } from '../../utils/query';
import { applyStockMovement } from '../stock/stock.service';
import type { AdjustStockInput } from '../stock/stock.schema';
import type { CreateProductInput, ListProductsQuery, UpdateProductInput } from './product.schema';

const listSelect = {
  id: true,
  name: true,
  sku: true,
  category: true,
  unitPrice: true,
  currentStock: true,
  minStockAlert: true,
  location: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

/** Products at or below their alert level, expressed as a reusable filter. */
const lowStockFilter: Prisma.ProductWhereInput = {
  currentStock: { lte: prisma.product.fields.minStockAlert },
};

export async function listProducts(query: ListProductsQuery) {
  const { search, category, lowStock, includeInactive, sortBy, sortOrder } = query;
  const term = normaliseSearch(search);

  const where: Prisma.ProductWhereInput = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
    ...(lowStock ? lowStockFilter : {}),
    ...(term
      ? {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { sku: { contains: term, mode: 'insensitive' } },
            { category: { contains: term, mode: 'insensitive' } },
            { location: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: listSelect,
      orderBy: { [sortBy]: sortOrder },
      ...toSkipTake(query),
    }),
    prisma.product.count({ where }),
  ]);

  // Computed rather than stored, so it can never drift out of date.
  const withFlags = products.map((p) => ({ ...p, isLowStock: p.currentStock <= p.minStockAlert }));

  return { products: withFlags, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      ...listSelect,
      stockMovements: {
        orderBy: { createdAt: 'desc' },
        take: 20,
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
      },
      _count: { select: { stockMovements: true, challanItems: true } },
    },
  });

  if (!product) throw AppError.notFound('Product not found');

  return { ...product, isLowStock: product.currentStock <= product.minStockAlert };
}

async function assertSkuIsFree(sku: string, excludeId?: string) {
  const existing = await prisma.product.findFirst({
    where: { sku, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true, isActive: true },
  });

  if (existing) {
    throw AppError.conflict(
      `SKU ${sku} is already used by ${existing.name}` + (existing.isActive ? '' : ' (deactivated)'),
      { conflictingProductId: existing.id },
    );
  }
}

/**
 * Opening stock is not written straight into `currentStock`. The product is
 * created at zero and the opening quantity is then applied as an IN movement,
 * so even a product's very first stock level has a row in the audit log
 * explaining where it came from.
 */
export async function createProduct(input: CreateProductInput, createdById: string) {
  await assertSkuIsFree(input.sku);

  const { openingStock, ...productData } = input;

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: { ...productData, currentStock: 0 },
      select: listSelect,
    });

    if (openingStock > 0) {
      await applyStockMovement(tx, {
        productId: product.id,
        quantity: openingStock,
        movementType: MovementType.IN,
        reason: 'Opening stock',
        createdById,
      });
    }

    const fresh = await tx.product.findUniqueOrThrow({ where: { id: product.id }, select: listSelect });
    return { ...fresh, isLowStock: fresh.currentStock <= fresh.minStockAlert };
  });
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound('Product not found');

  if (input.sku) await assertSkuIsFree(input.sku, id);

  const product = await prisma.product.update({ where: { id }, data: input, select: listSelect });
  return { ...product, isLowStock: product.currentStock <= product.minStockAlert };
}

/**
 * Soft delete. Challan items reference products, and the stock movement log is
 * a permanent record, so the row has to survive.
 */
export async function deactivateProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, isActive: true, currentStock: true, name: true },
  });

  if (!product) throw AppError.notFound('Product not found');
  if (!product.isActive) throw AppError.conflict('This product is already deactivated');

  return prisma.product.update({ where: { id }, data: { isActive: false }, select: listSelect });
}

export async function reactivateProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id }, select: { id: true, isActive: true } });

  if (!product) throw AppError.notFound('Product not found');
  if (product.isActive) throw AppError.conflict('This product is already active');

  return prisma.product.update({ where: { id }, data: { isActive: true }, select: listSelect });
}

/** Manual stock correction — goods received, damage, stock count adjustment. */
export async function adjustStock(productId: string, input: AdjustStockInput, createdById: string) {
  return prisma.$transaction(async (tx) =>
    applyStockMovement(tx, {
      productId,
      quantity: input.quantity,
      movementType: input.movementType,
      reason: input.reason,
      createdById,
    }),
  );
}

export async function listLowStockProducts() {
  const products = await prisma.product.findMany({
    where: { isActive: true, ...lowStockFilter },
    select: listSelect,
    orderBy: { currentStock: 'asc' },
  });

  return products.map((p) => ({ ...p, isLowStock: true, shortBy: p.minStockAlert - p.currentStock }));
}

export async function listCategories() {
  const rows = await prisma.product.findMany({
    where: { isActive: true },
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  });

  return rows.map((r) => r.category);
}

export async function getProductSummary() {
  const [total, inactive, lowStock, outOfStock, aggregate] = await prisma.$transaction([
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: false } }),
    prisma.product.count({ where: { isActive: true, ...lowStockFilter } }),
    prisma.product.count({ where: { isActive: true, currentStock: 0 } }),
    prisma.product.aggregate({ where: { isActive: true }, _sum: { currentStock: true } }),
  ]);

  return { total, inactive, lowStock, outOfStock, totalUnitsInStock: aggregate._sum.currentStock ?? 0 };
}
