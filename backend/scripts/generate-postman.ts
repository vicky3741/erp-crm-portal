/**
 * Generates the Postman collection from a single declaration of the API.
 *
 * Run with:  npm run postman
 * Output:    postman/ERP-CRM.postman_collection.json
 *
 * Generated rather than hand-maintained so the collection cannot drift away
 * from the routes as they change: one list, one source of truth.
 *
 * The login requests carry a test script that captures the returned token into
 * a collection variable, so importing the collection and hitting "Login as
 * Admin" is enough to make every other request work.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Req {
  name: string;
  method: Method;
  /** Path after /api, e.g. "customers/:id". Query strings are allowed. */
  path: string;
  description: string;
  body?: unknown;
  /** Which collection variable holds the token for this request. */
  tokenVar?: string;
  /** Postman test script lines. */
  test?: string[];
  /** Marks a request that is expected to fail, for demonstrating error handling. */
  expectFailure?: boolean;
}

interface Folder {
  name: string;
  description: string;
  requests: Req[];
}

const loginTest = (variable: string) => [
  'const body = pm.response.json();',
  'pm.test("login succeeded", () => pm.response.to.have.status(200));',
  'if (body.success && body.data && body.data.token) {',
  `  pm.collectionVariables.set("${variable}", body.data.token);`,
  '  pm.collectionVariables.set("token", body.data.token);',
  `  console.log("Saved ${variable}");`,
  '}',
];

const folders: Folder[] = [
  {
    name: '1. Authentication',
    description:
      'Start here. Running "Login as Admin" stores the token in the {{token}} collection ' +
      'variable, which every other request uses automatically.',
    requests: [
      {
        name: 'Login as Admin',
        method: 'POST',
        path: 'auth/login',
        description: 'Exchanges credentials for a JWT and saves it to {{adminToken}} and {{token}}.',
        body: { email: 'admin@erp.local', password: 'Admin@123' },
        test: loginTest('adminToken'),
      },
      {
        name: 'Login as Sales',
        method: 'POST',
        path: 'auth/login',
        description: 'Saves the token to {{salesToken}} and {{token}}.',
        body: { email: 'sales@erp.local', password: 'Sales@123' },
        test: loginTest('salesToken'),
      },
      {
        name: 'Login as Warehouse',
        method: 'POST',
        path: 'auth/login',
        description: 'Saves the token to {{warehouseToken}} and {{token}}.',
        body: { email: 'warehouse@erp.local', password: 'Warehouse@123' },
        test: loginTest('warehouseToken'),
      },
      {
        name: 'Login as Accounts',
        method: 'POST',
        path: 'auth/login',
        description: 'Saves the token to {{accountsToken}} and {{token}}.',
        body: { email: 'accounts@erp.local', password: 'Accounts@123' },
        test: loginTest('accountsToken'),
      },
      {
        name: 'Current user',
        method: 'GET',
        path: 'auth/me',
        description: 'Profile of whoever the current {{token}} belongs to.',
      },
      {
        name: 'Logout',
        method: 'POST',
        path: 'auth/logout',
        description: 'JWTs are stateless, so the client discards the token. Documented endpoint for the frontend.',
      },
      {
        name: 'Admin-only route (as Admin)',
        method: 'GET',
        path: 'auth/admin-check',
        description: 'Succeeds: the ADMIN role is allowed.',
        tokenVar: 'adminToken',
      },
      {
        name: 'Admin-only route (as Sales) - expect 403',
        method: 'GET',
        path: 'auth/admin-check',
        description:
          'A VALID token for a REAL user, rejected by authorisation rather than authentication. ' +
          'The message names the role that would have been accepted.',
        tokenVar: 'salesToken',
        expectFailure: true,
      },
      {
        name: 'Wrong password - expect 401',
        method: 'POST',
        path: 'auth/login',
        description:
          'Returns the same message as an unknown email, and takes the same time, so response ' +
          'behaviour cannot be used to discover which accounts exist.',
        body: { email: 'admin@erp.local', password: 'WrongPassword' },
        expectFailure: true,
      },
    ],
  },
  {
    name: '2. Customers (CRM)',
    description: 'Read is open to every role. Create and update need ADMIN or SALES; deactivate needs ADMIN.',
    requests: [
      {
        name: 'List customers',
        method: 'GET',
        path: 'customers?page=1&limit=10&sortBy=createdAt&sortOrder=desc',
        description: 'Paginated. Response carries a meta block with total, totalPages and next/prev flags.',
      },
      {
        name: 'Search customers',
        method: 'GET',
        path: 'customers?search=joshi',
        description: 'Case-insensitive across name, mobile, email, business name and GST number.',
      },
      {
        name: 'Filter by status and type',
        method: 'GET',
        path: 'customers?status=LEAD&customerType=WHOLESALE',
        description: 'Filters combine.',
      },
      {
        name: 'Follow-ups due',
        method: 'GET',
        path: 'customers?followUpDue=true',
        description: 'Customers whose follow-up date has arrived or passed.',
      },
      {
        name: 'Customer summary',
        method: 'GET',
        path: 'customers/summary',
        description: 'Counts for the dashboard.',
      },
      {
        name: 'Create customer',
        method: 'POST',
        path: 'customers',
        description: 'Saves the new id to {{customerId}} for the requests below.',
        tokenVar: 'salesToken',
        body: {
          name: 'Postman Test Customer',
          mobile: '9800000001',
          email: 'postman@example.com',
          businessName: 'Postman Traders',
          gstNumber: '27AABCP1234C1ZV',
          customerType: 'WHOLESALE',
          address: 'Plot 9, Test Estate, Pune 411001',
          status: 'LEAD',
          notes: 'Created from the Postman collection.',
        },
        test: [
          'const body = pm.response.json();',
          'if (body.success) pm.collectionVariables.set("customerId", body.data.id);',
        ],
      },
      {
        name: 'Get customer detail',
        method: 'GET',
        path: 'customers/{{customerId}}',
        description: 'Includes follow-up notes and the customer’s recent challans.',
      },
      {
        name: 'Update customer',
        method: 'PATCH',
        path: 'customers/{{customerId}}',
        description: 'Partial update. Omitted fields are left alone, never reset to a default.',
        tokenVar: 'salesToken',
        body: { status: 'ACTIVE', notes: 'Converted from lead.' },
      },
      {
        name: 'Add follow-up note',
        method: 'POST',
        path: 'customers/{{customerId}}/followups',
        description: 'Optionally reschedules the customer’s next follow-up in the same call.',
        tokenVar: 'salesToken',
        body: { note: 'Called and shared the price list.', followUpDate: '2026-11-01' },
      },
      {
        name: 'List follow-ups',
        method: 'GET',
        path: 'customers/{{customerId}}/followups',
        description: 'Paginated, newest first.',
      },
      {
        name: 'Create with invalid mobile - expect 400',
        method: 'POST',
        path: 'customers',
        description: 'Validation names the offending field.',
        tokenVar: 'salesToken',
        body: {
          name: 'Bad Data',
          mobile: '12345',
          email: 'not-an-email',
          businessName: 'X',
          customerType: 'RETAIL',
          address: 'Somewhere',
        },
        expectFailure: true,
      },
      {
        name: 'Create as Warehouse - expect 403',
        method: 'POST',
        path: 'customers',
        description: 'The warehouse can read customers but not create them.',
        tokenVar: 'warehouseToken',
        body: {
          name: 'Should Not Be Created',
          mobile: '9800000009',
          email: 'nope@example.com',
          businessName: 'Nope',
          customerType: 'RETAIL',
          address: 'Nowhere',
        },
        expectFailure: true,
      },
      {
        name: 'Deactivate customer',
        method: 'DELETE',
        path: 'customers/{{customerId}}',
        description: 'Soft delete: the row survives because challans reference it.',
        tokenVar: 'adminToken',
      },
    ],
  },
  {
    name: '3. Products & Inventory',
    description: 'Read is open to every role. Create, update and stock movements need ADMIN or WAREHOUSE.',
    requests: [
      {
        name: 'List products',
        method: 'GET',
        path: 'products?page=1&limit=10',
        description: 'Every row carries a computed isLowStock flag.',
      },
      {
        name: 'Search products',
        method: 'GET',
        path: 'products?search=oil',
        description: 'Matches name, SKU, category and location.',
      },
      {
        name: 'Low stock only',
        method: 'GET',
        path: 'products?lowStock=true',
        description: 'Products at or below their alert level.',
      },
      {
        name: 'Low stock (dedicated endpoint)',
        method: 'GET',
        path: 'products/low-stock',
        description: 'Same set, with a shortBy figure per product.',
      },
      {
        name: 'Categories',
        method: 'GET',
        path: 'products/categories',
        description: 'Distinct categories, for filter dropdowns.',
      },
      {
        name: 'Product summary',
        method: 'GET',
        path: 'products/summary',
        description: 'Counts for the dashboard.',
      },
      {
        name: 'Create product',
        method: 'POST',
        path: 'products',
        description:
          'Opening stock is applied as an IN movement rather than written into the column, so ' +
          'the first balance a product has is explained by a ledger row. Saves {{productId}}.',
        tokenVar: 'warehouseToken',
        body: {
          name: 'Postman Test Product',
          sku: 'POSTMAN-001',
          category: 'Test Category',
          unitPrice: 250,
          openingStock: 300,
          minStockAlert: 50,
          location: 'Warehouse Z - Rack 1',
        },
        test: [
          'const body = pm.response.json();',
          'if (body.success) pm.collectionVariables.set("productId", body.data.id);',
        ],
      },
      {
        name: 'Get product detail',
        method: 'GET',
        path: 'products/{{productId}}',
        description: 'Includes the product’s most recent stock movements.',
      },
      {
        name: 'Stock IN',
        method: 'POST',
        path: 'products/{{productId}}/stock',
        description: 'Goods received. Returns the new balance and the movement it wrote.',
        tokenVar: 'warehouseToken',
        body: { quantity: 50, movementType: 'IN', reason: 'Goods received from supplier' },
      },
      {
        name: 'Stock OUT',
        method: 'POST',
        path: 'products/{{productId}}/stock',
        description: 'Damage or a stock-count correction.',
        tokenVar: 'warehouseToken',
        body: { quantity: 30, movementType: 'OUT', reason: 'Damaged in transit' },
      },
      {
        name: 'Stock OUT beyond available - expect 400',
        method: 'POST',
        path: 'products/{{productId}}/stock',
        description:
          'The guard lives in the SQL WHERE clause, so the database rejects it at write time. ' +
          'The response carries the requested amount, the available amount and the shortfall.',
        tokenVar: 'warehouseToken',
        body: { quantity: 999999, movementType: 'OUT', reason: 'Attempt to overdraw' },
        expectFailure: true,
      },
      {
        name: 'Stock movement as Sales - expect 403',
        method: 'POST',
        path: 'products/{{productId}}/stock',
        description: 'Sales can see stock but cannot move it.',
        tokenVar: 'salesToken',
        body: { quantity: 1, movementType: 'IN', reason: 'Should not be allowed' },
        expectFailure: true,
      },
      {
        name: 'Update product',
        method: 'PATCH',
        path: 'products/{{productId}}',
        description: 'currentStock is deliberately absent from this schema - stock only moves via a movement.',
        tokenVar: 'warehouseToken',
        body: { unitPrice: 275, minStockAlert: 60 },
      },
    ],
  },
  {
    name: '4. Stock Ledger',
    description: 'Read-only over HTTP. Rows are only ever written by the transaction that changed the stock.',
    requests: [
      {
        name: 'All movements',
        method: 'GET',
        path: 'stock-movements?page=1&limit=20',
        description: 'Every movement records the balance immediately after it.',
      },
      {
        name: 'Movements for one product',
        method: 'GET',
        path: 'stock-movements?productId={{productId}}&sortOrder=asc',
        description: 'Oldest first, so the balances read as a running total.',
      },
      {
        name: 'OUT movements only',
        method: 'GET',
        path: 'stock-movements?movementType=OUT',
        description: 'Filter by direction.',
      },
      {
        name: 'Movements caused by challans',
        method: 'GET',
        path: 'stock-movements?referenceType=CHALLAN',
        description: 'Each row points back at the challan that caused it.',
      },
      {
        name: 'Ledger summary',
        method: 'GET',
        path: 'stock-movements/summary',
        description: 'Movement counts by direction.',
      },
    ],
  },
  {
    name: '5. Sales Challans',
    description:
      'Run these in order. Raise a draft, watch stock stay untouched, confirm it, watch stock drop, ' +
      'then cancel it and watch stock come back.',
    requests: [
      {
        name: 'List challans',
        method: 'GET',
        path: 'challans?page=1&limit=10',
        description: 'Filterable by status, customer and date range.',
      },
      {
        name: 'Challan summary',
        method: 'GET',
        path: 'challans/summary',
        description: 'Counts by status plus the total confirmed value.',
      },
      {
        name: 'Step 1 - Raise a DRAFT challan',
        method: 'POST',
        path: 'challans',
        description:
          'A draft reserves nothing: stock is untouched until it is confirmed. Note that each line ' +
          'stores the product name, SKU and price, not just the product id. Saves {{challanId}}.',
        tokenVar: 'salesToken',
        body: {
          customerId: '{{customerId}}',
          items: [{ productId: '{{productId}}', quantity: 60 }],
          notes: 'Raised from the Postman collection.',
        },
        test: [
          'const body = pm.response.json();',
          'if (body.success) pm.collectionVariables.set("challanId", body.data.id);',
        ],
      },
      {
        name: 'Step 2 - Check stock is UNCHANGED',
        method: 'GET',
        path: 'products/{{productId}}',
        description: 'Still at its previous balance. Drafts do not reserve stock.',
      },
      {
        name: 'Step 3 - Confirm the challan',
        method: 'POST',
        path: 'challans/{{challanId}}/confirm',
        description:
          'One transaction: check every line, deduct each one, write the OUT movements, flip the ' +
          'status. All of it or none of it.',
        tokenVar: 'warehouseToken',
      },
      {
        name: 'Step 4 - Check stock has DROPPED',
        method: 'GET',
        path: 'products/{{productId}}',
        description: 'Reduced by exactly the dispatched quantity.',
      },
      {
        name: 'Step 5 - See the movements it caused',
        method: 'GET',
        path: 'challans/{{challanId}}',
        description: 'The challan detail lists the stock movements it produced, with balances.',
      },
      {
        name: 'Confirm again - expect 409',
        method: 'POST',
        path: 'challans/{{challanId}}/confirm',
        description: 'Already confirmed. Stock is not deducted a second time.',
        tokenVar: 'adminToken',
        expectFailure: true,
      },
      {
        name: 'Edit a confirmed challan - expect 409',
        method: 'PATCH',
        path: 'challans/{{challanId}}',
        description: 'Confirmed challans are immutable. Cancel and raise a new one instead.',
        tokenVar: 'salesToken',
        body: { notes: 'Trying to edit after dispatch' },
        expectFailure: true,
      },
      {
        name: 'Raise a challan beyond available stock - expect 400',
        method: 'POST',
        path: 'challans',
        description:
          'Create-and-confirm in one call. The response names every short item with its shortfall, ' +
          'and nothing is deducted - not even the lines that were available.',
        tokenVar: 'salesToken',
        body: {
          customerId: '{{customerId}}',
          items: [{ productId: '{{productId}}', quantity: 999999 }],
          confirm: true,
        },
        expectFailure: true,
      },
      {
        name: 'Step 6 - Cancel the challan',
        method: 'POST',
        path: 'challans/{{challanId}}/cancel',
        description:
          'Returns the stock as IN movements referencing the challan. Nothing is deleted to make ' +
          'the numbers work.',
        tokenVar: 'adminToken',
        body: { reason: 'Customer cancelled the order' },
      },
      {
        name: 'Step 7 - Check stock has COME BACK',
        method: 'GET',
        path: 'products/{{productId}}',
        description: 'Back to the balance it had before confirmation.',
      },
    ],
  },
  {
    name: '6. Health',
    description: 'Used by the hosting platform and by the frontend.',
    requests: [
      {
        name: 'Health check',
        method: 'GET',
        path: 'health',
        description: 'Reports database reachability. Returns 503 if the database is down.',
      },
      {
        name: 'API index',
        method: 'GET',
        path: '',
        description: 'Lists every endpoint in the API.',
      },
    ],
  },
];

function buildRequest(req: Req) {
  const [rawPath, query] = req.path.split('?');
  const segments = (rawPath ?? '').split('/').filter(Boolean);

  const url: Record<string, unknown> = {
    raw: `{{baseUrl}}/api/${req.path}`,
    host: ['{{baseUrl}}'],
    path: ['api', ...segments],
  };

  if (query) {
    url.query = query.split('&').map((pair) => {
      const [key, value] = pair.split('=');
      return { key, value: value ?? '' };
    });
  }

  const token = req.tokenVar ? `{{${req.tokenVar}}}` : '{{token}}';

  const events: unknown[] = [];
  if (req.test) {
    events.push({ listen: 'test', script: { type: 'text/javascript', exec: req.test } });
  }

  return {
    name: req.name,
    ...(events.length ? { event: events } : {}),
    request: {
      method: req.method,
      header: [
        { key: 'Content-Type', value: 'application/json' },
        ...(req.path.startsWith('auth/login') || req.path === 'health' || req.path === ''
          ? []
          : [{ key: 'Authorization', value: `Bearer ${token}` }]),
      ],
      ...(req.body !== undefined
        ? { body: { mode: 'raw', raw: JSON.stringify(req.body, null, 2), options: { raw: { language: 'json' } } } }
        : {}),
      url,
      description:
        req.description + (req.expectFailure ? '\n\nThis request is EXPECTED TO FAIL - that is the point.' : ''),
    },
  };
}

const collection = {
  info: {
    name: 'ERP + CRM Operations Portal',
    _postman_id: 'erp-crm-operations-portal',
    description:
      'REST API for a wholesale/distribution ERP and CRM.\n\n' +
      '## Getting started\n\n' +
      '1. Set the `baseUrl` variable (defaults to http://localhost:4000).\n' +
      '2. Run **1. Authentication -> Login as Admin**. The token is captured automatically into ' +
      '`{{token}}`, so every other request works straight away.\n' +
      '3. Run the other login requests too if you want to exercise role restrictions - they save ' +
      '`{{adminToken}}`, `{{salesToken}}`, `{{warehouseToken}}` and `{{accountsToken}}`.\n\n' +
      '## Reading the folders\n\n' +
      'Requests whose name ends in "expect 4xx" are meant to fail. They demonstrate validation, ' +
      'authorisation and the stock guard, and are as much a part of the API as the happy paths.\n\n' +
      'Folder 5 is a numbered walkthrough: raise a draft, confirm it, watch stock drop, cancel it, ' +
      'watch stock return.\n\n' +
      '## Response shape\n\n' +
      'Success: `{ "success": true, "data": ..., "meta": ..., "message": ... }`\n' +
      'Failure: `{ "success": false, "message": ..., "details": ... }`\n\n' +
      '## Test credentials\n\n' +
      '| Role | Email | Password |\n' +
      '| --- | --- | --- |\n' +
      '| Admin | admin@erp.local | Admin@123 |\n' +
      '| Sales | sales@erp.local | Sales@123 |\n' +
      '| Warehouse | warehouse@erp.local | Warehouse@123 |\n' +
      '| Accounts | accounts@erp.local | Accounts@123 |',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: folders.map((folder) => ({
    name: folder.name,
    description: folder.description,
    item: folder.requests.map(buildRequest),
  })),
  variable: [
    { key: 'baseUrl', value: 'http://localhost:4000', type: 'string' },
    { key: 'token', value: '', type: 'string' },
    { key: 'adminToken', value: '', type: 'string' },
    { key: 'salesToken', value: '', type: 'string' },
    { key: 'warehouseToken', value: '', type: 'string' },
    { key: 'accountsToken', value: '', type: 'string' },
    { key: 'customerId', value: '', type: 'string' },
    { key: 'productId', value: '', type: 'string' },
    { key: 'challanId', value: '', type: 'string' },
  ],
};

const outPath = resolve(__dirname, '../../postman/ERP-CRM.postman_collection.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');

const requestCount = folders.reduce((sum, f) => sum + f.requests.length, 0);
console.log(`[postman] wrote ${requestCount} requests across ${folders.length} folders`);
console.log(`[postman] ${outPath}`);
