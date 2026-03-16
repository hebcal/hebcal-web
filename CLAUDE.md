# CLAUDE.md

## Testing Before Commit/Push

Always run unit tests to confirm everything works without breakage before committing or pushing code.

### Setup (required before first test run)

1. Install dependencies:
   ```
   npm install
   ```

2. Build generated files (e.g. `*.po.js` files):
   ```
   npm run build
   ```

3. Create test SQLite databases:
   ```
   node_modules/@hebcal/geo-sqlite/bin/make-test-dbs
   ```

### Run Tests

```
npm test
```

All tests must pass before committing or pushing.
