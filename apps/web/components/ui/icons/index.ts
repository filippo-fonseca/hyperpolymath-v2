/**
 * Re-export shim. The dimensional icon family and its shared recipe now live in
 * `@hyperpolymath/ui-icons` so apps/web and apps/desktop compose the SAME recipe
 * (UI-CONTRACT §13 bans forking it). This file keeps every existing
 * `@/components/ui/icons` import in the web app working untouched.
 */
export * from "@hyperpolymath/ui-icons";
