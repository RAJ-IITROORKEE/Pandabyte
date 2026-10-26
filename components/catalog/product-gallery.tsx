"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./catalog.module.css";
import type { ProductModel3d } from "@/lib/admin/validation";
import { ProductModelViewer } from "./product-model-viewer";

export type ProductGalleryImage = { id: string; alt: string };

export function ProductGallery({ images, model3d, title }: {
  images: ProductGalleryImage[];
  model3d?: ProductModel3d;
  title: string;
}) {
  const [storedIndex, setSelectedIndex] = useState(0);
  const slideCount = images.length + (model3d ? 1 : 0);
  const selectedIndex = Math.min(storedIndex, Math.max(0, slideCount - 1));
  const selected = images[selectedIndex];
  const modelSelected = !!model3d && selectedIndex === images.length;

  return (
    <section className={styles.gallery} aria-label={`${title} product gallery`}>
      <div className={styles.galleryMain}>
        {selected ? <Image
          src={`/api/media/${selected.id}`}
          alt={selected.alt}
          width={1200}
          height={1200}
          unoptimized
          preload
          sizes="(max-width: 900px) 100vw, 50vw"
        /> : modelSelected && model3d ? <ProductModelViewer model={model3d} title={title} /> : <p className={styles.galleryEmpty}>No product images have been published.</p>}
      </div>
      {slideCount > 1 && <div className={styles.galleryThumbs} role="group" aria-label="Choose product media">
        {images.map((image, index) => <button
          className={styles.galleryThumb}
          type="button"
          key={image.id}
          aria-label={`Show product image ${index + 1}`}
          aria-pressed={selectedIndex === index}
          onClick={() => setSelectedIndex(index)}
        >
          <Image src={`/api/media/${image.id}?w=96`} alt="" width={96} height={96} unoptimized />
        </button>)}
        {model3d && <button
          className={`${styles.galleryThumb} ${styles.galleryModelThumb}`}
          type="button"
          key="model3d"
          aria-label={`Show interactive 3D model of ${title}`}
          aria-pressed={modelSelected}
          onClick={() => setSelectedIndex(images.length)}
        >
          <Image src={`/api/media/${model3d.posterId}?w=96`} alt="" width={96} height={96} unoptimized />
          <span aria-hidden="true">3D</span>
        </button>}
      </div>}
    </section>
  );
}
