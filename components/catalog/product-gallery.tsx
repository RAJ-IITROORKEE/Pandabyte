"use client";

import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRef, useState } from "react";
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const slideCount = images.length + (model3d ? 1 : 0);
  const selectedIndex = Math.min(storedIndex, Math.max(0, slideCount - 1));
  const selected = images[selectedIndex];
  const modelSelected = !!model3d && selectedIndex === images.length;

  return (
    <section className={styles.gallery} aria-label={`${title} product gallery`}>
      <div className={styles.galleryMain}>
        {selected ? <button ref={openButton} type="button" className={styles.galleryOpen} onClick={() => setDialogOpen(true)} aria-label={`Enlarge image ${selectedIndex + 1} of ${images.length}`}><Image
          src={`/api/media/${selected.id}?w=960`}
          alt={selected.alt}
          width={1200}
          height={1200}
          unoptimized
          preload
          sizes="(max-width: 900px) 100vw, 50vw"
        /><span>{images.length} {images.length === 1 ? "photo" : "photos"}</span></button> : modelSelected && model3d ? <ProductModelViewer model={model3d} title={title} /> : <p className={styles.galleryEmpty}>No product images have been published.</p>}
      </div>
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal><Dialog.Overlay className={styles.galleryOverlay} /><Dialog.Content className={styles.galleryDialog} onCloseAutoFocus={event => { event.preventDefault(); openButton.current?.focus(); }} onKeyDown={event => {
          if (event.key === "ArrowRight") { event.preventDefault(); setSelectedIndex((selectedIndex + 1) % images.length); }
          if (event.key === "ArrowLeft") { event.preventDefault(); setSelectedIndex((selectedIndex + images.length - 1) % images.length); }
        }}>
          <Dialog.Title className={styles.srOnly}>{title} photos</Dialog.Title>
          <Dialog.Description className={styles.srOnly}>Use the arrow buttons or left and right arrow keys to browse photos.</Dialog.Description>
          <Dialog.Close className={styles.galleryClose} aria-label="Close gallery"><X aria-hidden="true" /></Dialog.Close>
          {selected && <Image src={`/api/media/${selected.id}`} alt={selected.alt} width={1600} height={1600} unoptimized sizes="90vw" />}
          {images.length > 1 && <div className={styles.galleryDialogNav}>
            <button type="button" aria-label="Previous photo" onClick={() => setSelectedIndex((selectedIndex + images.length - 1) % images.length)}><ChevronLeft aria-hidden="true" /></button>
            <span role="status" aria-live="polite" aria-atomic={true}>Photo {selectedIndex + 1} of {images.length}</span>
            <button type="button" aria-label="Next photo" onClick={() => setSelectedIndex((selectedIndex + 1) % images.length)}><ChevronRight aria-hidden="true" /></button>
          </div>}
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
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
