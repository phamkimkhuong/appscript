/** Deterministic business time for tests; never loaded into Apps Script. */
function fixedDate(iso) {
  return class extends Date {
    constructor(...args) { if(args.length) super(...args); else super(iso); }
    static now() { return Date.parse(iso); }
  };
}
module.exports = {fixedDate};
