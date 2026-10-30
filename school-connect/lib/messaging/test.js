// Test provider: nothing leaves the server. Every message still shows up on
// the Messages page, so you can demo the whole system to a principal before
// paying for an SMS account.
async function send({ to, channel }) {
  return { status: "test", providerRef: `TEST-${channel}-${to}` };
}

module.exports = { name: "test", send };
