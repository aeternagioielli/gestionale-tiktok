"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";

export function RetryButton() {
  const router = useRouter();
  return (
    <button className="retry-button" type="button" onClick={() => router.refresh()}>
      <RotateCw size={13} /> Riprova
    </button>
  );
}
