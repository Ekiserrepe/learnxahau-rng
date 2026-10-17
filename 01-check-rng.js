require('dotenv').config()
const { Client } = require('xahau')

// featureRNG amendment ID, as defined in xahaud (features.macro)
const RNG_AMENDMENT = 'A482912CE1E7026F8BC5F63F5A2394768455B71CD8117104F4BFE3A7EAE1AA45'

async function checkRng() {
  const client = new Client(process.env.WSS_URL || 'wss://xahau-test.net')
  await client.connect()

  // 1. Is the RNG amendment enabled on this network?
  const { result: feature } = await client.request({ command: 'feature', feature: RNG_AMENDMENT })
  console.log(`RNG enabled: ${feature[RNG_AMENDMENT].enabled}`)

  // 2. The Random object: a singleton ledger entry holding the RNG state.
  //    ledger_entry accepts `random: true` to select it.
  const { result } = await client.request({ command: 'ledger_entry', random: true, ledger_index: 'validated' })
  const random = result.node

  console.log(`Seeded for ledger:   ${random.LedgerSequence}`)
  console.log(`Validators revealed: ${random.EntropyCount} of ${random.EntropyDenominator}`)

  // Hooks can only draw if at least 80% of the UNLReport validators revealed.
  const ok = random.EntropyCount > 0 && random.EntropyCount * 5 >= random.EntropyDenominator * 4
  console.log(`Enough entropy:      ${ok}`)

  await client.disconnect()
}

checkRng().catch(console.error)
