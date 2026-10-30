// Every messaging provider implements one function:
//
//   send({ to, body, channel: "sms" | "whatsapp" }) -> { status, providerRef }
//
// Adding a local provider later (e.g. a Digicel/Flow bulk-SMS gateway) means
// writing one new file here and switching MESSAGING_PROVIDER in .env.

const providers = {
  test: require("./test"),
  twilio: require("./twilio"),
};

function getProvider() {
  const name = (process.env.MESSAGING_PROVIDER || "test").toLowerCase();
  return providers[name] || providers.test;
}

module.exports = { getProvider };
