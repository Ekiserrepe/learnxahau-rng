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
