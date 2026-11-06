# Molbhav stall beacon

Every Molbhav Stall Sign broadcasts the same Bluetooth LE advert, so a phone can find the stall in front
of it and ask that stall's agent directly, with no Wi-Fi, pairing or search. This file is the naming
convention the firmware follows. Phone-side scanning code should match it.

## The advert

| Part                          | Value                                                     |
| ----------------------------- | --------------------------------------------------------- |
| Local name (scan response)    | The stall's ENS label (below), else `MolbhavA-<agent id>` |
| Manufacturer data, company id | `0x0BAB` (sent low byte first: `AB 0B`)                   |
| Manufacturer data, payload    | `[version][status][agent id]`                             |
| Flags                         | `0x06` (general discoverable, LE only)                    |
| Transmit power                | +9 dBm                                                    |

Payload bytes after the company id:

| Byte | Meaning                                               |
| ---- | ----------------------------------------------------- |
| 0    | Version, `1`                                          |
| 1    | Status (below)                                        |
| 2–17 | Agent id, 16 ASCII bytes: `agent_` + 10 lowercase hex |

Example for `agent_1a2b3c4d5e`, open:

```
AB 0B 01 01 61 67 65 6E 74 5F 31 61 32 62 33 63 34 64 35 65
            a  g  e  n  t  _  1  a  2  b  3  c  4  d  5  e
```

## ENS label (scan response)

Once the stall's agent has its ENS name (e.g. `mohd-soyeb-khan.molbhav.eth`), the server sends its
label in the sign's state as `ensLabel`, and the sign uses it as its local name in the scan response:

```
Advertisement   02 01 06 | 15 FF AB 0B 01 01 "agent_078a8df588"      (unchanged)
Scan response   10 09 "mohd-soyeb-khan"                              → mohd-soyeb-khan.molbhav.eth
```

- A scan response holds 31 bytes and the name's header takes 2, so the label must be **3–29
  characters** of `a-z`, `0-9` and single inner hyphens. A longer label isn't sent (`ensLabel` is
  `""`), and the sign keeps `MolbhavA-<agent id>`.
- Phones add `.molbhav.eth` (the Molbhav app shows the name it heard). Any scanner can resolve it on
  ENS: its `agent-endpoint[a2a]` record is the Agent Card, and the card names it back. A label without
  the manufacturer data is ignored.
- The label belongs to the agent id it came with, and is kept across restarts: a sign set up for
  another shop drops it until the server sends the new one. A server that sends no `ensLabel` field
  (one older than ENS labels) leaves the saved label alone.
- To set it by hand over USB serial (e.g. before the server sends it): `set ens mohd-soyeb-khan`, or
  `set ens -` to go back to `MolbhavA-<agent id>`.
- Phones read the name only with an active scan (the default on Android and iOS). A passive scanner
  still finds the stall by its agent id.

## Status byte

| Byte | Status    | Should a phone offer the stall?  |
| ---- | --------- | -------------------------------- |
| `0`  | Closed    | No                               |
| `1`  | Open      | Yes                              |
| `2`  | Paused    | No                               |
| `3`  | In a deal | Yes (open, a bargain is running) |

The byte changes the moment a button on the sign is pressed, or when the server reports a change.

## Rules

- **The agent id is the key.** The manufacturer data carries the agent id and status. The name is
  either the ENS label or `MolbhavA-<agent id>`, and has no status byte, so a sign heard by name alone
  is never offered (it may be closed or paused).
- **A sign with no agent id doesn't broadcast.** New chips stay silent until they are set up for a shop,
  so a phone never sees a wrong or placeholder stall.
- **Never change the `MolbhavA-` prefix or company id per shop.** Only the agent id and the ENS label
  differ between signs.
- **Setup hotspot:** `Molbhav-Setup-XXXX`, where `XXXX` is the last 4 hex digits of the chip's MAC
  address. It is for setting up the sign, not for finding stalls.
- If the format ever changes, raise the version byte and keep phones accepting version `1`.
