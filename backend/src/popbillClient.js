const popbill = require('popbill');

popbill.config({
  LinkID: process.env.POPBILL_LINK_ID,
  SecretKey: process.env.POPBILL_SECRET_KEY,
  IsTest: process.env.POPBILL_IS_TEST !== 'false',
  IPRestrictOnOff: true,
  UseStaticIP: false,
  UseLocalTimeYN: true,
  defaultErrorHandler: function (Error) {
    console.error('[popbill]', Error.code, Error.message);
  },
});

const taxinvoiceService = popbill.TaxinvoiceService();

module.exports = { popbill, taxinvoiceService };
