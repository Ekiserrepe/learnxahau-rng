Welcome to Learning Xahau, a series of articles dedicated to helping developers, builders, and blockchain enthusiasts better understand the Xahau ecosystem. Whether you're just getting started or already building advanced applications, these posts will explore Xahau's features, architecture, and best practices through practical examples and real-world use cases.

**Generating a random number** sounds trivial. Every programming language has a `random()` function. But a blockchain is a machine designed to be deterministic: every node has to execute the same transaction and reach exactly the same result. If each validator rolled its own die, they would never agree on the outcome. And if the "random" value comes from something public, like a ledger hash, someone can usually compute it in advance, or nudge it in their favour.

The [2026.10.13 xahaud release](https://github.com/Xahau/xahaud/releases/tag/2026.10.13-release%2B4119) ships a new [amendment](https://xahau.network/docs/features/amendments/) that tackles this problem at the protocol level: **RNG**, a consensus random number generator for Hooks. In this article we will look at how it works under the hood, and then put it to work with two examples:

1. **A dice roller**: the smallest possible Hook that uses RNG.
2. **A lottery**: players buy tickets, the administrator closes the round with a [`CronSet`](https://xahau.network/docs/protocol-reference/transactions/transaction-types/cronset/), and the Hook draws a winner and pays the prize, all on-chain.

All code in this article targets the **Xahau Testnet** (`wss://xahau-test.net`) and requires **[xahau.js 4.2.0](https://www.npmjs.com/package/xahau)** or later.

---

## Why Randomness Is Hard On-Chain

Before RNG, a Hook developer who needed "randomness" had a few options, none of them great:

- **Ledger data** (like the parent ledger hash) is public before your transaction is applied, so anyone can compute the outcome in advance.
- **`ledger_nonce()`** gives you a unique value per call, but it's derived from data the submitter knows (parent ledger hash, transaction ID, Hook account), so a motivated user can grind transaction IDs until they get a value they like.
- **An external oracle** moves the problem off-chain: now you have to trust whoever runs the oracle.

What we really want is a value that every validator agrees on, that nobody knows before the transaction is locked into a ledger, and that no single participant can steer.

## How RNG Works

RNG solves this with a classic cryptographic technique called **commit-reveal**, run by the validators themselves as part of consensus.

### 1. Validators commit, then reveal

Each validator in the [UNLReport](https://xahau.network/docs/protocol-reference/ledger-data/ledger-objects-types/unl-report/) generates a secret. In every ledger it submits one [`Entropy`](https://xahau.network/docs/protocol-reference/transactions/pseudo-transaction-types/entropy/) pseudo-transaction that:

- **Reveals** the secret it committed to previously (`RandomData`)
- **Commits** to its next secret by publishing only its hash (`NextRandomDigest`)

Because the commitment is published *before* the secret, a validator can't change its mind after seeing everyone else's contribution. And because `Entropy` transactions never enter the open ledger, a reveal only becomes public once the revealing validator's transaction set is locked.

### 2. The reveals seed the `Random` object

All `Entropy` transactions are applied **before any other transaction** in the ledger. They feed a new singleton ledger object called [`Random`](https://xahau.network/docs/protocol-reference/ledger-data/ledger-objects-types/random/):

- The first `Entropy` of each ledger restarts the seed from the ledger sequence and the parent ledger hash.
- Each valid reveal (one whose hash matches the stored commitment) is mixed into the seed, and `EntropyCount` goes up by one.
- `EntropyDenominator` stores how many validators are in the UNLReport.

You can look at this object yourself. It's a regular ledger entry, so any node answers a `ledger_entry` request with `"random": true`, try it in your terminal:

```bash

curl -s https://xahau-test.net \
  -H "Content-Type: application/json" \
  -d '{
    "method": "ledger_entry",
    "params": [{
      "random": true,
      "ledger_index": "validated"
    }]
  }' | jq .

```

This is what testnet returned while writing this article:

```json
{
  "result": {
    "index": "125C53F238F6CA65C41A3287F760CCF04F2D0407A8FE016B59F460FE14F0C677",
    "ledger_hash": "28ACA42C47F819F828B6A0A62CD56CE2F5A37A1992DE487354FBC7EBC2BFAF4B",
    "ledger_index": 13256948,
    "node": {
      "EntropyCount": 4,
      "EntropyDenominator": 4,
      "Flags": 0,
      "LedgerEntryType": "Random",
      "LedgerSequence": 13256948,
      "PreviousTxnID": "E971DCB1095AA6276B2D1E264FD113874EF49D4701590F3CB8A6DD3D62DFBF46",
      "PreviousTxnLgrSeq": 13256948,
      "RandomData": "0F9ED2C058566B70F05E6A9C1FB817C775452D99E47B977B2D65805313A9BD37",
      "RandomDigests": [
        {
          "RandomDigestEntry": {
            "LedgerSequence": 13256948,
            "NextRandomDigest": "78815FA7D2774C7B5A83D3292338BCFE7372900BDC7C7C415ACBEA5D21D7D1BE",
            "PublicKey": "ED3ABC6740983BFB13FFD9728EBCC365A2877877D368FC28990819522300C92A69"
          }
        },
        {
          "RandomDigestEntry": {
            "LedgerSequence": 13256948,
            "NextRandomDigest": "A7C1B17766096D806E95ECA26AAA37AAA48DCC6C93418E77A47180584A1166C8",
            "PublicKey": "ED49F82B2FFD537F224A1E0A10DEEFC3C25CE3882979E6B327C9F18603D21F0A22"
          }
        },
        {
          "RandomDigestEntry": {
            "LedgerSequence": 13256948,
            "NextRandomDigest": "D181DD0087FC405A6A6D8CC764EF0B50B4093AA0D9C4D7FB6DB644D8F5B419A5",
            "PublicKey": "ED79EB0F6A9F01A039235E536D19F812B55ACF540C9E22CF62C271E0D42BFF5174"
          }
        },
        {
          "RandomDigestEntry": {
            "LedgerSequence": 13256948,
            "NextRandomDigest": "4701665DC07439F841C06071DEEC6A68FB3D109FF0F59B25DFDA70B77DFA19AD",
            "PublicKey": "ED96F581FED430E8CBE1F08B37408857001D4118D49FBB594B0BE007C2DBFFD367"
          }
        }
      ],
      "index": "125C53F238F6CA65C41A3287F760CCF04F2D0407A8FE016B59F460FE14F0C677"
    },
    "status": "success",
    "validated": true
  }
}

```

How to read it:

- `LedgerSequence` matches `ledger_index`: the seed belongs to this ledger, so Hooks running in it are allowed to draw.
- `EntropyCount: 4` of `EntropyDenominator: 4`: all four testnet validators revealed. That's above the 80% threshold, so [`dice()`](https://xahau.network/docs/hooks/functions/utilities/dice/) and [`util_random()`](https://xahau.network/docs/hooks/functions/utilities/util_random/) won't fail with `TOO_LITTLE_ENTROPY`.
- `RandomData` is the RNG state of this ledger. It's public now because the ledger is already closed. The next ledger restarts the seed with its own sequence, parent hash and new reveals, so knowing this value doesn't help you predict future draws.
- `RandomDigests` holds one commitment per validator (identified by its `PublicKey`): the hash of the value it will reveal in the next ledger. When that reveal arrives, xahaud checks it against `NextRandomDigest` and discards it if it doesn't match.
- `index` is always the same. `Random` is a singleton, so there's exactly one per ledger, at a fixed key.

The first script of this tutorial (`01-check-rng.js`) makes this same request with xahau.js.

### 3. Hooks draw from it

Every time a Hook asks for a random value, xahaud:

1. Checks that the seed belongs to the current ledger and that **at least 80% of the UNLReport validators revealed**. If not, the draw fails with `TOO_LITTLE_ENTROPY`.
2. Computes the output as a hash of the current state **plus** the transaction ID, the Hook account, the Hook hash and its position in the Hook chain.
3. Moves the state forward, so the next draw (in this Hook, another Hook or the next transaction) gets a completely different value.

What makes this safe to use:

- **Hooks can't read the RNG state.** They can only *draw* from it, never *peek* at what the next draw will return.
- **Rolling back doesn't rewind the dice.** If a Hook draws and then calls [`rollback()`](https://xahau.network/docs/hooks/functions/control/rollback/), the state still moves forward, so you can't "re-roll" until you like the result.
- **You can't preview a roll.** `simulate` and the preliminary result of `submit` run on the open ledger, but the real draw happens when the transaction is applied to a closed ledger, whose seed includes reveals that weren't public yet. Always read the result from the validated transaction.
- **Draws are auditable.** The state the transaction's first draw saw is written to its final metadata as `RandomData`.

### The new Hook APIs

| Function | Returns |
|---|---|
| [`int64_t dice(uint32_t sides)`](https://xahau.network/docs/hooks/functions/utilities/dice/) | A uniform integer in `[0, sides)`, with no modulo bias |
| [`int64_t util_random(uint32_t write_ptr, uint32_t write_len)`](https://xahau.network/docs/hooks/functions/utilities/util_random/) | Writes `write_len` random bytes (1 to 512) and returns the number written |

Both can return `TOO_LITTLE_ENTROPY` (`-46`) when fewer than 80% of the validators contributed to the current seed, and `TOO_MANY_NONCES` (`-12`) after 256 draws in a single Hook execution.

---

## Setup

Clone the companion repository:

```bash
git clone https://github.com/Ekiserrepe/learnxahau-rng.git
cd learnxahau-rng
npm install
```

Copy `.env.example` to `.env` and fill in the seeds. You need five testnet accounts, which you can get from the [Xahau Testnet Faucet](https://xahau-test.net/):

```bash
cp .env.example .env
```

```properties
# Xahau Testnet (RNG enabled). Get funded accounts at https://xahau-test.net/
# or run `node 00-create-accounts.js` to create them and fill this file for you
WSS_URL=wss://xahau-test.net

# Part 1: dice
DICE_SEED=        # account that installs the dice hook (02)

# Part 2: lottery
LOTTERY_SEED=     # lottery admin: installs the lottery hook and schedules the draw (04, 06)
PLAYER1_SEED=     # players: buy tickets (05). PLAYER1 also rolls the dice (03)
PLAYER2_SEED=
PLAYER3_SEED=
```

If you don't want to create the accounts by hand, the optional `00-create-accounts.js` script asks the faucet for them and writes each seed into `.env` (it creates the file from `.env.example` if it doesn't exist). The faucet gives one account per minute, so five accounts take about four minutes. Seeds already in `.env` are kept, so if it's interrupted you can simply run it again:

```bash
node 00-create-accounts.js
```

### Compiling the Hooks

The repository includes both Hooks already compiled in `build/`, so you can skip this step. If you want to compile them yourself, you can paste the C code into the [Hooks Builder](https://builder.xahau.network/) or build it locally with [Hooks Toolkit](https://hooks-toolkit.com/).

---

## Part 1: Rolling Dice

### Check that RNG is live (`01-check-rng.js`)

The `ledger_entry` RPC accepts `random: true` to select the `Random` singleton:

```javascript
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
```

Run it. It takes no parameters:

```bash
node 01-check-rng.js
```

```plaintext
RNG enabled: true
Seeded for ledger:   13246481
Validators revealed: 4 of 4
Enough entropy:      true
```

### The dice Hook (`hooks/rng_dice.c`)

For every [`Invoke`](https://xahau.network/docs/protocol-reference/transactions/transaction-types/invoke/) it receives, this Hook rolls a die with `dice()`, draws a 32-byte random "ticket" with `util_random()`, stores both in [Hook State](https://xahau.network/docs/protocol-reference/ledger-data/ledger-objects-types/hook-state/) and returns the roll as its [`HookReturnCode`](https://xahau.network/docs/hooks/concepts/execution-metadata/):

```c
/**
 * rng_dice.c - Learning Xahau: On-chain randomness with the RNG amendment
 *
 * Fires on Invoke transactions. For every Invoke it:
 *   1. Reads the optional "SIDES" HookParameter (1 byte, 2..255). Default: 6.
 *   2. Rolls a fair die with dice(sides)        -> uniform integer in [0, sides)
 *   3. Draws a 32-byte random ticket with util_random()
 *   4. Stores [roll (1 byte) | ticket (32 bytes)] in Hook State,
 *      keyed by the sender's account ID
 *   5. Accepts, returning the roll (1..sides) as the HookReturnCode
 *
 * dice() and util_random() only exist when the RNG amendment is enabled.
 */
#include "hookapi.h"

int64_t hook(uint32_t reserved)
{
    _g(1, 1);

    // Only Invoke transactions roll the die. Everything else passes through.
    if (otxn_type() != ttINVOKE)
        accept(SBUF("rng_dice: not an Invoke, nothing to roll."), 0);

    // Optional parameter SIDES (one byte). Defaults to a classic 6-sided die.
    uint8_t sides_buf[1];
    uint32_t sides = 6;
    if (otxn_param(SBUF(sides_buf), (uint32_t)"SIDES", 5) == 1)
        sides = sides_buf[0];

    if (sides < 2)
        rollback(SBUF("rng_dice: SIDES must be between 2 and 255."), 1);

    // dice(n) returns a uniform integer in [0, n), or a negative error code:
    //   TOO_LITTLE_ENTROPY (-46): not enough validators revealed this ledger
    //   TOO_MANY_NONCES    (-12): more than 256 draws in one execution
    int64_t roll = dice(sides);
    if (roll < 0)
        rollback(SBUF("rng_dice: dice() failed, no randomness available."), roll);

    // record[0]     = roll (1..sides)
    // record[1..32] = 32 random bytes from util_random()
    uint8_t record[33];
    record[0] = (uint8_t)(roll + 1);

    int64_t got = util_random((uint32_t)(record + 1), 32);
    if (got != 32)
        rollback(SBUF("rng_dice: util_random() failed."), got);

    // Hook State key: the account that sent the Invoke (20 bytes).
    uint8_t sender[20];
    if (otxn_field(SBUF(sender), sfAccount) != 20)
        rollback(SBUF("rng_dice: could not read sender."), 2);

    if (state_set(SBUF(record), SBUF(sender)) != sizeof(record))
        rollback(SBUF("rng_dice: could not write state."), 3);

    // Human readable result, e.g. "rng_dice: rolled 4 of 6"
    uint8_t msg[] = "rng_dice: rolled ... of ...";
    int64_t r = roll + 1;
    msg[17] = '0' + (r / 100);
    msg[18] = '0' + ((r / 10) % 10);
    msg[19] = '0' + (r % 10);
    msg[24] = '0' + (sides / 100);
    msg[25] = '0' + ((sides / 10) % 10);
    msg[26] = '0' + (sides % 10);

    accept(SBUF(msg), r);
    return 0;
}
```

Two details:

- `dice(sides)` returns a value in `[0, sides)`, so we add 1 to get a classic `1..sides` result.
- A **negative** draw result goes straight into `rollback()`. If the network didn't collect enough entropy, the transaction fails and you see `-46` in the Hook execution, instead of the Hook silently using weak randomness.

### Install it (`02-dice-install.js`)

On Xahau, a Hook lives on an account: it runs whenever a transaction that matches its [`HookOn`](https://xahau.network/docs/hooks/concepts/hookon-field/) touches that account. To install it, the account sends a **[`SetHook`](https://xahau.network/docs/protocol-reference/transactions/transaction-types/sethook/)** transaction, the transaction type used to install, update or remove Hooks on an account.

Here we install the dice Hook on the **dice account** (`DICE_SEED` in `.env`). From then on, any player who sends an `Invoke` to that account rolls the die. The `SetHook` carries the Hook definition:

- `CreateCode`: the compiled WASM (`build/rng_dice.wasm`) in hex.
- `HookOn`: which transaction types trigger the Hook. Here, only `Invoke`.
- [`HookNamespace`](https://xahau.network/docs/hooks/concepts/namespaces/): where the Hook keeps its state. We use all zeros.
- `HookApiVersion`: `0`.
- `Flags: 1` (`hsfOVERRIDE`): replaces any Hook already installed in that position.

```javascript
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
```

Run it once. It takes no parameters and installs the Hook on the account in `DICE_SEED`:

```bash
node 02-dice-install.js
```

```plaintext
Dice account: rwimbmGJR1jmGMMyxwU2ot2fyuryPQtSUM
SetHook:  tesSUCCESS
Explorer: https://xaman.app/explorer/21338/698F8F30E6F08A147F7C914B3F4A567924F3C19370503AB25A9C2D0C08B98A8E
```

Because the Hook imports `dice()` and `util_random()`, this `SetHook` is only accepted where the RNG amendment is enabled. On a network without it, the install is rejected with *"Hook attempted to import a function that does not appear in the hook_api function set: `dice`"*. Once RNG is voted in on mainnet, the exact same WASM will install there too.

### Roll (`03-dice-roll.js`)

```javascript
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
```

The script takes one optional parameter: **the number of sides of the die**. The roll is sent from the account in `PLAYER1_SEED`. Without a parameter it rolls a classic six-sided die:

```bash
node 03-dice-roll.js        # d6 (default)
node 03-dice-roll.js 20     # d20
node 03-dice-roll.js 100    # d100, a percentage roll
node 03-dice-roll.js 2      # a coin flip
```

The number travels to the Hook as the `SIDES` HookParameter, which is a single byte, so any die from 2 to 255 sides works. The script refuses anything outside that range before sending the transaction. The Hook also checks the value on its own side and rejects a `SIDES` below 2 with a `rollback()`.

Rolling the default d6:

```plaintext
Rolling a d6...
Result:     tesSUCCESS
Hook says:  rng_dice: rolled 002 of 006
Roll:       2
RandomData: A14E34203FFFAE5BE8C488EBFA78CB6C3BBC4EF2AA4C4DF759715A98E2B92006
Explorer:   https://xaman.app/explorer/21338/D07598AF911A6E1138A03E200FFF4574A4739C024B8D7634F83C811AA3B3E150
```

And a d20 (`node 03-dice-roll.js 20`):

```plaintext
Rolling a d20...
Result:     tesSUCCESS
Hook says:  rng_dice: rolled 001 of 020
Roll:       1
RandomData: C98645132A6AB878397FBD57B8AFFCCF818C85BA09895323638397351A36CAFB
Explorer:   https://xaman.app/explorer/21338/D119D4B3158EB26552ACD1F0C8CF916D48EE0FBA176322EE3C18096C79B9A71D
```

Run it a few times: each roll is a new transaction, drawn from a new state, so the results don't repeat in any pattern you can exploit.

Notice the new `RandomData` field in the transaction metadata: it's the audit trail of the draw.

---

## Part 2: An On-Chain Lottery

Dice are fun, but let's build something with real money flows: a lottery administered by a Hook.

- The **administrator** owns the lottery account. They install the Hook with a ticket price.
- **Players** buy a ticket by sending exactly the ticket price in XAH to the lottery account.
- When the administrator wants to close the round, they send a **`CronSet`**. At the scheduled time, Xahau fires a [`Cron`](https://xahau.network/docs/protocol-reference/transactions/pseudo-transaction-types/cron/) transaction on the lottery account.
- The Hook wakes up, **draws a winner with `dice()`**, **emits a Payment** of the whole pot to the winner, clears the tickets and opens a new round.

Nobody, not even the administrator, can know or choose the winner in advance: the draw happens inside the Hook, in a ledger whose seed didn't exist when the `CronSet` was sent.

### The lottery Hook (`hooks/lottery.c`)

```c
/**
 * lottery.c - Learning Xahau: an on-chain lottery with RNG + Cron
 *
 * Installed on the lottery (admin) account with a PRICE HookParameter
 * (8 bytes, big-endian, ticket price in drops).
 *
 * Incoming Payment  -> buys one ticket. Must be exactly PRICE in XAH and must
 *                      NOT be a partial payment. Ticket i is stored in Hook
 *                      State as key = i (4 bytes), value = buyer account.
 * Cron              -> closes the round: picks a winner with dice(),
 *                      emits a Payment of the whole pot to the winner
 *                      (no partial payment flag), clears the tickets and
 *                      opens a new round.
 * Outgoing txns     -> passed through (e.g. the admin withdrawing funds).
 */
#include "hookapi.h"

#define MAX_TICKETS 100
#define tfPARTIAL_PAYMENT 0x00020000UL

int64_t hook(uint32_t reserved)
{
    _g(1, 1);

    uint8_t hook_acc[20];
    hook_account(SBUF(hook_acc));

    // Ticket price, set by the admin when installing the hook
    uint8_t price_buf[8];
    if (hook_param(SBUF(price_buf), (uint32_t)"PRICE", 5) != 8)
        rollback(SBUF("lottery: PRICE hook parameter missing."), 1);
    uint64_t price = UINT64_FROM_BUF(price_buf);

    // Number of tickets sold in the current round
    uint8_t count_key[5] = {'C', 'O', 'U', 'N', 'T'};
    uint8_t count_buf[4] = {0, 0, 0, 0};
    state(SBUF(count_buf), SBUF(count_key));
    uint32_t count = UINT32_FROM_BUF(count_buf);

    int64_t tt = otxn_type();

    // ---------------------------------------------------------------- DRAW
    if (tt == ttCRON)
    {
        if (count == 0)
            accept(SBUF("lottery: no tickets sold, no draw."), 0);

        // Uniform winner among [0, count)
        int64_t winner = dice(count);
        if (winner < 0)
            rollback(SBUF("lottery: not enough entropy, draw postponed."), winner);

        uint8_t ticket_key[4];
        UINT32_TO_BUF(ticket_key, (uint32_t)winner);
        uint8_t winner_acc[20];
        if (state(SBUF(winner_acc), SBUF(ticket_key)) != 20)
            rollback(SBUF("lottery: winning ticket not found."), 2);

        uint64_t pot = price * count;

        // The Payment to emit, serialized. prepare() fills in Account, Sequence,
        // Fee, SigningPubKey, ledger window and EmitDetails for us.
        uint8_t txn[39] = {
            0x12U, 0x00U, 0x00U,                   // TransactionType = Payment
            0x22U, 0x00U, 0x00U, 0x00U, 0x00U,     // Flags = 0 (NO tfPartialPayment)
            0x61U, 0, 0, 0, 0, 0, 0, 0, 0,         // Amount (XAH, filled below)
            0x83U, 0x14U,                          // Destination (20 bytes)
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0};

        // Native amount: 0x40 marks "positive", the rest is drops
        txn[9]  = 0x40U | ((pot >> 56) & 0x3FU);
        txn[10] = (pot >> 48) & 0xFFU;
        txn[11] = (pot >> 40) & 0xFFU;
        txn[12] = (pot >> 32) & 0xFFU;
        txn[13] = (pot >> 24) & 0xFFU;
        txn[14] = (pot >> 16) & 0xFFU;
        txn[15] = (pot >> 8) & 0xFFU;
        txn[16] = pot & 0xFFU;

        for (int i = 0; GUARD(20), i < 20; ++i)
            txn[19 + i] = winner_acc[i];

        etxn_reserve(1);

        uint8_t prepared[512];
        int64_t prepared_len = prepare(SBUF(prepared), SBUF(txn));
        if (prepared_len < 0)
            rollback(SBUF("lottery: prepare() failed."), prepared_len);

        uint8_t emithash[32];
        if (emit(SBUF(emithash), (uint32_t)prepared, (uint32_t)prepared_len) != 32)
            rollback(SBUF("lottery: emit() failed."), 3);

        // Close the round: delete every ticket and reset the counter
        for (uint32_t i = 0; GUARD(MAX_TICKETS), i < count; ++i)
        {
            UINT32_TO_BUF(ticket_key, i);
            state_set(0, 0, SBUF(ticket_key));
        }
        state_set(0, 0, SBUF(count_key));

        // Keep the last result: [winner account (20) | winning ticket (4) | pot in drops (8)]
        uint8_t last_key[6] = {'W', 'I', 'N', 'N', 'E', 'R'};
        uint8_t last[32];
        for (int i = 0; GUARD(20), i < 20; ++i)
            last[i] = winner_acc[i];
        UINT32_TO_BUF(last + 20, (uint32_t)winner);
        UINT64_TO_BUF(last + 24, pot);
        state_set(SBUF(last), SBUF(last_key));

        accept(SBUF("lottery: winner drawn and paid."), winner + 1);
    }

    // ------------------------------------------------------- PASS THROUGH
    uint8_t sender[20];
    otxn_field(SBUF(sender), sfAccount);
    if (BUFFER_EQUAL_20(sender, hook_acc))
        accept(SBUF("lottery: outgoing transaction, passing."), 0);

    if (tt != ttPAYMENT)
        accept(SBUF("lottery: not a payment, passing."), 0);

    // ---------------------------------------------------------- BUY TICKET
    // 1. No partial payments: the delivered amount must be the Amount field
    uint8_t flags_buf[4];
    otxn_field(SBUF(flags_buf), sfFlags);
    if (UINT32_FROM_BUF(flags_buf) & tfPARTIAL_PAYMENT)
        rollback(SBUF("lottery: partial payments are not accepted."), 4);

    // 2. XAH only: a native amount is 8 bytes, an IOU amount is 48
    uint8_t amount_buf[48];
    if (otxn_field(SBUF(amount_buf), sfAmount) != 8)
        rollback(SBUF("lottery: tickets can only be paid in XAH."), 5);

    // 3. Exactly the ticket price
    uint64_t drops = ((uint64_t)(amount_buf[0] & 0x3FU) << 56) +
                     ((uint64_t)amount_buf[1] << 48) + ((uint64_t)amount_buf[2] << 40) +
                     ((uint64_t)amount_buf[3] << 32) + ((uint64_t)amount_buf[4] << 24) +
                     ((uint64_t)amount_buf[5] << 16) + ((uint64_t)amount_buf[6] << 8) +
                     (uint64_t)amount_buf[7];
    if (drops != price)
        rollback(SBUF("lottery: send exactly the ticket price."), 6);

    if (count >= MAX_TICKETS)
        rollback(SBUF("lottery: sold out, wait for the next round."), 7);

    // Store the ticket: key = ticket number, value = buyer
    uint8_t ticket_key[4];
    UINT32_TO_BUF(ticket_key, count);
    if (state_set(SBUF(sender), SBUF(ticket_key)) != 20)
        rollback(SBUF("lottery: could not store ticket."), 8);

    count++;
    UINT32_TO_BUF(count_buf, count);
    if (state_set(SBUF(count_buf), SBUF(count_key)) != 4)
        rollback(SBUF("lottery: could not update ticket count."), 9);

    // Return code = ticket number (1-based)
    accept(SBUF("lottery: ticket purchased."), count);
    return 0;
}
```

Let's go through the important parts.

**Ticket storage.** Each ticket is one Hook State entry: the key is the ticket number (`0, 1, 2…`) and the value is the buyer's account. A `COUNT` entry keeps how many tickets have been sold in the current round. A player can buy several tickets, and every ticket has the same chance of winning. The round is capped at `MAX_TICKETS` (100) so the clean-up loop has a fixed [`GUARD`](https://xahau.network/docs/hooks/concepts/loops-and-guarding/).

**No partial payments.** A partial payment is a [`Payment`](https://xahau.network/docs/protocol-reference/transactions/transaction-types/payment/) with the [`tfPartialPayment`](https://xahau.network/docs/protocol-reference/transactions/transaction-types/payment/) flag, where the amount actually delivered can be much smaller than the `Amount` field. It's a classic attack against any code that reads `Amount` and trusts it: "send" 10 XAH, deliver 0.0001. The Hook defends against it in three ways:

1. It rejects any incoming `Payment` with the `tfPartialPayment` flag.
2. It only accepts native XAH (an 8-byte amount). IOUs, where partial payments really are possible, are rejected.
3. It requires *exactly* the ticket price.

For XAH-to-XAH payments xahaud already refuses the flag at the protocol level (`temBAD_SEND_NATIVE_PARTIAL`), so check 1 is defence in depth: the Hook doesn't depend on that rule, or on anyone remembering it, to stay safe.

The same rule applies to the money going out. The prize `Payment` is serialized by hand with **`Flags = 0`**, so it can never be a partial payment: either the winner receives the whole pot, or nothing is sent.

**The draw.** When the `Cron` transaction arrives, the Hook calls `dice(count)` to pick a ticket number uniformly. If there isn't enough entropy, it rolls back and the tickets stay where they are, so the administrator can schedule another draw.

**Emitting the prize with [`prepare()`](https://xahau.network/docs/hooks/functions/emitted-transaction/prepare/).** Instead of building the whole transaction by hand, the Hook only serializes four fields (`TransactionType`, `Flags`, `Amount` and `Destination`) and passes them to the `prepare()` Hook API, which fills in `Account`, `Sequence`, `Fee`, `SigningPubKey`, the ledger window and [`EmitDetails`](https://xahau.network/docs/hooks/concepts/emitted-transactions/). Then [`emit()`](https://xahau.network/docs/hooks/functions/emitted-transaction/emit/) sends it.

**Outgoing transactions.** With a classic `HookOn`, the Hook fires on `Payment` in both directions. If the administrator sends a payment *from* the lottery account (for example, to withdraw funds), it must not be treated as a ticket purchase, so the Hook lets through anything sent by the lottery account itself. (You could also use `HookOnIncoming`/`HookOnOutgoing` from [HookOnV2](https://dev.to/ekiserrepe/learning-xahau-hookonv2-namedhooks-and-transaction-simulation-more-control-over-when-and-how-2glo) for this.)

### Install the lottery (`04-lottery-install.js`)

This time the Hook goes on the **lottery account** (`LOTTERY_SEED` in `.env`). That account belongs to the administrator: players send their tickets to it, and the pot accumulates there until the draw. As with the dice, the administrator installs the Hook with a `SetHook` transaction from that account, this time with a `PRICE` [HookParameter](https://xahau.network/docs/hooks/concepts/parameters/) (10 XAH, as 8 bytes in drops) and `HookOn` set to `Payment` + `Cron`.

There is one extra requirement: `Cron` transactions execute the Hook as a **[weak](https://xahau.network/docs/hooks/concepts/weak-and-strong/)** (collect) execution. For that to work, the Hook must be installed with the **[`hsfCOLLECT`](https://xahau.network/docs/hooks/concepts/collect-call/)** flag, and the account must have **[`asfTshCollect`](https://xahau.network/docs/protocol-reference/transactions/transaction-types/accountset/)** enabled. If you followed the [Cron article](https://dev.to/ekiserrepe/learning-xahau-automating-hook-execution-with-cron-transactions-14n1) this will be familiar. The script does both:

```javascript
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
```

Run it once. It takes no parameters and installs the Hook on the account in `LOTTERY_SEED`. The ticket price is the `TICKET_PRICE_XAH` constant at the top of the script. If you want a different price, change it there and in `05-lottery-buy-ticket.js` before installing: the Hook only accepts payments of exactly that amount.

```bash
node 04-lottery-install.js
```

```plaintext
Lottery account: rp8WJk1CyyLhuy48tXZ9kBZ9rinB5283rK
SetHook:    tesSUCCESS  https://xaman.app/explorer/21338/FC33692C8CAF16153A6021C3325DA15AC7365F667B94E39FE3C126B9AEFD6619
AccountSet: tesSUCCESS  https://xaman.app/explorer/21338/1C51026057C51658CCC273EF5DE3F2BC7E1C21088D154DE780EFA9E80AD50947

Lottery open. Ticket price: 10 XAH
```

### Buy tickets (`05-lottery-buy-ticket.js`)

Each player buys a ticket by sending 10 XAH, nothing else:

```javascript
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
```

The script takes one optional parameter: **the player number** (`1`, `2` or `3`, default `1`). It picks the matching seed from `.env` (`PLAYER2_SEED` for `2`, and so on). Each run buys one ticket, so the same player can run it several times to buy more tickets. To reproduce the round below, four tickets in total:

```bash
node 05-lottery-buy-ticket.js 1
node 05-lottery-buy-ticket.js 2
node 05-lottery-buy-ticket.js 3
node 05-lottery-buy-ticket.js 1   # player 1 buys a second ticket
```

```plaintext
Player 1: rmQp7CEbabRtdTJj67P2HrMNaQBC3sfpR
Payment:   tesSUCCESS
Hook says: lottery: ticket purchased.
Ticket #:  1
Explorer:  https://xaman.app/explorer/21338/B0F39F90FCD97082EF762F7525BD9081E3F224A5F72EBA154DDAFFBBBACBBBAC

Player 2: rEFJTt86o5kB8FCPbqBK9eS8duUFQRaYq8
Payment:   tesSUCCESS
Hook says: lottery: ticket purchased.
Ticket #:  2
Explorer:  https://xaman.app/explorer/21338/6A3C2E5621F69EEE43115006F07DED5B15B33CD29ECB0D560F1B21E6CA0F438F

Player 3: r4drjtP44SPqtfJCMsuTtow6Uag9CufUWm
Payment:   tesSUCCESS
Hook says: lottery: ticket purchased.
Ticket #:  3
Explorer:  https://xaman.app/explorer/21338/6B308F76F2BE05AA468A350B52A02CA4622982E72CC8D335A07A0DD9F4586ED5

Player 1: rmQp7CEbabRtdTJj67P2HrMNaQBC3sfpR
Payment:   tesSUCCESS
Hook says: lottery: ticket purchased.
Ticket #:  4
Explorer:  https://xaman.app/explorer/21338/BCE3A9DA845FE0E246971CAF5764613F0EB6A9124EC02BCBC2F31B72CA677437
```

### Close the round and draw (`06-lottery-close.js`)

The administrator closes the lottery with a **one-time** `CronSet`: only a `StartTime` (in Ripple epoch seconds), with no `DelaySeconds` or `RepeatCount`. The script then subscribes to the lottery account and waits for the `Cron` transaction and the prize payment:

```javascript
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
```

The script takes one optional parameter: **how many seconds from now the draw should happen** (default `30`):

```bash
node 06-lottery-close.js        # draw in 30 seconds (default)
node 06-lottery-close.js 30     # the same, explicitly
node 06-lottery-close.js 3600   # draw in one hour
```

The script waits and prints the draw when it happens. If no draw shows up within 5 minutes of the scheduled time, it stops waiting. You don't need to keep it running, though: once the `CronSet` is validated, the draw is on-chain and happens at the scheduled time whether the script is still open or not.

Closing the round we filled above with `node 06-lottery-close.js 30`:

```plaintext
CronSet: tesSUCCESS  https://xaman.app/explorer/21338/C22FE32729E9FC6A4CE35E28B625A38E0AE26E06B37FE31D56C8F82566E25BAB
Draw scheduled in 30s. Waiting...

Cron:      tesSUCCESS  https://xaman.app/explorer/21338/6E5CFD5B827D6399AEF6FBACE28098C83D205DAF64A7FFA83A9E026B27704726
Hook says: lottery: winner drawn and paid.
Winning ticket: #1

Prize:     tesSUCCESS  https://xaman.app/explorer/21338/5C35FA6A0CAEB6FB3DBF70F80FFF796A3AE1DAE8742AB14877FB8755DF272AE7
Winner:    rmQp7CEbabRtdTJj67P2HrMNaQBC3sfpR
Amount:    40 XAH
Flags:     0 (no tfPartialPayment)
```

That's the whole lifecycle: the `CronSet` scheduled the close, Xahau fired the `Cron` at the right time, the Hook drew a ticket with on-chain randomness and paid the full pot (4 tickets × 10 XAH) to the winner. The tickets are cleared and the next round is already open.

### Ideas to take it further

- **A weekly lottery**: use `DelaySeconds: 604800` and a `RepeatCount` in the `CronSet` and the draw runs every week, with no admin action at all.
- **An administration fee**: keep a percentage of the pot before emitting the prize.
- **Multiple prizes**: call `dice()` several times (up to 256 draws per execution) for second and third prizes.
- **Ticket NFTs**: combine it with the [Automatic NFT Factory](https://dev.to/ekiserrepe/learning-xahau-building-an-automatic-nft-factory-with-hooks-4j44) and mint each ticket as a URIToken.

---

## Summary

| Concept | What It Is |
|---|---|
| **RNG amendment** | Consensus random number generator for Hooks, shipped in xahaud `2026.10.13-release+4119` |
| **`Entropy`** | Pseudo-transaction where each validator reveals its previous secret and commits to the next one |
| **`Random`** | Singleton ledger object holding the current seed. Hooks can't read it; RPC can (`ledger_entry` with `random: true`) |
| **`dice(sides)`** | Uniform integer in `[0, sides)` |
| **`util_random(ptr, len)`** | 1 to 512 random bytes |
| **`TOO_LITTLE_ENTROPY` (-46)** | Fewer than 80% of the UNLReport validators revealed in this ledger |
| **`RandomData` in metadata** | The RNG state the transaction's first draw saw, for auditing |
| **Lottery pattern** | Tickets in Hook State, a `CronSet` to close the round, `dice()` to draw, `prepare()` + `emit()` to pay, no partial payments in or out |

---

## Resources

- [Companion repository](https://github.com/Ekiserrepe/learnxahau-rng)
- [Xahau Release 2026.10.13+4119](https://github.com/Xahau/xahaud/releases/tag/2026.10.13-release%2B4119)
- [xahau.js 4.2.0 Release Notes](https://github.com/Xahau/xahau.js/releases/tag/xahau%404.2.0)
- [Xahau Testnet Faucet](https://xahau-test.net/)
- [Xahau Devnets](https://xahau-dev.net/)
- [Xahau Hooks Documentation](https://xahau.network/docs/hooks/)
- [Hooks Builder](https://builder.xahau.network/)

---

If this is your first time here, start with [What is Xahau?](https://dev.to/ekiserrepe/learning-xahau-what-is-xahau-104j) and work your way through the [Learning Xahau series](https://dev.to/ekiserrepe/series/31668).

Have questions about RNG or ideas for what to build with it? Leave a comment below or join the [Xahau Contributors Discord server](https://discord.gg/ds7nb93mYj), where we'll be happy to help.

**Links**

- [Official Website](https://xahau.network/)
- [Official Docs](https://xahau.network/docs)
- [Hooks Builder](https://builder.xahau.network/)
- [Discord Server](https://discord.gg/ds7nb93mYj)
- [Xahaud](https://github.com/Xahau/xahaud)
- [X Account](https://x.com/XahauNetwork)
