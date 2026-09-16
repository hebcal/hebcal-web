import {describe, it, expect, beforeAll} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {MockMysqlDb} from './mock-mysql.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

beforeAll(() => {
  app.context.mysql = new MockMysqlDb();
});

describe('navbar account element', () => {
  it('renders the client-side-toggled account nav when Google login is enabled', async () => {
    app.context.iniConfig['hebcal.google.oauth.client_id'] = 'id';
    app.context.iniConfig['hebcal.google.oauth.client_secret'] = 'secret';
    delete app.context.iniConfig['hebcal.google.oauth.disabled'];
    const res = await request(server).get('/login');
    expect(res.status).toBe(200);
    // Both states are server-rendered identically for every viewer (cache-safe);
    // the inline script flips them based on the hu flag in the C cookie.
    expect(res.text).toContain('id="acct-signin"');
    expect(res.text).toContain('id="acct-account"');
    expect(res.text).toContain('href="/account"');
    expect(res.text).toContain('#bi-person-circle');
    expect(res.text).toContain('hu=1');
  });

  it('omits the account nav when Google login is disabled', async () => {
    app.context.iniConfig['hebcal.google.oauth.client_id'] = 'id';
    app.context.iniConfig['hebcal.google.oauth.client_secret'] = 'secret';
    app.context.iniConfig['hebcal.google.oauth.disabled'] = '1';
    const res = await request(server).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('id="acct-account"');
  });
});
