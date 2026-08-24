/**
 * Canonical owner publishing flow.
 *
 *   Login → Business Setup → Choose Template → Customize → Preview → Publish
 *
 * Every wizard step index, the publish-readiness "reviewed" rule and the
 * flow-order tests read these constants. Do not renumber screens in
 * `src/App.tsx` (or change `lastCompletedStep` semantics) without updating
 * this module and `scripts/test-owner-setup-publish-flow.mjs`.
 *
 * Stages by 0-based wizard step:
 *   - Login                     → 0   (HeroSplit / sign-in wall)
 *   - Business Setup            → 1–7 (details, services, team, photos,
 *                                     socials, location, contact & booking)
 *   - Choose Template           → 8   (StepTemplate)
 *   - Customize                 → 9–10 (StepPublish appearance/brand/services,
 *                                     StepAIContentReview)
 *   - Preview                   → 11  (StepFullWebsitePreview)
 *   - Publish                   → 12  (StepPublishSetup — real RPC)
 *   - Publish success           → 13  (StepPublishSuccess — only after the
 *                                     database confirms is_published = true)
 */
export const TOTAL_OWNER_STEPS = 14;

export const STEP_LOGIN = 0;
export const STEP_BUSINESS_SETUP_START = 1;
export const STEP_BUSINESS_SETUP_END = 7; // StepContactBooking
export const STEP_TEMPLATE = 8; // StepTemplate — Choose Template
export const STEP_CUSTOMIZE = 9; // StepPublish — appearance/brand/services
export const STEP_CONTENT_REVIEW = 10; // StepAIContentReview — AI copy review
export const STEP_PREVIEW = 11; // StepFullWebsitePreview
export const STEP_PUBLISH = 12; // StepPublishSetup — publish_owner_salon_website
export const STEP_PUBLISH_SUCCESS = 13; // StepPublishSuccess — gated by DB state

export const MAX_OWNER_STEP_INDEX = TOTAL_OWNER_STEPS - 1; // 13

export type OwnerFlowStage =
  | 'login'
  | 'business-setup'
  | 'template'
  | 'customize'
  | 'preview'
  | 'publish'
  | 'success';

export interface OwnerFlowStageRange {
  stage: OwnerFlowStage;
  /** Inclusive 0-based wizard step range. */
  from: number;
  to: number;
  label: string;
}

/** Ordered stage ranges — the only owner sequence the app may render. */
export const OWNER_FLOW_STAGES: readonly OwnerFlowStageRange[] = [
  { stage: 'login', from: STEP_LOGIN, to: STEP_LOGIN, label: 'Login' },
  {
    stage: 'business-setup',
    from: STEP_BUSINESS_SETUP_START,
    to: STEP_BUSINESS_SETUP_END,
    label: 'Business Setup',
  },
  { stage: 'template', from: STEP_TEMPLATE, to: STEP_TEMPLATE, label: 'Choose Template' },
  {
    stage: 'customize',
    from: STEP_CUSTOMIZE,
    to: STEP_CONTENT_REVIEW,
    label: 'Customize',
  },
  { stage: 'preview', from: STEP_PREVIEW, to: STEP_PREVIEW, label: 'Preview' },
  { stage: 'publish', from: STEP_PUBLISH, to: STEP_PUBLISH, label: 'Publish' },
  {
    stage: 'success',
    from: STEP_PUBLISH_SUCCESS,
    to: STEP_PUBLISH_SUCCESS,
    label: 'Published',
  },
];

export const OWNER_FLOW_SEQUENCE: readonly OwnerFlowStage[] =
  OWNER_FLOW_STAGES.map((range) => range.stage);

export function ownerFlowStageForStep(step: number): OwnerFlowStage {
  const match = OWNER_FLOW_STAGES.find((range) => step >= range.from && step <= range.to);
  return match ? match.stage : 'business-setup';
}

/** Human stage for a screen: "Step 10 of 14 — Customize". */
export function ownerFlowStageLabel(step: number): string {
  const stage = ownerFlowStageForStep(step);
  const range = OWNER_FLOW_STAGES.find((entry) => entry.stage === stage);
  return range ? range.label : 'Business Setup';
}
