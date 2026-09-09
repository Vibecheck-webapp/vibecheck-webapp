import { DashboardView } from "@/components/dashboard/DashboardView";
import type { DashboardProfile } from "@/components/dashboard/ProfileCard";

// Dev-only route for eyeballing the dashboard UI before login exists.
// No auth check, no Supabase fetch — just fixed sample data covering every
// context color and every visibility badge. Share/Manage/Buy-credits still
// call the real Server Actions, so those will surface a "must be signed in"
// error here rather than actually mutating anything — that's expected.
// Delete this route once /login exists and the real /dashboard is reachable.

const MOCK_PROFILES: DashboardProfile[] = [
  {
    id: "mock-1",
    slug: "chima",
    context: "dating",
    visibility: "public",
    is_primary: true,
    headline: "Looking for my person",
  },
  {
    id: "mock-2",
    slug: "just-friends",
    context: "friendship",
    visibility: "unlisted",
    is_primary: false,
    headline: "New in town, let's be friends",
  },
  {
    id: "mock-3",
    slug: "get-to-know-me",
    context: "get_to_know",
    visibility: "private",
    is_primary: false,
    headline: null,
  },
];

export default function DashboardPreviewPage() {
  return (
    <>
      <div className="bg-[#2A2112] px-6 py-2 text-center text-[12px] font-semibold text-[#FFE2A0]">
        Preview mode — sample data, not signed in. Not linked from anywhere in the app.
      </div>
      <DashboardView username="chima" credits={4} profiles={MOCK_PROFILES} />
    </>
  );
}
