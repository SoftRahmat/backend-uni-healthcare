export const USER_ROLES = ["PATIENT", "DOCTOR", "ADMIN", "SUPER_ADMIN"] as const;

// Role hierarchy shared by authentication, RBAC, and resource policies.

export type ApplicationRole = typeof USER_ROLES[number];

export const ROLE_RANK: Readonly<Record<ApplicationRole, number>> = Object.freeze({
  PATIENT: 1,
  DOCTOR: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
});
