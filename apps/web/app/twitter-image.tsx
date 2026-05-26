// Twitter card mirrors the Open Graph image one-to-one. Re-export keeps the
// asset in lock-step so the X / Twitter preview never drifts from the LinkedIn
// / iMessage / Slack preview, which all read from the OG card.
export { default, runtime, size, contentType, alt } from "./opengraph-image";
