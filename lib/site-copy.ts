const defaults = {
  supportTitle: "Engineering Support",
  supportText: "Contact PandaByte for IoT development, setup, and troubleshooting support.",
  footerTagline: "Development boards, sensors and IoT kits for your next build.",
  copyrightName: "PandaByte",
};

export type SiteCopyInput = Partial<Record<keyof typeof defaults, string | null | undefined>>;

export function getSiteCopy(input?: SiteCopyInput | null) {
  const text = (value: string | null | undefined, fallback: string) => value?.trim() || fallback;
  return {
    supportTitle: text(input?.supportTitle, defaults.supportTitle),
    supportText: text(input?.supportText, defaults.supportText),
    footerTagline: text(input?.footerTagline, defaults.footerTagline),
    copyrightName: text(input?.copyrightName, defaults.copyrightName),
  };
}
