"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./catalog.module.css";

export type ProductGalleryImage = { id: string; alt: string };

export function ProductGallery({ images }: { images: ProductGalleryImage[] }) {
  const [selectedId, setSelectedId] = useState(images[0]?.id ?? "");
  const selected = images.find((image) => image.id === selectedId) ?? images[0];

  return (
    <section className={styles.gallery} aria-label="Product images">
      <div className={styles.galleryMain}>
        {selected ? <Image
          src={`/api/media/${selected.id}`}
          alt={selected.alt}
          width={1200}
          height={1200}
          unoptimized
          preload
          sizes="(max-width: 900px) 100vw, 50vw"
        /> : <p className={styles.galleryEmpty}>No product images have been published.</p>}
      </div>
      {images.length > 1 && <div className={styles.galleryThumbs} role="group" aria-label="Choose an image">
        {images.map((image, index) => <button
          className={styles.galleryThumb}
          type="button"
          key={image.id}
          aria-label={`Show product image ${index + 1}`}
          aria-pressed={selected?.id === image.id}
          onClick={() => setSelectedId(image.id)}
        >
          <Image src={`/api/media/${image.id}?w=96`} alt="" width={96} height={96} unoptimized />
        </button>)}
      </div>}
    </section>
  );
}
