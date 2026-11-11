import { parseWiringSpec, type WireColor, type WiringSpec } from "./block-specs";
import styles from "./blocks.module.css";

const COLORS: Record<WireColor, string> = { red: "#d9483b", black: "var(--foreground)", yellow: "#c9a227", green: "#2f9e5b", blue: "#3b82d9", orange: "#e0802b", white: "var(--muted)" };
const PART_W = 150, ROW = 22, HEAD = 30, GAP = 150, PAD = 14;

function Diagram({ spec }: { spec: WiringSpec }) {
  const cols = spec.parts.length;
  const col = new Map(spec.parts.map((p, i) => [p.id, i]));
  const colOf = (ref: string) => col.get(ref.slice(0, ref.indexOf(".")))!;
  // A wire attaches to the edge facing its other end; same-column wires use the right edge.
  const sideOf = (self: string, other: string): 1 | -1 => (colOf(other) < colOf(self) ? -1 : 1);
  const sides = new Map<string, Set<1 | -1>>();
  const arches: number[] = []; // wire indexes that skip over a column
  spec.wires.forEach((w, i) => {
    (sides.get(w.from) ?? sides.set(w.from, new Set()).get(w.from)!).add(sideOf(w.from, w.to));
    (sides.get(w.to) ?? sides.set(w.to, new Set()).get(w.to)!).add(sideOf(w.to, w.from));
    if (Math.abs(colOf(w.from) - colOf(w.to)) > 1) arches.push(i);
  });
  const LANE = 12;
  const TOP = PAD + (arches.length ? arches.length * LANE + 6 : 0);
  const W = PAD * 2 + cols * PART_W + (cols - 1) * GAP;
  const H = TOP + PAD + HEAD + Math.max(...spec.parts.map(p => p.pins.length)) * ROW + 8;
  const px = (ci: number) => PAD + ci * (PART_W + GAP);
  const pinY = (ref: string) => { const p = spec.parts[colOf(ref)]; return TOP + HEAD + p.pins.indexOf(ref.slice(ref.indexOf(".") + 1)) * ROW + ROW / 2; };
  const edgeX = (ref: string, side: 1 | -1) => px(colOf(ref)) + (side === 1 ? PART_W : 0);
  return <svg viewBox={`0 0 ${W} ${H}`} width={W} role="img" aria-label={`Connection diagram${spec.title ? `: ${spec.title}` : ""}. ${spec.wires.length} wires; see the connection list below.`}>
    {spec.parts.map((p, ci) => <g key={p.id}>
      <rect className={styles.wPart} x={px(ci)} y={TOP} width={PART_W} height={H - TOP - PAD} rx={8} />
      <text className={styles.wTitle} x={px(ci) + PART_W / 2} y={TOP + 19} textAnchor="middle">{p.label}</text>
      {p.pins.map(pin => {
        const ref = `${p.id}.${pin}`, used = sides.get(ref), y = pinY(ref);
        const both = used?.size === 2, onRight = used?.size === 1 && used.has(1);
        return <g key={pin}>
          <text className={styles.wPin} x={both ? px(ci) + PART_W / 2 : onRight ? px(ci) + PART_W - 10 : px(ci) + 10} y={y + 4} textAnchor={both ? "middle" : onRight ? "end" : "start"}>{pin}</text>
          {[...(used ?? [])].map(s => <circle key={s} className={styles.wDot} cx={edgeX(ref, s)} cy={y} r={3.5} />)}
        </g>;
      })}
    </g>)}
    {spec.wires.map((w, i) => {
      const sa = sideOf(w.from, w.to), sb = sideOf(w.to, w.from);
      const ax = edgeX(w.from, sa), ay = pinY(w.from), bx = edgeX(w.to, sb), by = pinY(w.to);
      const lane = arches.indexOf(i);
      let d: string, lx = (ax + bx) / 2, ly = (ay + by) / 2 - 5;
      if (lane >= 0) {
        const ly0 = PAD + lane * LANE, o = sa; // arch above the part boxes
        d = `M${ax},${ay} C${ax + o * 40},${ay} ${ax + o * 40},${ly0} ${ax + o * 80},${ly0} L${bx + sb * 80},${ly0} C${bx + sb * 40},${ly0} ${bx + sb * 40},${by} ${bx},${by}`;
        ly = ly0 - 3;
      } else {
        const dx = sa === sb ? 40 : Math.max(40, Math.abs(bx - ax) / 2);
        d = `M${ax},${ay} C${ax + sa * dx},${ay} ${bx + sb * dx},${by} ${bx},${by}`;
        if (sa === sb) lx = ax + 30;
      }
      return <g key={i}>
        <path d={d} fill="none" stroke={COLORS[w.color ?? "white"]} strokeWidth={2} strokeLinecap="round" opacity={0.9}><title>{`${w.from} to ${w.to}`}</title></path>
        {w.label && <text className={styles.wLabel} x={lx} y={ly} textAnchor="middle">{w.label}</text>}
      </g>;
    })}
  </svg>;
}

export function WiringBlock({ code }: { code: string }) {
  const spec = parseWiringSpec(code);
  if (!spec) return <figure className={styles.block}><pre className={styles.plain}><code>{code}</code></pre><p className={styles.note}>Connection diagram could not be drawn</p></figure>;
  return <figure className={styles.block}>
    <div className={styles.header}><span>{spec.title ?? "Connections"}</span></div>
    <div className={styles.scroll}><Diagram spec={spec} /></div>
    <details className={styles.details}>
      <summary>Connection list</summary>
      <div className={styles.scroll}><table className={styles.table}>
        <thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Note</th></tr></thead>
        <tbody>{spec.wires.map((w, i) => <tr key={i}><td>{w.from}</td><td>{w.to}</td><td>{[w.color, w.label].filter(Boolean).join(", ")}</td></tr>)}</tbody>
      </table></div>
    </details>
  </figure>;
}
