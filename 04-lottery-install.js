require('dotenv').config()
const fs = require('fs')
const { Client, Wallet, xahToDrops } = require('xahau')

// Fire on Payment (ticket purchases) and Cron (the draw)
const HOOK_ON_PAYMENT_AND_CRON = 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFFFFFFFFFFFFFBFFFFE'

const TICKET_PRICE_XAH = '10'

async function installLottery() {
  const client = new Client(process.env.WSS_URL || 'wss://xahau-test.net')
  await client.connect()

  const admin = Wallet.fromSeed(process.env.LOTTERY_SEED, { algorithm: 'secp256k1' })
  console.log(`Lottery account: ${admin.address}`)

  // PRICE parameter: ticket price in drops, as an 8-byte big-endian integer
  const price = BigInt(xahToDrops(TICKET_PRICE_XAH)).toString(16).padStart(16, '0').toUpperCase()

  // 1. Install the hook.
  //    hsfCOLLECT (4) is required so the hook can run on Cron transactions,
  //    which execute the hook as a "weak" (collect) execution.
  const setHook = await client.autofill({
    TransactionType: 'SetHook',
    Account: admin.address,
    Hooks: [
      {
        Hook: {
          CreateCode: fs.readFileSync('build/lottery.wasm').toString('hex').toUpperCase(),
          HookOn: HOOK_ON_PAYMENT_AND_CRON,
          HookNamespace: '0'.repeat(64),
          HookApiVersion: 0,
          Flags: 1 | 4, // hsfOVERRIDE | hsfCOLLECT
          HookParameters: [
            {
              HookParameter: {
                HookParameterName: Buffer.from('PRICE').toString('hex').toUpperCase(),
                HookParameterValue: price
              }
            }
          ]
        }
      }
    ]
  })
  let { result } = await client.submitAndWait(admin.sign(setHook).tx_blob)
  console.log(`SetHook:    ${result.meta.TransactionResult}  https://xaman.app/explorer/21338/${result.hash}`)

  // 2. Enable asfTshCollect (11) on the account, the other half of
  //    allowing weak executions such as Cron.
  const accountSet = await client.autofill({
    TransactionType: 'AccountSet',
    Account: admin.address,
    SetFlag: 11 // asfTshCollect
  })
  ;({ result } = await client.submitAndWait(admin.sign(accountSet).tx_blob))
  console.log(`AccountSet: ${result.meta.TransactionResult}  https://xaman.app/explorer/21338/${result.hash}`)

  console.log(`\nLottery open. Ticket price: ${TICKET_PRICE_XAH} XAH`)
  await client.disconnect()
}

installLottery().catch(console.error)
