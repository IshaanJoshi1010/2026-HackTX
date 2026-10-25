"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataRow } from "@/ui/profile/DataRow";
import { miles, sentence, usd } from "@/ui/profile/format";
import { useForkStore } from "@/ui/store/useForkStore";

export interface ProfileConfirmCardProps {
  className?: string;
  compact?: boolean;
}

export function ProfileConfirmCard({ className, compact = false }: ProfileConfirmCardProps) {
  const twin = useForkStore((s) => s.twin);
  const profile = useForkStore((s) => s.explore.confirmedProfile);

  if (!twin) return null;

  const prov = profile.provenance;
  const financeProv = twin.finance?.provenance?.financeType ?? prov.financeType;

  return (
    <div
      data-testid="profile-confirm-card"
      className={cn(
        "text-left transition-colors",
        // compact is just the rows, for the details sheet; the full card keeps its frame and title
        !compact && "rounded-lg border border-line bg-ink/[0.03] p-4",
        className,
      )}
    >
      {!compact && (
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div>
          <h4 className="text-sm font-medium text-ink">Confirmed Driver Profile</h4>
          <p className="text-xs text-ink/50">Baseline inputs feeding all scenario projections</p>
        </div>
        <span className="flex items-center gap-1 rounded bg-ink/15 px-2 py-0.5 text-[11px] font-medium text-ink">
          <Check className="size-3 text-ink" />
          <span>Active</span>
        </span>
      </div>
      )}

      <div className={cn(!compact && "mt-1")}>
        <DataRow
          label="Location"
          value={profile.location || "Not specified"}
          source={prov.location}
        />
        <DataRow
          label="Current odometer"
          value={miles(twin.mileage)}
          source={prov.mileage}
        />
        <DataRow
          label="Annual driving"
          value={`${miles(profile.annualMiles)}/yr`}
          source={prov.annualMiles}
        />
        <DataRow
          label="Household size"
          value={`${profile.householdSize} ${profile.householdSize === 1 ? "person" : "people"}`}
          source={prov.householdSize}
        />
        <DataRow
          label="Children"
          value={profile.children}
          source={prov.children}
        />
        <DataRow
          label="Cargo requirement"
          value={sentence(profile.cargoNeed)}
          source={prov.cargoNeed}
        />
        <DataRow
          label="Local fuel price"
          value={`${usd(profile.fuelPricePerGal)}/gal`}
          source={prov.fuelPricePerGal}
        />
        <DataRow
          label="Finance structure"
          value={sentence(profile.financeType)}
          source={financeProv}
        />
      </div>
    </div>
  );
}
