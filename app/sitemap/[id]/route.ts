import { PUBLIC_ORIGIN } from "@/lib/editorial/seo";
import { publishedSitemapPage, SITEMAP_PAGE_SIZE } from "@/lib/editorial/sitemap";
export const dynamic = "force-dynamic";
const xml = (value:string) => value.replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[character]!);
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id} = await params;
  if (!/^(0|[1-9][0-9]{0,3})\.xml$/.test(id) || Number(id.slice(0,-4))>1000) return new Response("Not found",{status:404});
  const page = Number(id.slice(0,-4));
  try {
    const {items,total} = await publishedSitemapPage(page);
    if (page>0 && page*SITEMAP_PAGE_SIZE>=total) return new Response("Not found",{status:404});
    let entries = items.map((item)=>`<url><loc>${xml(new URL(item.path,PUBLIC_ORIGIN).toString())}</loc><lastmod>${xml(new Date(item.publishedAt).toISOString())}</lastmod></url>`).join("");
    if (page===0 && !items.some((item)=>item.path==="/")) entries=`<url><loc>${PUBLIC_ORIGIN}/</loc></url>`+entries;
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`,{headers:{"Content-Type":"application/xml; charset=utf-8","Cache-Control":"no-store"}});
  } catch { return new Response("Sitemap is temporarily unavailable.",{status:503,headers:{"Cache-Control":"no-store"}}); }
}
