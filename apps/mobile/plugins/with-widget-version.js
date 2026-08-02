/**
 * Keep ExpoWidgetsTarget MARKETING_VERSION / CURRENT_PROJECT_VERSION in lockstep
 * with the main app. expo-widgets currently hardcodes MARKETING_VERSION = 1.0 on
 * the extension target, which App Store Connect rejects (parent/extension mismatch).
 */
const { withXcodeProject } = require("expo/config-plugins");

function withWidgetMarketingVersion(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const version = cfg.ios?.version ?? cfg.version ?? "1.0.0";
    const buildNumber = String(
      cfg.ios?.buildNumber ?? cfg.android?.versionCode ?? "1",
    );

    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const entry = configurations[key];
      if (typeof entry !== "object" || !entry.buildSettings) continue;
      const bundleId = entry.buildSettings.PRODUCT_BUNDLE_IDENTIFIER;
      if (
        typeof bundleId === "string" &&
        bundleId.includes("ExpoWidgetsTarget")
      ) {
        entry.buildSettings.MARKETING_VERSION = version;
        entry.buildSettings.CURRENT_PROJECT_VERSION = buildNumber;
      }
      // Also match by product name when bundle id isn't expanded yet.
      if (entry.buildSettings.PRODUCT_NAME === '"ExpoWidgetsTarget"') {
        entry.buildSettings.MARKETING_VERSION = version;
        entry.buildSettings.CURRENT_PROJECT_VERSION = buildNumber;
      }
    }

    return cfg;
  });
}

module.exports = withWidgetMarketingVersion;
