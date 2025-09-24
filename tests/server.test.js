

---


## File: `tests/server.test.js`
```js
import request from 'supertest';
import { spawn } from 'child_process';
import path from 'path';


// We import the app indirectly by starting server.js in a child process is overkill.
// Simpler: export the app from server.js; but to keep server.js minimal, we test the HTTP surface using supertest on a dynamic import.


// For this MVP, we just sanity check health and basic validation by spinning up an ephemeral server instance.


let server;


beforeAll(async () => {
const mod = await import(path.resolve('server.js'));
// server.js starts listening immediately; we cannot access app here, so we just hit the default port
});


describe('Health', () => {
it('returns ok', async () => {
const res = await request('http://localhost:3000').get('/api/health');
expect(res.status).toBe(200);
expect(res.body.status).toBe('ok');
});
});


describe('Submit validation', () => {
it('rejects bad payload', async () => {
const res = await request('http://localhost:3000').post('/api/submit').send({});
expect(res.status).toBe(400);
expect(res.body.ok).toBe(false);
});
});
