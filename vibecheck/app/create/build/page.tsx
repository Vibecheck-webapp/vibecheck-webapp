import { Suspense } from "react";
import { BuilderView } from "@/components/builder/BuilderView";

// useSearchParams inside BuilderView requires a Suspense boundary, or Next
// forces this whole route out of static generation. Since /create/build is
// entirely client-driven anyway, isolating it here keeps the rest of the
// app's static pages unaffected.
export default function CreateBuildPage() {
  return (
    <Suspense fallback={null}>
      <BuilderView />
    </Suspense>
  );
}
