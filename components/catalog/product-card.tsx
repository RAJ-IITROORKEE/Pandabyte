import Image from "next/image";
import Link from "next/link";
import type { PublishedRecord } from "@/lib/editorial/published";
import styles from "./catalog.module.css";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

function cardPrice(product: PublishedRecord<"products">): string {
  const prices = product.variants.map((variant) => variant.effectivePricePaise);
  if (!prices.length || prices.some((price) => price === null)) return "Price unavailable";
  const values = prices as number[];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? money.format(min / 100) : `From ${money.format(min / 100)}`;
}

function productImage(product: PublishedRecord<"products">) {
  const mediaId = product.document.mediaIds[0];
  if (!mediaId) return null;
  const block = product.document.blocks.find((item) => item.type === "image" && item.mediaId === mediaId);
  return { mediaId, alt: block?.type === "image" ? block.alt : product.title };
}

export function ProductCard({ product, featured = false }: { product: PublishedRecord<"products">; featured?: boolean }) {
  const image = productImage(product);
  const sourceObservation = product.document.sourceObservation;
  const available = product.variants.some((variant) => variant.availability === "available");
  const availabilityLabel = product.variants.length === 0 ? "Availability unavailable" : available ? "Available" : "Unavailable";
  const onSale = product.variants.some((variant) => variant.isOnSale);

  return (
    <article className={`${styles.productCard} ${featured ? styles.featuredCard : ""} ${sourceObservation ? styles.sourceObservationCard : ""}`}>
      <Link className={styles.productCardLink} href={`/products/${encodeURIComponent(product.slug)}`}>
        <div className={styles.productCardImage}>
          {image ? <Image
            src={`/api/media/${image.mediaId}`}
            alt={image.alt}
            width={800}
            height={600}
            unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 30vw"
          /> : <span>No product image published</span>}
        </div>
        <div className={styles.productCardContent}>
          {featured ? <h3>{product.title}</h3> : <h2>{product.title}</h2>}
          {featured && product.variants.length === 1 && <p className={styles.featuredSku}>SKU: {product.variants[0].sku}</p>}
          {!featured && product.summary && <p className={styles.productCardSummary}>{product.summary}</p>}
          {sourceObservation ? <div className={styles.sourceObservation}>
            <p className={styles.sourceObservationLabel}>Source observation · not a current offer</p>
            <p className={styles.sourceObservationPrice}>{sourceObservation.priceText.trim() || "No source price recorded"}</p>
            <p className={styles.sourceObservationCapture}>
              Capture date: {sourceObservation.capturedAt.slice(0, 10)}. Timing is unverified and may reflect scrape job start.
            </p>
          </div> : <>
            <div className={styles.productCardTags}>
              <span className={available ? styles.available : styles.unavailable}>{availabilityLabel}</span>
              {onSale && <span className={styles.saleTag}>Sale</span>}
            </div>
            <p className={styles.productCardPrice}>{cardPrice(product)}</p>
          </>}
          <span className={styles.productCardAction}><span>View product</span></span>
        </div>
      </Link>
    </article>
  );
}
