import { ApiError } from "../../errorHelpers/ApiError.js";

const blockedTerms = ["idiot", "stupid", "scam", "fraud"];
export type ModerationResult = { comment: string | null; flagged: boolean; reason?: string };

export const moderateReviewComment = (input?: string | null): ModerationResult => {
  if (!input) return { comment: null, flagged: false };
  const comment = input.replace(/\s+/g, " ").trim();
  if (/<\/?[a-z][\s\S]*>/i.test(comment) || /javascript:/i.test(comment)) {
    throw new ApiError(
      400,
      "HTML and executable content are not allowed in reviews",
      "UNSAFE_REVIEW_CONTENT",
    );
  }
  const lower = comment.toLowerCase();
  const profanity = blockedTerms.find((term) => new RegExp(`\\b${term}\\b`, "i").test(lower));
  if (profanity) return { comment, flagged: true, reason: "Potentially abusive language" };
  const links = comment.match(/https?:\/\//gi)?.length ?? 0;
  if (links >= 3 || /(.)\1{9,}/i.test(comment))
    return { comment, flagged: true, reason: "Potential spam" };
  return { comment, flagged: false };
};

export const moderateDoctorResponse = (response: string): string => {
  const result = moderateReviewComment(response);
  if (result.flagged)
    throw new ApiError(
      400,
      "Doctor response must use professional language",
      "UNPROFESSIONAL_RESPONSE",
    );
  return result.comment!;
};
