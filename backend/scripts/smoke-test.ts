/**
 * End-to-end smoke test against a running API.
 *
 * Start the server, then:  npm run test:smoke
 * Against a deployed API:  API_URL=https://your-api.onrender.com npm run test:smoke
 *
 * This exercises the real HTTP surface — routing, middleware order, validation,
 * authentication, authorisation and status codes — rather than calling service
 * functions directly. Grows one section at a time alongside the API.
 */
const BASE = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/**
 * Every record this suite creates is tagged with a per-run id.
 *
 * Mobile numbers and SKUs are unique in the database, and the suite only ever
 * soft-deletes what it creates, so fixed test values would collide with the
 * previous run. Tagging makes the suite runnable repeatedly against the same
 * database without a reseed — which matters, because it gets run live.
 */
const RUN = Date.now().toString().slice(-6);
const RUN_MOBILE = `9${Date.now().toString().slice(-9)}`;

interface Result {
  group: string;
  name: string;
  expected: string;
  actual: string;
  pass: boolean;
}

const results: Result[] = [];
let currentGroup = 'general';

function group(name: string) {
  currentGroup = name;
}

interface CallOptions {
  method?: string;
  token?: string;
  body?: unknown;
  rawHeaders?: Record<string, string>;
}

async function call(path: string, options: CallOptions = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...options.rawHeaders };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* some responses have no body */
  }

  return { status: res.status, body: json };
}

function check(name: string, expected: string, actual: string, pass: boolean) {
  results.push({ group: currentGroup, name, expected, actual, pass });
}

function expectStatus(name: string, got: number, want: number, extra?: string) {
  check(name, `${want}`, `${got}${extra ? ` (${extra})` : ''}`, got === want);
}

async function main() {
  console.log(`\n[smoke] target: ${BASE}\n`);

  // ------------------------------- health ----------------------------------
  group('health');
  const health = await call('/api/health');
  expectStatus('health endpoint responds', health.status, 200);
  check(
    'health reports the database as up',
    'up',
    String(health.body?.data?.database),
    health.body?.data?.database === 'up',
  );

  const unknown = await call('/api/definitely-not-a-route');
  expectStatus('unknown route returns 404', unknown.status, 404);

  // ------------------------------ validation -------------------------------
  group('validation');
  const noBody = await call('/api/auth/login', { method: 'POST', body: {} });
  expectStatus('login with empty body is rejected', noBody.status, 400);
  check(
    'validation error names the offending fields',
    'email and password listed',
    JSON.stringify(noBody.body?.details ?? []),
    Array.isArray(noBody.body?.details) &&
      noBody.body.details.some((d: any) => d.field === 'email') &&
      noBody.body.details.some((d: any) => d.field === 'password'),
  );

  const badEmail = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'not-an-email', password: 'whatever' },
  });
  expectStatus('login with a malformed email is rejected', badEmail.status, 400);

  const extraFields = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@erp.local', password: 'Admin@123', role: 'ADMIN', isActive: true },
  });
  check(
    'unknown fields are stripped, not trusted',
    '200 and login still succeeds',
    `${extraFields.status}`,
    extraFields.status === 200,
  );

  // --------------------------- authentication ------------------------------
  group('authentication');
  const wrongPassword = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@erp.local', password: 'WrongPassword1!' },
  });
  expectStatus('wrong password is rejected', wrongPassword.status, 401);

  const unknownEmail = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'nobody@erp.local', password: 'WrongPassword1!' },
  });
  expectStatus('unknown email is rejected', unknownEmail.status, 401);
  check(
    'both failures return an identical message (no user enumeration)',
    'same message',
    `"${wrongPassword.body?.message}" vs "${unknownEmail.body?.message}"`,
    wrongPassword.body?.message === unknownEmail.body?.message,
  );

  const uppercaseEmail = await call('/api/auth/login', {
    method: 'POST',
    body: { email: '  ADMIN@ERP.LOCAL  ', password: 'Admin@123' },
  });
  expectStatus('email is trimmed and lower-cased before lookup', uppercaseEmail.status, 200);

  // Log in as every role.
  const credentials = [
    { role: 'ADMIN', email: 'admin@erp.local', password: 'Admin@123' },
    { role: 'SALES', email: 'sales@erp.local', password: 'Sales@123' },
    { role: 'WAREHOUSE', email: 'warehouse@erp.local', password: 'Warehouse@123' },
    { role: 'ACCOUNTS', email: 'accounts@erp.local', password: 'Accounts@123' },
  ];

  const tokens: Record<string, string> = {};

  for (const cred of credentials) {
    const res = await call('/api/auth/login', {
      method: 'POST',
      body: { email: cred.email, password: cred.password },
    });
    const gotRole = res.body?.data?.user?.role;
    const token = res.body?.data?.token;
    if (token) tokens[cred.role] = token;

    check(
      `${cred.role} can log in and receives a token`,
      `200 + role ${cred.role}`,
      `${res.status} + role ${gotRole}`,
      res.status === 200 && gotRole === cred.role && typeof token === 'string' && token.length > 20,
    );
  }

  check(
    'the login response never contains a password hash',
    'absent',
    JSON.stringify(uppercaseEmail.body?.data?.user ?? {}),
    !JSON.stringify(uppercaseEmail.body ?? {}).toLowerCase().includes('passwordhash'),
  );

  // ------------------------------ protected --------------------------------
  group('protected routes');
  const noToken = await call('/api/auth/me');
  expectStatus('protected route without a token returns 401', noToken.status, 401);

  const garbageToken = await call('/api/auth/me', { token: 'this.is.not.a.jwt' });
  expectStatus('protected route with a malformed token returns 401', garbageToken.status, 401);

  const wrongScheme = await call('/api/auth/me', {
    rawHeaders: { Authorization: `Basic ${tokens.ADMIN}` },
  });
  expectStatus('non-Bearer authorization scheme returns 401', wrongScheme.status, 401);

  // A token signed with a different secret must not be accepted.
  const forged =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlLXVzZXItaWQiLCJyb2xlIjoiQURNSU4iLCJpYXQiOjE3MDAwMDAwMDB9.' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const forgedRes = await call('/api/auth/me', { token: forged });
  expectStatus('a token signed with another secret is rejected', forgedRes.status, 401);

  const meAdmin = await call('/api/auth/me', { token: tokens.ADMIN });
  expectStatus('valid token reaches the protected route', meAdmin.status, 200, meAdmin.body?.data?.email);
  check(
    'the profile returns the right user and role',
    'admin@erp.local / ADMIN',
    `${meAdmin.body?.data?.email} / ${meAdmin.body?.data?.role}`,
    meAdmin.body?.data?.email === 'admin@erp.local' && meAdmin.body?.data?.role === 'ADMIN',
  );
  check(
    'the profile never returns a password hash',
    'absent',
    Object.keys(meAdmin.body?.data ?? {}).join(', '),
    !Object.keys(meAdmin.body?.data ?? {}).includes('passwordHash'),
  );

  // ----------------------------- authorisation -----------------------------
  group('authorisation (RBAC)');
  const adminOnlyAsAdmin = await call('/api/auth/admin-check', { token: tokens.ADMIN });
  expectStatus('ADMIN reaches the admin-only route', adminOnlyAsAdmin.status, 200);

  for (const role of ['SALES', 'WAREHOUSE', 'ACCOUNTS']) {
    const res = await call('/api/auth/admin-check', { token: tokens[role] });
    expectStatus(`${role} is blocked from the admin-only route`, res.status, 403);
  }

  const forbidden = await call('/api/auth/admin-check', { token: tokens.SALES });
  check(
    'the 403 explains which roles are allowed',
    'message names ADMIN',
    String(forbidden.body?.message),
    String(forbidden.body?.message ?? '').includes('ADMIN'),
  );

  // -------------------------------- logout ---------------------------------
  group('logout');
  const logout = await call('/api/auth/logout', { method: 'POST', token: tokens.ADMIN });
  expectStatus('logout succeeds for an authenticated user', logout.status, 200);

  const logoutNoToken = await call('/api/auth/logout', { method: 'POST' });
  expectStatus('logout without a token returns 401', logoutNoToken.status, 401);

  // ------------------------------- customers -------------------------------
  group('customers: read');
  const listAll = await call('/api/customers', { token: tokens.ADMIN });
  expectStatus('list customers', listAll.status, 200);
  check(
    'list is paginated with meta',
    'meta with total and totalPages',
    JSON.stringify(listAll.body?.meta ?? null),
    typeof listAll.body?.meta?.total === 'number' && typeof listAll.body?.meta?.totalPages === 'number',
  );
  check(
    'seeded customers are returned',
    '8 active customers',
    `${listAll.body?.meta?.total}`,
    listAll.body?.meta?.total === 8,
  );

  const listNoToken = await call('/api/customers');
  expectStatus('listing customers without a token returns 401', listNoToken.status, 401);

  const page2 = await call('/api/customers?page=2&limit=3', { token: tokens.ACCOUNTS });
  check(
    'pagination returns the right slice',
    'page 2, 3 rows, hasPrevPage true',
    `page ${page2.body?.meta?.page}, ${page2.body?.data?.length} rows, hasPrevPage ${page2.body?.meta?.hasPrevPage}`,
    page2.body?.meta?.page === 2 && page2.body?.data?.length === 3 && page2.body?.meta?.hasPrevPage === true,
  );

  const badLimit = await call('/api/customers?limit=5000', { token: tokens.ADMIN });
  expectStatus('an oversized limit is rejected', badLimit.status, 400);

  const searchByName = await call('/api/customers?search=kavita', { token: tokens.WAREHOUSE });
  check(
    'search is case-insensitive across fields',
    'finds Kavita Joshi',
    `${searchByName.body?.data?.[0]?.name}`,
    searchByName.body?.data?.length === 1 && searchByName.body.data[0].name === 'Kavita Joshi',
  );

  const searchByMobile = await call('/api/customers?search=9765443321', { token: tokens.ADMIN });
  check(
    'search matches on mobile number',
    'finds Shaikh Distributors',
    `${searchByMobile.body?.data?.[0]?.businessName}`,
    searchByMobile.body?.data?.[0]?.businessName === 'Shaikh Distributors',
  );

  const filterLeads = await call('/api/customers?status=LEAD', { token: tokens.ADMIN });
  check(
    'filtering by status returns only that status',
    'every row is a LEAD',
    `${filterLeads.body?.data?.length} rows`,
    Array.isArray(filterLeads.body?.data) &&
      filterLeads.body.data.length > 0 &&
      filterLeads.body.data.every((c: any) => c.status === 'LEAD'),
  );

  const filterType = await call('/api/customers?customerType=DISTRIBUTOR', { token: tokens.ADMIN });
  check(
    'filtering by customer type works',
    'every row is a DISTRIBUTOR',
    `${filterType.body?.data?.length} rows`,
    Array.isArray(filterType.body?.data) &&
      filterType.body.data.length > 0 &&
      filterType.body.data.every((c: any) => c.customerType === 'DISTRIBUTOR'),
  );

  const sorted = await call('/api/customers?sortBy=name&sortOrder=asc&limit=100', { token: tokens.ADMIN });
  const names: string[] = (sorted.body?.data ?? []).map((c: any) => c.name);
  check(
    'sorting by name ascending is applied',
    'names in alphabetical order',
    names.slice(0, 3).join(' | '),
    names.every((n, i) => i === 0 || (names[i - 1] as string).localeCompare(n) <= 0),
  );

  const summaryRes = await call('/api/customers/summary', { token: tokens.ACCOUNTS });
  expectStatus('customer summary responds', summaryRes.status, 200);
  check(
    'summary counts add up to the seeded data',
    'total 8',
    `total ${summaryRes.body?.data?.total}, leads ${summaryRes.body?.data?.leads}`,
    summaryRes.body?.data?.total === 8,
  );

  // ---------------------------- customers: write ---------------------------
  group('customers: write');
  const customerName = `Smoke Test Customer ${RUN}`;
  const newCustomer = {
    name: customerName,
    mobile: RUN_MOBILE,
    email: `Smoke.Test.${RUN}@Example.COM`,
    businessName: `Smoke Test Traders ${RUN}`,
    gstNumber: '27AABCP1234C1ZV',
    customerType: 'WHOLESALE',
    address: 'Plot 1, Test Industrial Area, Pune 411001',
    status: 'LEAD',
    notes: 'Created by the automated smoke test.',
  };

  const createdByWarehouse = await call('/api/customers', {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: newCustomer,
  });
  expectStatus('WAREHOUSE cannot create a customer', createdByWarehouse.status, 403);

  const createdByAccounts = await call('/api/customers', {
    method: 'POST',
    token: tokens.ACCOUNTS,
    body: newCustomer,
  });
  expectStatus('ACCOUNTS cannot create a customer', createdByAccounts.status, 403);

  const badMobile = await call('/api/customers', {
    method: 'POST',
    token: tokens.SALES,
    body: { ...newCustomer, mobile: '12345' },
  });
  expectStatus('an invalid mobile number is rejected', badMobile.status, 400);

  const badGst = await call('/api/customers', {
    method: 'POST',
    token: tokens.SALES,
    body: { ...newCustomer, gstNumber: 'NOT-A-GST' },
  });
  expectStatus('an invalid GST number is rejected', badGst.status, 400);

  const createdRes = await call('/api/customers', {
    method: 'POST',
    token: tokens.SALES,
    body: newCustomer,
  });
  expectStatus('SALES can create a customer', createdRes.status, 201);
  const customerId: string | undefined = createdRes.body?.data?.id;
  check(
    'email is normalised to lower case on create',
    `smoke.test.${RUN}@example.com`,
    String(createdRes.body?.data?.email),
    createdRes.body?.data?.email === `smoke.test.${RUN}@example.com`,
  );

  const duplicate = await call('/api/customers', {
    method: 'POST',
    token: tokens.SALES,
    body: { ...newCustomer, email: `different.${RUN}@example.com` },
  });
  expectStatus('a duplicate mobile number is rejected', duplicate.status, 409);
  check(
    'the duplicate error names the existing customer',
    `message mentions ${customerName}`,
    String(duplicate.body?.message),
    String(duplicate.body?.message ?? '').includes(customerName),
  );

  const updated = await call(`/api/customers/${customerId}`, {
    method: 'PATCH',
    token: tokens.SALES,
    body: { status: 'ACTIVE', notes: 'Converted from lead.' },
  });
  expectStatus('SALES can update a customer', updated.status, 200);
  check(
    'the update applied and left other fields alone',
    'status ACTIVE, name unchanged',
    `${updated.body?.data?.status}, ${updated.body?.data?.name}`,
    updated.body?.data?.status === 'ACTIVE' && updated.body?.data?.name === customerName,
  );

  const emptyPatch = await call(`/api/customers/${customerId}`, {
    method: 'PATCH',
    token: tokens.SALES,
    body: {},
  });
  expectStatus('an empty update is rejected', emptyPatch.status, 400);

  const missing = await call('/api/customers/does-not-exist', { token: tokens.ADMIN });
  expectStatus('an unknown customer id returns 404', missing.status, 404);

  // ------------------------------ follow-ups -------------------------------
  group('customers: follow-ups');
  const followUpRes = await call(`/api/customers/${customerId}/followups`, {
    method: 'POST',
    token: tokens.SALES,
    body: { note: 'Called and shared the price list.', followUpDate: '2026-10-01' },
  });
  expectStatus('SALES can add a follow-up note', followUpRes.status, 201);

  const followUpByWarehouse = await call(`/api/customers/${customerId}/followups`, {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: { note: 'Should not be allowed.' },
  });
  expectStatus('WAREHOUSE cannot add a follow-up note', followUpByWarehouse.status, 403);

  const shortNote = await call(`/api/customers/${customerId}/followups`, {
    method: 'POST',
    token: tokens.SALES,
    body: { note: 'x' },
  });
  expectStatus('a too-short follow-up note is rejected', shortNote.status, 400);

  const detail = await call(`/api/customers/${customerId}`, { token: tokens.ADMIN });
  check(
    'the follow-up appears on the customer detail',
    '1 follow-up, recorded against its author',
    `${detail.body?.data?.followUps?.length} by ${detail.body?.data?.followUps?.[0]?.createdBy?.name}`,
    detail.body?.data?.followUps?.length === 1 &&
      detail.body.data.followUps[0].createdBy?.name === 'Rohit Sharma',
  );
  check(
    'adding a follow-up with a date rescheduled the customer',
    'followUpDate set to 2026-10-01',
    String(detail.body?.data?.followUpDate),
    String(detail.body?.data?.followUpDate ?? '').startsWith('2026-10-01'),
  );

  // ------------------------------ soft delete ------------------------------
  group('customers: deactivation');
  const deleteBySales = await call(`/api/customers/${customerId}`, {
    method: 'DELETE',
    token: tokens.SALES,
  });
  expectStatus('SALES cannot deactivate a customer', deleteBySales.status, 403);

  const deleted = await call(`/api/customers/${customerId}`, { method: 'DELETE', token: tokens.ADMIN });
  expectStatus('ADMIN can deactivate a customer', deleted.status, 200);

  const afterDelete = await call(`/api/customers?search=${encodeURIComponent(customerName)}`, {
    token: tokens.ADMIN,
  });
  check(
    'a deactivated customer is hidden from the default list',
    '0 results',
    `${afterDelete.body?.data?.length}`,
    afterDelete.body?.data?.length === 0,
  );

  const withInactive = await call(
    `/api/customers?search=${encodeURIComponent(customerName)}&includeInactive=true`,
    { token: tokens.ADMIN },
  );
  check(
    'the record still exists and can be listed explicitly',
    '1 result, isActive false',
    `${withInactive.body?.data?.length} result, isActive ${withInactive.body?.data?.[0]?.isActive}`,
    withInactive.body?.data?.length === 1 && withInactive.body.data[0].isActive === false,
  );

  const doubleDelete = await call(`/api/customers/${customerId}`, {
    method: 'DELETE',
    token: tokens.ADMIN,
  });
  expectStatus('deactivating twice is rejected', doubleDelete.status, 409);

  // Leave the database as we found it.
  await call(`/api/customers/${customerId}/reactivate`, { method: 'POST', token: tokens.ADMIN });
  await call(`/api/customers/${customerId}`, { method: 'DELETE', token: tokens.ADMIN });

  // ------------------------------- products --------------------------------
  group('products: read');
  const productList = await call('/api/products?limit=100', { token: tokens.SALES });
  expectStatus('list products', productList.status, 200);

  // Asserted against the seeded catalogue rather than an absolute row count,
  // so a previous run's leftover records cannot break the suite.
  const SEEDED_SKUS = [
    'GRO-OIL-1L', 'GRO-RIC-25', 'GRO-ATA-10', 'GRO-DAL-05',
    'HOM-DET-04', 'HOM-DSH-750', 'HOM-FLR-05',
    'PER-SHM-500', 'PER-SOP-125', 'PER-TPT-200',
    'SNK-BIS-1K', 'SNK-NDL-48',
  ];
  const listedSkus = new Set((productList.body?.data ?? []).map((p: any) => p.sku));
  const missingSkus = SEEDED_SKUS.filter((s) => !listedSkus.has(s));
  check(
    'every seeded product is returned',
    'all 12 seeded SKUs present',
    missingSkus.length ? `missing ${missingSkus.join(', ')}` : 'all present',
    missingSkus.length === 0,
  );
  check(
    'each row carries a computed isLowStock flag',
    'boolean on every row',
    typeof productList.body?.data?.[0]?.isLowStock,
    (productList.body?.data ?? []).every((p: any) => typeof p.isLowStock === 'boolean'),
  );

  const lowStockRes = await call('/api/products/low-stock', { token: tokens.WAREHOUSE });
  const lowStockSkus = new Set((lowStockRes.body?.data ?? []).map((p: any) => p.sku));
  const SEEDED_LOW_STOCK = ['GRO-DAL-05', 'HOM-DSH-750', 'PER-TPT-200'];
  check(
    'low-stock returns the seeded low-stock products, and only genuinely low ones',
    'the 3 seeded low-stock SKUs present, every row at or below its alert level',
    `${lowStockRes.body?.data?.length} rows`,
    SEEDED_LOW_STOCK.every((s) => lowStockSkus.has(s)) &&
      (lowStockRes.body?.data ?? []).every((p: any) => p.currentStock <= p.minStockAlert),
  );

  const lowStockFilter = await call('/api/products?lowStock=true&limit=100', { token: tokens.ADMIN });
  check(
    'the lowStock filter agrees with the dedicated endpoint',
    `${lowStockRes.body?.data?.length}`,
    `${lowStockFilter.body?.meta?.total}`,
    lowStockFilter.body?.meta?.total === lowStockRes.body?.data?.length,
  );

  const categoriesRes = await call('/api/products/categories', { token: tokens.SALES });
  const categories: string[] = categoriesRes.body?.data ?? [];
  const SEEDED_CATEGORIES = ['Grocery', 'Home Care', 'Personal Care', 'Snacks'];
  check(
    'categories are distinct and alphabetically sorted',
    'contains the 4 seeded categories, no duplicates, sorted',
    JSON.stringify(categories),
    SEEDED_CATEGORIES.every((c) => categories.includes(c)) &&
      new Set(categories).size === categories.length &&
      categories.every((c, i) => i === 0 || (categories[i - 1] as string).localeCompare(c) <= 0),
  );

  const bySku = await call('/api/products?search=GRO-OIL', { token: tokens.ADMIN });
  check(
    'search matches on SKU',
    'Sunflower Oil 1L Pouch',
    `${bySku.body?.data?.[0]?.name}`,
    bySku.body?.data?.[0]?.sku === 'GRO-OIL-1L',
  );

  const oilProduct = bySku.body?.data?.[0];
  const oilId: string = oilProduct?.id;

  // --------------------------- products: write -----------------------------
  group('products: write');
  const newProduct = {
    name: `Smoke Test Widget ${RUN}`,
    sku: `smoke-test-${RUN}`,
    category: 'Test Category',
    unitPrice: 199.5,
    openingStock: 100,
    minStockAlert: 20,
    location: 'Warehouse Z - Rack 9',
  };

  const productBySales = await call('/api/products', { method: 'POST', token: tokens.SALES, body: newProduct });
  expectStatus('SALES cannot create a product', productBySales.status, 403);

  const badPrice = await call('/api/products', {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: { ...newProduct, unitPrice: 12.999 },
  });
  expectStatus('a price with 3 decimal places is rejected', badPrice.status, 400);

  const negativePrice = await call('/api/products', {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: { ...newProduct, unitPrice: -5 },
  });
  expectStatus('a negative price is rejected', negativePrice.status, 400);

  const productRes = await call('/api/products', {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: newProduct,
  });
  expectStatus('WAREHOUSE can create a product', productRes.status, 201);
  const productId: string = productRes.body?.data?.id;
  check(
    'SKU is upper-cased on create',
    `SMOKE-TEST-${RUN}`,
    String(productRes.body?.data?.sku),
    productRes.body?.data?.sku === `SMOKE-TEST-${RUN}`,
  );
  check(
    'opening stock was applied',
    '100 in stock',
    `${productRes.body?.data?.currentStock}`,
    productRes.body?.data?.currentStock === 100,
  );

  const openingMovement = await call(`/api/stock-movements?productId=${productId}`, { token: tokens.ADMIN });
  check(
    'opening stock was recorded as an auditable IN movement',
    '1 IN movement, balanceAfter 100, reason "Opening stock"',
    `${openingMovement.body?.data?.length} movement, type ${openingMovement.body?.data?.[0]?.movementType}, balanceAfter ${openingMovement.body?.data?.[0]?.balanceAfter}`,
    openingMovement.body?.data?.length === 1 &&
      openingMovement.body.data[0].movementType === 'IN' &&
      openingMovement.body.data[0].balanceAfter === 100 &&
      openingMovement.body.data[0].reason === 'Opening stock',
  );

  const duplicateSku = await call('/api/products', {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: { ...newProduct, name: 'Different Name' },
  });
  expectStatus('a duplicate SKU is rejected', duplicateSku.status, 409);

  const stockViaPatch = await call(`/api/products/${productId}`, {
    method: 'PATCH',
    token: tokens.WAREHOUSE,
    body: { currentStock: 99999 },
  });
  check(
    'currentStock cannot be set directly through PATCH',
    'stock unchanged at 100',
    `${stockViaPatch.status} -> stock ${stockViaPatch.body?.data?.currentStock}`,
    stockViaPatch.status === 400 || stockViaPatch.body?.data?.currentStock === 100,
  );

  // ---------------------------- stock movements ----------------------------
  group('stock: movements');
  const stockIn = await call(`/api/products/${productId}/stock`, {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: { quantity: 50, movementType: 'IN', reason: 'Goods received from supplier' },
  });
  expectStatus('WAREHOUSE can record an IN movement', stockIn.status, 201);
  check(
    'the IN movement raised the balance and recorded it',
    'stock 150, balanceAfter 150',
    `stock ${stockIn.body?.data?.product?.currentStock}, balanceAfter ${stockIn.body?.data?.movement?.balanceAfter}`,
    stockIn.body?.data?.product?.currentStock === 150 && stockIn.body?.data?.movement?.balanceAfter === 150,
  );

  const stockOut = await call(`/api/products/${productId}/stock`, {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: { quantity: 30, movementType: 'OUT', reason: 'Damaged in transit' },
  });
  check(
    'the OUT movement lowered the balance',
    'stock 120',
    `${stockOut.body?.data?.product?.currentStock}`,
    stockOut.body?.data?.product?.currentStock === 120,
  );

  const stockBySales = await call(`/api/products/${productId}/stock`, {
    method: 'POST',
    token: tokens.SALES,
    body: { quantity: 1, movementType: 'IN', reason: 'Should not be allowed' },
  });
  expectStatus('SALES cannot move stock', stockBySales.status, 403);

  const noReason = await call(`/api/products/${productId}/stock`, {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: { quantity: 5, movementType: 'IN' },
  });
  expectStatus('a stock movement without a reason is rejected', noReason.status, 400);

  const fractional = await call(`/api/products/${productId}/stock`, {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: { quantity: 2.5, movementType: 'IN', reason: 'Fractional units' },
  });
  expectStatus('a fractional quantity is rejected', fractional.status, 400);

  const zeroQty = await call(`/api/products/${productId}/stock`, {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: { quantity: 0, movementType: 'OUT', reason: 'Zero movement' },
  });
  expectStatus('a zero quantity is rejected', zeroQty.status, 400);

  // ------------------------ the core stock guarantee -----------------------
  group('stock: cannot go negative');
  const overdraw = await call(`/api/products/${productId}/stock`, {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: { quantity: 5000, movementType: 'OUT', reason: 'Attempt to overdraw' },
  });
  expectStatus('taking out more than exists is rejected', overdraw.status, 400);
  check(
    'the rejection names the shortfall',
    'message states requested and available',
    String(overdraw.body?.message),
    String(overdraw.body?.message ?? '').includes('5000') &&
      String(overdraw.body?.message ?? '').includes('120'),
  );
  check(
    'the rejection carries machine-readable detail',
    'insufficientStock array with shortBy',
    JSON.stringify(overdraw.body?.details ?? null),
    overdraw.body?.details?.insufficientStock?.[0]?.shortBy === 4880,
  );

  const afterOverdraw = await call(`/api/products/${productId}`, { token: tokens.ADMIN });
  check(
    'the failed movement changed nothing',
    'stock still 120',
    `${afterOverdraw.body?.data?.currentStock}`,
    afterOverdraw.body?.data?.currentStock === 120,
  );

  // Ten simultaneous requests for 20 units each against a balance of 120.
  // At most six can succeed; the guard must reject the rest.
  const concurrent = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      call(`/api/products/${productId}/stock`, {
        method: 'POST',
        token: tokens.WAREHOUSE,
        body: { quantity: 20, movementType: 'OUT', reason: `Concurrent request ${i + 1}` },
      }),
    ),
  );

  const succeeded = concurrent.filter((r) => r.status === 201).length;
  const rejected = concurrent.filter((r) => r.status === 400).length;
  const other = concurrent.filter((r) => r.status !== 201 && r.status !== 400);
  check(
    'ten concurrent withdrawals of 20 from a balance of 120',
    'exactly 6 succeed, 4 rejected, no other outcome',
    other.length
      ? `${succeeded} succeeded, ${rejected} rejected, ${other.length} errored (${other.map((r) => r.status).join(',')})`
      : `${succeeded} succeeded, ${rejected} rejected`,
    succeeded === 6 && rejected === 4,
  );

  const afterConcurrency = await call(`/api/products/${productId}`, { token: tokens.ADMIN });
  check(
    'stock landed exactly on zero, never below',
    '0',
    `${afterConcurrency.body?.data?.currentStock}`,
    afterConcurrency.body?.data?.currentStock === 0,
  );

  const ledger = await call(`/api/stock-movements?productId=${productId}&limit=100&sortOrder=asc`, {
    token: tokens.ACCOUNTS,
  });
  const movements: any[] = ledger.body?.data ?? [];
  let running = 0;
  const ledgerConsistent = movements.every((m) => {
    running += m.movementType === 'IN' ? m.quantityChanged : -m.quantityChanged;
    return m.balanceAfter === running;
  });
  check(
    'the ledger replays to the current balance with no gaps',
    'every balanceAfter matches the running total',
    `${movements.length} movements, final balance ${running}`,
    ledgerConsistent && running === 0,
  );

  // ---------------------------- ledger filters -----------------------------
  group('stock: ledger');
  const outOnly = await call(`/api/stock-movements?productId=${productId}&movementType=OUT&limit=100`, {
    token: tokens.ADMIN,
  });
  check(
    'the ledger filters by movement type',
    'only OUT rows',
    `${outOnly.body?.data?.length} rows`,
    (outOnly.body?.data ?? []).every((m: any) => m.movementType === 'OUT'),
  );

  const ledgerNoToken = await call('/api/stock-movements');
  expectStatus('the ledger requires authentication', ledgerNoToken.status, 401);

  // Clean up: deactivate the test product (its ledger rows must survive).
  const productDeleted = await call(`/api/products/${productId}`, { method: 'DELETE', token: tokens.ADMIN });
  expectStatus('ADMIN can deactivate a product', productDeleted.status, 200);

  const ledgerAfterDelete = await call(`/api/stock-movements?productId=${productId}&limit=100`, {
    token: tokens.ADMIN,
  });
  check(
    'deactivating a product preserves its stock history',
    `${movements.length} movements still present`,
    `${ledgerAfterDelete.body?.data?.length}`,
    ledgerAfterDelete.body?.data?.length === movements.length,
  );

  const moveDeactivated = await call(`/api/products/${productId}/stock`, {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: { quantity: 1, movementType: 'IN', reason: 'Into a deactivated product' },
  });
  expectStatus('a deactivated product cannot move stock', moveDeactivated.status, 409);

  // Confirm the seeded catalogue is untouched by all of the above.
  const oilAfter = await call(`/api/products/${oilId}`, { token: tokens.ADMIN });
  check(
    'the seeded catalogue was not disturbed',
    'Sunflower Oil still at 360',
    `${oilAfter.body?.data?.currentStock}`,
    oilAfter.body?.data?.currentStock === 360,
  );

  // ------------------------------- challans --------------------------------
  group('challans: drafts');

  // A dedicated product with a known balance, so the arithmetic is unambiguous.
  const challanProductRes = await call('/api/products', {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: {
      name: `Challan Test Item ${RUN}`,
      sku: `CHALLAN-TEST-A-${RUN}`,
      category: 'Test Category',
      unitPrice: 250,
      openingStock: 300,
      minStockAlert: 10,
      location: 'Warehouse Z - Rack 1',
    },
  });
  const chProductId: string = challanProductRes.body?.data?.id;

  const customerForChallan = (await call('/api/customers?search=9765443321', { token: tokens.ADMIN }))
    .body?.data?.[0];
  const chCustomerId: string = customerForChallan?.id;

  const draftByWarehouse = await call('/api/challans', {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: { customerId: chCustomerId, items: [{ productId: chProductId, quantity: 10 }] },
  });
  expectStatus('WAREHOUSE cannot raise a challan', draftByWarehouse.status, 403);

  const emptyItems = await call('/api/challans', {
    method: 'POST',
    token: tokens.SALES,
    body: { customerId: chCustomerId, items: [] },
  });
  expectStatus('a challan with no line items is rejected', emptyItems.status, 400);

  const unknownProduct = await call('/api/challans', {
    method: 'POST',
    token: tokens.SALES,
    body: { customerId: chCustomerId, items: [{ productId: 'nope', quantity: 1 }] },
  });
  expectStatus('a challan naming an unknown product is rejected', unknownProduct.status, 400);

  const draftRes = await call('/api/challans', {
    method: 'POST',
    token: tokens.SALES,
    body: {
      customerId: chCustomerId,
      items: [
        { productId: chProductId, quantity: 40 },
        { productId: chProductId, quantity: 20 },
      ],
      notes: 'Raised by the smoke test.',
    },
  });
  expectStatus('SALES can raise a draft challan', draftRes.status, 201);
  const draftId: string = draftRes.body?.data?.id;

  check(
    'the challan number follows the CH-YYYYMM-NNNN format',
    'CH-YYYYMM-NNNN',
    String(draftRes.body?.data?.challanNumber),
    /^CH-\d{6}-\d{4}$/.test(String(draftRes.body?.data?.challanNumber ?? '')),
  );
  check(
    'duplicate lines for one product are merged, not duplicated',
    '1 line of quantity 60',
    `${draftRes.body?.data?.items?.length} line(s) of quantity ${draftRes.body?.data?.items?.[0]?.quantity}`,
    draftRes.body?.data?.items?.length === 1 && draftRes.body.data.items[0].quantity === 60,
  );
  check(
    'totals are computed from the line items',
    'quantity 60, amount 15000.00',
    `quantity ${draftRes.body?.data?.totalQuantity}, amount ${draftRes.body?.data?.totalAmount}`,
    draftRes.body?.data?.totalQuantity === 60 && Number(draftRes.body?.data?.totalAmount) === 15000,
  );
  check(
    'the line stores a snapshot of the product, not just its id',
    'name, SKU, category and price all present',
    JSON.stringify({
      name: draftRes.body?.data?.items?.[0]?.productName,
      sku: draftRes.body?.data?.items?.[0]?.productSku,
      price: draftRes.body?.data?.items?.[0]?.unitPrice,
    }),
    draftRes.body?.data?.items?.[0]?.productName === `Challan Test Item ${RUN}` &&
      draftRes.body?.data?.items?.[0]?.productSku === `CHALLAN-TEST-A-${RUN}` &&
      Number(draftRes.body?.data?.items?.[0]?.unitPrice) === 250,
  );
  check(
    'the challan stores a snapshot of the customer too',
    'Arif Shaikh / Shaikh Distributors',
    `${draftRes.body?.data?.customerName} / ${draftRes.body?.data?.customerBusinessName}`,
    draftRes.body?.data?.customerName === 'Arif Shaikh' &&
      draftRes.body?.data?.customerBusinessName === 'Shaikh Distributors',
  );

  const afterDraft = await call(`/api/products/${chProductId}`, { token: tokens.ADMIN });
  check(
    'raising a draft does NOT touch stock',
    '300 still in stock',
    `${afterDraft.body?.data?.currentStock}`,
    afterDraft.body?.data?.currentStock === 300,
  );

  const draftMovements = await call(`/api/stock-movements?referenceType=CHALLAN&limit=100`, {
    token: tokens.ADMIN,
  });
  check(
    'a draft produces no stock movements',
    'no movements reference this draft',
    `${(draftMovements.body?.data ?? []).filter((m: any) => m.referenceId === draftId).length}`,
    (draftMovements.body?.data ?? []).filter((m: any) => m.referenceId === draftId).length === 0,
  );

  // ------------------------------ confirmation -----------------------------
  group('challans: confirmation');

  const confirmed = await call(`/api/challans/${draftId}/confirm`, {
    method: 'POST',
    token: tokens.WAREHOUSE,
  });
  expectStatus('WAREHOUSE can confirm a challan (they dispatch the goods)', confirmed.status, 200);
  check(
    'confirmation records who and when',
    'status CONFIRMED, confirmedBy Imran Qureshi',
    `${confirmed.body?.data?.status}, ${confirmed.body?.data?.confirmedBy?.name}`,
    confirmed.body?.data?.status === 'CONFIRMED' &&
      confirmed.body?.data?.confirmedBy?.name === 'Imran Qureshi' &&
      Boolean(confirmed.body?.data?.confirmedAt),
  );

  const afterConfirm = await call(`/api/products/${chProductId}`, { token: tokens.ADMIN });
  check(
    'confirming deducted exactly the dispatched quantity',
    '300 - 60 = 240',
    `${afterConfirm.body?.data?.currentStock}`,
    afterConfirm.body?.data?.currentStock === 240,
  );

  const confirmDetail = await call(`/api/challans/${draftId}`, { token: tokens.ACCOUNTS });
  check(
    'the challan links to the stock movements it caused',
    '1 OUT movement, balanceAfter 240',
    `${confirmDetail.body?.data?.stockMovements?.length} movement, type ${confirmDetail.body?.data?.stockMovements?.[0]?.movementType}, balanceAfter ${confirmDetail.body?.data?.stockMovements?.[0]?.balanceAfter}`,
    confirmDetail.body?.data?.stockMovements?.length === 1 &&
      confirmDetail.body.data.stockMovements[0].movementType === 'OUT' &&
      confirmDetail.body.data.stockMovements[0].balanceAfter === 240,
  );

  const doubleConfirm = await call(`/api/challans/${draftId}/confirm`, {
    method: 'POST',
    token: tokens.ADMIN,
  });
  expectStatus('confirming twice is rejected', doubleConfirm.status, 409);

  const afterDoubleConfirm = await call(`/api/products/${chProductId}`, { token: tokens.ADMIN });
  check(
    'the rejected second confirm did not deduct stock again',
    'still 240',
    `${afterDoubleConfirm.body?.data?.currentStock}`,
    afterDoubleConfirm.body?.data?.currentStock === 240,
  );

  const editConfirmed = await call(`/api/challans/${draftId}`, {
    method: 'PATCH',
    token: tokens.SALES,
    body: { notes: 'Trying to edit a confirmed challan' },
  });
  expectStatus('a confirmed challan cannot be edited', editConfirmed.status, 409);

  // ------------------- insufficient stock is atomic ------------------------
  group('challans: insufficient stock');

  const shortProductRes = await call('/api/products', {
    method: 'POST',
    token: tokens.WAREHOUSE,
    body: {
      name: `Scarce Item ${RUN}`,
      sku: `CHALLAN-TEST-B-${RUN}`,
      category: 'Test Category',
      unitPrice: 100,
      openingStock: 5,
      minStockAlert: 1,
      location: 'Warehouse Z - Rack 2',
    },
  });
  const scarceId: string = shortProductRes.body?.data?.id;

  const mixedDraft = await call('/api/challans', {
    method: 'POST',
    token: tokens.SALES,
    body: {
      customerId: chCustomerId,
      items: [
        { productId: chProductId, quantity: 10 }, // plenty available
        { productId: scarceId, quantity: 50 }, // only 5 available
      ],
    },
  });
  const mixedId: string = mixedDraft.body?.data?.id;

  const failedConfirm = await call(`/api/challans/${mixedId}/confirm`, {
    method: 'POST',
    token: tokens.SALES,
  });
  expectStatus('confirming with insufficient stock is rejected', failedConfirm.status, 400);
  check(
    'the error names the short item and the shortfall',
    'Scarce Item, need 50, have 5',
    String(failedConfirm.body?.message),
    String(failedConfirm.body?.message ?? '').includes('Scarce Item') &&
      failedConfirm.body?.details?.insufficientStock?.[0]?.shortBy === 45,
  );

  const availableAfterFail = await call(`/api/products/${chProductId}`, { token: tokens.ADMIN });
  check(
    'the AVAILABLE item on that challan was not deducted either',
    'still 240 — the whole confirm rolled back',
    `${availableAfterFail.body?.data?.currentStock}`,
    availableAfterFail.body?.data?.currentStock === 240,
  );

  const stillDraft = await call(`/api/challans/${mixedId}`, { token: tokens.ADMIN });
  check(
    'the challan stayed a DRAFT after the failed confirm',
    'DRAFT',
    String(stillDraft.body?.data?.status),
    stillDraft.body?.data?.status === 'DRAFT',
  );

  // ---------------------- concurrent confirmation --------------------------
  group('challans: concurrent confirmation');

  // Scarce Item has 5 units. Five challans each want 2 — only two can ship.
  const raceIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const res = await call('/api/challans', {
      method: 'POST',
      token: tokens.SALES,
      body: { customerId: chCustomerId, items: [{ productId: scarceId, quantity: 2 }] },
    });
    raceIds.push(res.body?.data?.id);
  }

  const raceResults = await Promise.all(
    raceIds.map((id) => call(`/api/challans/${id}/confirm`, { method: 'POST', token: tokens.SALES })),
  );

  const raceOk = raceResults.filter((r) => r.status === 200).length;
  const raceFail = raceResults.filter((r) => r.status === 400).length;
  check(
    'five simultaneous confirms for 2 units each, only 5 in stock',
    'exactly 2 confirm, 3 rejected',
    `${raceOk} confirmed, ${raceFail} rejected`,
    raceOk === 2 && raceFail === 3,
  );

  const scarceAfterRace = await call(`/api/products/${scarceId}`, { token: tokens.ADMIN });
  check(
    'the scarce product landed on 1, never below zero',
    '1',
    `${scarceAfterRace.body?.data?.currentStock}`,
    scarceAfterRace.body?.data?.currentStock === 1,
  );

  const uniqueNumbers = new Set(
    (await call('/api/challans?limit=100', { token: tokens.ADMIN })).body?.data?.map(
      (c: any) => c.challanNumber,
    ),
  );
  const allChallans = (await call('/api/challans?limit=100', { token: tokens.ADMIN })).body?.data ?? [];
  check(
    'every challan number issued is unique',
    `${allChallans.length} challans, ${allChallans.length} distinct numbers`,
    `${uniqueNumbers.size} distinct`,
    uniqueNumbers.size === allChallans.length,
  );

  // ------------------------------ cancellation -----------------------------
  group('challans: cancellation');

  const cancelBySales = await call(`/api/challans/${draftId}/cancel`, {
    method: 'POST',
    token: tokens.SALES,
    body: { reason: 'Should not be allowed' },
  });
  expectStatus('SALES cannot cancel a challan', cancelBySales.status, 403);

  const cancelNoReason = await call(`/api/challans/${draftId}/cancel`, {
    method: 'POST',
    token: tokens.ADMIN,
    body: {},
  });
  expectStatus('cancelling without a reason is rejected', cancelNoReason.status, 400);

  const cancelled = await call(`/api/challans/${draftId}/cancel`, {
    method: 'POST',
    token: tokens.ADMIN,
    body: { reason: 'Customer cancelled the order' },
  });
  expectStatus('ADMIN can cancel a confirmed challan', cancelled.status, 200);

  const afterCancel = await call(`/api/products/${chProductId}`, { token: tokens.ADMIN });
  check(
    'cancelling returned the stock',
    '240 + 60 = 300',
    `${afterCancel.body?.data?.currentStock}`,
    afterCancel.body?.data?.currentStock === 300,
  );

  const cancelDetail = await call(`/api/challans/${draftId}`, { token: tokens.ADMIN });
  check(
    'the return is recorded as an IN movement, not by deleting the OUT',
    'OUT then IN, both referencing the challan',
    (cancelDetail.body?.data?.stockMovements ?? []).map((m: any) => m.movementType).join(' then '),
    (cancelDetail.body?.data?.stockMovements ?? []).length === 2 &&
      cancelDetail.body.data.stockMovements[0].movementType === 'OUT' &&
      cancelDetail.body.data.stockMovements[1].movementType === 'IN',
  );
  check(
    'the cancellation records who, when and why',
    'reason and canceller stored',
    `${cancelDetail.body?.data?.cancelReason} — ${cancelDetail.body?.data?.cancelledBy?.name}`,
    cancelDetail.body?.data?.cancelReason === 'Customer cancelled the order' &&
      cancelDetail.body?.data?.cancelledBy?.role === 'ADMIN',
  );

  const reconfirmCancelled = await call(`/api/challans/${draftId}/confirm`, {
    method: 'POST',
    token: tokens.ADMIN,
  });
  expectStatus('a cancelled challan cannot be confirmed', reconfirmCancelled.status, 409);

  // --------------------------- snapshot integrity --------------------------
  group('challans: snapshot integrity');

  await call(`/api/products/${chProductId}`, {
    method: 'PATCH',
    token: tokens.WAREHOUSE,
    body: { name: 'RENAMED After Dispatch', unitPrice: 999 },
  });

  const afterRename = await call(`/api/challans/${draftId}`, { token: tokens.ADMIN });
  check(
    'renaming and repricing a product does NOT rewrite past challans',
    'still "Challan Test Item" at 250',
    `${afterRename.body?.data?.items?.[0]?.productName} at ${afterRename.body?.data?.items?.[0]?.unitPrice}`,
    afterRename.body?.data?.items?.[0]?.productName === `Challan Test Item ${RUN}` &&
      Number(afterRename.body?.data?.items?.[0]?.unitPrice) === 250,
  );

  const challanSummary = await call('/api/challans/summary', { token: tokens.ACCOUNTS });
  expectStatus('challan summary responds', challanSummary.status, 200);

  // Deactivate the products this run created, so repeated runs do not fill the
  // active catalogue. Their ledger rows and challans deliberately survive.
  for (const id of [chProductId, scarceId]) {
    await call(`/api/products/${id}`, { method: 'DELETE', token: tokens.ADMIN });
  }

  // -------------------------------- report ---------------------------------
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);

  console.table(
    results.map((r) => ({
      group: r.group,
      check: r.name,
      expected: r.expected,
      actual: r.actual,
      result: r.pass ? 'PASS' : 'FAIL',
    })),
  );

  if (failed.length > 0) {
    console.error(`\n[smoke] ${failed.length} of ${results.length} checks FAILED:`);
    for (const f of failed) console.error(`  - [${f.group}] ${f.name}: expected ${f.expected}, got ${f.actual}`);
    console.error('');
    process.exit(1);
  }

  console.log(`\n[smoke] all ${passed} checks passed\n`);
}

main().catch((err) => {
  console.error('[smoke] the test run itself failed:', err);
  console.error('[smoke] is the API running? Start it with: npm run dev');
  process.exit(1);
});
