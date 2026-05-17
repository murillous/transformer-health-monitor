"""
Ponte Serial -> MQTT para a simulacao no Proteus.

Le linhas no formato `[MQTT] topico -> payload_json` da porta COM virtual
exposta pelo COMPIM e republica no broker Mosquitto local. O servidor
(supervision/apps/server) ja escuta o broker e propaga para o dashboard
via WebSocket.

Uso:
    python bridge.py --port COM5 --broker localhost --baud 9600

O firmware no Arduino UNO (Proteus) usa 9600 bps — limitação do simulador.
ESP32 não usa esta ponte (fala MQTT direto). Confirme que o COMPIM e o
Virtual Terminal do Proteus estão configurados com a mesma taxa do firmware.

Requisitos: pyserial, paho-mqtt (ver requirements.txt).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from typing import Optional

import paho.mqtt.client as mqtt
import serial


PADRAO = re.compile(r"\[MQTT\]\s+(\S+)\s+->\s+(.+)")


def conectar_mqtt(broker: str, porta: int) -> mqtt.Client:
    cliente = mqtt.Client(client_id="proteus-bridge")
    cliente.connect(broker, porta, keepalive=30)
    cliente.loop_start()
    return cliente


def conectar_serial(porta: str, baud: int) -> serial.Serial:
    return serial.Serial(porta, baud, timeout=1)


def reescrever_ts_unix(payload: str) -> str:
    """Substitui o uptime do Arduino pelo timestamp Unix da maquina."""
    try:
        dados = json.loads(payload)
        if "ts" in dados:
            dados["ts"] = int(time.time())
            return json.dumps(dados, separators=(",", ":"))
    except (json.JSONDecodeError, TypeError):
        pass
    return payload


def loop(ser: serial.Serial, cliente: mqtt.Client, quiet: bool, debug: bool) -> None:
    while True:
        bruto: Optional[bytes] = ser.readline()
        if not bruto:
            continue
        linha = bruto.decode(errors="ignore").strip()
        if not linha:
            continue
        m = PADRAO.match(linha)
        if not m:
            if debug:
                print(f"[skip] {linha}", file=sys.stderr)
            continue
        topico, payload = m.group(1), m.group(2)
        payload = reescrever_ts_unix(payload)
        cliente.publish(topico, payload, qos=0)
        if not quiet:
            print(f"-> {topico} {payload}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True, help="Porta COM virtual (ex.: COM5)")
    parser.add_argument("--baud", type=int, default=9600)
    parser.add_argument("--broker", default="localhost")
    parser.add_argument("--broker-port", type=int, default=1883)
    parser.add_argument("--quiet", action="store_true", help="Suprime log de mensagens publicadas")
    parser.add_argument("--debug", action="store_true", help="Loga linhas que não casam regex [MQTT] (ruidoso)")
    args = parser.parse_args()

    try:
        ser = conectar_serial(args.port, args.baud)
    except serial.SerialException as exc:
        print(f"Erro abrindo serial {args.port}: {exc}", file=sys.stderr)
        return 1

    try:
        cli = conectar_mqtt(args.broker, args.broker_port)
    except OSError as exc:
        print(f"Erro conectando broker {args.broker}:{args.broker_port}: {exc}", file=sys.stderr)
        ser.close()
        return 1

    print(f"Lendo {args.port}@{args.baud} -> {args.broker}:{args.broker_port}")
    try:
        loop(ser, cli, quiet=args.quiet, debug=args.debug)
    except KeyboardInterrupt:
        pass
    finally:
        cli.loop_stop()
        cli.disconnect()
        ser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
