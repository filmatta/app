import { permanentRedirect } from "next/navigation";

export default function LegacyAccountPage() {
  permanentRedirect("/cuenta");
}
