#!/usr/bin/env python3
"""
Write one shop's settings into a Molbhav Stall Sign over USB.

Flash the same firmware on every chip, then run this once per chip:

    python3 tools/provision.py --port /dev/cu.usbserial-0001 \
        --agent agent_1a2b3c4d5e --name "Ramesh Sabzi" \
        --server https://molbhav-eta.vercel.app --token <device token> \
        --wifi "MarketWiFi" --wifi-pass "secret"

Only --port and --agent are required. Needs pyserial (pip install pyserial; PlatformIO already has it).
"""

import argparse
import re
import sys
import time

try:
    import serial
except ImportError:
    sys.exit("pyserial is missing: pip install pyserial")

AGENT_ID = re.compile(r"^agent_[0-9a-f]{10}$")


def wait_for(port, text, timeout):
    """Read lines until one contains text. Returns the lines read."""
    lines, end = [], time.time() + timeout
    while time.time() < end:
        line = port.readline().decode(errors="replace").strip()
        if line:
            lines.append(line)
            print("  sign>", line)
            if text in line:
                return lines
    raise TimeoutError(f"no '{text}' from the sign after {timeout} s")


def send(port, command, expect="ok"):
    print(">", command if "token" not in command and "wifi" not in command else command.split(" ")[0] + " ...")
    port.write((command + "\n").encode())
    end = time.time() + 5
    while time.time() < end:
        line = port.readline().decode(errors="replace").strip()
        if not line:
            continue
        print("  sign>", line)
        if line.startswith("error"):
            raise RuntimeError(line)
        if line.startswith(expect):
            return
    raise TimeoutError(f"no reply to '{command.split(' ')[0]}'")


def main():
    p = argparse.ArgumentParser(description="Set up a Molbhav Stall Sign for one shop.")
    p.add_argument("--port", required=True, help="e.g. /dev/cu.usbserial-0001 or COM5")
    p.add_argument("--agent", required=True, help="the shop's agent id, e.g. agent_1a2b3c4d5e")
    p.add_argument("--name", help="stall name shown on the screen")
    p.add_argument("--server", help="server address, e.g. https://molbhav-eta.vercel.app")
    p.add_argument("--token", help="device token for this shop")
    p.add_argument("--wifi", help="Wi-Fi network name (no spaces)")
    p.add_argument("--wifi-pass", default="", help="Wi-Fi password")
    a = p.parse_args()

    agent = a.agent.strip().lower()
    if not AGENT_ID.match(agent):
        sys.exit("--agent must be agent_ followed by 10 hex digits (0-9, a-f)")
    if a.wifi and " " in a.wifi:
        sys.exit("--wifi can't contain spaces here; set it on the sign's setup page instead")

    with serial.Serial(a.port, 115200, timeout=0.5) as port:
        # Opening the port resets most boards. Wait until the firmware is ready for commands
        # (it can spend up to 15 s trying the saved Wi-Fi first).
        port.dtr = False
        port.rts = True
        time.sleep(0.1)
        port.rts = False
        print("Waiting for the sign to start...")
        wait_for(port, "Ready.", 45)

        send(port, f"set agent {agent}")
        if a.name:
            send(port, f"set name {a.name}")
        if a.server is not None:
            send(port, f"set server {a.server or '-'}")
        if a.token is not None:
            send(port, f"set token {a.token or '-'}")
        if a.wifi:
            send(port, f"wifi {a.wifi} {a.wifi_pass}".rstrip())
            time.sleep(4)  # let the Wi-Fi driver save the network
        send(port, "restart", expect="ok restarting")

        wait_for(port, "Ready.", 45)
        port.write(b"show\n")
        wait_for(port, "status", 5)

    print(f"\nDone. This sign now broadcasts as MolbhavA-{agent}")


if __name__ == "__main__":
    main()
