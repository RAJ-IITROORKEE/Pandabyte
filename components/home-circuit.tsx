"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { pointerToCircuitPlane, type PlanePoint } from "./home-circuit-geometry";
import styles from "./home-circuit.module.css";

const devices = {
  air: {
    name: "BMV080",
    detail: "Particulate matter · I²C",
    x: 150,
    y: 190,
    width: 102,
    height: 233,
    assetWidth: 997,
    assetHeight: 1578,
    port: [325, 280],
    screen: { heading: "AIR QUALITY · SAMPLE", value: "6.8", unit: "µg/m³", detail: "PM2.5 · PM1 4.1 / PM10 9.2" },
  },
  oled: {
    name: "0.96″ OLED",
    detail: "128 × 64 · I²C display",
    x: 160,
    y: 450,
    width: 205,
    height: 190,
    assetWidth: 1385,
    assetHeight: 1136,
    port: [325, 409],
    screen: { heading: "I²C DISPLAY · SAMPLE", value: "128 × 64", unit: "", detail: "DEMO OUTPUT · NOT LIVE DATA" },
  },
  dht: {
    name: "DHT11",
    detail: "Temperature & humidity",
    x: 740,
    y: 203,
    width: 240,
    height: 87,
    assetWidth: 1983,
    assetHeight: 793,
    port: [555, 280],
    screen: { heading: "DHT11 · SAMPLE", value: "24", unit: "°C", detail: "HUMIDITY · 58% RH" },
  },
  light: {
    name: "TEMT6000",
    detail: "Ambient light · analog",
    x: 735,
    y: 449,
    width: 200,
    height: 104,
    assetWidth: 1934,
    assetHeight: 813,
    port: [555, 409],
    screen: { heading: "TEMT6000 · SAMPLE", value: "2128", unit: "ADC", detail: "12-BIT SAMPLE · NOT LUX" },
  },
} as const;

type SensorId = keyof typeof devices;
type Selection = SensorId | "board" | null;
type Point = PlanePoint;
type Rotation = { x: number; y: number };
type Gesture = "moving" | "rotating" | null;
type Drag = {
  pointerId: number;
  id: SensorId | null;
  startX: number;
  startY: number;
  startPoint: Point | null;
  startPosition: Point | null;
  startRotation: Rotation;
  lastClientX: number;
  lastClientY: number;
  moved: boolean;
  captureTarget: HTMLElement;
};

const cableColors = ["#303a35", "#d9655a", "#dadcd0", "#e8bb51"];
const initialRotation = { x: 17, y: -7 };
const oledBars = [4, 7, 5, 8, 3, 6, 8, 5];
const airParticles = [9, 32, 55, 78, 14, 37, 60, 83, 19];

function initialPositions(): Record<SensorId, Point> {
  return Object.fromEntries(Object.entries(devices).map(([id, device]) => [id, { x: device.x, y: device.y }])) as Record<SensorId, Point>;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampPosition(id: SensorId, point: Point): Point {
  const device = devices[id];
  return {
    x: clamp(point.x, device.width / 2 + 16, 884 - device.width / 2),
    y: clamp(point.y, device.height / 2 + 12, 558 - device.height / 2),
  };
}

function getCablePath(id: SensorId, point: Point, offset: number) {
  const device = devices[id];
  const [portX, portY] = device.port;
  if (id === "dht" || id === "light") {
    const startY = portY + offset;
    const endX = point.x - device.width / 2 + 4;
    const endY = point.y + offset;
    return `M${portX} ${startY} C${portX + 55} ${startY} ${endX - 42} ${endY} ${endX} ${endY}`;
  }

  const startY = portY + offset;
  const endX = point.x + offset;
  const endY = point.y + (id === "air" ? device.height / 2 - 3 : -device.height / 2 - 6);
  return id === "air"
    ? `M${portX} ${startY} C${portX - 76} ${startY} ${endX} ${endY + 65} ${endX} ${endY}`
    : `M${portX} ${startY} C${portX - 76} ${startY} ${endX} ${endY - 60} ${endX} ${endY}`;
}

function sampleFor(selection: Selection) {
  if (selection === "board") {
    return { heading: "PANDABYTE / xC6", value: "Concept", unit: "", detail: "PROPOSED ROUTES · SAMPLE VALUES" };
  }
  if (selection) return devices[selection].screen;
  return { heading: "PANDABYTE / xC6", value: "Ready", unit: "", detail: "SELECT A SENSOR · SAMPLE VALUES" };
}

function announcementFor(selection: Selection) {
  if (!selection) return "Selection cleared. Display values are samples, not live sensor data.";
  if (selection === "board") return "PandaByte xC6 selected. The shield, pin labels, and routes are proposed concepts, not verified hardware.";
  const device = devices[selection];
  return `${device.name} selected. ${device.screen.heading}. Sample reading: ${device.screen.value} ${device.screen.unit}. Not live sensor data.`;
}

function pointerToPlane(stage: HTMLElement, world: HTMLElement, clientX: number, clientY: number): Point {
  const rect = stage.getBoundingClientRect();
  const matrix = new DOMMatrix(getComputedStyle(world).transform);
  const perspective = Number.parseFloat(getComputedStyle(stage).perspective);
  return pointerToCircuitPlane(clientX, clientY, rect, matrix, perspective);
}

export function HomeCircuit() {
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClickRef = useRef<SensorId | null>(null);
  const positionsRef = useRef<Record<SensorId, Point>>(initialPositions());
  const [positions, setPositions] = useState<Record<SensorId, Point>>(initialPositions);
  const [rotation, setRotation] = useState<Rotation>(initialRotation);
  const [selected, setSelected] = useState<Selection>(null);
  const [hovered, setHovered] = useState<Selection>(null);
  const [focused, setFocused] = useState<Selection>(null);
  const [gesture, setGesture] = useState<Gesture>(null);
  const [announcement, setAnnouncement] = useState("");
  const hasActiveSelectionRef = useRef(false);
  const active = hovered ?? focused ?? selected;
  const screen = sampleFor(active);

  useEffect(() => {
    const stage = stageRef.current;
    const world = worldRef.current;
    if (!stage || !world) return;

    const resize = () => {
      const scale = Math.min(stage.clientWidth / 900, stage.clientHeight / 620);
      world.style.setProperty("--scene-scale", String(scale));
      const drag = dragRef.current;
      if (drag?.id) {
        drag.startPoint = pointerToPlane(stage, world, drag.lastClientX, drag.lastClientY);
        drag.startPosition = positionsRef.current[drag.id];
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (active) hasActiveSelectionRef.current = true;
    if (!hasActiveSelectionRef.current) return;
    const timer = window.setTimeout(() => setAnnouncement(announcementFor(active)), 180);
    return () => window.clearTimeout(timer);
  }, [active]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const stage = stageRef.current;
    const world = worldRef.current;
    if (!stage || !world) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-cable-id]")) return;

    const deviceElement = target?.closest<HTMLElement>("[data-device-id]") ?? null;
    const rawId = deviceElement?.dataset.deviceId;
    if (rawId === "board") return;
    const id = rawId && Object.hasOwn(devices, rawId) ? rawId as SensorId : null;
    const captureTarget = deviceElement ?? stage;
    const startPoint = id ? pointerToPlane(stage, world, event.clientX, event.clientY) : null;
    try { captureTarget.setPointerCapture(event.pointerId); } catch { /* A browser may cancel capture before it is acquired. */ }
    dragRef.current = {
      pointerId: event.pointerId,
      id,
      startX: event.clientX,
      startY: event.clientY,
      startPoint,
      startPosition: id ? positions[id] : null,
      startRotation: rotation,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      moved: false,
      captureTarget,
    };
    suppressClickRef.current = null;
    if (id) setHovered(id);
    setGesture(id ? "moving" : "rotating");
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const stage = stageRef.current;
    const world = worldRef.current;
    if (!drag || !stage || !world || drag.pointerId !== event.pointerId) return;
    drag.lastClientX = event.clientX;
    drag.lastClientY = event.clientY;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) > 4) drag.moved = true;
    if (!drag.moved) return;

    event.preventDefault();
    if (drag.id && drag.startPoint && drag.startPosition) {
      const point = pointerToPlane(stage, world, event.clientX, event.clientY);
      const id = drag.id;
      setPositions((current) => {
        const next = {
          ...current,
          [id]: clampPosition(id, {
            x: drag.startPosition!.x + point.x - drag.startPoint!.x,
            y: drag.startPosition!.y + point.y - drag.startPoint!.y,
          }),
        };
        positionsRef.current = next;
        return next;
      });
    } else if (!drag.id) {
      setRotation({
        x: clamp(drag.startRotation.x - deltaY * 0.14, -22, 42),
        y: clamp(drag.startRotation.y + deltaX * 0.14, -30, 30),
      });
    }
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>, cancelled: boolean, captureLost = false) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!captureLost && drag.captureTarget.hasPointerCapture(event.pointerId)) {
      drag.captureTarget.releasePointerCapture(event.pointerId);
    }
    setGesture(null);
    if (cancelled) {
      suppressClickRef.current = null;
      setHovered(null);
      return;
    }
    if (drag.id && drag.moved) suppressClickRef.current = drag.id;
    setHovered(drag.id);
  }

  function handleStageKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setSelected(null);
      setHovered(null);
      setFocused(null);
    } else if (event.key === "Home") {
      event.preventDefault();
      const reset = initialPositions();
      positionsRef.current = reset;
      setPositions(reset);
      setRotation(initialRotation);
      setSelected(null);
      setHovered(null);
      setFocused(null);
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
    event.stopPropagation();
    setHovered(id);
    setPositions((current) => {
      const next = { ...current, [id]: clampPosition(id, { x: current[id].x + move.x, y: current[id].y + move.y }) };
      positionsRef.current = next;
      return next;
    });
  }

  function toggleSelection(selection: Selection, pointerDetail = 0) {
    if (pointerDetail > 0 && suppressClickRef.current === selection) {
      suppressClickRef.current = null;
      return;
    }
    setSelected((current) => current === selection ? null : selection);
  }

  function handleCableKeyDown(event: KeyboardEvent<SVGPathElement>, id: SensorId) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    toggleSelection(id);
  }

  return (
    <figure className={styles.figure}>
      <div
        ref={stageRef}
        className={styles.stage}
        role="group"
        tabIndex={0}
        aria-label="Interactive circuit illustration. Drag empty space or use arrow keys to rotate the scene."
        aria-describedby="home-circuit-help home-circuit-caption"
        data-rotating={gesture === "rotating"}
        data-moving={gesture === "moving"}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointer(event, false)}
        onPointerCancel={(event) => finishPointer(event, true)}
        onLostPointerCapture={(event) => finishPointer(event, true, true)}
        onKeyDown={handleStageKeyDown}
      >
        <div
          ref={worldRef}
          className={styles.world}
          data-active={Boolean(active)}
          style={{ transform: `translate(-50%, -50%) scale(var(--scene-scale, .9)) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) rotateZ(-3deg)` }}
        >
          <div className={styles.plane} aria-hidden="true" />
          <svg className={styles.wireless} viewBox="0 0 900 620" aria-hidden="true">
            <path d="M440 145 C440 105 510 91 567 91" />
          </svg>
          <span className={styles.cloudRoute} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0" />
              <circle cx="12" cy="20" r="1" />
            </svg>
            Wi-Fi <span>→</span> IoT cloud
          </span>
          <svg className={styles.wires} viewBox="0 0 900 620" role="group" aria-label="Proposed Grove cable routes">
            {(Object.keys(devices) as SensorId[]).map((id) => {
              const point = positions[id];
              const cableActive = Boolean(active && (active === id || id === "oled" || active === "board"));
              return (
                <g key={id} className={styles.wireGroup} data-id={id} data-active={cableActive}>
                  <path className={styles.wireGlow} d={getCablePath(id, point, 0)} />
                  {cableColors.map((color, index) => {
                    const path = getCablePath(id, point, (index - 1.5) * 5);
                    return (
                      <g key={color}>
                        <path className={styles.wireShadow} d={path} />
                        <path className={styles.wireColor} d={path} stroke={color} />
                      </g>
                    );
                  })}
                  <path className={styles.wireFlow} d={getCablePath(id, point, 0)} />
                  <path
                    className={styles.wireHit}
                    d={getCablePath(id, point, 0)}
                    data-cable-id={id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Inspect the proposed ${devices[id].name} cable route`}
                    aria-pressed={selected === id}
                    onPointerEnter={() => setHovered(id)}
                    onPointerLeave={() => setHovered((current) => current === id ? null : current)}
                    onFocus={() => setFocused(id)}
                    onBlur={() => setFocused((current) => current === id ? null : current)}
                    onClick={(event) => toggleSelection(id, event.detail)}
                    onKeyDown={(event) => handleCableKeyDown(event, id)}
                  />
                </g>
              );
            })}
          </svg>
          <div className={styles.carrier} aria-hidden="true">
            <Image src="/hero/grove-shield.svg" alt="" width={300} height={370} unoptimized loading="eager" />
          </div>
          <button
            type="button"
            className={styles.board}
            data-device-id="board"
            data-active={active === "board"}
            aria-label="PandaByte xC6 with proposed Grove shield concept"
            aria-pressed={selected === "board"}
            aria-describedby="home-circuit-caption"
            onClick={(event) => toggleSelection("board", event.detail)}
            onPointerEnter={() => setHovered("board")}
            onPointerLeave={() => setHovered((current) => current === "board" ? null : current)}
            onFocus={() => setFocused("board")}
            onBlur={() => setFocused((current) => current === "board" ? null : current)}
          >
            <span className={styles.boardArt}>
              <Image src="/hero/xc6.webp" alt="" width={1064} height={1478} draggable={false} />
              <span className={styles.pinTags} aria-hidden="true">
                <span className={styles.pin6}>6</span><span className={styles.pin7}>7</span>
                <span className={styles.pin0}>0</span><span className={styles.pin18}>18</span>
              </span>
              <span className={styles.boardLed} aria-hidden="true" />
            </span>
            <span className={styles.boardLabel}>PandaByte xC6<small>ESP32-C6 + Grove shield concept</small></span>
          </button>

          {(Object.keys(devices) as SensorId[]).map((id) => {
            const device = devices[id];
            const point = positions[id];
            return (
              <button
                key={id}
                type="button"
                className={`${styles.sensor} ${styles[`sensor${id[0].toUpperCase()}${id.slice(1)}`]} ${active === id ? styles.sensorActive : ""}`}
                data-device-id={id}
                data-dragging={gesture === "moving" && hovered === id}
                style={{ left: point.x, top: point.y, width: device.width, height: device.height }}
                aria-label={`${device.name}: select to show sample values; drag or use arrow keys to move`}
                aria-pressed={selected === id}
                aria-describedby="home-circuit-help home-circuit-caption"
                onClick={(event) => toggleSelection(id, event.detail)}
                onPointerEnter={() => setHovered(id)}
                onPointerLeave={() => setHovered((current) => current === id ? null : current)}
                onFocus={() => setFocused(id)}
                onBlur={() => setFocused((current) => current === id ? null : current)}
                onKeyDown={(event) => handleSensorKeyDown(event, id)}
              >
                <span className={styles.art} aria-hidden="true">
                  <span className={styles.crop}>
                    <Image
                      className={styles.sensorImage}
                      src={`/hero/${id}.webp`}
                      alt=""
                      width={device.assetWidth}
                      height={device.assetHeight}
                      draggable={false}
                      fetchPriority={id === "air" || id === "dht" ? "high" : undefined}
                    />
                  </span>
                  {id === "air" && (
                    <span className={`${styles.effect} ${styles.particles}`}>
                      {airParticles.map((x, index) => (
                        <i key={index} style={{ "--px": `${x}%`, "--py": `${5 + ((index * 17) % 90)}%`, "--delay": `${index * 0.17}s` } as CSSProperties} />
                      ))}
                    </span>
                  )}
                  {id === "dht" && <span className={`${styles.effect} ${styles.heat}`}><i /><i /><i /></span>}
                  {id === "light" && <span className={`${styles.effect} ${styles.lightRays}`} />}
                  {id === "oled" && (
                    <>
                      <span className={styles.oledPort} />
                      <span className={styles.oledScreen}>
                        <span className={styles.oledHeading}><span>{screen.heading}</span><i /></span>
                        <span className={styles.oledMain}>{screen.value}<small>{screen.unit}</small></span>
                        <span className={styles.oledSub}>{screen.detail}</span>
                        <span className={styles.oledBars}>
                          {oledBars.map((height, index) => <b key={index} style={{ "--bar": `${height}px`, "--delay": `${index * 0.12}s` } as CSSProperties} />)}
                        </span>
                      </span>
                    </>
                  )}
                </span>
                <span className={styles.sensorLabel}>{device.name}<small>{device.detail}</small></span>
              </button>
            );
          })}
        </div>
      </div>
      <figcaption id="home-circuit-caption" className={styles.visuallyHidden}>
        Illustrative circuit only. Sensor readings are samples, not live telemetry. The Grove shield, pin labels, routes, and product compatibility are proposed and unverified; consult manufacturer documentation before building.
      </figcaption>
      <p id="home-circuit-help" className={styles.visuallyHidden}>
        Select or focus a sensor or cable to inspect sample values. Drag a sensor or use its arrow keys to move it. Focus empty circuit space and use arrow keys to rotate. Press Home to reset and Escape to clear selection.
      </p>
      <p className={styles.visuallyHidden} aria-live="polite" aria-atomic="true">{announcement}</p>
    </figure>
  );
}
