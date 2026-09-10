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
  const newCustomer = {
    name: 'Smoke Test Customer',
    mobile: '9812345678',
    email: 'Smoke.Test@Example.COM',
    businessName: 'Smoke Test Traders',
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
    'smoke.test@example.com',
    String(createdRes.body?.data?.email),
    createdRes.body?.data?.email === 'smoke.test@example.com',
  );

  const duplicate = await call('/api/customers', {
    method: 'POST',
    token: tokens.SALES,
    body: { ...newCustomer, email: 'different@example.com' },
  });
  expectStatus('a duplicate mobile number is rejected', duplicate.status, 409);
  check(
    'the duplicate error names the existing customer',
    'message mentions Smoke Test Customer',
    String(duplicate.body?.message),
    String(duplicate.body?.message ?? '').includes('Smoke Test Customer'),
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
    updated.body?.data?.status === 'ACTIVE' && updated.body?.data?.name === 'Smoke Test Customer',
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

  const afterDelete = await call('/api/customers?search=Smoke Test Customer', { token: tokens.ADMIN });
  check(
    'a deactivated customer is hidden from the default list',
    '0 results',
    `${afterDelete.body?.data?.length}`,
    afterDelete.body?.data?.length === 0,
  );

  const withInactive = await call('/api/customers?search=Smoke Test Customer&includeInactive=true', {
    token: tokens.ADMIN,
  });
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
