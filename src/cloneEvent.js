/**
 * Returns a shallow copy of an event with a different `memo`.
 *
 * `@hebcal/core` caches (and therefore shares) holiday event instances between
 * calendars, so an event whose memo needs to change must never be mutated in
 * place — a later request would otherwise inherit the memo we generated here.
 * @param {Event} ev
 * @param {string} memo
 * @return {Event}
 */
export function cloneEventWithMemo(ev, memo) {
  const clone = Object.create(
      Object.getPrototypeOf(ev),
      Object.getOwnPropertyDescriptors(ev),
  );
  clone.memo = memo;
  return clone;
}
