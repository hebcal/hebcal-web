export class MockMysqlDb {
  constructor() {
    this.mockData = {
      yahrzeitCalendars: {
        '01jthv2t5k88yermamssn96pzf': {
          contents: {
            x1: '1978-12-08', // Golda Meir's date of death
            n1: 'Golda Meir',
            t1: 'y',
            years: 20,
          },
          updated: new Date('2025-01-01'),
          downloaded: 1,
        },
      },
      // Yahrzeit email subscriptions, keyed by subscription id.
      // Mutated by INSERT/UPDATE so signup/verify flows can be exercised end-to-end.
      yahrzeitEmailSubs: {},
      subscriptions: {
        '01jthv2t5k88yermamssn96pze': {
          email_id: '01jthv2t5k88yermamssn96pze',
          email_address: 'nobody@example.com',
          email_status: 'active',
          email_created: new Date('2025-01-01'),
          email_candles_zipcode: null,
          email_candles_city: null,
          email_candles_geonameid: 3530597,
          email_candles_havdalah: 50,
          email_havdalah_degrees: null,
          email_sundown_candles: 18,
          email_use_elevation: 0,
        },
        '3fb9stfc55da9afel3aecdca': {
          email_id: '3fb9stfc55da9afel3aecdca',
          email_address: 'verify@example.com',
          email_status: 'pending',
          email_created: new Date('2025-01-01'),
          email_candles_zipcode: null,
          email_candles_city: null,
          email_candles_geonameid: 5368361,
          email_candles_havdalah: null,
          email_havdalah_degrees: 7.083,
          email_sundown_candles: 18,
          email_use_elevation: 0,
        },
      },
      emailsByAddress: {
        'nobody@example.com': '01jthv2t5k88yermamssn96pze',
      },
      // Login accounts, provider links, and sessions for "Sign in with Google".
      users: {},
      userIdentities: {}, // keyed by `${provider}\0${sub}`
      userSessions: {}, // keyed by session id
    };
  }

  /**
   * Test helper: seed a user + active session so a signed `S` cookie can be
   * exercised through loadSession().
   * @param {{userId: string, email: string, displayName?: string, sessionId: string, expires?: Date}} opts
   */
  seedSession(opts) {
    const {userId, email, displayName = null, sessionId} = opts;
    const expires = opts.expires || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    this.mockData.users[userId] = {
      id: userId, email, email_verified: 1, display_name: displayName,
      created: new Date(),
    };
    this.mockData.userSessions[sessionId] = {
      id: sessionId, user_id: userId, expires, created: new Date(),
    };
  }

  async query(sql, params) {
    // Normalize the mysql2 options-object call form: query({sql, values, timeout})
    if (sql && typeof sql === 'object' && typeof sql.sql === 'string') {
      params = sql.values;
      sql = sql.sql;
    }
    const args = Array.isArray(params) ? params : params === undefined ? [] : [params];

    // Handle SELECT queries for shabbat email verification
    if (sql.includes('SELECT') && sql.includes('hebcal_shabbat_email')) {
      if (sql.includes('WHERE email_id = ?')) {
        const subscriptionId = args[0];
        const row = this.mockData.subscriptions[subscriptionId];
        return row ? [row] : [];
      } else if (sql.includes('WHERE email_address = ?')) {
        const emailAddress = args[0];
        const subscriptionId = this.mockData.emailsByAddress[emailAddress];
        const row = subscriptionId ? this.mockData.subscriptions[subscriptionId] : null;
        return row ? [row] : [];
      }
    }

    // Handle yahrzeit verify lookup (joins yahrzeit_email + yahrzeit by subscription id)
    if (sql.includes('FROM yahrzeit_email e, yahrzeit y') && sql.includes('WHERE e.id = ?')) {
      const subId = args[0];
      const sub = this.mockData.yahrzeitEmailSubs[subId];
      if (!sub) {
        return [];
      }
      const cal = this.mockData.yahrzeitCalendars[sub.calendar_id];
      if (!cal) {
        return [];
      }
      return [{
        email_addr: sub.email_addr,
        calendar_id: sub.calendar_id,
        sub_status: sub.sub_status,
        contents: structuredClone(cal.contents),
        updated: cal.updated,
        downloaded: cal.downloaded,
      }];
    }

    // Handle existingSubByEmailAndCalendar lookup
    if (sql.includes('SELECT id, sub_status FROM yahrzeit_email')) {
      const [emailAddr, calendarId] = args;
      return Object.values(this.mockData.yahrzeitEmailSubs)
          .filter((r) => r.email_addr === emailAddr && r.calendar_id === calendarId)
          .map((r) => ({id: r.id, sub_status: r.sub_status}));
    }

    // Handle SELECT queries for yahrzeit calendar data
    if (sql.includes('SELECT') && sql.includes('FROM yahrzeit') && !sql.includes('yahrzeit_email')) {
      const id = args[0];
      const row = this.mockData.yahrzeitCalendars[id];
      if (!row) {
        return [];
      }
      return [{
        contents: structuredClone(row.contents),
        updated: row.updated,
        downloaded: row.downloaded,
      }];
    }

    // Handle remaining yahrzeit_email SELECT queries (e.g. search) — no results
    if (sql.includes('SELECT') && sql.includes('yahrzeit_email')) {
      return [];
    }

    // Handle INSERT of a new yahrzeit email subscription
    if (sql.includes('INSERT INTO yahrzeit_email')) {
      const [id, emailAddr, calendarId] = args;
      this.mockData.yahrzeitEmailSubs[id] = {
        id,
        email_addr: emailAddr,
        calendar_id: calendarId,
        sub_status: 'pending',
      };
      return {affectedRows: 1};
    }

    // Handle UPDATE of a yahrzeit email subscription status
    if (sql.includes('UPDATE yahrzeit_email')) {
      const id = args[args.length - 1];
      const sub = this.mockData.yahrzeitEmailSubs[id];
      if (sub) {
        for (const status of ['active', 'pending', 'unsub']) {
          if (sql.includes(`sub_status = '${status}'`)) {
            sub.sub_status = status;
            break;
          }
        }
      }
      return {affectedRows: 1};
    }

    // Handle UPDATE queries for shabbat email
    if (sql.includes('UPDATE hebcal_shabbat_email')) {
      return {affectedRows: 1};
    }

    // Handle INSERT queries for email open tracking
    if (sql.includes('INSERT INTO email_open')) {
      return {insertId: 1};
    }

    // ----- Login: user_session -----
    if (sql.includes('INSERT INTO user_session')) {
      const [id, userId, expires, ip, ua] = args;
      this.mockData.userSessions[id] = {
        id, user_id: userId, expires, ip, user_agent: ua, created: new Date(),
      };
      return {affectedRows: 1};
    }
    if (sql.includes('FROM user_session s') && sql.includes('JOIN user u')) {
      const sessionId = args[0];
      const s = this.mockData.userSessions[sessionId];
      if (!s) {
        return [];
      }
      const u = this.mockData.users[s.user_id];
      if (!u) {
        return [];
      }
      return [{
        user_id: s.user_id,
        expires: s.expires,
        created: s.created,
        email: u.email,
        display_name: u.display_name,
      }];
    }
    if (sql.includes('UPDATE user_session') && sql.includes('SET expires')) {
      const [newExpires, sessionId] = args;
      const s = this.mockData.userSessions[sessionId];
      if (s) {
        s.expires = newExpires;
      }
      return {affectedRows: 1};
    }
    if (sql.includes('DELETE FROM user_session')) {
      delete this.mockData.userSessions[args[0]];
      return {affectedRows: 1};
    }

    // ----- Login: user_identity -----
    if (sql.includes('SELECT user_id FROM user_identity')) {
      const [provider, sub] = args;
      const row = this.mockData.userIdentities[`${provider}\0${sub}`];
      return row ? [{user_id: row.user_id}] : [];
    }
    if (sql.includes('UPDATE user_identity')) {
      const [email, provider, sub] = args;
      const row = this.mockData.userIdentities[`${provider}\0${sub}`];
      if (row) {
        row.email = email;
      }
      return {affectedRows: 1};
    }
    if (sql.includes('INSERT INTO user_identity')) {
      const [provider, sub, userId, email] = args;
      this.mockData.userIdentities[`${provider}\0${sub}`] = {
        provider, provider_sub: sub, user_id: userId, email,
      };
      return {affectedRows: 1};
    }

    // ----- Login: user -----
    if (sql.includes('SELECT id FROM user WHERE email')) {
      const email = args[0];
      const found = Object.values(this.mockData.users).find((u) => u.email === email);
      return found ? [{id: found.id}] : [];
    }
    if (sql.includes('INSERT INTO user ')) {
      const [id, email, emailVerified, displayName] = args;
      this.mockData.users[id] = {
        id, email, email_verified: emailVerified, display_name: displayName,
        created: new Date(),
      };
      return {affectedRows: 1};
    }

    // Default: return empty array
    return [];
  }

  async execute(...params) {
    return this.query(...params);
  }

  async query2(ctx, options) {
    return await this.query(options.sql, options.values);
  }

  async execute2(ctx, options) {
    return this.query2(ctx, options);
  }

  async close() {
    return true;
  }
}
