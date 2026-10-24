import Image from "next/image";
import { Pause, Play } from "lucide-react";
import styles from "./home.module.css";

const brands = [
  { name: "Seeed Studio", light: "seeed-color.png", dark: "seeed-white.png" },
  { name: "M5Stack", light: "m5stack-color.png", dark: "m5stack-white.png" },
  { name: "Waveshare", light: "waveshare-site-logo.png" },
  { name: "Espressif", light: "espressif-drone.png" },
];

export function HomeBrands() {
  return <section className={styles.brands} aria-label="Logos shown on PandaByte: Seeed Studio, M5Stack, Waveshare and Espressif">
    <label className={styles.brandPause}>
      <input type="checkbox" aria-label="Pause logo animation" />
      <span><Pause className={styles.pauseIcon} aria-hidden="true" /><Play className={styles.playIcon} aria-hidden="true" /></span>
    </label>
    <div className={styles.brandViewport}>
      <div className={styles.brandTrack}>
        {[false, true].map((duplicate) => <ul key={String(duplicate)} className={styles.brandGroup} aria-hidden={duplicate || undefined}>
          {brands.map((brand) => <li className={styles.brandLogo} key={brand.name}>
            <Image className={brand.dark ? styles.brandLight : undefined} src={`/brand/industry/${brand.light}`} alt={duplicate ? "" : `${brand.name} logo`} width={176} height={52} />
            {brand.dark && <Image className={styles.brandDark} src={`/brand/industry/${brand.dark}`} alt={duplicate ? "" : `${brand.name} logo`} width={176} height={52} />}
          </li>)}
        </ul>)}
      </div>
    </div>
  </section>;
}
