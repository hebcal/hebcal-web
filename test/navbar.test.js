import {describe, it, expect, beforeAll, beforeEach} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {MockMysqlDb} from './mock-mysql.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

beforeAll(() => {
  app.context.mysql = new MockMysqlDb();
});

/**
 * The account nav is gated on ctx.state.loginEnabled -- ANY provider, not
 * Google specifically -- so a test about its absence has to silence every
 * provider, or it only passes on a machine with no Apple config.
 */
function disableAllProviders() {
  for (const key of [
    'hebcal.google.oauth.client_id',
    'hebcal.google.oauth.client_secret',
    'hebcal.apple.oauth.client_id',
    'hebcal.apple.oauth.team_id',
    'hebcal.apple.oauth.key_id',
    'hebcal.apple.oauth.private_key',
    'hebcal.apple.oauth.private_key_file',
  ]) {
    delete app.context.iniConfig[key];
  }
}

describe('navbar account element', () => {
  beforeEach(() => {
    disableAllProviders();
  });

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

  it('omits the account nav when no provider is enabled', async () => {
    app.context.iniConfig['hebcal.google.oauth.client_id'] = 'id';
    app.context.iniConfig['hebcal.google.oauth.client_secret'] = 'secret';
    app.context.iniConfig['hebcal.google.oauth.disabled'] = '1';
    const res = await request(server).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('id="acct-account"');
  });

  it('renders the account nav when only Apple is enabled', async () => {
    // The nav belongs to the session, not to any one provider, so turning
    // Google off while Apple is on must not take it away.
    app.context.iniConfig['hebcal.google.oauth.disabled'] = '1';
    app.context.iniConfig['hebcal.apple.oauth.client_id'] = 'com.hebcal.web';
    app.context.iniConfig['hebcal.apple.oauth.team_id'] = 'TEAM123456';
    app.context.iniConfig['hebcal.apple.oauth.key_id'] = 'KEY1234567';
    app.context.iniConfig['hebcal.apple.oauth.private_key_file'] = '/nonexistent.p8';
    const res = await request(server).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="acct-account"');
    expect(res.text).not.toContain('Sign in with Google');
    expect(res.text).toContain('Sign in with Apple');
  });
});
