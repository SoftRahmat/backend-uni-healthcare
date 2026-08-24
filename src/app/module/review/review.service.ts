import type { Prisma } from "../../../generated/prisma/client.js";
import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { applicationCache } from "../../lib/cache.js";
import { prisma } from "../../lib/prisma.js";
import type { ApplicationRole } from "../../shared/constants/roles.js";
import { reviewEmailService } from "./review-email.service.js";
import { moderateDoctorResponse, moderateReviewComment } from "./review-moderation.service.js";
import type {
  CreateReviewInput,
  DoctorReviewQuery,
  PatientReviewQuery,
  UpdateReviewInput,
} from "./review.validation.js";

export type ReviewActor = { userId: string; role: ApplicationRole; profileId?: string };
const isAdmin = (role: ApplicationRole) => role === "ADMIN" || role === "SUPER_ADMIN";
const include = {
  patient: true,
  doctor: { include: { specialties: { include: { specialty: true } } } },
  appointment: { include: { schedule: true } },
  response: true,
} satisfies Prisma.ReviewInclude;
type ReviewRecord = Prisma.ReviewGetPayload<{ include: typeof include }>;
const invalidate = (doctorId: string, patientId?: string) =>
  applicationCache.deleteByPrefix(
    `reviews:doctor:${doctorId}:`,
    `doctor:${doctorId}:`,
    "doctors:list:",
    ...(patientId ? [`reviews:patient:${patientId}:`] : []),
  );
const anonymize = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)![0]}.` : `${name[0] ?? "P"}.`;
};
const recalculateDoctor = async (tx: Prisma.TransactionClient, doctorId: string) => {
  const aggregate = await tx.review.aggregate({
    where: { doctorId, isDeleted: false, flaggedAt: null, isVerified: true },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const averageRating = aggregate._avg.rating ?? 0;
  const totalReviews = aggregate._count._all;
  await tx.doctor.update({
    where: { id: doctorId },
    data: {
      averageRating,
      totalReviews,
      isProfileVisible: totalReviews === 0 || averageRating >= 3,
      ratingReviewRequired: totalReviews > 0 && averageRating < 2.5,
    },
  });
  return { averageRating, totalReviews };
};
const publicView = (review: ReviewRecord) => ({
  id: review.id,
  rating: review.rating,
  comment: review.flaggedAt ? "This review is under moderation." : review.comment,
  patientName: review.displayAnonymous ? anonymize(review.patient.name) : review.patient.name,
  isVerified: review.isVerified,
  createdAt: review.createdAt,
  response: review.response
    ? { response: review.response.response, respondedAt: review.response.createdAt }
    : null,
});
type DoctorReviewResult = {
  doctor: {
    id: string;
    name: string;
    specialty: string | null;
    averageRating: number;
    totalReviews: number;
  };
  ratingDistribution: Record<string, number>;
  ratingPercentages: Record<string, number>;
  reviews: ReturnType<typeof publicView>[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export class ReviewService {
  async create(
    input: CreateReviewInput,
    actor: ReviewActor,
    context: RequestContext,
    now = new Date(),
  ) {
    if (actor.role !== "PATIENT")
      throw new ApiError(403, "Only patients can create reviews", "FORBIDDEN");
    const appointment = await prisma.appointment.findFirst({
      where: { id: input.appointmentId, isDeleted: false },
      include: { review: true, patient: true, doctor: true },
    });
    if (!appointment) throw new ApiError(404, "Appointment was not found", "APPOINTMENT_NOT_FOUND");
    if (appointment.status !== "COMPLETED")
      throw new ApiError(
        400,
        "Only completed appointments can be reviewed",
        "APPOINTMENT_NOT_COMPLETED",
      );
    if (actor.profileId !== appointment.patientId)
      throw new ApiError(403, "Only the appointment patient can review", "FORBIDDEN");
    if (appointment.review)
      throw new ApiError(409, "This appointment already has a review", "REVIEW_ALREADY_EXISTS");
    const completedAt = appointment.completedAt ?? appointment.updatedAt;
    if (now.getTime() > completedAt.getTime() + 30 * 86_400_000)
      throw new ApiError(400, "The 30-day review window has expired", "REVIEW_WINDOW_EXPIRED");
    const moderation = moderateReviewComment(input.comment);
    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          doctorId: appointment.doctorId,
          rating: input.rating,
          comment: moderation.comment,
          displayAnonymous: input.displayAnonymous,
          ...(moderation.flagged ? { flaggedAt: now, flagReason: moderation.reason } : {}),
        },
        include,
      });
      await tx.patient.update({
        where: { id: appointment.patientId },
        data: { appointmentDiscountBps: 500 },
      });
      await recalculateDoctor(tx, appointment.doctorId);
      await tx.auditLog.create({
        data: {
          action: "REVIEW_CREATED",
          userId: actor.userId,
          ...context,
          metadata: {
            reviewId: created.id,
            appointmentId: appointment.id,
            doctorId: appointment.doctorId,
            rating: input.rating,
            discountBps: 500,
          },
        },
      });
      if (moderation.flagged)
        await tx.auditLog.create({
          data: {
            action: "REVIEW_FLAGGED",
            userId: actor.userId,
            ...context,
            metadata: { reviewId: created.id, reason: moderation.reason },
          },
        });
      return created;
    });
    invalidate(appointment.doctorId, appointment.patientId);
    await reviewEmailService.notifyCreated({
      doctorEmail: appointment.doctor.email,
      rating: input.rating,
      comment: moderation.flagged ? null : moderation.comment,
      reviewId: review.id,
    });
    return publicView(review);
  }

  async update(
    reviewId: string,
    input: UpdateReviewInput,
    actor: ReviewActor,
    context: RequestContext,
    now = new Date(),
  ) {
    if (actor.role !== "PATIENT")
      throw new ApiError(403, "Only the review author can update it", "FORBIDDEN");
    const existing = await prisma.review.findFirst({
      where: { id: reviewId, isDeleted: false },
      include,
    });
    if (!existing) throw new ApiError(404, "Review was not found", "REVIEW_NOT_FOUND");
    if (actor.profileId !== existing.patientId)
      throw new ApiError(403, "Only the review author can update it", "FORBIDDEN");
    if (now.getTime() > existing.createdAt.getTime() + 7 * 86_400_000)
      throw new ApiError(400, "The review edit window has expired", "REVIEW_EDIT_WINDOW_EXPIRED");
    const moderation = input.comment !== undefined ? moderateReviewComment(input.comment) : null;
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.review.update({
        where: { id: reviewId },
        data: {
          rating: input.rating,
          displayAnonymous: input.displayAnonymous,
          ...(moderation
            ? {
                comment: moderation.comment,
                flaggedAt: moderation.flagged ? now : null,
                flagReason: moderation.reason ?? null,
              }
            : {}),
        },
        include,
      });
      await recalculateDoctor(tx, existing.doctorId);
      await tx.auditLog.create({
        data: {
          action: "REVIEW_UPDATED",
          userId: actor.userId,
          ...context,
          metadata: { reviewId, fields: Object.keys(input) },
        },
      });
      if (moderation?.flagged)
        await tx.auditLog.create({
          data: {
            action: "REVIEW_FLAGGED",
            userId: actor.userId,
            ...context,
            metadata: { reviewId, reason: moderation.reason },
          },
        });
      return saved;
    });
    invalidate(existing.doctorId, existing.patientId);
    return publicView(updated);
  }

  async delete(
    reviewId: string,
    reason: string | undefined,
    actor: ReviewActor,
    context: RequestContext,
    now = new Date(),
  ) {
    const existing = await prisma.review.findFirst({
      where: { id: reviewId, isDeleted: false },
      include,
    });
    if (!existing) throw new ApiError(404, "Review was not found", "REVIEW_NOT_FOUND");
    const admin = isAdmin(actor.role);
    if (!admin && (actor.role !== "PATIENT" || actor.profileId !== existing.patientId))
      throw new ApiError(403, "You cannot delete this review", "FORBIDDEN");
    if (!admin && now.getTime() > existing.createdAt.getTime() + 7 * 86_400_000)
      throw new ApiError(
        400,
        "The review deletion window has expired",
        "REVIEW_DELETE_WINDOW_EXPIRED",
      );
    if (admin && !reason)
      throw new ApiError(
        400,
        "Administrator deletion reason is required",
        "DELETION_REASON_REQUIRED",
      );
    const deleted = await prisma.$transaction(async (tx) => {
      const saved = await tx.review.update({
        where: { id: reviewId },
        data: {
          isDeleted: true,
          deletedAt: now,
          deletedByUserId: actor.userId,
          deletionReason: reason,
        },
      });
      await recalculateDoctor(tx, existing.doctorId);
      await tx.auditLog.create({
        data: {
          action: "REVIEW_DELETED",
          userId: actor.userId,
          ...context,
          metadata: {
            reviewId,
            doctorId: existing.doctorId,
            patientId: existing.patientId,
            reason,
            actorRole: actor.role,
          },
        },
      });
      return saved;
    });
    invalidate(existing.doctorId, existing.patientId);
    await reviewEmailService.notifyDeleted({
      doctorEmail: existing.doctor.email,
      patientEmail: existing.patient.email,
      adminDeleted: admin,
      reason,
    });
    return { id: deleted.id, isDeleted: deleted.isDeleted, deletedAt: deleted.deletedAt };
  }

  async listDoctor(doctorId: string, query: DoctorReviewQuery) {
    const cacheKey = `reviews:doctor:${doctorId}:${JSON.stringify(query)}`;
    const cached = applicationCache.get<DoctorReviewResult>(cacheKey);
    if (cached) return cached;
    const doctor = await prisma.doctor.findFirst({
      where: { id: doctorId, isDeleted: false },
      include: { specialties: { include: { specialty: true } } },
    });
    if (!doctor) throw new ApiError(404, "Doctor was not found", "DOCTOR_NOT_FOUND");
    const where: Prisma.ReviewWhereInput = {
      doctorId,
      isDeleted: false,
      flaggedAt: null,
      rating: query.rating,
      ...(query.verifiedOnly ? { isVerified: true } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              gte: query.startDate ? new Date(`${query.startDate}T00:00:00Z`) : undefined,
              lte: query.endDate ? new Date(`${query.endDate}T23:59:59Z`) : undefined,
            },
          }
        : {}),
    };
    const [reviews, total, distribution] = await prisma.$transaction([
      prisma.review.findMany({
        where,
        include,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.review.count({ where }),
      prisma.review.groupBy({
        by: ["rating"],
        where: { doctorId, isDeleted: false, flaggedAt: null, isVerified: true },
        _count: { _all: true },
      }),
    ]);
    const counts = Object.fromEntries(
      [1, 2, 3, 4, 5].map((rating) => [
        rating,
        distribution.find((row) => row.rating === rating)?._count._all ?? 0,
      ]),
    );
    const result: DoctorReviewResult = {
      doctor: {
        id: doctor.id,
        name: doctor.name,
        specialty: doctor.specialties[0]?.specialty.title ?? null,
        averageRating: doctor.averageRating,
        totalReviews: doctor.totalReviews,
      },
      ratingDistribution: counts,
      ratingPercentages: Object.fromEntries(
        Object.entries(counts).map(([rating, count]) => [
          rating,
          doctor.totalReviews ? (Number(count) / doctor.totalReviews) * 100 : 0,
        ]),
      ),
      reviews: reviews.map(publicView),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
    applicationCache.set(cacheKey, result, 15 * 60);
    return result;
  }

  async listPatient(
    patientId: string,
    query: PatientReviewQuery,
    actor: ReviewActor,
    context: RequestContext,
    now = new Date(),
  ) {
    if (!isAdmin(actor.role) && (actor.role !== "PATIENT" || actor.profileId !== patientId))
      throw new ApiError(403, "Patients can only view their reviews", "FORBIDDEN");
    const where = { patientId, isDeleted: false } satisfies Prisma.ReviewWhereInput;
    const [reviews, total] = await prisma.$transaction([
      prisma.review.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.review.count({ where }),
    ]);
    await prisma.auditLog.create({
      data: {
        action: "REVIEW_LIST_VIEWED",
        userId: actor.userId,
        ...context,
        metadata: { patientId },
      },
    });
    return {
      reviews: reviews.map((review) => {
        const remaining = Math.max(0, review.createdAt.getTime() + 7 * 86_400_000 - now.getTime());
        return {
          ...publicView(review),
          doctor: {
            id: review.doctorId,
            name: review.doctor.name,
            specialty: review.doctor.specialties[0]?.specialty.title ?? null,
          },
          appointment: {
            id: review.appointmentId,
            scheduleDate: review.appointment.schedule.scheduleDate.toISOString().slice(0, 10),
          },
          isEditable: remaining > 0,
          editTimeRemainingMs: remaining,
          updatedAt: review.updatedAt,
        };
      }),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async respond(
    reviewId: string,
    responseInput: string,
    actor: ReviewActor,
    context: RequestContext,
    now = new Date(),
  ) {
    if (actor.role !== "DOCTOR")
      throw new ApiError(403, "Only the reviewed doctor can respond", "FORBIDDEN");
    const review = await prisma.review.findFirst({
      where: { id: reviewId, isDeleted: false },
      include,
    });
    if (!review) throw new ApiError(404, "Review was not found", "REVIEW_NOT_FOUND");
    if (actor.profileId !== review.doctorId)
      throw new ApiError(403, "Only the reviewed doctor can respond", "FORBIDDEN");
    if (review.response)
      throw new ApiError(409, "This review already has a response", "REVIEW_RESPONSE_EXISTS");
    if (now.getTime() > review.createdAt.getTime() + 30 * 86_400_000)
      throw new ApiError(400, "The response window has expired", "RESPONSE_WINDOW_EXPIRED");
    const response = moderateDoctorResponse(responseInput);
    const saved = await prisma.$transaction(async (tx) => {
      const created = await tx.reviewResponse.create({
        data: { reviewId, doctorId: review.doctorId, response },
      });
      await tx.auditLog.create({
        data: {
          action: "REVIEW_RESPONSE_ADDED",
          userId: actor.userId,
          ...context,
          metadata: { reviewId, responseId: created.id },
        },
      });
      return created;
    });
    invalidate(review.doctorId, review.patientId);
    await reviewEmailService.notifyResponse({
      patientEmail: review.patient.email,
      response,
      reviewId,
    });
    return { reviewId, response: saved.response, respondedAt: saved.createdAt };
  }

  async statistics(actor: ReviewActor, now = new Date()) {
    if (!isAdmin(actor.role))
      throw new ApiError(403, "Administrator access is required", "FORBIDDEN");
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const week = new Date(today.getTime() - 7 * 86_400_000);
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const yearAgo = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
    const base = {
      isDeleted: false,
      flaggedAt: null,
      isVerified: true,
    } satisfies Prisma.ReviewWhereInput;
    const [
      all,
      todayCount,
      weekCount,
      monthCount,
      previousMonthCount,
      distribution,
      trendRows,
      doctors,
      lowRated,
      flagged,
    ] = await prisma.$transaction([
      prisma.review.aggregate({ where: base, _count: { _all: true }, _avg: { rating: true } }),
      prisma.review.count({ where: { ...base, createdAt: { gte: today } } }),
      prisma.review.count({ where: { ...base, createdAt: { gte: week } } }),
      prisma.review.count({ where: { ...base, createdAt: { gte: month } } }),
      prisma.review.count({ where: { ...base, createdAt: { gte: previousMonth, lt: month } } }),
      prisma.review.groupBy({ by: ["rating"], where: base, _count: { _all: true } }),
      prisma.review.findMany({
        where: { ...base, createdAt: { gte: yearAgo } },
        select: { createdAt: true, rating: true },
      }),
      prisma.doctor.findMany({
        where: { totalReviews: { gt: 0 }, isDeleted: false },
        orderBy: [{ averageRating: "desc" }, { totalReviews: "desc" }],
        take: 10,
        select: { id: true, name: true, averageRating: true, totalReviews: true },
      }),
      prisma.review.findMany({
        where: { ...base, rating: { lte: 2 } },
        take: 50,
        orderBy: { createdAt: "desc" },
        select: { id: true, appointmentId: true, doctorId: true, rating: true, createdAt: true },
      }),
      prisma.review.findMany({
        where: { isDeleted: false, flaggedAt: { not: null } },
        take: 50,
        orderBy: { flaggedAt: "desc" },
        select: { id: true, doctorId: true, flagReason: true, flaggedAt: true },
      }),
    ]);
    const trends = new Map<string, { count: number; total: number }>();
    for (const row of trendRows) {
      const key = row.createdAt.toISOString().slice(0, 7);
      const value = trends.get(key) ?? { count: 0, total: 0 };
      value.count++;
      value.total += row.rating;
      trends.set(key, value);
    }
    return {
      overview: {
        totalReviews: all._count._all,
        todayReviews: todayCount,
        weekReviews: weekCount,
        monthReviews: monthCount,
        averageRating: all._avg.rating ?? 0,
        growthRate: previousMonthCount
          ? ((monthCount - previousMonthCount) / previousMonthCount) * 100
          : monthCount
            ? 100
            : 0,
      },
      ratingDistribution: Object.fromEntries(
        [1, 2, 3, 4, 5].map((rating) => [
          rating,
          distribution.find((item) => item.rating === rating)?._count._all ?? 0,
        ]),
      ),
      trends: {
        byMonth: [...trends].map(([monthKey, value]) => ({
          month: monthKey,
          count: value.count,
          avgRating: value.total / value.count,
        })),
      },
      topRatedDoctors: doctors,
      doctorsNeedingAttention: await prisma.doctor.findMany({
        where: { averageRating: { lt: 3.5 }, totalReviews: { gt: 0 }, isDeleted: false },
        select: {
          id: true,
          name: true,
          averageRating: true,
          totalReviews: true,
          ratingReviewRequired: true,
        },
      }),
      lowRatedAppointments: lowRated,
      flaggedReviews: flagged,
    };
  }
}
export const reviewService = new ReviewService();
