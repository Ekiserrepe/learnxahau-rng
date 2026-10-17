require('dotenv').config()
const { Client, Wallet } = require('xahau')

// Number of sides from the command line: `node 03-dice-roll.js 20` rolls a d20
const SIDES = Number(process.argv[2] || 6)
// The hook reads SIDES as a single byte, so 255 is the largest die it can roll
if (!Number.isInteger(SIDES) || SIDES < 2 || SIDES > 255) {
  console.error('Usage: node 03-dice-roll.js [sides]   (sides between 2 and 255, default 6)')
  process.exit(1)
}

async function rollDice() {
  const client = new Client(process.env.WSS_URL || 'wss://xahau-test.net')
  await client.connect()

  const player = Wallet.fromSeed(process.env.PLAYER1_SEED, { algorithm: 'secp256k1' })
  const diceAccount = Wallet.fromSeed(process.env.DICE_SEED, { algorithm: 'secp256k1' }).address
  console.log(`Rolling a d${SIDES}...`)

  // Invoke wakes the hook up without moving funds. SIDES is a 1-byte parameter.
  const tx = await client.autofill({
    TransactionType: 'Invoke',
    Account: player.address,
    Destination: diceAccount,
    HookParameters: [
      {
        HookParameter: {
          HookParameterName: Buffer.from('SIDES').toString('hex').toUpperCase(),
          HookParameterValue: SIDES.toString(16).padStart(2, '0').toUpperCase()
        }
      }
    ]
  })

  const { result } = await client.submitAndWait(player.sign(tx).tx_blob)
  const exec = result.meta.HookExecutions[0].HookExecution

  console.log(`Result:     ${result.meta.TransactionResult}`)
  console.log(`Hook says:  ${Buffer.from(exec.HookReturnString, 'hex').toString().replace(/\0/g, '')}`)
  console.log(`Roll:       ${parseInt(exec.HookReturnCode, 16)}`)
  // featureRNG: the RNG state the transaction's first draw saw, for auditing
  console.log(`RandomData: ${result.meta.RandomData}`)
  console.log(`Explorer:   https://xaman.app/explorer/21338/${result.hash}`)

  await client.disconnect()
}

rollDice().catch(console.error)
