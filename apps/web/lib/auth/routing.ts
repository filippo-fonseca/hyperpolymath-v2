export function decideLandingRoute(user: { onboardedAt: Date | null }): "/onboarding" | "/today" {
  return user.onboardedAt ? "/today" : "/onboarding";
}
