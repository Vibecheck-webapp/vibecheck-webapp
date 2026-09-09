import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  CONTEXT_COVER_CLASS,
  CONTEXT_COVER_TEXT,
  CONTEXT_LABEL,
  profilePath,
  profileUrl,
} from "@/lib/profile-meta";
import type { ProfileRow } from "@/lib/supabase/types";

const VISIBILITY_BADGE: Record<ProfileRow["visibility"], string> = {
  public: "border-[#285C49] bg-[#10271F] text-[#A8E8CF]",
  unlisted: "border-[#58461F] bg-[#2A2112] text-[#FFE2A0]",
  private: "border-[#2A2726] bg-[#24201F] text-[#E4D8D0]",
};

const VISIBILITY_DOT: Record<ProfileRow["visibility"], string> = {
  public: "●",
  unlisted: "◐",
  private: "○",
};

export type DashboardProfile = Pick<
  ProfileRow,
  "id" | "slug" | "context" | "visibility" | "is_primary" | "headline"
>;

export function ProfileCard({
  profile,
  username,
  onShare,
  onManage,
}: {
  profile: DashboardProfile;
  username: string;
  onShare: () => void;
  onManage: () => void;
}) {
  const canView = profile.visibility !== "private";
  const linkClasses =
    "inline-flex items-center justify-center rounded-[14px] border border-[#2A2726] bg-transparent px-3 py-2 text-[12px] font-extrabold text-white/80 hover:bg-[#1A1817]";

  return (
    <div className="grid grid-cols-[60px_1fr] items-center gap-4 rounded-[22px] border border-[#2A2726] bg-[#171514] p-4 sm:grid-cols-[76px_1fr_auto]">
      <div
        className={`grid h-20 w-[60px] items-end rounded-2xl p-2.5 text-[11px] leading-tight font-black sm:h-24 sm:w-[76px] ${CONTEXT_COVER_CLASS[profile.context]}`}
      >
        {CONTEXT_COVER_TEXT[profile.context]}
      </div>

      <div className="min-w-0">
        <div className="truncate text-[17px] font-black text-[#FFF8F2]">
          {profile.headline || CONTEXT_LABEL[profile.context]}
        </div>
        <div className="mt-1.5 truncate text-[13px] text-[#FFB1D0]">
          🔗 {profileUrl(username, profile)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${VISIBILITY_BADGE[profile.visibility]}`}
          >
            {VISIBILITY_DOT[profile.visibility]}{" "}
            {profile.visibility[0].toUpperCase() + profile.visibility.slice(1)}
          </span>
          <span className="text-[12px] text-white/60">{CONTEXT_LABEL[profile.context]}</span>
        </div>
      </div>

      <div className="col-span-2 flex flex-wrap justify-start gap-1.5 sm:col-span-1 sm:justify-end">
        <Button variant="primary" size="sm" onClick={onShare}>
          Share
        </Button>
        {canView ? (
          <Link href={profilePath(username, profile)} className={linkClasses}>
            View
          </Link>
        ) : (
          <Button variant="ghost" size="sm" disabled title="Make this profile public or unlisted to view it">
            View
          </Button>
        )}
        <Link href={`/dashboard/profiles/${profile.id}/edit`} className={linkClasses}>
          Edit
        </Link>
        <Button variant="ghost" size="sm" onClick={onManage}>
          Manage
        </Button>
      </div>
    </div>
  );
}
