require('dotenv').config()
const { Client, Wallet, xahToDrops } = require('xahau')

// Which player buys: `node 05-lottery-buy-ticket.js 2` uses PLAYER2_SEED
const PLAYER = process.argv[2] || '1'
if (!process.env[`PLAYER${PLAYER}_SEED`]) {
  console.error(`Usage: node 05-lottery-buy-ticket.js [player]   (1, 2 or 3; PLAYER${PLAYER}_SEED is not in .env)`)
  process.exit(1)
}
const TICKET_PRICE_XAH = '10'

async function buyTicket() {
  const client = new Client(process.env.WSS_URL || 'wss://xahau-test.net')
  await client.connect()

  const player = Wallet.fromSeed(process.env[`PLAYER${PLAYER}_SEED`], { algorithm: 'secp256k1' })
  const lottery = Wallet.fromSeed(process.env.LOTTERY_SEED, { algorithm: 'secp256k1' }).address
  console.log(`Player ${PLAYER}: ${player.address}`)

  // A plain XAH payment of exactly the ticket price, with no tfPartialPayment flag
  const tx = await client.autofill({
    TransactionType: 'Payment',
    Account: player.address,
    Destination: lottery,
    Amount: xahToDrops(TICKET_PRICE_XAH)
  })

  const { result } = await client.submitAndWait(player.sign(tx).tx_blob)
  const exec = result.meta.HookExecutions?.[0]?.HookExecution

  console.log(`Payment:   ${result.meta.TransactionResult}`)
  if (exec) {
    console.log(`Hook says: ${Buffer.from(exec.HookReturnString, 'hex').toString().replace(/\0/g, '')}`)
    console.log(`Ticket #:  ${parseInt(exec.HookReturnCode, 16)}`)
  }
  console.log(`Explorer:  https://xaman.app/explorer/21338/${result.hash}`)

  await client.disconnect()
}

buyTicket().catch(console.error)
