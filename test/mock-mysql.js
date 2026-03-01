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
          email_havdalah_tzeit: 0,
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
          email_candles_havdalah: 50,
          email_havdalah_tzeit: 0,
          email_sundown_candles: 18,
          email_use_elevation: 0,
        },
      },
      emailsByAddress: {
        'nobody@example.com': '01jthv2t5k88yermamssn96pze',
      },
    };
  }

  async query(sql, params) {
    // Handle SELECT queries for email verification
    if (sql.includes('SELECT') && sql.includes('hebcal_shabbat_email')) {
      if (sql.includes('WHERE email_id = ?')) {
        const subscriptionId = params;
        const row = this.mockData.subscriptions[subscriptionId];
        return row ? [row] : [];
      } else if (sql.includes('WHERE email_address = ?')) {
        const emailAddress = params;
        const subscriptionId = this.mockData.emailsByAddress[emailAddress];
        const row = subscriptionId ? this.mockData.subscriptions[subscriptionId] : null;
        return row ? [row] : [];
      }
    }

    // Handle SELECT queries for yahrzeit calendar data
    if (sql.includes('SELECT') && sql.includes('FROM yahrzeit') && !sql.includes('yahrzeit_email')) {
      const id = Array.isArray(params) ? params[0] : params;
      const row = this.mockData.yahrzeitCalendars[id];
      return row ? [row] : [];
    }

    // Handle SELECT queries for yahrzeit verification
    if (sql.includes('SELECT') && sql.includes('yahrzeit_email')) {
      // Return empty result to trigger 404 in the test
      return [];
    }

    // Handle UPDATE queries
    if (sql.includes('UPDATE hebcal_shabbat_email') || sql.includes('UPDATE yahrzeit_email')) {
      return {affectedRows: 1};
    }

    // Handle INSERT queries for email open tracking
    if (sql.includes('INSERT INTO email_open')) {
      return {insertId: 1};
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
