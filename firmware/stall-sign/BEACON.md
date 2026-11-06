# Molbhav stall beacon

Every Molbhav Stall Sign broadcasts the same Bluetooth LE advert, so a phone can find the stall in front
of it and ask that stall's agent directly, with no Wi-Fi, pairing or search. This file is the naming
convention the firmware follows. Phone-side scanning code should match it.

## The advert

| Part                          | Value                                                   |
| ----------------------------- | ------------------------------------------------------- |
| Local name (scan response)    | `MolbhavA-<agent id>`, e.g. `MolbhavA-agent_1a2b3c4d5e` |
| Manufacturer data, company id | `0x0BAB` (sent low byte first: `AB 0B`)                 |
| Manufacturer data, payload    | `[version][status][agent id]`                           |
| Flags                         | `0x06` (general discoverable, LE only)                  |
| Transmit power                | +9 dBm                                                  |

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

## Status byte

| Byte | Status    | Should a phone offer the stall?  |
| ---- | --------- | -------------------------------- |
| `0`  | Closed    | No                               |
| `1`  | Open      | Yes                              |
| `2`  | Paused    | No                               |
| `3`  | In a deal | Yes (open, a bargain is running) |

The byte changes the moment a button on the sign is pressed, or when the server reports a change.

## Rules

- **The agent id is the key.** The name and the manufacturer data carry the same agent id. Phones read
  the manufacturer data only: the name has no status byte, so a sign heard by name alone is never
  offered (it may be closed or paused).
- **A sign with no agent id doesn't broadcast.** New chips stay silent until they are set up for a shop,
  so a phone never sees a wrong or placeholder stall.
- **Never change the prefix or company id per shop.** Only the agent id differs between signs.
- **Setup hotspot:** `Molbhav-Setup-XXXX`, where `XXXX` is the last 4 hex digits of the chip's MAC
  address. It is for setting up the sign, not for finding stalls.
- If the format ever changes, raise the version byte and keep phones accepting version `1`.
