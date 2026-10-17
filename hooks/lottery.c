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
