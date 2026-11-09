import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { EXAONE_PROVIDER_ID, exaoneProvider } from "./provider";

export default function exaone(pi: ExtensionAPI): void {
  pi.registerProvider(EXAONE_PROVIDER_ID, {
    ...exaoneProvider,
    // OMP treats unresolved key references as literals. Register the fallback
    // only when set; /login credentials remain available and take precedence.
    ...(process.env.EXAONE_API_KEY?.trim() ? { apiKey: "EXAONE_API_KEY" } : {}),
  });
}
