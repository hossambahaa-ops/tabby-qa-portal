import { sb } from "../lib/supabase.js";

// Surveys + responses API. RLS does the real authorisation:
//   - everyone reads surveys (deleted_at IS NULL); only admin+ writes
//   - everyone inserts their own survey_responses row; unique
//     constraint blocks duplicates; only admin+ reads everyone's
//
// The "mandatory survey modal" on every page calls listActiveSurvey
// + listMyResponse to decide whether to render. The /admin/surveys
// page calls listAllSurveys + listResponsesForSurvey.

export const listActiveSurvey = ({ token }) =>
  sb.query("surveys", {
    token,
    select: "id,title,intro_message,created_by,created_at,expires_at",
    filters: "is_active=eq.true&deleted_at=is.null&order=created_at.desc&limit=1",
  }).catch(() => []);

export const listAllSurveys = ({ token }) =>
  sb.query("surveys", {
    token,
    select: "*",
    filters: "deleted_at=is.null&order=created_at.desc",
  }).catch(() => []);

export const listMyResponse = ({ token, surveyId, userEmail }) =>
  sb.query("survey_responses", {
    token,
    select: "id,rating,submitted_at",
    filters: `survey_id=eq.${surveyId}&user_email=eq.${encodeURIComponent(userEmail)}&limit=1`,
  }).catch(() => []);

export const listResponsesForSurvey = ({ token, surveyId }) =>
  sb.query("survey_responses", {
    token,
    select: "id,user_email,rating,feedback,submitted_at",
    filters: `survey_id=eq.${surveyId}&order=submitted_at.desc`,
  }).catch(() => []);

export const submitSurveyResponse = ({ token, body }) =>
  sb.query("survey_responses", { token, method: "POST", body });

export const createSurvey = ({ token, body }) =>
  sb.query("surveys", { token, method: "POST", body });

// Soft delete — RLS via the surveys_admin_write policy.
export const softDeleteSurvey = ({ token, id }) =>
  sb.query("surveys", {
    token, method: "PATCH",
    filters: `id=eq.${id}`,
    body: { deleted_at: new Date().toISOString(), is_active: false },
  });

// Close (deactivate) a survey without deleting — keeps the responses
// visible in history. Admins use this to stop collecting on a survey.
export const closeSurvey = ({ token, id }) =>
  sb.query("surveys", {
    token, method: "PATCH",
    filters: `id=eq.${id}`,
    body: { is_active: false },
  });
