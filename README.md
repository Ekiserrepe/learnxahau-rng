# Learning Xahau: RNG

Companion code for the Learning Xahau article about the **RNG amendment** (consensus random numbers for Hooks: `dice()` and `util_random()`), introduced in xahaud `2026.10.13-release+4119`.

Targets the **Xahau Testnet** (`wss://xahau-test.net`) with **xahau.js 4.2.0**.

> [!WARNING]
> **Educational purposes only.** This code was written to illustrate how the RNG amendment works. It is **not production-ready** and **has not been audited**. Use it at your own risk: the author takes no responsibility for any security flaw, bug or loss of funds resulting from its use.
>
> The lottery example is a technical demo. Lotteries, raffles and games of chance are regulated activities in most jurisdictions. Before running anything similar with real money, check the regulations that apply in your country.

```bash
npm install
cp .env.example .env              # fill in 5 testnet seeds from https://xahau-test.net/
node 00-create-accounts.js        # optional: creates and funds them for you (~4 min, faucet cooldown)

# Part 1: dice
node 01-check-rng.js              # amendment status + the Random ledger object
node 02-dice-install.js           # installs build/rng_dice.wasm
node 03-dice-roll.js [sides]      # rolls a die via Invoke (2-255 sides, default 6)

# Part 2: lottery
node 04-lottery-install.js        # admin installs build/lottery.wasm (+ asfTshCollect)
node 05-lottery-buy-ticket.js 1   # player 1 buys a 10 XAH ticket (also 2, 3)
node 06-lottery-close.js [secs]   # admin closes the round with a CronSet (default 30s); the hook draws and pays
```

The compiled hooks are in `build/`. To recompile `hooks/*.c` you need LLVM clang + wasm-ld: `npm run build:hooks`.

The headers in `hooks/include/` come from [xahaud](https://github.com/Xahau/xahaud/tree/dev/hook) (ISC license).

## Acknowledgements

Many thanks to the **Xahau Core Devs** for their work on [xahaud](https://github.com/Xahau/xahaud). Thanks to them we can build with new features like RNG, Cron and the rest of the Hooks APIs that make examples like these possible.
