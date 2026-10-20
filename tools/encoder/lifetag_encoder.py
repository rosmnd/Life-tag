#!/usr/bin/env python3
"""LifeTag desktop encoder.

Pulls orders that finished prep from the LifeTag API, writes each plain-text
payload to an NTAG213/215/216 tag on a PC/SC reader (ACR122U and similar), reads
it back to verify, then marks the order as encoded on the server.

    pip install pyscard
    export ENCODER_TOKEN=...                      # same value as on the server
    python lifetag_encoder.py --server https://your-site.vercel.app
    python lifetag_encoder.py --csv orders.csv    # offline: columns id,payload
    python lifetag_encoder.py --selftest          # no reader or server needed
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request

MAX_PAYLOAD_BYTES = 120  # keep in sync with src/lib/payload.ts

# --------------------------------------------------------------------------
# NDEF text record + TLV (pure functions, unit-testable without hardware)
# --------------------------------------------------------------------------

def text_record(text: str, lang: str = "en") -> bytes:
    body = bytes([len(lang)]) + lang.encode("ascii") + text.encode("utf-8")  # status: UTF-8
    if len(body) > 255:
        raise ValueError("payload too long for a short NDEF record")
    return bytes([0xD1, 0x01, len(body), 0x54]) + body  # MB|ME|SR, TNF=well-known, type 'T'


def ndef_tlv(record: bytes) -> bytes:
    length = bytes([len(record)]) if len(record) < 0xFF else b"\xff" + len(record).to_bytes(2, "big")
    return b"\x03" + length + record + b"\xfe"


def parse_text(memory: bytes) -> str:
    """Extract the first NDEF text record from tag user memory (starting at page 4)."""
    i = 0
    while i < len(memory):
        tag = memory[i]
        if tag == 0x00:
            i += 1
            continue
        if tag == 0xFE:
            break
        if i + 1 >= len(memory):
            break
        if memory[i + 1] == 0xFF:
            length, start = int.from_bytes(memory[i + 2 : i + 4], "big"), i + 4
        else:
            length, start = memory[i + 1], i + 2
        value = memory[start : start + length]
        if tag == 0x03:
            flags, type_len, payload_len = value[0], value[1], value[2]
            if not flags & 0x10:
                raise ValueError("long NDEF records are not supported")
            if value[3 : 3 + type_len] != b"T":
                raise ValueError("first NDEF record is not text")
            payload = value[3 + type_len : 3 + type_len + payload_len]
            lang_len = payload[0] & 0x3F
            return payload[1 + lang_len :].decode("utf-8")
        i = start + length
    raise ValueError("no NDEF message found")


def pad_to(data: bytes, size: int) -> bytes:
    if len(data) > size:
        raise ValueError(f"needs {len(data)} bytes but the tag holds {size}")
    return data + b"\x00" * (size - len(data))


# --------------------------------------------------------------------------
# Tag access over PC/SC (ACR122U pseudo-APDUs)
# --------------------------------------------------------------------------

class TagError(RuntimeError):
    pass


class Tag:
    def __init__(self, connection):
        self.c = connection

    def _tx(self, apdu: list[int]) -> list[int]:
        data, sw1, sw2 = self.c.transmit(apdu)
        if (sw1, sw2) != (0x90, 0x00):
            raise TagError(f"reader returned {sw1:02X}{sw2:02X}")
        return data

    def uid(self) -> str:
        return bytes(self._tx([0xFF, 0xCA, 0x00, 0x00, 0x00])).hex().upper()

    def read(self, page: int, pages: int = 4) -> bytes:
        return bytes(self._tx([0xFF, 0xB0, 0x00, page, pages * 4]))

    def write_page(self, page: int, data: bytes) -> None:
        assert len(data) == 4
        self._tx([0xFF, 0xD6, 0x00, page, 0x04, *data])

    def capacity(self) -> int:
        cc = self.read(3, 1)
        if cc[0] != 0xE1:
            raise TagError("tag is not NDEF formatted (capability container missing)")
        return cc[2] * 8  # NTAG213 -> 144 bytes

    def read_user_memory(self, size: int) -> bytes:
        out = b""
        page = 4
        while len(out) < size:
            out += self.read(page, 4)
            page += 4
        return out[:size]

    def write_user_memory(self, data: bytes) -> None:
        for n in range(0, len(data), 4):
            self.write_page(4 + n // 4, data[n : n + 4])


def write_and_verify(tag: Tag, text: str) -> str:
    """Write `text` as an NDEF text record, read it back, return the tag UID."""
    if len(text.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise TagError("payload is longer than the allowed 120 bytes")
    size = tag.capacity()
    blob = pad_to(ndef_tlv(text_record(text)), size)  # zero-fill wipes any older data
    tag.write_user_memory(blob)
    got = parse_text(tag.read_user_memory(size))
    if got != text:
        raise TagError("read-back did not match what was written")
    return tag.uid()


# --------------------------------------------------------------------------
# Server API (stdlib only)
# --------------------------------------------------------------------------

def call(server: str, token: str, method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        server.rstrip("/") + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"authorization": f"Bearer {token}", "content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.load(res)
    except urllib.error.HTTPError as err:
        detail = err.read().decode(errors="replace")
        raise SystemExit(f"Server said {err.code} for {path}: {detail}") from None


def load_queue(args) -> list[dict]:
    if args.csv:
        with open(args.csv, newline="", encoding="utf-8") as f:
            return [{"id": r["id"], "buyer": r.get("buyer", ""), "payload": r["payload"].replace("\\n", "\n")} for r in csv.DictReader(f)]
    return call(args.server, args.token, "GET", "/api/encoder/queue")["queue"]


# --------------------------------------------------------------------------
# Reader loop
# --------------------------------------------------------------------------

def open_reader(index: int):
    from smartcard.System import readers  # imported late so --selftest needs no pyscard

    found = readers()
    if not found:
        raise SystemExit("No PC/SC reader found. Plug in the ACR122U and install its driver.")
    return found[index]


def wait_for_tag(reader, present: bool, timeout: float | None = None):
    from smartcard.Exceptions import CardConnectionException, NoCardException

    start = time.time()
    while True:
        try:
            conn = reader.createConnection()
            conn.connect()
            if present:
                return conn
        except (NoCardException, CardConnectionException):
            if not present:
                return None
        if timeout and time.time() - start > timeout:
            return None
        time.sleep(0.3)


def run(args) -> int:
    queue = load_queue(args)
    if not queue:
        print("Nothing to encode.")
        return 0
    reader = open_reader(args.reader)
    print(f"Reader: {reader}\n{len(queue)} order(s) to encode.\n")
    done = failed = 0
    for item in queue:
        label = f"#{item['id']} {item.get('buyer', '')}".strip()
        print(f"--- {label}\n{item['payload']}\n")
        if not args.auto:
            answer = input("Place a blank tag, then press Enter to write (s = skip, q = quit): ").strip().lower()
            if answer == "q":
                break
            if answer == "s":
                continue
        else:
            print("Place a blank tag on the reader…")
        conn = wait_for_tag(reader, present=True)
        try:
            uid = write_and_verify(Tag(conn), item["payload"])
        except (TagError, ValueError) as err:
            failed += 1
            print(f"FAILED {label}: {err}\n")
            wait_for_tag(reader, present=False)
            continue
        if not args.csv:
            call(args.server, args.token, "POST", f"/api/encoder/{item['id']}/result",
                 {"verified": True, "via": "desktop", "uid": uid})
        done += 1
        print(f"OK {label} · tag {uid} · verified\n")
        print("Remove the tag…")
        wait_for_tag(reader, present=False)
    print(f"Finished: {done} written, {failed} failed.")
    return 1 if failed else 0


# --------------------------------------------------------------------------
# Self test with a fake NTAG213 (no hardware)
# --------------------------------------------------------------------------

class FakeConnection:
    def __init__(self):
        self.pages = [bytes(4) for _ in range(45)]
        self.pages[3] = bytes([0xE1, 0x10, 0x12, 0x00])

    def transmit(self, apdu):
        ins, page, length = apdu[1], apdu[3], apdu[4]
        if ins == 0xCA:
            return list(bytes.fromhex("04A1B2C3D4E5F6")), 0x90, 0x00
        if ins == 0xB0:
            return list(b"".join(self.pages[page : page + length // 4])), 0x90, 0x00
        if ins == 0xD6:
            self.pages[page] = bytes(apdu[5:9])
            return [], 0x90, 0x00
        return [], 0x6A, 0x81


def selftest() -> None:
    sample = "LIFETAG EMERGENCY INFO\n| NAME: Juan Dela Cruz\n| BLOOD: O+\n| ICE: 0917XXXXXXX\n| ALLERGIES: Penicillin"
    rec = text_record(sample)
    assert parse_text(ndef_tlv(rec)) == sample
    tag = Tag(FakeConnection())
    assert tag.capacity() == 144
    assert write_and_verify(tag, sample) == "04A1B2C3D4E5F6"
    again = "LIFETAG EMERGENCY INFO\n| NAME: Ana\n| BLOOD: A+\n| ICE: 0918 220 1145\n| ALLERGIES: None"
    write_and_verify(tag, again)  # rewrite a shorter text: old bytes must be gone
    assert parse_text(tag.read_user_memory(144)) == again
    assert b"Penicillin" not in tag.read_user_memory(144)
    try:
        write_and_verify(tag, "X" * 130)
    except TagError:
        pass
    else:
        raise AssertionError("oversize payload should be rejected")
    print(f"selftest ok · sample payload {len(sample.encode())} bytes, tlv {len(ndef_tlv(rec))} bytes")


def main() -> int:
    p = argparse.ArgumentParser(description="Write LifeTag orders to NFC tags.")
    p.add_argument("--server", default=os.environ.get("LIFETAG_SERVER"), help="site URL, e.g. https://lifetag.example.com")
    p.add_argument("--token", default=os.environ.get("ENCODER_TOKEN"), help="encoder token (or ENCODER_TOKEN env)")
    p.add_argument("--csv", help="offline queue: CSV with id,payload columns")
    p.add_argument("--reader", type=int, default=0, help="reader index when several are plugged in")
    p.add_argument("--auto", action="store_true", help="write as soon as a tag is detected, no Enter key")
    p.add_argument("--selftest", action="store_true")
    args = p.parse_args()
    if args.selftest:
        selftest()
        return 0
    if not args.csv and not (args.server and args.token):
        p.error("give --server and --token (or ENCODER_TOKEN), or use --csv")
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
