import { PUBLIC_ORIGIN } from "@/lib/editorial/seo";
import { publishedSitemapPage, SITEMAP_PAGE_SIZE } from "@/lib/editorial/sitemap";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const {total} = await publishedSitemapPage(0);
    const count = Math.max(1,Math.ceil(total/SITEMAP_PAGE_SIZE));
    const entries = Array.from({length:count},(_,id)=>`<sitemap><loc>${PUBLIC_ORIGIN}/sitemap/${id}.xml</loc></sitemap>`).join("");
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`,{headers:{"Content-Type":"application/xml; charset=utf-8","Cache-Control":"no-store"}});
  } catch { return new Response("Sitemap is temporarily unavailable.",{status:503,headers:{"Cache-Control":"no-store"}}); }
}
