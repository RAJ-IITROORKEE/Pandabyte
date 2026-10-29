import type { CSSProperties } from "react";
import Image from "next/image";
import { Pause, Play } from "lucide-react";
import styles from "./home-brands.module.css";

// Adapted from SmoothUI logo-cloud-3; see docs/licenses/smoothui.txt.
export type BrandLogo = { name: string; image: string; href?: string; width?: number };

export const industryBrands: BrandLogo[] = [
  { name: "Seeed Studio", image: "seeed-color.png", width: 176 },
  { name: "M5Stack", image: "m5stack-color.png", width: 164 },
  { name: "Waveshare", image: "waveshare-site-logo.png", width: 176 },
  { name: "Espressif", image: "espressif-drone.png", width: 176 },
];

type Props = {
  title: string;
  description: string;
  logos?: BrandLogo[];
  className?: string;
  speed?: "slow" | "normal" | "fast";
};

const durations = { slow: "60s", normal: "40s", fast: "20s" };

export function HomeBrands({ title, description, logos = industryBrands, className, speed = "slow" }: Props) {
  if (!logos.length) return null;
  return <section className={[styles.brands, className].filter(Boolean).join(" ")} aria-label={title}>
    <header className={styles.heading}>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
    <label className={styles.pause}>
      <input type="checkbox" aria-label="Pause logo animation" />
      <span><Pause className={styles.pauseIcon} aria-hidden="true" /><Play className={styles.playIcon} aria-hidden="true" /></span>
    </label>
    <div className={styles.viewport}>
      <div className={styles.track} style={{ "--marquee-duration": durations[speed] } as CSSProperties}>
        {[false, true].map(duplicate => <ul key={String(duplicate)} className={styles.group} aria-hidden={duplicate || undefined}>
          {logos.map(brand => <li className={styles.logo} key={brand.name}>
            {brand.href && !duplicate ? <a href={brand.href} aria-label={brand.name}>
              <Image src={`/brand/industry/${brand.image}`} alt="" width={brand.width ?? 176} height={52} style={{ maxWidth: brand.width ?? 176 }} />
            </a> : <Image src={`/brand/industry/${brand.image}`} alt={duplicate ? "" : `${brand.name} logo`} width={brand.width ?? 176} height={52} style={{ maxWidth: brand.width ?? 176 }} />}
          </li>)}
        </ul>)}
      </div>
    </div>
  </section>;
}
