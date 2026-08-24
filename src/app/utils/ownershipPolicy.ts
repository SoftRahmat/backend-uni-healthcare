import type { ApplicationRole } from "../shared/constants/roles.js";
import { ApiError } from "../errorHelpers/ApiError.js";

export type ResourceActor = {
  userId: string;
  role: ApplicationRole;
  profileId?: string;
};

export type OwnershipPolicy = {
  ownerUserId?: string;
  ownerProfileId?: string;
  allowAdminOverride?: boolean;
  adminOverrideRoles?: ApplicationRole[];
};

/** Must be called inside service methods before returning or mutating owned data. */
export const assertResourceOwnership = (
  actor: ResourceActor,
  policy: OwnershipPolicy,
): { usedAdminOverride: boolean } => {
  const ownsByUser = Boolean(policy.ownerUserId && policy.ownerUserId === actor.userId);
  const ownsByProfile = Boolean(
    policy.ownerProfileId && actor.profileId && policy.ownerProfileId === actor.profileId,
  );
  if (ownsByUser || ownsByProfile) return { usedAdminOverride: false };

  const overrideRoles = policy.adminOverrideRoles ?? ["SUPER_ADMIN", "ADMIN"];
  if (policy.allowAdminOverride !== false && overrideRoles.includes(actor.role)) {
    return { usedAdminOverride: true };
  }

  throw new ApiError(403, "You do not own this resource", "RESOURCE_ACCESS_DENIED");
};
