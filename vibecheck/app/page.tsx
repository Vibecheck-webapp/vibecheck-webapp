import { Suspense } from "react";
import { ChatSimulator } from "@/components/landing/ChatSimulator";
import { DraftSavedToast } from "@/components/landing/DraftSavedToast";
import { Hero } from "@/components/landing/Hero";

export default function Home() {
  return (
    <>
      <Suspense fallback={null}>
        <DraftSavedToast />
      </Suspense>
      <ChatSimulator />
      <Hero />
    </>
  );
}
