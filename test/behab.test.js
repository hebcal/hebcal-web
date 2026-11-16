import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

const BEHAB_TITLE = 'Ta’anit BeHaB';

describe('bhb (Ta\'anit BeHaB) JSON option', () => {
  it('includes the BeHaB fast when bhb=on', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&year=2026&bhb=on&cfg=json');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
    const behab = response.body.items.filter((ev) => ev.title === BEHAB_TITLE);
    expect(behab.length).toBeGreaterThan(0);
    const item = behab.find((ev) => ev.date === '2026-10-19');
    expect(item).toMatchObject({
      title: BEHAB_TITLE,
      date: '2026-10-19',
      hdate: '8 Cheshvan 5787',
      category: 'holiday',
      subcat: 'fast',
      title_orig: 'Ta\'anit BeHaB',
      hebrew: 'תענית בה״ב',
    });
  });

  it('omits the BeHaB fast when bhb is not set', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&year=2026&cfg=json');
    expect(response.status).toBe(200);
    const item = response.body.items.find((ev) => ev.title === BEHAB_TITLE);
    expect(item).toBeUndefined();
  });
});
