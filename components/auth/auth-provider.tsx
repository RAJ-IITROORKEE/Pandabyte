"use client";

import { ChakraProvider, createSystem, defaultConfig } from "@chakra-ui/react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { useServerInsertedHTML } from "next/navigation";
import { useState, type ReactNode } from "react";

const system = createSystem({
  ...defaultConfig,
  preflight: false,
  cssVarsRoot: ".pb-auth",
  globalCss: {},
});

export function AuthProvider({ children, nonce }: { children: ReactNode; nonce?: string }) {
  // Based on Chakra UI's Next.js App Router streaming registry.
  const [{ cache, flush }] = useState(() => {
    const cache = createCache({ key: "pb-auth", nonce });
    cache.compat = true;
    const previousInsert = cache.insert;
    let inserted: string[] = [];
    cache.insert = (...args) => {
      if (cache.inserted[args[1].name] === undefined) inserted.push(args[1].name);
      return previousInsert(...args);
    };
    return { cache, flush: () => { const names = inserted; inserted = []; return names; } };
  });

  useServerInsertedHTML(() => {
    const names = flush();
    if (!names.length) return null;
    const css = names.map((name) => cache.inserted[name]).join("");
    return <style nonce={nonce} data-emotion={`${cache.key} ${names.join(" ")}`} dangerouslySetInnerHTML={{ __html: css }} />;
  });

  return <CacheProvider value={cache}><ChakraProvider value={system}>{children}</ChakraProvider></CacheProvider>;
}
