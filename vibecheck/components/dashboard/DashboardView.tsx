"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CreditModal } from "@/components/dashboard/CreditModal";
import { ManageModal } from "@/components/dashboard/ManageModal";
import { ProfileCard, type DashboardProfile } from "@/components/dashboard/ProfileCard";
import { ShareModal } from "@/components/dashboard/ShareModal";
import { profileUrl } from "@/lib/profile-meta";

export function DashboardView({
  username,
  credits,
  profiles,
}: {
  username: string;
  credits: number;
  profiles: DashboardProfile[];
}) {
  const [shareId, setShareId] = useState<string | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);
  const [creditModalOpen, setCreditModalOpen] = useState(false);

  const shareProfile = profiles.find((p) => p.id === shareId) ?? null;
  const manageProfile = profiles.find((p) => p.id === manageId) ?? null;

  const publicCount = profiles.filter((p) => p.visibility === "public").length;
  const quickShareProfile =
    profiles.find((p) => p.is_primary && p.visibility !== "private") ??
    profiles.find((p) => p.visibility !== "private") ??
    null;

  return (
    <section className="mx-auto w-full max-w-[1200px] px-6 py-12 lg:px-10 lg:py-16">
      <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-[700px]">
          <div className="text-[13px] font-semibold tracking-wide text-white/50 uppercase">
            Creator dashboard
          </div>
          <h1 className="mt-3.5 font-inter text-[36px] font-black text-white lg:text-[44px]">
            Your Vibechecks.
          </h1>
          <p className="mt-2 text-[18px] text-white/60">
            Your profiles, your links, your rules. View, edit, share or make any Vibecheck
            private whenever you want.
          </p>
        </div>
        <Link
          href="/dashboard/new"
          className="inline-flex h-[45px] items-center justify-center rounded-[14px] bg-[#FF96C3] px-5 text-center font-inter text-[16px] font-extrabold text-neutral-900"
        >
          + Create Vibecheck
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Card className="bg-[#171514] p-4">
          <div className="text-[28px] font-black text-[#FFF8F2]">{profiles.length}</div>
          <div className="mt-1 text-[12px] text-[#C7C0BA]">Vibechecks</div>
        </Card>
        <Card className="bg-[#171514] p-4">
          <div className="text-[28px] font-black text-[#FFF8F2]">{publicCount}</div>
          <div className="mt-1 text-[12px] text-[#C7C0BA]">Public links</div>
        </Card>
        <Card className="bg-[#171514] p-4">
          <div className="text-[28px] font-black text-[#FFF8F2]">{credits}</div>
          <div className="mt-1 text-[12px] text-[#C7C0BA]">Available credits</div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="bg-[#141313] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold tracking-wide text-white/50 uppercase">
                My profile links
              </div>
              <h2 className="mt-1.5 text-[24px] font-black text-white">
                Share when you&apos;re ready.
              </h2>
            </div>
            <Button variant="ghost" onClick={() => setCreditModalOpen(true)}>
              Buy credits
            </Button>
          </div>

          <div className="mt-5 grid gap-3">
            {profiles.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-[#4A4541] bg-[#141313] p-7 text-center">
                <div className="text-[34px]">✨</div>
                <h3 className="mt-2 text-[18px] font-black text-white">
                  Your first Vibecheck starts here.
                </h3>
                <p className="mt-1 text-white/60">
                  Create a profile, then come back here to manage and share its link.
                </p>
                <Link
                  href="/dashboard/new"
                  className="mt-3.5 inline-flex h-[45px] items-center justify-center rounded-[14px] bg-[#FF96C3] px-5 font-inter text-[16px] font-extrabold text-neutral-900"
                >
                  Create Vibecheck
                </Link>
              </div>
            ) : (
              profiles.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  username={username}
                  onShare={() => setShareId(profile.id)}
                  onManage={() => setManageId(profile.id)}
                />
              ))
            )}
          </div>

          <p className="mt-4 text-[13px] text-white/40">
            Public links can be found by anyone, including search engines. Unlisted links only
            work for people you send them to. Private links stop working for everyone until you
            change visibility again.
          </p>
        </Card>

        <div className="grid gap-4">
          <Card className="bg-[#141313] p-5">
            <div className="text-[13px] font-semibold tracking-wide text-white/50 uppercase">
              Quick share
            </div>
            <h2 className="mt-1.5 text-[24px] font-black text-white">Your easiest CTA.</h2>
            <p className="mt-1 text-white/60">
              Copy your most shareable Vibecheck&apos;s link in one tap.
            </p>

            {quickShareProfile ? (
              <div className="mt-3.5 rounded-[18px] border border-[#4A3941] bg-gradient-to-br from-[#21181D] to-[#171514] p-4">
                <div className="text-[13px] font-semibold tracking-wide text-white/50 uppercase">
                  Fastest share
                </div>
                <strong className="mt-1 block text-[#FFF8F2]">
                  {quickShareProfile.headline || "Your Vibecheck"}
                </strong>
                <div className="mt-2 flex items-center gap-2.5">
                  <div className="min-w-0 flex-1 truncate rounded-xl border border-[#2A2726] bg-[#0F0E0E] px-3.5 py-3 text-[#F3ECE6]">
                    {profileUrl(username, quickShareProfile)}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShareId(quickShareProfile.id)}
                    className="shrink-0 rounded-[14px] bg-[#FF96C3] px-4 py-3 text-[14px] font-extrabold text-neutral-900"
                  >
                    Share ↗
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3.5 text-[13px] text-white/40">
                Make one of your profiles public or unlisted to unlock a one-tap share link.
              </p>
            )}
          </Card>

          <Card className="bg-[#141313] p-5">
            <div className="text-[13px] font-semibold tracking-wide text-white/50 uppercase">
              Recent reactions
            </div>
            <div className="mt-3 rounded-[16px] border border-dashed border-[#4A4541] p-5 text-center text-[13px] text-white/40">
              Coming soon.
            </div>
          </Card>
        </div>
      </div>

      {shareProfile && (
        <ShareModal profile={shareProfile} username={username} onClose={() => setShareId(null)} />
      )}
      {manageProfile && (
        <ManageModal
          profile={manageProfile}
          username={username}
          onClose={() => setManageId(null)}
          onShare={() => {
            setManageId(null);
            setShareId(manageProfile.id);
          }}
        />
      )}
      {creditModalOpen && <CreditModal onClose={() => setCreditModalOpen(false)} />}
    </section>
  );
}
