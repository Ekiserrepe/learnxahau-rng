require('dotenv').config()
const { Client, Wallet, dropsToXah, unixTimeToRippleTime } = require('xahau')

// Seconds from now until the draw: `node 06-lottery-close.js 60`
const DRAW_IN_SECONDS = Number(process.argv[2] || 30)
if (!Number.isInteger(DRAW_IN_SECONDS) || DRAW_IN_SECONDS < 1) {
  console.error('Usage: node 06-lottery-close.js [seconds]   (seconds until the draw, default 30)')
  process.exit(1)
}

const hookMessage = exec => Buffer.from(exec.HookReturnString, 'hex').toString().replace(/\0/g, '')

async function closeLottery() {
  const client = new Client(process.env.WSS_URL || 'wss://xahau-test.net')
  await client.connect()

  const admin = Wallet.fromSeed(process.env.LOTTERY_SEED, { algorithm: 'secp256k1' })

  // A one-time Cron: only StartTime (Ripple epoch), no DelaySeconds/RepeatCount
  const startTime = unixTimeToRippleTime(Date.now() + DRAW_IN_SECONDS * 1000)
  const cronSet = await client.autofill({
    TransactionType: 'CronSet',
    Account: admin.address,
    StartTime: startTime
  })
  const { result } = await client.submitAndWait(admin.sign(cronSet).tx_blob)
  console.log(`CronSet: ${result.meta.TransactionResult}  https://xaman.app/explorer/21338/${result.hash}`)
  if (result.meta.TransactionResult !== 'tesSUCCESS') return client.disconnect()
  console.log(`Draw scheduled in ${DRAW_IN_SECONDS}s. Waiting...\n`)

  // Watch the lottery account: first the Cron that triggers the draw,
  // then the prize Payment the hook emits.
  await client.request({ command: 'subscribe', accounts: [admin.address] })

  await new Promise((resolve, reject) => {
    // Give up 5 minutes after the scheduled time
    const timeout = setTimeout(() => reject(new Error('No draw seen 5 minutes after the scheduled time')), (DRAW_IN_SECONDS + 300) * 1000)

    client.on('transaction', msg => {
      const { meta, validated } = msg
      const tx = msg.tx_json || msg.transaction
      if (!validated || !tx) return
      const hash = msg.hash || tx.hash

      if (tx.TransactionType === 'Cron') {
        const exec = meta.HookExecutions?.[0]?.HookExecution
        console.log(`Cron:      ${meta.TransactionResult}  https://xaman.app/explorer/21338/${hash}`)
        if (!exec) return
        console.log(`Hook says: ${hookMessage(exec)}`)
        const code = parseInt(exec.HookReturnCode, 16)
        // HookResult 3 = accept. Anything else (e.g. not enough entropy) is a rollback:
        // the tickets stay in place and the admin can schedule another draw.
        if (exec.HookResult !== 3 || code === 0) {
          clearTimeout(timeout) // no draw this time, nothing to pay
          resolve()
        } else {
          console.log(`Winning ticket: #${code}`)
        }
      }

      // The emitted prize: a Payment from the lottery account carrying EmitDetails
      if (tx.TransactionType === 'Payment' && tx.Account === admin.address && tx.EmitDetails) {
        console.log(`\nPrize:     ${meta.TransactionResult}  https://xaman.app/explorer/21338/${hash}`)
        console.log(`Winner:    ${tx.Destination}`)
        console.log(`Amount:    ${dropsToXah(meta.delivered_amount ?? tx.Amount)} XAH`)
        console.log(`Flags:     ${tx.Flags ?? 0} (no tfPartialPayment)`)
        clearTimeout(timeout)
        resolve()
      }
    })
  })

  await client.disconnect()
}

closeLottery().catch(err => {
  console.error(err)
  process.exit(1)
})
