import { permanentRedirect } from "next/navigation";

export default function HelpCenterLegacyRoute() {
  permanentRedirect("/help");
}
