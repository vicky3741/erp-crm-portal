/**
 * Data integrity check.
 *
 * Run with:  npm run db:verify        (inside backend/)
 *
 * Asserts the invariants the application is supposed to guarantee at all times.
 * Useful after seeding, and as a regression check after exercising the challan
 * confirm/cancel flows by hand.
 */
import { PrismaClient, MovementType, ChallanStatus } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const failures: string[] = [];
const checks: Array<{ check: string; result: string }> = [];

function assert(condition: boolean, name: string, detail: string) {
  checks.push({ check: name, result: condition ? 'PASS' : `FAIL — ${detail}` });
  if (!condition) failures.push(`${name}: ${detail}`);
}

async function main() {
  // ---- 1. currentStock must equal the sum of its movements -----------------
  const products = await prisma.product.findMany({
    include: { stockMovements: { orderBy: { createdAt: 'asc' } } },
  });

  const stockMismatches: string[] = [];
  const balanceMismatches: string[] = [];

  for (const p of products) {
    let running = 0;
    for (const m of p.stockMovements) {
      running += m.movementType === MovementType.IN ? m.quantityChanged : -m.quantityChanged;
      if (m.balanceAfter !== running) {
        balanceMismatches.push(`${p.sku} movement ${m.id}: balanceAfter=${m.balanceAfter}, expected ${running}`);
      }
    }
    if (running !== p.currentStock) {
      stockMismatches.push(`${p.sku}: currentStock=${p.currentStock}, movements sum to ${running}`);
    }
  }

  assert(
    stockMismatches.length === 0,
    'currentStock equals the sum of its stock movements',
    stockMismatches.join('; '),
  );
  assert(
    balanceMismatches.length === 0,
    'every movement balanceAfter matches its running total',
    balanceMismatches.join('; '),
  );

  // ---- 2. no product may hold negative stock -------------------------------
  const negative = products.filter((p) => p.currentStock < 0);
  assert(
    negative.length === 0,
    'no product has negative stock',
    negative.map((p) => `${p.sku}=${p.currentStock}`).join(', '),
  );

  // ---- 3. challan totals must equal the sum of their line items ------------
  const challans = await prisma.challan.findMany({ include: { items: true } });
  const totalMismatches: string[] = [];

  for (const c of challans) {
    const qty = c.items.reduce((s, i) => s + i.quantity, 0);
    const amount = c.items.reduce((s, i) => s + Number(i.lineTotal), 0);
    const lineMath = c.items.filter(
      (i) => Math.abs(Number(i.unitPrice) * i.quantity - Number(i.lineTotal)) > 0.005,
    );

    if (qty !== c.totalQuantity) {
      totalMismatches.push(`${c.challanNumber}: totalQuantity=${c.totalQuantity}, items sum to ${qty}`);
    }
    if (Math.abs(amount - Number(c.totalAmount)) > 0.005) {
      totalMismatches.push(`${c.challanNumber}: totalAmount=${c.totalAmount}, items sum to ${amount.toFixed(2)}`);
    }
    for (const i of lineMath) {
      totalMismatches.push(`${c.challanNumber} / ${i.productSku}: lineTotal != unitPrice * quantity`);
    }
  }

  assert(totalMismatches.length === 0, 'challan totals equal the sum of their items', totalMismatches.join('; '));

  // ---- 4. confirmed challans must have OUT movements; drafts must not ------
  const referenceProblems: string[] = [];

  for (const c of challans) {
    const movements = await prisma.stockMovement.count({
      where: { referenceType: 'CHALLAN', referenceId: c.id },
    });

    if (c.status === ChallanStatus.CONFIRMED && movements !== c.items.length) {
      referenceProblems.push(
        `${c.challanNumber} is CONFIRMED with ${c.items.length} items but has ${movements} stock movements`,
      );
    }
    if (c.status === ChallanStatus.DRAFT && movements !== 0) {
      referenceProblems.push(`${c.challanNumber} is a DRAFT but has ${movements} stock movements`);
    }
  }

  assert(
    referenceProblems.length === 0,
    'confirmed challans moved stock, drafts did not',
    referenceProblems.join('; '),
  );

  // ---- 5. every challan item must carry its snapshot -----------------------
  const emptySnapshots = await prisma.challanItem.count({
    where: { OR: [{ productName: '' }, { productSku: '' }] },
  });
  assert(emptySnapshots === 0, 'every challan item carries a product snapshot', `${emptySnapshots} items missing snapshot data`);

  // ---- 6. the challan sequence must cover every issued number --------------
  const sequences = await prisma.challanSequence.findMany();
  const sequenceProblems: string[] = [];

  for (const s of sequences) {
    const issued = await prisma.challan.count({ where: { challanNumber: { startsWith: `CH-${s.period}-` } } });
    if (issued > s.lastNumber) {
      sequenceProblems.push(`period ${s.period}: ${issued} challans issued but lastNumber=${s.lastNumber}`);
    }
  }
  assert(sequenceProblems.length === 0, 'challan sequence covers every issued number', sequenceProblems.join('; '));

  // ---- report --------------------------------------------------------------
  console.log('\n[verify] integrity checks\n');
  console.table(checks);

  const lowStock = products.filter((p) => p.isActive && p.currentStock <= p.minStockAlert);
  console.log('[verify] products at or below their alert level:');
  console.table(
    lowStock.map((p) => ({ sku: p.sku, name: p.name, currentStock: p.currentStock, minStockAlert: p.minStockAlert })),
  );

  if (failures.length > 0) {
    console.error(`\n[verify] ${failures.length} check(s) FAILED\n`);
    process.exit(1);
  }
  console.log(`[verify] all ${checks.length} checks passed\n`);
}

main()
  .catch((e) => {
    console.error('[verify] error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
