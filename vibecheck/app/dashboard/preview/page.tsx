import Link from "next/link";
import { DashboardView } from "@/components/dashboard/DashboardView";
import type { DashboardProfile } from "@/components/dashboard/ProfileCard";

// Dev-only route for eyeballing the dashboard UI before login exists.
// No auth check, no Supabase fetch — just fixed sample data covering every
// context color and every visibility badge. Share/Manage/Buy-credits still
// call the real Server Actions, so those will surface a "must be signed in"
// error here rather than actually mutating anything — that's expected.
// Delete this route once /login exists and the real /dashboard is reachable.

type PreviewState = "default" | "many" | "empty";

const PREVIEW_STATES: PreviewState[] = ["default", "many", "empty"];

function isPreviewState(value: unknown): value is PreviewState {
  return typeof value === "string" && (PREVIEW_STATES as string[]).includes(value);
}

// One mock "signed-in user" per state — credits live here (a user-level
// number, not derived from any profile) alongside the profiles that user
// owns. DashboardView itself derives every stat-row number straight from
// these two fields (profiles.length, profiles filtered by visibility,
// credits passed through as-is), so a state's numbers can never drift from
// its profile list — this is the only place that could happen.
const MOCK_STATES: Record<PreviewState, { username: string; credits: number; profiles: DashboardProfile[] }> = {
  // A real new user: signed up, spent their one free credit building their
  // first (dating) Vibecheck, made it public. Exactly what someone sees
  // the first time they land here.
  default: {
    username: "chima",
    credits: 0,
    profiles: [
      {
        id: "mock-1",
        slug: "chima",
        context: "dating",
        visibility: "public",
        is_primary: true,
        headline: "Looking for my person",
      },
    ],
  },
  // A more established account: three profiles across every context, and
  // credits left over from buying more.
  many: {
    username: "chima",
    credits: 4,
    profiles: [
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
    ],
  },
  // A brand-new account that hasn't built anything yet — still holding its
  // one free signup credit.
  empty: {
    username: "chima",
    credits: 1,
    profiles: [],
  },
};

const STATE_LABEL: Record<PreviewState, string> = {
  default: "Default — new user",
  many: "Many — established account",
  empty: "Empty — nothing built yet",
};

function statePreviewHref(state: PreviewState): string {
  return state === "default" ? "/dashboard/preview" : `/dashboard/preview?state=${state}`;
}

export default async function DashboardPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state: stateParam } = await searchParams;
  const activeState: PreviewState = isPreviewState(stateParam) ? stateParam : "default";
  const { username, credits, profiles } = MOCK_STATES[activeState];

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#2A2112] px-6 py-2 text-center text-[12px] font-semibold text-[#FFE2A0]">
        <span>
          Preview mode — sample data, not signed in. Not linked from anywhere in the app. Showing:{" "}
          <strong>{STATE_LABEL[activeState]}</strong>
        </span>
        <span className="flex items-center gap-2 text-[#FFE2A0]/80">
          {PREVIEW_STATES.map((state) => (
            <Link
              key={state}
              href={statePreviewHref(state)}
              className={
                state === activeState
                  ? "underline decoration-2 underline-offset-2"
                  : "text-[#FFE2A0]/60 hover:text-[#FFE2A0]"
              }
            >
              {state}
            </Link>
          ))}
        </span>
      </div>
      <DashboardView username={username} credits={credits} profiles={profiles} />
    </>
  );
}
