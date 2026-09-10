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
