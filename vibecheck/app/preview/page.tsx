import { StoryViewer } from "@/components/viewer/StoryViewer";
import { ORLA_DEMO_CONTEXT, ORLA_DEMO_PHOTO_URL, ORLA_DEMO_SLIDES } from "@/lib/story-slides";

export default function PreviewVibecheckPage() {
  return (
    <StoryViewer context={ORLA_DEMO_CONTEXT} slides={ORLA_DEMO_SLIDES} photoUrl={ORLA_DEMO_PHOTO_URL} />
  );
}
