require('dotenv').config()
const fs = require('fs')
const { Client, Wallet } = require('xahau')

// Fire only on Invoke transactions (and not on SetHook)
const HOOK_ON_INVOKE_ONLY = 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF7FFFFFFFFFFFFFFFFFFBFFFFF'

async function installDiceHook() {
  const client = new Client(process.env.WSS_URL || 'wss://xahau-test.net')
  await client.connect()

  const wallet = Wallet.fromSeed(process.env.DICE_SEED, { algorithm: 'secp256k1' })
  console.log(`Dice account: ${wallet.address}`)

  // Compiled with ./hooks/build.sh. It imports dice() and util_random(),
  // so SetHook is only accepted on a network where the RNG amendment is enabled.
  const wasm = fs.readFileSync('build/rng_dice.wasm')

  const tx = await client.autofill({
    TransactionType: 'SetHook',
    Account: wallet.address,
    Hooks: [
      {
        Hook: {
          CreateCode: wasm.toString('hex').toUpperCase(),
          HookOn: HOOK_ON_INVOKE_ONLY,
          HookNamespace: '0'.repeat(64),
          HookApiVersion: 0,
          Flags: 1 // hsfOVERRIDE
        }
      }
    ]
  })

  const { result } = await client.submitAndWait(wallet.sign(tx).tx_blob)
  console.log(`SetHook:  ${result.meta.TransactionResult}`)
  console.log(`Explorer: https://xaman.app/explorer/21338/${result.hash}`)

  await client.disconnect()
}

installDiceHook().catch(console.error)
