"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import styles from "./home-circuit.module.css";

const devices = {
  air: { name: "BMV080", detail: "Particulate matter · I²C", x: 150, y: 190, width: 102, height: 233, sample: "PM2.5 6.8 µg/m³; PM1 4.1; PM10 9.2" },
  oled: { name: "0.96″ OLED", detail: "128 × 64 · I²C display", x: 160, y: 450, width: 205, height: 190, sample: "Display module · sample screen" },
  dht: { name: "DHT11", detail: "Temperature & humidity", x: 740, y: 203, width: 240, height: 87, sample: "Temperature 24 °C; humidity 58% RH" },
  light: { name: "TEMT6000", detail: "Ambient light · analog", x: 735, y: 449, width: 200, height: 104, sample: "Raw ADC sample 2128 of 4095; not calibrated lux" },
} as const;

type SensorId = keyof typeof devices;
type Point = { x: number; y: number };
type Rotation = { x: number; y: number };
type Selection = SensorId | "board" | null;
type Drag = {
  pointerId: number;
  id: Selection;
  startX: number;
  startY: number;
  startPosition: Point | null;
  startRotation: Rotation;
  moved: boolean;
  captureTarget: HTMLElement;
};

const colors = ["#303a35", "#d9655a", "#dadcd0", "#e8bb51"];
const initialRotation = { x: 17, y: -7 };

function initialPositions(): Record<SensorId, Point> {
  return Object.fromEntries(Object.entries(devices).map(([id, device]) => [id, { x: device.x, y: device.y }])) as Record<SensorId, Point>;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getCablePath(id: SensorId, point: Point, offset: number) {
  const device = devices[id];
  if (id === "dht" || id === "light") {
    const sy = (id === "dht" ? 280 : 409) + offset;
    const ex = point.x - device.width / 2 + 4;
    const ey = point.y + offset;
    return `M555 ${sy} C610 ${sy} ${ex - 42} ${ey} ${ex} ${ey}`;
  }

  const sx = 325 + offset;
  const sy = (id === "air" ? 280 : 409) + offset;
  const ex = point.x + offset;
  const ey = id === "air" ? point.y + device.height / 2 - 3 : point.y - device.height / 2 + 6;
  return id === "air"
    ? `M${sx} ${sy} C${sx - 76} ${sy} ${ex} ${ey + 65} ${ex} ${ey}`
    : `M${sx} ${sy} C${sx - 76} ${sy} ${ex} ${ey - 60} ${ex} ${ey}`;
}

function sampleFor(selection: Selection) {
  if (!selection) return { heading: "PANDABYTE · CIRCUIT ILLUSTRATION", value: "Ready", unit: "", detail: "Select a sensor · sample values" };
  if (selection === "board") return { heading: "PANDABYTE xC6", value: "Illustration", unit: "", detail: "Proposed shield layout · unverified" };
  const device = devices[selection];
  if (selection === "air") return { heading: "BMV080 · SAMPLE", value: "6.8", unit: "µg/m³", detail: "PM2.5 · PM1 4.1 · PM10 9.2" };
  if (selection === "dht") return { heading: "DHT11 · SAMPLE", value: "24", unit: "°C", detail: "Humidity · 58% RH" };
  if (selection === "light") return { heading: "TEMT6000 · SAMPLE", value: "2128", unit: "ADC", detail: "Raw 12-bit value · not calibrated lux" };
  return { heading: device.name.toUpperCase(), value: "Sample screen", unit: "", detail: "Illustrative display output" };
}

function announcementFor(selection: Selection) {
  if (!selection) return "Selection cleared. The circuit readings are illustrative samples, not live sensor data.";
  if (selection === "board") return "PandaByte xC6 board selected. The Grove shield and routing shown are proposed concepts, not verified hardware.";
  return `${devices[selection].name} selected. Sample reading: ${devices[selection].sample}. These values are not live sensor data.`;
}

export function HomeCircuit() {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [positions, setPositions] = useState<Record<SensorId, Point>>(initialPositions);
  const [rotation, setRotation] = useState<Rotation>(initialRotation);
  const [selected, setSelected] = useState<Selection>(null);
  const [hovered, setHovered] = useState<Selection>(null);
  const [announcement, setAnnouncement] = useState("");
  const active = selected ?? hovered;
  const screen = sampleFor(active);

  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncement(announcementFor(selected)), 120);
    return () => window.clearTimeout(timer);
  }, [selected]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const deviceElement = target?.closest<HTMLElement>("[data-device-id]") ?? null;
    const rawId = deviceElement?.dataset.deviceId;
    const id: Selection = rawId === "board" ? "board" : rawId && rawId in devices ? rawId as SensorId : null;
    const captureTarget = deviceElement ?? stage;
    try { captureTarget.setPointerCapture(event.pointerId); } catch { /* Pointer may have been cancelled by the browser. */ }
    dragRef.current = {
      pointerId: event.pointerId,
      id,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: id && id !== "board" ? positions[id] : null,
      startRotation: rotation,
      moved: false,
      captureTarget,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) > 4) drag.moved = true;
    if (!drag.moved) return;

    event.preventDefault();
    if (drag.id && drag.id !== "board" && drag.startPosition) {
      const sensorId = drag.id;
      const startPosition = drag.startPosition;
      const rect = stage.getBoundingClientRect();
      const device = devices[sensorId];
      setPositions((current) => ({
        ...current,
        [sensorId]: {
          x: clamp(startPosition.x + (deltaX * 900) / rect.width, device.width / 2 + 16, 884 - device.width / 2),
          y: clamp(startPosition.y + (deltaY * 620) / rect.height, device.height / 2 + 12, 558 - device.height / 2),
        },
      }));
    } else if (!drag.id) {
      setRotation({
        x: clamp(drag.startRotation.x - deltaY * 0.14, -22, 42),
        y: clamp(drag.startRotation.y + deltaX * 0.14, -30, 30),
      });
    }
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.captureTarget.hasPointerCapture(event.pointerId)) drag.captureTarget.releasePointerCapture(event.pointerId);

    if (drag.id && drag.id !== "board") {
      setSelected(drag.id);
      setHovered(drag.id);
    } else if (drag.id === "board") {
      setSelected((current) => current === "board" ? null : "board");
      setHovered("board");
    }
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.captureTarget.hasPointerCapture(event.pointerId)) drag.captureTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setHovered(null);
  }

  function handleStageKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setSelected(null);
      setHovered(null);
    } else if (event.key === "Home") {
      event.preventDefault();
      setPositions(initialPositions());
      setRotation(initialRotation);
      setSelected(null);
      setHovered(null);
    } else if (event.target === event.currentTarget && event.key.startsWith("Arrow")) {
      event.preventDefault();
      setRotation((current) => ({
        x: clamp(current.x + (event.key === "ArrowUp" ? -5 : event.key === "ArrowDown" ? 5 : 0), -22, 42),
        y: clamp(current.y + (event.key === "ArrowLeft" ? -5 : event.key === "ArrowRight" ? 5 : 0), -30, 30),
      }));
    }
  }

  function handleSensorKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: SensorId) {
    const moves: Record<string, Point> = {
      ArrowLeft: { x: -12, y: 0 }, ArrowRight: { x: 12, y: 0 },
      ArrowUp: { x: 0, y: -12 }, ArrowDown: { x: 0, y: 12 },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setPositions((current) => ({
      ...current,
      [id]: {
        x: clamp(current[id].x + move.x, devices[id].width / 2 + 16, 884 - devices[id].width / 2),
        y: clamp(current[id].y + move.y, devices[id].height / 2 + 12, 558 - devices[id].height / 2),
      },
    }));
  }

  function handleDeviceClick(selection: Selection, pointerDetail: number) {
    if (pointerDetail > 0) return;
    setSelected((current) => current === selection ? null : selection);
  }

  return (
    <figure className={styles.figure} aria-labelledby="home-circuit-caption">
      <div
        ref={stageRef}
        className={styles.stage}
        role="group"
        tabIndex={0}
        aria-label="Interactive circuit illustration. Use arrow keys to rotate the scene, Home to reset, and Escape to clear the selection."
        aria-describedby="home-circuit-help home-circuit-caption"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleStageKeyDown}
      >
        <div className={styles.world} style={{ transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) rotateZ(-3deg)` }}>
          <svg className={styles.wires} viewBox="0 0 900 620" preserveAspectRatio="none" aria-hidden="true">
            {(Object.keys(devices) as SensorId[]).map((id) => (
              <g key={id} className={active === id || active === "board" ? styles.activeWire : undefined}>
                {colors.map((color, index) => <path key={color} d={getCablePath(id, positions[id], (index - 1.5) * 5)} stroke={color} />)}
              </g>
            ))}
            <path className={styles.wifiPath} d="M440 145 C440 105 510 91 567 91" />
          </svg>

          <div className={styles.cloudRoute} aria-hidden="true">⌁ Wi-Fi <span>→</span> IoT cloud</div>
          <div className={styles.carrier} aria-hidden="true">
            <Image src="/hero/grove-shield.svg" alt="" width={300} height={370} unoptimized />
          </div>
          <button
            type="button"
            className={`${styles.board} ${active === "board" ? styles.boardActive : ""}`}
            data-device-id="board"
            aria-label="PandaByte xC6 board with a proposed Grove shield concept. Select for illustration details."
            aria-pressed={selected === "board"}
            aria-describedby="home-circuit-caption"
            onClick={(event) => handleDeviceClick("board", event.detail)}
            onPointerEnter={() => setHovered("board")}
            onPointerLeave={() => setHovered((current) => current === "board" ? null : current)}
            onFocus={() => setHovered("board")}
            onBlur={() => setHovered((current) => current === "board" ? null : current)}
          >
            <Image src="/hero/xc6.webp" alt="" width={1064} height={1478} priority draggable={false} />
            <span className={styles.led} aria-hidden="true" />
            <span className={styles.boardLabel}>PandaByte xC6<small>Proposed Grove shield layout</small></span>
          </button>

          {(Object.keys(devices) as SensorId[]).map((id) => {
            const device = devices[id];
            const point = positions[id];
            return (
              <button
                key={id}
                type="button"
                className={`${styles.sensor} ${id === "air" ? styles.sensorAir : ""} ${active === id ? styles.sensorActive : ""}`}
                data-device-id={id}
                style={{ left: `${point.x / 9}%`, top: `${point.y / 6.2}%`, width: `${device.width / 9}%`, height: `${device.height / 6.2}%` }}
                aria-label={`${device.name}. Select to show sample values, or drag or use arrow keys to move.`}
                aria-pressed={selected === id}
                aria-describedby="home-circuit-help home-circuit-caption"
                onClick={(event) => handleDeviceClick(id, event.detail)}
                onPointerEnter={() => setHovered(id)}
                onPointerLeave={() => setHovered((current) => current === id ? null : current)}
                onFocus={() => setHovered(id)}
                onBlur={() => setHovered((current) => current === id ? null : current)}
                onKeyDown={(event) => handleSensorKeyDown(event, id)}
              >
                <Image
                  src={`/hero/${id}.webp`}
                  alt=""
                  width={device.width * 4}
                  height={device.height * 4}
                  draggable={false}
                  priority={id === "air" || id === "dht"}
                />
                {id === "oled" && (
                  <span className={styles.oledScreen} aria-hidden="true">
                    <span className={styles.oledHeading}>{screen.heading}<i /></span>
                    <span className={styles.oledValue}>{screen.value}<small>{screen.unit}</small></span>
                    <span className={styles.oledDetail}>{screen.detail}</span>
                    <span className={styles.oledBars}><i /><i /><i /><i /><i /><i /><i /></span>
                  </span>
                )}
                <span className={styles.sensorLabel}>{device.name}<small>{device.detail}</small></span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.controlCaption}>
        <span>Drag a sensor to move it</span>
        <span>Drag open space to rotate · focus a device to inspect</span>
      </div>
      <div className={styles.readout}>
        <div>
          <p className={styles.readoutTitle}>{active ? (active === "board" ? "Proposed shield concept" : `${devices[active].name} · sample reading`) : "Select a sensor to inspect."}</p>
          <p className={styles.readoutCopy}>{active === "board" ? "The shield, pin allocation, and routes shown are concepts; they are not verified hardware." : active ? devices[active].sample : "Follow an illustrated route to the display. All readings shown are samples, not live data."}</p>
        </div>
        <ul className={styles.legend} aria-label="Illustrated proposed Grove wire labels">
          <li><i className={styles.signal} />SCL</li><li><i className={styles.data} />SDA</li><li><i className={styles.power} />3V3</li><li><i className={styles.ground} />GND</li>
        </ul>
      </div>
      <p className={styles.sampleCue}>Illustrative circuit · sample readings, not live sensor data.</p>
      <figcaption id="home-circuit-caption" className={styles.provenance}>
        Product cutouts are AI-enhanced from PandaByte product photographs. The Grove shield and routing are proposed, unverified concepts, not a wiring guide. Check product compatibility and manufacturer documentation before building.
      </figcaption>
      <p id="home-circuit-help" className={styles.visuallyHidden}>
        Select a sensor to show its sample values. Use its arrow keys to move it. Use arrow keys on the circuit background to rotate. Press Home to reset positions and Escape to clear selection.
      </p>
      <p className={styles.visuallyHidden} aria-live="polite" aria-atomic="true">{announcement}</p>
    </figure>
  );
}
