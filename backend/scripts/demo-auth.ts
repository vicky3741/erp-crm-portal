/**
 * Narrated walkthrough of authentication and role-based access.
 *
 * Run with:  npm run demo:auth        (with the API running)
 *
 * Unlike the smoke test, which asserts and reports pass/fail, this prints the
 * request and the response for each step in the order someone reviewing the
 * API would want to see them, so the behaviour is visible rather than described.
 */
const BASE = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const line = (char = '-') => console.log(char.repeat(78));

function heading(step: number, title: string) {
  console.log('');
  line('=');
  console.log(`  STEP ${step}  ${title}`);
  line('=');
}

interface CallOptions {
  method?: string;
  token?: string;
  body?: unknown;
}

async function show(label: string, path: string, options: CallOptions = {}) {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  console.log(`\n  ${label}`);
  console.log(`  → ${method} ${path}`);
  if (options.token) console.log(`     Authorization: Bearer ${options.token.slice(0, 24)}...`);
  if (options.body !== undefined) console.log(`     body: ${JSON.stringify(options.body)}`);

  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const elapsed = Date.now() - started;

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }

  const verdict = res.status < 400 ? 'OK' : 'REJECTED';
  console.log(`  ← ${res.status} ${verdict}   (${elapsed}ms)`);
  console.log(`     ${JSON.stringify(forDisplay(body))}`);

  return { status: res.status, body };
}

/**
 * Trims the response for on-screen readability: drops the development-only
 * stack trace and shortens JWTs, which are otherwise long enough to wrap the
 * terminal several times over.
 */
function forDisplay(body: any): unknown {
  if (body === null || typeof body !== 'object') return body;

  const { stack, ...rest } = body as Record<string, unknown>;

  if (rest.data && typeof rest.data === 'object') {
    const data = rest.data as Record<string, unknown>;
    if (typeof data.token === 'string') {
      rest.data = { ...data, token: `${data.token.slice(0, 20)}...<${data.token.length} chars>` };
    }
  }

  return rest;
}

async function main() {
  console.log(`\n  Authentication and role-based access walkthrough`);
  console.log(`  API: ${BASE}`);

  // -------------------------------------------------------------------------
  heading(1, 'A wrong password is rejected');
  const wrongPassword = await show('Correct email, wrong password:', '/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@erp.local', password: 'WrongPassword' },
  });

  const unknownEmail = await show('An email that does not exist at all:', '/api/auth/login', {
    method: 'POST',
    body: { email: 'attacker@nowhere.com', password: 'WrongPassword' },
  });

  console.log('');
  console.log('  Both return the SAME message:');
  console.log(`    wrong password -> "${wrongPassword.body?.message}"`);
  console.log(`    unknown email  -> "${unknownEmail.body?.message}"`);
  console.log('  If these differed, an attacker could discover which company emails');
  console.log('  are real accounts. Timing is equalised too - an unknown email is');
  console.log('  still compared against a dummy bcrypt hash.');

  // -------------------------------------------------------------------------
  heading(2, 'Bad input is rejected before it reaches any handler');
  await show('Empty body:', '/api/auth/login', { method: 'POST', body: {} });
  await show('Malformed email:', '/api/auth/login', {
    method: 'POST',
    body: { email: 'not-an-email', password: 'x' },
  });

  console.log('');
  console.log('  Zod validates and REPLACES the request body, so unknown fields are');
  console.log('  stripped. A client cannot smuggle "role": "ADMIN" into a login call.');

  // -------------------------------------------------------------------------
  heading(3, 'A protected route needs a valid token');
  await show('No Authorization header:', '/api/auth/me');
  await show('A token that is not a JWT:', '/api/auth/me', { token: 'this.is.not.a.jwt' });
  await show('A JWT signed with someone else\'s secret:', '/api/auth/me', {
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIiwicm9sZSI6IkFETUlOIn0.' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  });

  console.log('');
  console.log('  The forged token claims "role": "ADMIN" in its payload, but the');
  console.log('  signature does not verify against our secret, so it never gets in.');

  // -------------------------------------------------------------------------
  heading(4, 'Logging in as each role');
  const credentials = [
    { role: 'ADMIN', email: 'admin@erp.local', password: 'Admin@123' },
    { role: 'SALES', email: 'sales@erp.local', password: 'Sales@123' },
    { role: 'WAREHOUSE', email: 'warehouse@erp.local', password: 'Warehouse@123' },
    { role: 'ACCOUNTS', email: 'accounts@erp.local', password: 'Accounts@123' },
  ];

  const tokens: Record<string, string> = {};

  for (const cred of credentials) {
    const res = await show(`${cred.role}:`, '/api/auth/login', {
      method: 'POST',
      body: { email: cred.email, password: cred.password },
    });
    if (res.body?.data?.token) tokens[cred.role] = res.body.data.token;
  }

  console.log('');
  console.log('  Note what is NOT in those responses: no password, no password hash.');

  // -------------------------------------------------------------------------
  heading(5, 'Same route, different roles - authorisation in action');
  console.log('\n  GET /api/auth/admin-check is declared as:');
  console.log('      authenticate, authorize(\'ADMIN\')');

  await show('ADMIN calls it:', '/api/auth/admin-check', { token: tokens.ADMIN });

  for (const role of ['SALES', 'WAREHOUSE', 'ACCOUNTS']) {
    await show(`${role} calls the very same route:`, '/api/auth/admin-check', { token: tokens[role] });
  }

  console.log('');
  console.log('  Every one of those requests carried a VALID token for a REAL user.');
  console.log('  Authentication succeeded; authorisation is what stopped them, and');
  console.log('  the error names the role that would have been accepted.');

  console.log('');
  line('=');
  console.log('  Walkthrough complete.');
  line('=');
  console.log('');
}

main().catch((err) => {
  console.error('\n  The walkthrough could not run:', err instanceof Error ? err.message : err);
  console.error('  Is the API running? Start it with:  npm run dev:backend\n');
  process.exit(1);
});
