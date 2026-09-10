/**
 * Seed script — creates a realistic demo dataset for the ERP/CRM portal.
 *
 * Run with:  npm run seed        (inside backend/)
 *
 * The script wipes the tables it owns and rebuilds them, so it can be run
 * repeatedly and always produces the same, predictable demo state.
 *
 * Stock integrity is preserved end to end: every product's currentStock equals
 * its opening IN movement minus the OUT movements written for the confirmed
 * challan, exactly as the running application would maintain it.
 */
import { PrismaClient, Role, CustomerType, CustomerStatus, MovementType, ChallanStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

/** Demo login credentials — these are documented in the README. */
const USERS = [
  { name: 'Anita Deshmukh', email: 'admin@erp.local', password: 'Admin@123', role: Role.ADMIN },
  { name: 'Rohit Sharma', email: 'sales@erp.local', password: 'Sales@123', role: Role.SALES },
  { name: 'Imran Qureshi', email: 'warehouse@erp.local', password: 'Warehouse@123', role: Role.WAREHOUSE },
  { name: 'Meera Nair', email: 'accounts@erp.local', password: 'Accounts@123', role: Role.ACCOUNTS },
];

const PRODUCTS = [
  { name: 'Sunflower Oil 1L Pouch',      sku: 'GRO-OIL-1L',    category: 'Grocery',     unitPrice: '142.50', openingStock: 480, minStockAlert: 100, location: 'Warehouse A - Rack 1' },
  { name: 'Basmati Rice 25kg Bag',       sku: 'GRO-RIC-25',    category: 'Grocery',     unitPrice: '2150.00', openingStock: 120, minStockAlert: 30,  location: 'Warehouse A - Rack 2' },
  { name: 'Wheat Flour 10kg Bag',        sku: 'GRO-ATA-10',    category: 'Grocery',     unitPrice: '415.00',  openingStock: 260, minStockAlert: 60,  location: 'Warehouse A - Rack 2' },
  { name: 'Toor Dal 5kg Pack',           sku: 'GRO-DAL-05',    category: 'Grocery',     unitPrice: '780.00',  openingStock: 45,  minStockAlert: 50,  location: 'Warehouse A - Rack 3' },
  { name: 'Detergent Powder 4kg',        sku: 'HOM-DET-04',    category: 'Home Care',   unitPrice: '395.00',  openingStock: 310, minStockAlert: 80,  location: 'Warehouse B - Rack 1' },
  { name: 'Dishwash Liquid 750ml',       sku: 'HOM-DSH-750',   category: 'Home Care',   unitPrice: '128.00',  openingStock: 22,  minStockAlert: 60,  location: 'Warehouse B - Rack 1' },
  { name: 'Floor Cleaner 5L Can',        sku: 'HOM-FLR-05',    category: 'Home Care',   unitPrice: '540.00',  openingStock: 95,  minStockAlert: 25,  location: 'Warehouse B - Rack 2' },
  { name: 'Herbal Shampoo 500ml',        sku: 'PER-SHM-500',   category: 'Personal Care', unitPrice: '289.00', openingStock: 180, minStockAlert: 40, location: 'Warehouse B - Rack 3' },
  { name: 'Bath Soap 125g (Pack of 4)',  sku: 'PER-SOP-125',   category: 'Personal Care', unitPrice: '196.00', openingStock: 540, minStockAlert: 120, location: 'Warehouse B - Rack 3' },
  { name: 'Toothpaste 200g',             sku: 'PER-TPT-200',   category: 'Personal Care', unitPrice: '118.00', openingStock: 12,  minStockAlert: 75, location: 'Warehouse B - Rack 4' },
  { name: 'Biscuits Assorted 1kg Box',   sku: 'SNK-BIS-1K',    category: 'Snacks',      unitPrice: '245.00',  openingStock: 420, minStockAlert: 90,  location: 'Warehouse C - Rack 1' },
  { name: 'Instant Noodles (Case of 48)', sku: 'SNK-NDL-48',   category: 'Snacks',      unitPrice: '672.00',  openingStock: 150, minStockAlert: 40,  location: 'Warehouse C - Rack 2' },
];

const CUSTOMERS = [
  { name: 'Suresh Patil',    mobile: '9822014576', email: 'suresh@patilstores.in',   businessName: 'Patil General Stores',   gstNumber: '27AABCP1234C1ZV', customerType: CustomerType.RETAIL,      address: 'Shop 14, Market Road, Nashik, Maharashtra 422001',   status: CustomerStatus.ACTIVE,   notes: 'Pays on delivery. Prefers morning dispatch.' },
  { name: 'Kavita Joshi',    mobile: '9890123344', email: 'kavita@joshitraders.com', businessName: 'Joshi Traders',          gstNumber: '27AAECJ5678D1Z2', customerType: CustomerType.WHOLESALE,   address: 'Plot 22, MIDC, Pune, Maharashtra 411019',            status: CustomerStatus.ACTIVE,   notes: 'Monthly credit account, 30-day terms.' },
  { name: 'Arif Shaikh',     mobile: '9765443321', email: 'arif@shaikhdistributors.in', businessName: 'Shaikh Distributors', gstNumber: '27AAFCS9012E1Z8', customerType: CustomerType.DISTRIBUTOR, address: 'Warehouse 5, Transport Nagar, Aurangabad 431005',    status: CustomerStatus.ACTIVE,   notes: 'Largest account by volume. Quarterly rate review.' },
  { name: 'Priya Menon',     mobile: '9819227744', email: 'priya@freshmart.co.in',   businessName: 'FreshMart Supermarket',  gstNumber: '27AAGCF3456F1Z5', customerType: CustomerType.RETAIL,      address: '3rd Floor, Link Plaza, Andheri West, Mumbai 400058', status: CustomerStatus.ACTIVE,   notes: null },
  { name: 'Deepak Rane',     mobile: '9922556677', email: 'deepak.rane@gmail.com',   businessName: 'Rane Kirana',            gstNumber: null,              customerType: CustomerType.RETAIL,      address: 'Near Bus Stand, Satara, Maharashtra 415001',         status: CustomerStatus.LEAD,     notes: 'Enquired about grocery range. Send price list.' },
  { name: 'Nikhil Agarwal',  mobile: '9004112233', email: 'nikhil@agarwalsales.in',  businessName: 'Agarwal Sales Corp',     gstNumber: '27AAHCA7890G1Z1', customerType: CustomerType.WHOLESALE,   address: 'Unit 8, Bhiwandi Logistics Park, Thane 421302',      status: CustomerStatus.LEAD,     notes: 'Wants distributor pricing. Follow up with proposal.' },
  { name: 'Sanjay Kulkarni', mobile: '9881003344', email: 'sanjay@kulkarniagencies.com', businessName: 'Kulkarni Agencies',  gstNumber: '27AAJCK2345H1Z9', customerType: CustomerType.DISTRIBUTOR, address: 'Godown 2, Kolhapur Road, Sangli 416416',             status: CustomerStatus.INACTIVE, notes: 'Dormant since last season. Re-engage before festival cycle.' },
  { name: 'Fatima Ansari',   mobile: '9702887766', email: 'fatima@ansarimart.in',    businessName: 'Ansari Mart',            gstNumber: null,              customerType: CustomerType.RETAIL,      address: 'Shop 3, Station Road, Kalyan, Maharashtra 421301',   status: CustomerStatus.LEAD,     notes: 'New shop opening next month.' },
];

/** Returns a Date `days` in the future (negative for the past), time zeroed to 10:00. */
function relativeDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(10, 0, 0, 0);
  return d;
}

function periodOf(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function challanNumberFor(period: string, sequence: number): string {
  return `CH-${period}-${String(sequence).padStart(4, '0')}`;
}

async function clearDatabase() {
  // Deleted child-first so foreign keys are never violated.
  await prisma.challanItem.deleteMany();
  await prisma.challan.deleteMany();
  await prisma.challanSequence.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  console.log('[seed] clearing existing data...');
  await clearDatabase();

  // ----------------------------- users -------------------------------------
  console.log('[seed] creating users...');
  const users = [];
  for (const u of USERS) {
    const user = await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, SALT_ROUNDS),
        role: u.role,
      },
    });
    users.push(user);
  }

  const admin = users.find((u) => u.role === Role.ADMIN)!;
  const sales = users.find((u) => u.role === Role.SALES)!;
  const warehouse = users.find((u) => u.role === Role.WAREHOUSE)!;

  // --------------------------- products ------------------------------------
  console.log('[seed] creating products with opening stock...');
  const products = [];
  for (const p of PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        name: p.name,
        sku: p.sku,
        category: p.category,
        unitPrice: p.unitPrice,
        currentStock: p.openingStock,
        minStockAlert: p.minStockAlert,
        location: p.location,
      },
    });

    // Opening stock is itself an auditable movement, not a silent number.
    await prisma.stockMovement.create({
      data: {
        productId: product.id,
        quantityChanged: p.openingStock,
        movementType: MovementType.IN,
        reason: 'Opening stock',
        balanceAfter: p.openingStock,
        createdById: warehouse.id,
        createdAt: relativeDate(-30),
      },
    });

    products.push(product);
  }

  const bySku = new Map(products.map((p) => [p.sku, p]));
  const product = (sku: string) => {
    const found = bySku.get(sku);
    if (!found) throw new Error(`Seed error: product ${sku} not found`);
    return found;
  };

  // --------------------------- customers -----------------------------------
  console.log('[seed] creating customers...');
  const customers = [];
  for (const [index, c] of CUSTOMERS.entries()) {
    const customer = await prisma.customer.create({
      data: {
        ...c,
        // Leads get a near-term follow-up date; active accounts a later one.
        followUpDate: c.status === CustomerStatus.LEAD ? relativeDate(index + 1) : relativeDate(index + 10),
        createdById: c.status === CustomerStatus.LEAD ? sales.id : admin.id,
      },
    });
    customers.push(customer);
  }

  const byMobile = new Map(customers.map((c) => [c.mobile, c]));
  const customer = (mobile: string) => {
    const found = byMobile.get(mobile);
    if (!found) throw new Error(`Seed error: customer ${mobile} not found`);
    return found;
  };

  // --------------------------- follow-ups ----------------------------------
  console.log('[seed] creating follow-up notes...');
  await prisma.followUp.createMany({
    data: [
      { customerId: customer('9922556677').id, note: 'Called and shared the grocery price list over WhatsApp.', followUpDate: relativeDate(3), createdById: sales.id, createdAt: relativeDate(-4) },
      { customerId: customer('9922556677').id, note: 'Asked for a sample invoice before placing the first order.', followUpDate: relativeDate(6), createdById: sales.id, createdAt: relativeDate(-1) },
      { customerId: customer('9004112233').id, note: 'Requested distributor slab pricing. Proposal drafted.', followUpDate: relativeDate(2), createdById: sales.id, createdAt: relativeDate(-3) },
      { customerId: customer('9702887766').id, note: 'Shop opening confirmed for next month. Wants an opening stock combo.', followUpDate: relativeDate(8), createdById: sales.id, createdAt: relativeDate(-2) },
      { customerId: customer('9890123344').id, note: 'Monthly order placed. Payment cleared within terms.', followUpDate: relativeDate(25), createdById: admin.id, createdAt: relativeDate(-9) },
      { customerId: customer('9881003344').id, note: 'No orders this quarter. Scheduling a re-engagement visit.', followUpDate: relativeDate(14), createdById: sales.id, createdAt: relativeDate(-15) },
    ],
  });

  // ---------------------- challan 1: confirmed ------------------------------
  // Confirmed challans have already reduced stock, so the seed writes the OUT
  // movements and decrements currentStock exactly like the confirm endpoint.
  console.log('[seed] creating a confirmed challan (stock deducted)...');
  const period = periodOf(new Date());

  const confirmedCustomer = customer('9765443321'); // Shaikh Distributors
  const confirmedLines = [
    { sku: 'GRO-OIL-1L', quantity: 120 },
    { sku: 'HOM-DET-04', quantity: 60 },
    { sku: 'SNK-BIS-1K', quantity: 80 },
  ];

  const confirmedItems = confirmedLines.map((line) => {
    const p = product(line.sku);
    const unitPrice = Number(p.unitPrice);
    return {
      productId: p.id,
      productName: p.name,
      productSku: p.sku,
      productCategory: p.category,
      unitPrice: p.unitPrice,
      quantity: line.quantity,
      lineTotal: (unitPrice * line.quantity).toFixed(2),
    };
  });

  const confirmedChallan = await prisma.challan.create({
    data: {
      challanNumber: challanNumberFor(period, 1),
      status: ChallanStatus.CONFIRMED,
      customerId: confirmedCustomer.id,
      customerName: confirmedCustomer.name,
      customerMobile: confirmedCustomer.mobile,
      customerBusinessName: confirmedCustomer.businessName,
      totalQuantity: confirmedItems.reduce((sum, i) => sum + i.quantity, 0),
      totalAmount: confirmedItems.reduce((sum, i) => sum + Number(i.lineTotal), 0).toFixed(2),
      notes: 'Monthly replenishment order. Dispatched by road.',
      createdById: sales.id,
      confirmedById: sales.id,
      confirmedAt: relativeDate(-2),
      createdAt: relativeDate(-2),
      items: { create: confirmedItems },
    },
  });

  for (const item of confirmedItems) {
    const updated = await prisma.product.update({
      where: { id: item.productId },
      data: { currentStock: { decrement: item.quantity } },
    });

    await prisma.stockMovement.create({
      data: {
        productId: item.productId,
        quantityChanged: item.quantity,
        movementType: MovementType.OUT,
        reason: `Challan ${confirmedChallan.challanNumber} confirmed`,
        balanceAfter: updated.currentStock,
        referenceType: 'CHALLAN',
        referenceId: confirmedChallan.id,
        createdById: sales.id,
        createdAt: relativeDate(-2),
      },
    });
  }

  // ------------------------ challan 2: draft --------------------------------
  // Drafts reserve nothing — stock is untouched until confirmation.
  console.log('[seed] creating a draft challan (no stock impact)...');
  const draftCustomer = customer('9890123344'); // Joshi Traders
  const draftLines = [
    { sku: 'GRO-RIC-25', quantity: 15 },
    { sku: 'PER-SOP-125', quantity: 100 },
  ];

  const draftItems = draftLines.map((line) => {
    const p = product(line.sku);
    return {
      productId: p.id,
      productName: p.name,
      productSku: p.sku,
      productCategory: p.category,
      unitPrice: p.unitPrice,
      quantity: line.quantity,
      lineTotal: (Number(p.unitPrice) * line.quantity).toFixed(2),
    };
  });

  await prisma.challan.create({
    data: {
      challanNumber: challanNumberFor(period, 2),
      status: ChallanStatus.DRAFT,
      customerId: draftCustomer.id,
      customerName: draftCustomer.name,
      customerMobile: draftCustomer.mobile,
      customerBusinessName: draftCustomer.businessName,
      totalQuantity: draftItems.reduce((sum, i) => sum + i.quantity, 0),
      totalAmount: draftItems.reduce((sum, i) => sum + Number(i.lineTotal), 0).toFixed(2),
      notes: 'Awaiting confirmation from the customer on quantities.',
      createdById: sales.id,
      items: { create: draftItems },
    },
  });

  // The sequence must continue from the highest number already issued.
  await prisma.challanSequence.create({ data: { period, lastNumber: 2 } });

  // ----------------------------- summary ------------------------------------
  const lowStock = await prisma.product.count({
    where: { isActive: true, currentStock: { lte: prisma.product.fields.minStockAlert } },
  });

  console.log('\n[seed] done');
  console.table({
    users: await prisma.user.count(),
    customers: await prisma.customer.count(),
    followUps: await prisma.followUp.count(),
    products: await prisma.product.count(),
    stockMovements: await prisma.stockMovement.count(),
    challans: await prisma.challan.count(),
    challanItems: await prisma.challanItem.count(),
    lowStockProducts: lowStock,
  });

  console.log('\n[seed] login credentials:');
  console.table(USERS.map((u) => ({ role: u.role, email: u.email, password: u.password })));
}

main()
  .catch((e) => {
    console.error('[seed] failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
